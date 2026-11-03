// Genera catalogo/data/productos.js y catalogo/img/*.webp a partir del Excel del catálogo.
// Uso (desde esta carpeta):  npm install  →  node generar.js ["ruta/al/archivo.xlsx"]
// Sin ruta, usa "../NUEVO CATALOGO SERIGRAFIA DTF.xlsx". Al terminar ejecuta validar.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const AdmZip = require('adm-zip');
const sharp = require('sharp');
const { load, colName } = require('./xl.js');

const XLSX = path.resolve(process.argv[2] || path.join(__dirname, '..', 'NUEVO CATALOGO SERIGRAFIA DTF.xlsx'));
const PROJECT = path.resolve(__dirname, '..');
const REPORT = path.join(__dirname, 'reporte.json');
const XDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vanys-catalogo-'));
new AdmZip(XLSX).extractAllTo(XDIR, true);
const OUT = path.join(PROJECT, 'catalogo');
const IMG_OUT = path.join(OUT, 'img');

// Column letters -> numbers per layout
const C = (l) => l.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const STD = { sku: C('A'), code: C('B'), img: C('C'), color: C('D'), desc: C('G'), cost: C('H'), p100: C('K'), p1000: C('M') };
const TAZA = { ...STD, sku: null, p100: null, p1000: null };
const CONS = { sku: null, code: C('A'), img: C('B'), color: C('C'), desc: C('F'), cost: C('G'), p100: null, p1000: null };

// Sheet name -> category. skip: true = sheet not published (reason in report).
const SHEETS = {
  'TODO METAL': { id: 'metal', label: 'Termos, mugs y botellas de metal', layout: STD },
  'TOMATODO PLASTICO': { id: 'tomatodos', label: 'Tomatodos de plástico y eco', layout: STD },
  'BOLSA': { id: 'bolsas', label: 'Bolsas y mochilas', layout: STD },
  'LAPICERO': { id: 'lapiceros', label: 'Lapiceros y estuches', layout: STD },
  'LIBRETAS Y POSTITS': { id: 'libretas', label: 'Libretas y post-it', layout: STD },
  'ART.ESCRITORIO': { id: 'escritorio', label: 'Artículos de escritorio', layout: STD },
  'LLAVEROS': { id: 'llaveros', label: 'Llaveros', layout: STD },
  'TECNOLOGICOS': { id: 'tecnologia', label: 'Tecnología', layout: STD },
  'TELÉFONO MOVIL': { id: 'celular', label: 'Accesorios para celular', layout: STD },
  'DESTAPADOR': { id: 'destapadores', label: 'Destapadores', layout: STD },
  'OTRO': { id: 'otros', label: 'Otros artículos', layout: STD },
  'TEXTILES': { skip: 'La hoja es una copia de DESTAPADOR: mismos códigos, descripciones e imágenes, sin SKU propio y sin ningún producto textil.' },
  'TAZA CERAMICA Y VIDRIO': { id: 'tazas', label: 'Tazas de cerámica y vidrio', layout: TAZA },
  'CONSUMIBLES PERSONALIZADOS': { id: 'consumibles', label: 'Consumibles personalizados', layout: CONS },
};

// Obvious typos in the source, fixed for display (listed in the report).
const TYPOS = [
  [/\bVEDER\b/g, 'VERDE'], [/TRANSAPARENTE/g, 'TRANSPARENTE'], [/DES5TAPADOR/g, 'DESTAPADOR'],
  [/Sulimable/g, 'Sublimable'], [/INDIVIFUAL/g, 'INDIVIDUAL'], [/indicidual/g, 'individual'],
  [/Memo Boz/g, 'Memo Box'], [/LIBRETA Mediaum/g, 'LIBRETA Medium'], [/TRANSPARANTE/g, 'TRANSPARENTE'],
  [/\bBOLS INDIVIDUAL/g, 'BOLSA INDIVIDUAL'], [/4\.5 cml/g, '4.5 cm'],
  [/CMANCHO/g, 'CM ANCHO'], [/Redondo Redondo/g, 'Redondo'],
];
const typoHits = new Map();
function fixTypos(s) {
  for (const [re, rep] of TYPOS) {
    const before = s;
    s = s.replace(re, rep);
    if (s !== before) typoHits.set(re.source, rep);
  }
  return s;
}
const clean = (v) => (v == null ? '' : fixTypos(String(v)).replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n')
  .replace(/,(?=\p{L})|(?<=\p{L}),(?=\d)/gu, ', ').replace(/\.(?=\p{Lu}\p{Ll})/gu, '. ').trim());
