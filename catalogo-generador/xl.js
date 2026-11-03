// Lector mínimo de XLSX (ya descomprimido): celdas, fórmulas, celdas combinadas e imágenes ancladas.
const fs = require('fs');
const path = require('path');

function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}
function colNum(letters) { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function colName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function load(dir) {
  const rd = p => fs.readFileSync(path.join(dir, p), 'utf8');
  const ss = [];
  for (const m of rd('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    ss.push(decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));
  }
  const wbRels = {};
  for (const m of rd('xl/_rels/workbook.xml.rels').matchAll(/Id="(\w+)"[^>]*Target="([^"]+)"/g)) wbRels[m[1]] = m[2];
  const sheets = [];
  for (const m of rd('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="(\w+)"/g)) {
    const name = decode(m[1]);
    const file = 'xl/' + wbRels[m[2]];
    const xml = rd(file);
    const cells = {};
    for (const c of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, row, attrs, inner = ''] = c;
      const t = (attrs.match(/t="(\w+)"/) || [])[1];
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const f = (inner.match(/<f[^>]*>([\s\S]*?)<\/f>/) || [])[1];
      const isT = (inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
      let val = null;
      if (t === 's' && v != null) val = ss[+v];
      else if (t === 'inlineStr') val = decode(isT || '');
      else if (t === 'str' && v != null) val = decode(v);
      else if (v != null) val = isNaN(+v) ? decode(v) : +v;
      if (val === null && f == null) continue;
      (cells[+row] ||= {})[colNum(col)] = { v: val, f: f ? decode(f) : null };
    }
    // images
    const images = [];
    const relsFile = path.join(dir, path.dirname(file), '_rels', path.basename(file) + '.rels');
    if (fs.existsSync(relsFile)) {
      const rels = fs.readFileSync(relsFile, 'utf8');
      const dm = rels.match(/Target="\.\.\/drawings\/([^"]+)"/);
      if (dm) {
        const dxml = rd('xl/drawings/' + dm[1]);
        const drels = {};
        for (const r of rd('xl/drawings/_rels/' + dm[1] + '.rels').matchAll(/Id="(\w+)"[^>]*Target="\.\.\/media\/([^"]+)"/g)) drels[r[1]] = r[2];
        for (const a of dxml.matchAll(/<xdr:(oneCellAnchor|twoCellAnchor|absoluteAnchor)[^>]*>([\s\S]*?)<\/xdr:\1>/g)) {
          const body = a[2];
          const from = body.match(/<xdr:from><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(-?\d+)<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row><xdr:rowOff>(-?\d+)<\/xdr:rowOff>/);
          const to = body.match(/<xdr:to><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(-?\d+)<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row>/);
          const ext = body.match(/<xdr:ext cx="(\d+)" cy="(\d+)"/);
          const emb = (body.match(/r:embed="(\w+)"/) || [])[1];
          images.push({
            kind: a[1],
            col: from ? +from[1] + 1 : null, row: from ? +from[3] + 1 : null,
            colOff: from ? +from[2] : 0, rowOff: from ? +from[4] : 0,
            toCol: to ? +to[1] + 1 : null, toRow: to ? +to[3] + 1 : null,
            cx: ext ? +ext[1] : null, cy: ext ? +ext[2] : null,
            media: drels[emb] || null,
          });
        }
      }
    }
    // row heights
    const rowHt = {};
    for (const r of xml.matchAll(/<row r="(\d+)"[^>]*?ht="([\d.]+)"/g)) rowHt[+r[1]] = +r[2];
    const merges = [...xml.matchAll(/<mergeCell ref="([A-Z]+\d+:[A-Z]+\d+)"/g)].map(x => x[1]);
    sheets.push({ name, file, cells, images, rowHt, merges });
  }
  return sheets;
}

module.exports = { load, colName, colNum };
