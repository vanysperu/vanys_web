/* ==========================================================================
   VANYS · Catálogo digital · Datos desde el sistema
   Pide los productos a api/productos.php (que los lee del sistema con la API key guardada en el
   servidor), los adapta al formato que usa catalogo.js (window.VANYS_CATALOGO) y recién entonces
   carga catalogo.js y carrito.js.
   Sin PHP (por ejemplo, Live Server en tu PC) usa la copia api/cache/productos.json.
   ========================================================================== */
(function () {
  'use strict';

  const SOURCES = ['api/productos.php', 'api/cache/productos.json'];
  const SCRIPTS = ['catalogo.js?v=8', 'carrito.js?v=6'];

  // Categorías del sistema → id corto del catálogo (lo usan los enlaces ?categoria=… de merchandising.html)
  // y orden en que se muestran. Una categoría nueva toma un id a partir de su nombre y va al final.
  const CATEGORIES = [
    ['termos, mugs y botellas de metal', 'metal'], ['tomatodos de plastico y eco', 'tomatodos'],
    ['bolsas y mochilas', 'bolsas'], ['lapiceros y estuches', 'lapiceros'], ['libretas y post-it', 'libretas'],
    ['articulos de escritorio', 'escritorio'], ['llaveros', 'llaveros'], ['tecnologia', 'tecnologia'],
    ['ecnologia', 'tecnologia'], ['accesorios para celular', 'celular'], ['destapadores', 'destapadores'],
    ['otros articulos', 'otros'], ['tazas de ceramica y vidrio', 'tazas'], ['consumibles personalizados', 'consumibles'],
  ];
  const NO_CATEGORY = { id: 'mas-productos', label: 'Más productos' };
  // Líneas "Etiqueta: valor" de la descripción → filas de la ficha técnica.
  const SPECS = { capacidad: 'capacity', medidas: 'size', material: 'material', empaque: 'packaging', detalles: 'details' };

  const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const price = (n) => (typeof n === 'number' && n > 0 ? n : null); // 0 = sin precio → "Precio a consultar"

  function adapt(raw) {
    const cats = new Map();
    const catOf = (c) => {
      if (!c || !c.name) { if (!cats.has(NO_CATEGORY.id)) cats.set(NO_CATEGORY.id, { ...NO_CATEGORY, order: 999 }); return NO_CATEGORY.id; }
      const n = norm(c.name);
      const at = CATEGORIES.findIndex(([name]) => name === n);
      const id = at >= 0 ? CATEGORIES[at][1] : slug(c.name);
      if (!cats.has(id)) cats.set(id, { id, label: c.name.trim(), order: at >= 0 ? at : 500 });
      return id;
    };
    const colorHex = {};

    const products = raw.products.map((p, i) => {
      const specs = { capacity: [], size: [], material: [], packaging: [], details: [] };
      for (const line of String(p.description || '').split('\n').map((l) => l.trim()).filter(Boolean)) {
        const m = line.match(/^([^:]{2,20}):\s*(.+)$/);
        const key = m && SPECS[norm(m[1])];
        if (key) specs[key].push(...m[2].split(' · ').map((s) => s.trim()).filter(Boolean));
        else specs.details.push(line);
      }

      const p100 = price(p.price_hundred);
      const p1000 = price(p.price_thousand);
      const images = p.image_url ? [p.image_url] : [];
      const img = images.length ? 0 : null;
      // codeColor: el código ya indica el color (E6000-01), así que el carrito envía solo el código.
      const variant = (code, color, codeColor = false) => ({ code, color, codeColor, detail: null, p100, p1000, img });

      // Una variante por código (con su color). Un código sin color cuyo texto encabeza otros
      // (MT015 frente a MT015-01, -02…) es el del proveedor para todo el modelo: no es una opción aparte.
      const codes = (p.codes || []).map((c) => ({ code: String(c.code || '').trim(), color: c.color || null })).filter((c) => c.code);
      const colored = new Set(codes.filter((c) => c.color).map((c) => norm(c.color)));
      const loose = (p.colors || []).filter((col) => !colored.has(norm(col.name)));
      const uncolored = codes.filter((c) => !c.color);
      // Un solo código para varios colores (MT013 + Azul, Rojo…): cada color va con ese código y el
      // carrito envía código + color. Con varios códigos sin color, los colores sueltos van solo con el SKU.
      const shared = uncolored.length === 1 && loose.length ? uncolored[0] : null;
      const variants = [];
      for (const c of codes) {
        if (c.color) { variants.push(variant(c.code, c.color, true)); continue; }
        const parent = codes.some((o) => o !== c && o.code.toUpperCase().startsWith(c.code.toUpperCase() + '-'));
        if (!parent && c !== shared) variants.push(variant(c.code, null));
      }
      for (const col of p.colors || []) if (col.hex) colorHex[col.name] = col.hex;
      loose.forEach((col) => variants.push(variant(shared ? shared.code : null, col.name)));
      if (!variants.length) variants.push(variant(codes[0] ? codes[0].code : null, null));

      const section = p.subcategory && p.subcategory.name ? p.subcategory.name.trim() : null;
      const id = slug(p.sku);
      const beq = p.colors_from_photo && codes.find((c) => !c.color);
      return {
        id, sku: p.sku, category: catOf(p.category), section, name: p.name,
        ...specs,
        sublimable: /sublim/i.test([p.name, section, ...(p.colors || []).map((c) => c.name)].join(' ')),
        p100, p1000, priceVaries: false,
        images, variants,
        colorsInPhoto: !!p.colors_from_photo,
        // Enlaces y carritos guardados con el id anterior de los lapiceros BEQ (#p=beq-pl002).
        aliases: beq ? ['beq-' + slug(beq.code)] : [],
        _i: i,
      };
    });

    const categories = [...cats.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'es'));
    const catIndex = new Map(categories.map((c, i) => [c.id, i]));
    products.sort((a, b) => catIndex.get(a.category) - catIndex.get(b.category) || a._i - b._i);
    products.forEach((p) => { delete p._i; });
    categories.forEach((c) => { c.count = products.filter((p) => p.category === c.id).length; delete c.order; });

    return { generated: String(raw.generated || '').slice(0, 10), source: raw.source || 'sistema', categories, products, colorHex };
  }

  async function load() {
    for (const url of SOURCES) {
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) continue;
        const json = await res.json(); // Live Server devuelve el PHP como texto: aquí falla y se usa la copia
        if (json && json.success !== false && Array.isArray(json.products)) return json;
      } catch (e) { /* siguiente fuente */ }
    }
    return null;
  }

  function showError() {
    const count = document.getElementById('cv-count');
    if (count) count.textContent = 'No pudimos cargar el catálogo en este momento.';
    const grid = document.getElementById('cv-grid');
    if (grid) {
      grid.innerHTML = '<div class="cv-loaderror"><strong>No pudimos cargar los productos.</strong>' +
        '<p>Vuelve a intentarlo en unos minutos o escríbenos: te enviamos el catálogo por WhatsApp.</p>' +
        '<a class="cv-btn cv-btn-wa" href="https://wa.me/51952350797?text=' +
        encodeURIComponent('Hola VANYS 👋 Quiero ver el catálogo de productos personalizados.') +
        '" target="_blank" rel="noopener">Escribir por WhatsApp</a></div>';
    }
  }

  function loadScripts(list) {
    list.forEach((src) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false; // en orden: carrito.js necesita a catalogo.js
      document.body.appendChild(s);
    });
  }

  load().then((raw) => {
    if (!raw || !raw.products.length) return showError();
    window.VANYS_CATALOGO = adapt(raw);
    loadScripts(SCRIPTS);
  });
})();