const oneLine = (v) => clean(v).replace(/\s*\n\s*/g, ' ').replace(/\s*\/\s*/g, '/').trim();
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const round2 = (x) => Math.round(Number((x * 100).toPrecision(12))) / 100;

// ---- text presentation helpers (case only; wording comes from the Excel) ----
const KEEP_UPPER = /^(ML|OZ|CM|MM|GB|USB|AAA|PU|A4|A5|A6|A10|A15|A23|X|MT|DTF|UV|HD|C|B|D|E|S|3D|LED|II)$/i;
const SMALL = new Set(['de', 'del', 'con', 'y', 'para', 'en', 'el', 'la', 'las', 'los', 'sin', 'a', 'por', 'o', 'e', 'al']);
const isShouting = (s) => { const L = s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, ''); return L.length > 2 && L.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length / L.length > 0.7; };
function titleCase(s) {
  if (!isShouting(s)) return s.replace(/^\p{Ll}/u, (m) => m.toUpperCase());
  return s.toLowerCase().split(/(\s+)/).map((w, i) => {
    if (/^\s+$/.test(w)) return w;
    const core = w.replace(/[^\p{L}\p{N}]/gu, '');
    if (KEEP_UPPER.test(core) || /\d/.test(core)) return w.toUpperCase();
    if (i > 0 && SMALL.has(core)) return w;
    return w.replace(/\p{L}/u, (m) => m.toUpperCase());
  }).join('');
}
function sentenceCase(s) {
  if (!isShouting(s)) return s;
  let t = s.toLowerCase();
  t = t.replace(/(\d)\s*(ml|oz|cm|mm|gb|mt|gr|g)\b/g, (m, d, u) => d + (u === 'gr' || u === 'g' ? u : u.toUpperCase()))
    .replace(/^[^\p{L}\d]*\p{Ll}/u, (m) => m.toUpperCase())
    .replace(/\b(usb|aaa|pu|a4|a5|a6)\b/g, (m) => m.toUpperCase())
    .replace(/: *(\p{Ll})/gu, (m, c) => ': ' + c.toUpperCase());
  return t;
}
const LABELS = [
  ['capacity', /^capacidad\s*:?\s*/i],
  ['size', /^(medidas?|medida de wincha|alto|tamaño)\s*:?\s*/i],
  ['material', /^material(es)?\s*:?\s*/i],
];
const MATERIAL_ONLY = /^(pl[aá]stico|bamb[uú]|metal|acero|madera|corcho|aluminio|silicona|vidrio|cer[aá]mica|fibra de trigo|algod[oó]n|neoprene|poliuretano|piedra|cuerina|vinilo)(\s*(y|,|\+)\s*(pl[aá]stico|bamb[uú]|metal|acero|madera|corcho|aluminio|silicona|vidrio|cer[aá]mica|fibra de trigo|algod[oó]n))*\.?$/i;
const SIZE_LIKE = /(\d+([.,]\d+)?\s*[*xX×]\s*\d)|(\b\d+([.,]\d+)?\s*(cm|mm)\b)/i;
const PACK_LIKE = /(caja|pza|pzas|piezas|bolsa individual|bolsita|bolsa grande|bolsa de \d|por caja|sin bolsa|sin caja|con caja|viene (con|en))/i;

