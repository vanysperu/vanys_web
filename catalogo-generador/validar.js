// Verificación independiente del catálogo generado contra el Excel (la ejecuta generar.js al final).
// Uso manual: node validar.js <carpetaExcelDescomprimido> <carpetaProyecto> <reporte.json>
const fs = require('fs');
const path = require('path');
const { load } = require('./xl.js');
const [, , XDIR, PROJECT, REPORT] = process.argv;
global.window = {};
require(path.join(PROJECT, 'catalogo/data/productos.js'));
const cat = window.VANYS_CATALOGO;
const rep = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
const sheets = Object.fromEntries(load(XDIR).map((s) => [s.name, s]));
const r2 = (x) => Math.round(Number((x * 100).toPrecision(12))) / 100;
const out = []; const fail = (m) => out.push('FAIL ' + m); const pass = (m) => out.push('PASS ' + m);

// 1. Every SKU in column A (sheets with SKU column, real data rows) is in the catalog
const skuSheets = ['TODO METAL', 'TOMATODO PLASTICO', 'BOLSA', 'LAPICERO', 'LIBRETAS Y POSTITS', 'ART.ESCRITORIO', 'LLAVEROS', 'TECNOLOGICOS', 'TELÉFONO MOVIL', 'DESTAPADOR', 'OTRO'];
const catSkus = cat.products.map((p) => p.sku).filter(Boolean);
let missing = [];
for (const n of skuSheets) {
  const s = sheets[n];
  for (const [row, cells] of Object.entries(s.cells)) {
    const a = cells[1]?.v; const b = cells[2]?.v;
    if (+row >= 5 && typeof a === 'string' && /^[A-Z]{3}-?\d{3,4}$/.test(a.trim()) && b) {
      if (!catSkus.includes(a.trim())) missing.push(`${n}!A${row} ${a}`);
    }
  }
}
missing.length ? fail('SKUs del Excel faltantes: ' + missing.join(', ')) : pass(`Todos los SKU con código del Excel están en el catálogo (${new Set(catSkus).size} SKU únicos)`);

// 2. Every product code (col B / col A for consumibles) of published sheets appears as a variant
const catCodes = new Set(cat.products.flatMap((p) => p.variants.map((v) => v.code)).filter(Boolean));
const ignoredRows = new Set(rep.ignoredRows.map((x) => x.sheet + '!' + x.row));
missing = [];
for (const [n, s] of Object.entries(sheets)) {
  if (n === 'TEXTILES') continue;
  const codeCol = n === 'CONSUMIBLES PERSONALIZADOS' ? 1 : 2;
  for (const [row, cells] of Object.entries(s.cells)) {
    const v = cells[codeCol]?.v;
    if (+row < 5 || v == null || String(v).toUpperCase() === 'CODIGO' || ignoredRows.has(n + '!' + row)) continue;
    if (n === 'TODO METAL' && String(v) === 'SUBLIMABLE') continue;
    if (!catCodes.has(String(v).replace(/\s*\n\s*/g, ' ').replace(/\s*\/\s*/g, '/').trim())) missing.push(`${n}!${row} ${v}`);
  }
}
missing.length ? fail('Códigos faltantes: ' + missing.join(', ')) : pass(`Todos los códigos de producto están en el catálogo (${catCodes.size} códigos únicos; filas descartadas documentadas: ${rep.ignoredRows.length})`);

// 3. Prices: each published price equals K (x100) / M (x1000) of an Excel row of the same sheet, and never equals that row's cost/CP/utilidad
let checked = 0; const priceErr = [];
for (const dbg of rep.productsDebug) {
  const s = sheets[dbg.sheet];
  if (['TAZA CERAMICA Y VIDRIO', 'CONSUMIBLES PERSONALIZADOS'].includes(dbg.sheet)) {
    if (dbg.variants.some((v) => v.p100 != null || v.p1000 != null)) priceErr.push(`${dbg.sheet} fila ${dbg.row} tiene precio pero la hoja no tiene precios de venta`);
    continue;
  }
  for (const v of dbg.variants) {
    if (v.p100 == null) continue;
    checked++;
    const rows = Object.entries(s.cells).filter(([r, c]) => typeof c[11]?.v === 'number' && r2(c[11].v) === v.p100 && typeof c[13]?.v === 'number' && r2(c[13].v) === v.p1000);
    if (!rows.length) priceErr.push(`${dbg.sku} ${v.code}: ${v.p100}/${v.p1000} no coincide con ninguna fila K/M`);
    const anchor = rows.find(([r]) => +r <= v.row && +r >= dbg.row) || rows[0];
    if (anchor) {
      const c = anchor[1];
      for (const col of [8, 9, 10, 12, 14]) if (typeof c[col]?.v === 'number' && (r2(c[col].v) === v.p100 || r2(c[col].v) === v.p1000)) priceErr.push(`${dbg.sku} ${v.code}: el precio coincide con una columna interna (${col})`);
      if (typeof c[8]?.v === 'number' && v.p100 <= c[8].v) priceErr.push(`${dbg.sku} ${v.code}: precio x100 ≤ costo`);
    }
  }
}
priceErr.length ? fail('Precios: ' + priceErr.join(' ; ')) : pass(`${checked} precios de variantes = columnas K (x100) y M (x1000) del Excel; ninguno coincide con costo, CP o utilidad, y todos superan el costo`);