function parseDescription(desc) {
  const lines = clean(desc).split('\n').map((l) => l.trim()).filter(Boolean);
  const out = { name: '', capacity: [], size: [], material: [], packaging: [], details: [] };
  if (!lines.length) return out;
  out.name = titleCase(lines[0].replace(/\s+/g, ' ').replace(/\s*-\s*$/, ''));
  for (const raw of lines.slice(1)) {
    const line = raw.replace(/^[-•·]\s*/, '');
    let done = false;
    for (const [key, re] of LABELS) {
      if (re.test(line)) {
        const value = line.replace(re, '').trim();
        if (value) out[key].push(sentenceCase(key === 'size' && !/^medidas?/i.test(line) ? line : value));
        done = true; break;
      }
    }
    if (done) continue;
    if (MATERIAL_ONLY.test(line)) out.material.push(sentenceCase(line.replace(/\.$/, '')));
    else if (PACK_LIKE.test(line) && !SIZE_LIKE.test(line.replace(/\d+\s*(pza|pzas)/i, ''))) out.packaging.push(sentenceCase(line));
    else if (SIZE_LIKE.test(line) && line.length < 60) out.size.push(sentenceCase(line));
    else out.details.push(sentenceCase(line));
  }
  return out;
}
function prettyColor(c) {
  const t = oneLine(c).replace(/\//g, ' / ');
  if (!t) return '';
  return titleCase(t.toUpperCase());
}

// ---------------------------------------------------------------------------
const sheets = load(XDIR);
const report = { sheets: [], ignoredRows: [], excludedImages: [], issues: [], typos: [], priceAnomalies: [], sharedImages: [] };
const products = [];
const categories = [];
const mediaUse = new Map(); // media -> [product ids]

for (const [si, sh] of sheets.entries()) {
  const conf = SHEETS[sh.name];
  if (!conf) throw new Error('Hoja sin configurar: ' + sh.name);
  const sheetRep = { index: si + 1, name: sh.name, images: sh.images.length, products: 0, variants: 0 };
  report.sheets.push(sheetRep);
  if (conf.skip) {
    sheetRep.skipped = conf.skip;
    sh.images.forEach((im) => report.excludedImages.push({ sheet: sh.name, cell: colName(im.col) + im.row, media: im.media, reason: 'Hoja no publicada (duplicada)' }));
    continue;
  }
  const L = conf.layout;
  const cat = { id: conf.id, label: conf.label, sheet: sh.name };
  categories.push(cat);

  // merges -> {col,r1,r2}
  const merges = sh.merges.map((m) => {
    const [a, b] = m.split(':');
    const p = (x) => { const mm = x.match(/([A-Z]+)(\d+)/); return [C(mm[1]), +mm[2]]; };
    const [c1, r1] = p(a); const [c2, r2] = p(b);
    return { c1, c2, r1, r2 };
  });
  const mergeAt = (col, row) => merges.find((m) => col >= m.c1 && col <= m.c2 && row >= m.r1 && row <= m.r2);
  const raw = (col, row) => (col && sh.cells[row] && sh.cells[row][col] ? sh.cells[row][col].v : null);
  const val = (col, row) => { // value with merge propagation
    if (!col) return null;
    const m = mergeAt(col, row);
    return m ? raw(m.c1, m.r1) : raw(col, row);
  };
  const ownText = (col, row) => { const v = raw(col, row); return v == null ? '' : String(v).trim(); };

  // images in the image column, by row. Others are excluded.
  const imgsByRow = {};
  for (const im of sh.images) {
    if (im.col === L.img) (imgsByRow[im.row] ||= []).push(im);
    else report.excludedImages.push({ sheet: sh.name, cell: colName(im.col) + im.row, media: im.media, reason: 'Fuera de la columna IMAGEN (insignia de descuento o de llegada de contenedor)' });
  }
  const sizeOf = require('./imgsize.js');
  for (const r in imgsByRow) imgsByRow[r].sort((a, b) => {
    const A = sizeOf(path.join(XDIR, 'xl/media', a.media)); const B = sizeOf(path.join(XDIR, 'xl/media', b.media));
    return (B.w * B.h) - (A.w * A.h);
  });

  // price anchor: the row whose cost cell (own or merged) governs this row
  const priceRowFor = (row) => {
    if (num(raw(L.cost, row)) != null) return row;
    const m = mergeAt(L.cost, row);
    if (m && num(raw(m.c1, m.r1)) != null) return m.r1;
    return null;
  };
  const pricesAt = (row) => {
    if (row == null || !L.p100) return { p100: null, p1000: null };
    const a = num(raw(L.p100, row)); const b = num(raw(L.p1000, row));
    return { p100: a && a > 0 ? round2(a) : null, p1000: b && b > 0 ? round2(b) : null };
  };

  const rows = Object.keys(sh.cells).map(Number).concat(Object.keys(imgsByRow).map(Number));
  const allRows = [...new Set(rows)].sort((a, b) => a - b).filter((r) => r >= 5);
  let current = null; let section = null;
  let blockEnd = 0; let lastRow = 0;

  for (const r of allRows) {
    const sku = L.sku ? ownText(L.sku, r) : '';
    const code = ownText(L.code, r);
    const color = ownText(L.color, r);
    const ownDesc = ownText(L.desc, r);
    const hasImg = !!imgsByRow[r];

    // header row repeated mid-sheet / section titles
    if (code.toUpperCase() === 'CODIGO') { lastRow = r; continue; }
    const next = sh.cells[r + 1] || {};
    if (code && !sku && !color && !ownDesc && !hasImg && next[L.code] && String(next[L.code].v).toUpperCase() === 'CODIGO') {
      section = titleCase(code); current = null; lastRow = r; continue;
    }
    const inBlock = current && r <= blockEnd;
    const contiguous = current && r === lastRow + 1;
    const startsProduct = !!sku || ((!current || !inBlock) && hasImg && (code || ownDesc));

    if (startsProduct) {
      if (!code && !ownDesc && !val(L.desc, r)) { report.ignoredRows.push({ sheet: sh.name, row: r, reason: 'SKU sin código ni descripción', data: sku }); continue; }
      const descText = clean(val(L.desc, r));
      const d = parseDescription(descText);
      current = {
        id: '', sku: sku || null, category: cat.id, section: section || null,
        name: d.name || null, description: descText || null,
        capacity: d.capacity, size: d.size, material: d.material, packaging: d.packaging, details: d.details,
        images: [], variants: [], _row: r, _sheet: sh.name,
      };
      if (!d.name) report.issues.push({ type: 'sin-descripcion', sheet: sh.name, row: r, sku, code, msg: 'Producto sin descripción en el Excel; se muestra con su código.' });
      products.push(current);
      sheetRep.products++;
      blockEnd = r;
      for (const col of [L.img, L.desc]) { const m = mergeAt(col, r); if (m && m.r1 === r) blockEnd = Math.max(blockEnd, m.r2); }
    } else if (current && (inBlock || contiguous) && (code || color)) {
      // variant row of the current product
    } else {
      if (code || color || ownDesc || hasImg) report.ignoredRows.push({ sheet: sh.name, row: r, reason: 'Fila suelta: sin SKU, sin imagen propia y fuera de un bloque de producto', data: [sku, code, color, oneLine(ownDesc).slice(0, 50)].filter(Boolean).join(' | ') });
      else if (sku) report.ignoredRows.push({ sheet: sh.name, row: r, reason: 'SKU suelto sin datos', data: sku });
      lastRow = r;
      continue;
    }

    const vDesc = clean(val(L.desc, r));
    const pr = pricesAt(priceRowFor(r) ?? priceRowFor(current._row));
    const variant = {
      code: code ? oneLine(code) : null,
      color: prettyColor(color) || null,
      detail: null,
      p100: pr.p100, p1000: pr.p1000,
      img: null,
      _row: r,
    };
    if (vDesc && vDesc !== current.description) {
      const d = parseDescription(vDesc);
      variant.detail = [d.capacity.join(', '), d.size.join(', ')].filter(Boolean).join(' · ') || d.name;
    }
    if (hasImg) {
      for (const im of imgsByRow[r]) {
        if (!current.images.includes(im.media)) current.images.push(im.media);
      }
      variant.img = current.images.indexOf(imgsByRow[r][0].media);
    }
    current.variants.push(variant);
    if (current.variants.length > 1) sheetRep.variants++;
    lastRow = r;
    blockEnd = Math.max(blockEnd, r);
  }
  cat.count = products.filter((p) => p.category === cat.id).length;
}

// ---- post-process: ids, colors, price summary, anomalies -------------------
const used = new Set();
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const skuCount = {};
products.forEach((p) => { if (p.sku) skuCount[p.sku] = (skuCount[p.sku] || 0) + 1; });
for (const p of products) {
  let id = slug(p.sku && skuCount[p.sku] === 1 ? p.sku : [p.sku, p.variants[0]?.code].filter(Boolean).join('-') || p.category + '-' + p._row);
  while (used.has(id)) id += '-b';
  used.add(id); p.id = id;
  if (!p.name) p.name = 'Producto ' + (p.variants[0]?.code || p.sku);
  const ps = p.variants.map((v) => v.p100).filter((x) => x != null);
  const ps2 = p.variants.map((v) => v.p1000).filter((x) => x != null);
  p.p100 = ps.length ? Math.min(...ps) : null;
  p.p1000 = ps2.length ? Math.min(...ps2) : null;
  p.priceVaries = new Set(p.variants.map((v) => `${v.p100}|${v.p1000}`)).size > 1;
  p.sublimable = /sublim/i.test([p.name, p.description, p.section, ...p.variants.map((v) => v.color)].join(' '));
  for (const v of p.variants) {
    if (v.p100 != null && v.p1000 != null && v.p1000 > v.p100) report.priceAnomalies.push({ sku: p.sku, code: v.code, name: p.name, p100: v.p100, p1000: v.p1000, msg: 'Precio x1000 mayor que precio x100 (así está en el Excel)' });
  }
  if (p.p100 == null) report.issues.push({ type: 'sin-precio', sheet: p._sheet, row: p._row, sku: p.sku, code: p.variants[0]?.code, name: p.name });
  if (!p.images.length) report.issues.push({ type: 'sin-imagen', sheet: p._sheet, row: p._row, sku: p.sku, code: p.variants[0]?.code, name: p.name });
  p.images.forEach((m) => { if (!mediaUse.has(m)) mediaUse.set(m, []); mediaUse.get(m).push(p.sku || p.variants[0]?.code); });
}
for (const [sku, n] of Object.entries(skuCount)) if (n > 1) report.issues.push({ type: 'sku-duplicado', sku, msg: `El SKU ${sku} aparece en ${n} productos distintos` });
const codeOwners = {};
products.forEach((p) => p.variants.forEach((v) => { if (v.code) (codeOwners[v.code] ||= new Set()).add(p.sku || p.id); }));
for (const [code, set] of Object.entries(codeOwners)) if (set.size > 1) report.issues.push({ type: 'codigo-duplicado', code, msg: `El código ${code} aparece en productos distintos: ${[...set].join(', ')}` });
for (const [m, owners] of mediaUse) if (owners.length > 1) report.sharedImages.push({ media: m, products: owners });
report.typos = [...typoHits].map(([a, b]) => `${a.replace(/\\b/g, '')} → ${b}`);

// ---- images ----------------------------------------------------------------
async function writeImages() {
  fs.rmSync(IMG_OUT, { recursive: true, force: true });
  fs.mkdirSync(IMG_OUT, { recursive: true });
  const names = new Map();
  for (const p of products) for (const m of p.images) if (!names.has(m)) names.set(m, `foto-${m.replace(/^image(\d+)\..*$/, '$1').padStart(3, '0')}.webp`);
  for (const [m, out] of names) {
    await sharp(path.join(XDIR, 'xl/media', m)).rotate()
      .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84 }).toFile(path.join(IMG_OUT, out));
  }
  return names;
}