// 4. Images: the main image of each product is the picture anchored in the IMAGEN column at a row of that product block
const imgErr = [];
for (const dbg of rep.productsDebug) {
  const s = sheets[dbg.sheet];
  const imgCol = dbg.sheet === 'CONSUMIBLES PERSONALIZADOS' ? 2 : 3;
  const rows = dbg.variants.map((v) => v.row);
  const anchored = s.images.filter((im) => im.col === imgCol && rows.includes(im.row)).map((im) => im.media);
  if (!dbg.images.length) { imgErr.push(`${dbg.sku || dbg.name}: sin imagen`); continue; }
  if (!anchored.includes(dbg.images[0])) imgErr.push(`${dbg.sku || dbg.name}: imagen ${dbg.images[0]} no anclada en su fila`);
  if (dbg.images.some((m) => !anchored.includes(m))) imgErr.push(`${dbg.sku || dbg.name}: imagen extra fuera de su bloque`);
}
imgErr.length ? fail('Imágenes: ' + imgErr.join(' ; ')) : pass(`Las ${rep.productsDebug.length} fichas usan solo imágenes ancladas en la columna IMAGEN de sus propias filas`);
const files = fs.readdirSync(path.join(PROJECT, 'catalogo/img'));
const refd = new Set(cat.products.flatMap((p) => p.images.map((i) => i.replace('img/', ''))));
(files.length === refd.size && [...refd].every((f) => files.includes(f))) ? pass(`${files.length} archivos de imagen, todos referenciados y existentes`) : fail(`imagenes: ${files.length} archivos vs ${refd.size} referenciadas`);

// 5. Colors: every variant color equals the Excel COLOR cell of its row (case/space-normalized)
const colErr = [];
const nz = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/VEDER/g, 'VERDE').replace(/TRANSAPARENTE/g, 'TRANSPARENTE').replace(/[^A-Z0-9+]/g, '');
for (const dbg of rep.productsDebug) {
  const s = sheets[dbg.sheet];
  const colorCol = dbg.sheet === 'CONSUMIBLES PERSONALIZADOS' ? 3 : 4;
  for (const v of dbg.variants) {
    const x = s.cells[v.row]?.[colorCol]?.v;
    if (nz(x) !== nz(v.color)) colErr.push(`${dbg.sku || ''} fila ${v.row}: "${x}" vs "${v.color}"`);
  }
}
colErr.length ? fail('Colores: ' + colErr.join(' ; ')) : pass('Todos los colores coinciden con la columna COLOR de su fila');

// 6. No internal numbers leaked into the published file
const js = fs.readFileSync(path.join(PROJECT, 'catalogo/data/productos.js'), 'utf8');
/costo|insumo|utilidad|stock|"cp/i.test(js) ? fail('El archivo publicado menciona campos internos') : pass('productos.js no contiene campos de costo, insumo, utilidad ni stock');
const tazaCosts = []; for (const n of ['TAZA CERAMICA Y VIDRIO', 'CONSUMIBLES PERSONALIZADOS']) for (const [r, c] of Object.entries(sheets[n].cells)) { const v = c[n === 'TAZA CERAMICA Y VIDRIO' ? 8 : 7]?.v; if (+r >= 5 && typeof v === 'number') tazaCosts.push(v); }
const leakedTaza = cat.products.filter((p) => ['tazas', 'consumibles'].includes(p.category)).some((p) => p.p100 != null || p.p1000 != null);
leakedTaza ? fail('Tazas/consumibles muestran precio') : pass(`Tazas y consumibles: sus ${tazaCosts.length} valores de la columna PRECIO (costo) no se publican; se muestran como "Precio a consultar"`);

console.log(out.join('\n'));