(async () => {
  const names = await writeImages();
  const data = {
    generated: new Date().toISOString().slice(0, 10),
    source: path.basename(XLSX),
    categories: categories.filter((c) => c.count > 0).map(({ id, label, count }) => ({ id, label, count })),
    products: products.map((p) => ({
      id: p.id, sku: p.sku, category: p.category, section: p.section, name: p.name,
      capacity: p.capacity, size: p.size, material: p.material, packaging: p.packaging, details: p.details,
      sublimable: p.sublimable, p100: p.p100, p1000: p.p1000, priceVaries: p.priceVaries,
      images: p.images.map((m) => 'img/' + names.get(m)),
      variants: p.variants.map((v) => ({ code: v.code, color: v.color, detail: v.detail, p100: v.p100, p1000: v.p1000, img: v.img })),
    })),
  };
  const js = '/* Catálogo VANYS · generado automáticamente desde "' + data.source + '" el ' + data.generated + '.\n' +
    '   Solo contiene precios de venta (x100 y x1000). No editar a mano: volver a generar desde el Excel. */\n' +
    'window.VANYS_CATALOGO = ' + JSON.stringify(data, null, 1) + ';\n';
  fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'data', 'productos.js'), js);

  report.totals = {
    products: products.length,
    variants: products.reduce((n, p) => n + p.variants.length, 0),
    categories: data.categories.length,
    imagesInWorkbook: sheets.reduce((n, s) => n + s.images.length, 0),
    uniqueMediaFiles: fs.readdirSync(path.join(XDIR, 'xl/media')).length,
    productImagesWritten: names.size,
    withPrice: products.filter((p) => p.p100 != null).length,
  };
  // keep internal rows for validation
  report.productsDebug = products.map((p) => ({ sheet: p._sheet, row: p._row, sku: p.sku, name: p.name, images: p.images, variants: p.variants.map((v) => ({ row: v._row, code: v.code, color: v.color, p100: v.p100, p1000: v.p1000 })) }));
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
  console.log(`Productos: ${report.totals.products} · Variantes: ${report.totals.variants} · Categorías: ${report.totals.categories} · Imágenes: ${report.totals.productImagesWritten} · Con precio: ${report.totals.withPrice}`);
  console.log('Categorías:', data.categories.map((c) => `${c.label} (${c.count})`).join(' | '));
  console.log(`Observaciones: ${report.issues.length} · Filas descartadas: ${report.ignoredRows.length} · Detalle en ${path.relative(PROJECT, REPORT)}\n`);
  console.log('Validando contra el Excel…');
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'validar.js'), XDIR, PROJECT, REPORT], { stdio: 'inherit' });
  } finally {
    fs.rmSync(XDIR, { recursive: true, force: true });
  }
})();
