/* ==========================================================================
   VANYS · Catálogo digital (/catalogo)
   Lee window.VANYS_CATALOGO (data/productos.js) y arma buscador, categorías,
   filtros, tarjetas, ficha ampliada y cotización por WhatsApp.
   Script independiente: no usa ni modifica ../script.js.
   ========================================================================== */
(function () {
  'use strict';

  // Mismo número que usa la web (script.js → WHATSAPP_NUMBER). Si cambia, edítalo aquí también.
  const WHATSAPP_NUMBER = '51952350797';
  const PAGE_SIZE = 48;

  const data = window.VANYS_CATALOGO;
  const $ = (sel, root = document) => root.querySelector(sel);
  const grid = $('#cv-grid');
  if (!data || !grid) return;

  const waUrl = (msg) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const money = (n) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const catLabel = Object.fromEntries(data.categories.map((c) => [c.id, c.label]));
  const products = data.products.map((p, i) => ({
    ...p,
    order: i,
    hay: norm([p.name, p.sku, catLabel[p.category], p.section, ...p.capacity, ...p.size, ...p.material, ...p.details,
      ...p.variants.flatMap((v) => [v.code, v.color, v.detail])].filter(Boolean).join(' ')),
  }));
  const byId = new Map(products.map((p) => [p.id, p]));

  // --- Colores -------------------------------------------------------------
  // Nombre de color del Excel → muestra visual. El orden importa: primero los nombres compuestos.
  const SWATCHES = [
    ['blanco hueso', '#f1ead9'], ['azul claro', '#86b8ea'], ['azul oscuro', '#16295c'], ['verde claro', '#9fd77d'],
    ['verde oscuro', '#1f5c3a'], ['acero inoxidable', 'linear-gradient(135deg,#eef1f4,#9aa3ad 55%,#e4e8ec)'],
    ['fibra de trigo', '#e2d1a3'], ['arcoiris', 'conic-gradient(#ff4d4d,#ffd23f,#3ddc84,#3fa7ff,#a05bff,#ff4d4d)'],
    ['transparente', 'repeating-conic-gradient(#e6edf5 0 25%,#fff 0 50%) 50%/8px 8px'],
    ['plateado', 'linear-gradient(135deg,#f4f6f8,#aeb6bf 55%,#eef1f4)'], ['plateada', 'linear-gradient(135deg,#f4f6f8,#aeb6bf 55%,#eef1f4)'],
    ['plata', 'linear-gradient(135deg,#f4f6f8,#aeb6bf 55%,#eef1f4)'], ['dorado', 'linear-gradient(135deg,#f6e27a,#c9a227 60%,#f3d46b)'],
    ['oro', 'linear-gradient(135deg,#f6e27a,#c9a227 60%,#f3d46b)'], ['bambu', '#d9b77c'], ['madera', '#a9743f'], ['corcho', '#b98a5a'],
    ['natural', '#e9dcc0'], ['beige', '#e6d5b8'], ['blanco', '#ffffff'], ['blanca', '#ffffff'], ['negro', '#1d1f24'],
    ['azul', '#1f4fbf'], ['celeste', '#8fd3f4'], ['rojo', '#d63031'], ['rosado', '#f4a6c1'], ['amarillo', '#f7d23e'],
    ['verde', '#2fa65a'], ['morado', '#7b4bb7'], ['naranja', '#ff8a1f'], ['gris', '#9aa3ad'],
  ];
  function swatch(color) {
    if (!color) return null;
    let s = norm(color);
    const found = [];
    for (const [name, css] of SWATCHES) {
      const re = new RegExp('\\b' + name + '\\b');
      const m = s.match(re);
      if (m) { found.push({ at: m.index, css }); s = s.replace(re, ' '.repeat(name.length)); }
    }
    if (!found.length) return null;
    found.sort((a, b) => a.at - b.at);
    const solid = (c) => (c.startsWith('#') ? c : null);
    if (found.length > 1 && solid(found[0].css) && solid(found[1].css)) return `linear-gradient(135deg,${found[0].css} 50%,${found[1].css} 50%)`;
    return found[0].css;
  }
  const dot = (color, cls = 'cv-dot') => {
    const bg = swatch(color);
    return bg ? `<span class="${cls}" style="background:${esc(bg)}" title="${esc(color)}" aria-hidden="true"></span>` : '';
  };
  const uniqueColors = (p) => [...new Set(p.variants.map((v) => v.color).filter(Boolean))];

  // --- Estado y URL ----------------------------------------------------------
  const params = new URLSearchParams(location.search);
  const state = {
    q: params.get('q') || '',
    cat: byCat(params.get('categoria')),
    sub: params.get('sublimables') === '1',
    priced: params.get('conprecio') === '1',
    sort: params.get('orden') || 'relevance',
    shown: PAGE_SIZE,
  };
  function byCat(id) { return id && catLabel[id] ? id : 'all'; }
  function syncUrl() {
    const sp = new URLSearchParams();
    if (state.q) sp.set('q', state.q);
    if (state.cat !== 'all') sp.set('categoria', state.cat);
    if (state.sub) sp.set('sublimables', '1');
    if (state.priced) sp.set('conprecio', '1');
    if (state.sort !== 'relevance') sp.set('orden', state.sort);
    const qs = sp.toString();
    history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  function filtered(ignoreCat) {
    const terms = norm(state.q).split(/\s+/).filter(Boolean);
    return products.filter((p) =>
      (ignoreCat || state.cat === 'all' || p.category === state.cat) &&
      (!state.sub || p.sublimable) &&
      (!state.priced || p.p100 != null) &&
      terms.every((t) => p.hay.includes(t)));
  }
  function sorted(list) {
    const price = (p) => (p.p100 == null ? Infinity : p.p100);
    const out = list.slice();
    if (state.sort === 'price-asc') out.sort((a, b) => price(a) - price(b) || a.order - b.order);
    else if (state.sort === 'price-desc') out.sort((a, b) => (b.p100 ?? -1) - (a.p100 ?? -1) || a.order - b.order);
    else if (state.sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    else out.sort((a, b) => a.order - b.order);
    return out;
  }

  // --- Render: categorías ----------------------------------------------------
  const catsEl = $('#cv-cats');
  function renderCats() {
    const base = filtered(true);
    const count = (id) => (id === 'all' ? base.length : base.filter((p) => p.category === id).length);
    const items = [{ id: 'all', label: 'Todos los productos' }, ...data.categories];
    catsEl.innerHTML = items.map((c) =>
      `<button type="button" class="cv-cat" role="listitem" data-cat="${c.id}" aria-pressed="${state.cat === c.id}">${esc(c.label)} <small>${count(c.id)}</small></button>`).join('');
  }
  catsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.cat = b.dataset.cat;
    state.shown = PAGE_SIZE;
    update();
    const nb = $(`[data-cat="${state.cat}"]`, catsEl);
    nb.focus({ preventScroll: true });
    // En celular los chips son una fila horizontal: centra el elegido sin mover la página.
    if (catsEl.scrollWidth > catsEl.clientWidth) {
      const r = nb.getBoundingClientRect(); const cr = catsEl.getBoundingClientRect();
      catsEl.scrollTo({ left: catsEl.scrollLeft + r.left - cr.left - (cr.width - r.width) / 2, behavior: 'smooth' });
    }
    // Si el usuario estaba más abajo, vuelve al inicio de los resultados.
    const top = $('.cv-layout').getBoundingClientRect().top + window.scrollY - 70;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  });

  // --- Render: tarjetas ------------------------------------------------------
  function priceBlock(p) {
    if (p.p100 == null && p.p1000 == null) return '<div class="cv-prices cv-prices-ask">Precio a consultar</div>';
    const cell = (label, v) => `<div><small>${label}</small><strong>${v == null ? 'Consultar' : money(v)}</strong></div>`;
    return `<div class="cv-prices"><p class="cv-prices-head">Precio por unidad${p.priceVaries ? ' · desde' : ''}</p>${cell('<span class="cv-xs-hide">Pedido </span>100 u.', p.p100)}${cell('<span class="cv-xs-hide">Pedido </span>1,000 u.', p.p1000)}</div>`;
  }
  function codesLine(p) {
    const codes = p.variants.map((v) => v.code).filter(Boolean);
    const parts = [];
    if (p.sku) parts.push(`SKU <b>${esc(p.sku)}</b>`);
    if (codes.length === 1) parts.push(`Cód. <b>${esc(codes[0])}</b>`);
    else if (codes.length > 1) parts.push(`<b>${codes.length}</b> códigos`);
    return parts.join(' · ');
  }
  function card(p) {
    const colors = uniqueColors(p);
    const dots = colors.map((c) => dot(c)).filter(Boolean);
    const shownDots = dots.slice(0, 7).join('');
    const extra = colors.length > 7 ? `<span class="cv-more-colors">+${colors.length - 7}</span>` : '';
    const colorTxt = colors.length ? `${colors.length} ${colors.length === 1 ? 'color' : 'colores'}: ${colors.join(', ')}` : '';
    const img = p.images[0]
      ? `<img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy" decoding="async">`
      : '<span class="cv-noimg">Imagen no disponible</span>';
    const badges = [p.sublimable ? '<span class="cv-badge">Sublimable</span>' : ''].join('');
    return `<article class="cv-card">
      <button type="button" class="cv-card-media" data-open="${p.id}" aria-label="Ver ficha de ${esc(p.name)}">${img}${badges ? `<span class="cv-badges">${badges}</span>` : ''}</button>
      <div class="cv-card-body">
        <span class="cv-card-cat">${esc(catLabel[p.category])}</span>
        <h3 class="cv-card-title"><button type="button" data-open="${p.id}">${esc(p.name)}</button></h3>
        <p class="cv-codes">${codesLine(p)}</p>
        <div class="cv-swatches" ${colorTxt ? `title="${esc(colorTxt)}"` : ''}>${shownDots}${extra}<span class="cv-sr">${esc(colorTxt)}</span></div>
        ${priceBlock(p)}
        <div class="cv-card-actions">
          <button type="button" class="cv-btn cv-btn-ghost" data-open="${p.id}">Ver ficha</button>
          <button type="button" class="cv-btn cv-btn-primary" data-add="${p.id}" aria-label="Añadir ${esc(p.name)} al carrito"><svg class="cv-ico"><use href="#cv-i-cart"/></svg> Añadir</button>
        </div>
      </div>
    </article>`;
  }

  const countEl = $('#cv-count');
  const emptyEl = $('#cv-empty');
  const moreEl = $('#cv-more');
  const moreBtn = $('#cv-more-btn');
  let current = [];
  function renderGrid() {
    current = sorted(filtered(false));
    const visible = current.slice(0, state.shown);
    grid.innerHTML = visible.map(card).join('');
    emptyEl.hidden = current.length > 0;
    const where = state.cat === 'all' ? 'en todo el catálogo' : `en ${esc(catLabel[state.cat])}`;
    countEl.innerHTML = `<b>${current.length}</b> ${current.length === 1 ? 'producto' : 'productos'} ${where}${state.q ? ` para “${esc(state.q)}”` : ''}`;
    const rest = current.length - visible.length;
    moreEl.hidden = rest <= 0;
    moreBtn.textContent = autoLoad ? `Cargando más productos… (${rest})` : `Ver más productos (${rest})`;
  }
  // Con IntersectionObserver los productos se cargan solos al bajar; el aviso no es clicable para que
  // ningún toque caiga sobre una tarjeta recién insertada. Sin él, queda el botón "Ver más".
  const autoLoad = 'IntersectionObserver' in window;
  if (autoLoad) {
    moreBtn.disabled = true;
    moreBtn.classList.add('cv-loading');
    new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !moreEl.hidden) { state.shown += PAGE_SIZE; renderGrid(); }
    }, { rootMargin: '600px' }).observe(moreEl);
  } else {
    moreBtn.addEventListener('click', () => { state.shown += PAGE_SIZE; renderGrid(); });
  }

  function update() { renderCats(); renderGrid(); syncUrl(); }

  // --- Buscador, filtros y orden --------------------------------------------
  const q = $('#cv-q');
  const qClear = $('#cv-q-clear');
  const subEl = $('#cv-f-sub');
  const priceEl = $('#cv-f-price');
  const sortEl = $('#cv-sort');
  q.value = state.q; subEl.checked = state.sub; priceEl.checked = state.priced; sortEl.value = state.sort;
  qClear.hidden = !state.q;
  let t;
  q.addEventListener('input', () => {
    qClear.hidden = !q.value;
    clearTimeout(t);
    t = setTimeout(() => { state.q = q.value.trim(); state.shown = PAGE_SIZE; update(); }, 140);
  });
  $('#cv-search-form').addEventListener('submit', (e) => { e.preventDefault(); q.blur(); $('.cv-layout').scrollIntoView({ behavior: 'smooth' }); });
  qClear.addEventListener('click', () => { q.value = ''; qClear.hidden = true; state.q = ''; update(); q.focus(); });
  subEl.addEventListener('change', () => { state.sub = subEl.checked; state.shown = PAGE_SIZE; update(); });
  priceEl.addEventListener('change', () => { state.priced = priceEl.checked; state.shown = PAGE_SIZE; update(); });
  sortEl.addEventListener('change', () => { state.sort = sortEl.value; update(); });
  $('#cv-reset').addEventListener('click', () => {
    Object.assign(state, { q: '', cat: 'all', sub: false, priced: false, sort: 'relevance', shown: PAGE_SIZE });
    q.value = ''; qClear.hidden = true; subEl.checked = false; priceEl.checked = false; sortEl.value = 'relevance';
    update();
  });

  // Resumen del hero
  const totalVariants = products.reduce((n, p) => n + p.variants.length, 0);
  $('#cv-stats').innerHTML = `<li><b>${products.length}</b>productos</li><li><b>${data.categories.length}</b>categorías</li><li><b>${totalVariants}</b>variantes de color y código</li>`;

  // --- WhatsApp ---------------------------------------------------------------
  function productLink(p) {
    return location.protocol.startsWith('http') ? `${location.origin}${location.pathname}#p=${p.id}` : '';
  }
  function quoteMessage(p, v, qty) {
    const lines = ['Hola VANYS 👋 Quiero cotizar este producto del catálogo:', `• Producto: ${p.name}`];
    if (p.sku) lines.push(`• SKU: ${p.sku}`);
    if (v) {
      if (v.code) lines.push(`• Código: ${v.code}`);
      if (v.color) lines.push(`• Color: ${v.color}`);
      if (v.detail) lines.push(`• Detalle: ${v.detail}`);
    } else {
      const codes = p.variants.map((x) => x.code).filter(Boolean);
      if (codes.length) lines.push(`• ${codes.length > 1 ? 'Códigos' : 'Código'}: ${codes.join(', ')}`);
    }
    if (qty) {
      lines.push(`• Cantidad: ${qty.toLocaleString('es-PE')} unidades`);
      const ref = v && (qty >= 1000 ? v.p1000 : qty >= 100 ? v.p100 : null);
      if (ref != null) lines.push(`• Precio de referencia: ${money(ref)} por unidad`);
    } else {
      lines.push('• Cantidad: ');
    }
    lines.push('Me gustaría personalizarlo con mi logo.');
    const link = productLink(p);
    if (link) lines.push(link);
    return lines.join('\n');
  }
  document.querySelectorAll('[data-wa]').forEach((a) => { a.href = waUrl(a.dataset.wa); });

  // --- Ficha ampliada -------------------------------------------------------
  const modal = $('#cv-modal');
  const inner = $('#cv-modal-inner');
  let lastFocus = null;
  let mState = null;

  function specsList(p) {
    const rows = [
      ['Capacidad', p.capacity], ['Medidas', p.size], ['Material', p.material], ['Empaque', p.packaging], ['Detalles', p.details],
    ].filter(([, v]) => v && v.length);
    if (!rows.length) return '';
    return `<p class="cv-block-title">Ficha técnica</p><dl class="cv-specs">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v.map(esc).join('<br>')}</dd>`).join('')}</dl>`;
  }
  function variantLabel(v, i) { return v.color || v.detail || v.code || `Opción ${i + 1}`; }
  function variantsTable(p) {
    const hasDetail = p.variants.some((v) => v.detail);
    const hasPrice = p.variants.some((v) => v.p100 != null || v.p1000 != null);
    const head = `<tr><th>Código</th><th>Color</th>${hasDetail ? '<th>Detalle</th>' : ''}${hasPrice ? '<th class="cv-num">x 100 u.</th><th class="cv-num">x 1,000 u.</th>' : ''}</tr>`;
    const rows = p.variants.map((v) => `<tr><td>${esc(v.code || '—')}</td><td>${dot(v.color)}${esc(v.color || '—')}</td>${hasDetail ? `<td>${esc(v.detail || '—')}</td>` : ''}${hasPrice ? `<td class="cv-num">${v.p100 != null ? money(v.p100) : 'Consultar'}</td><td class="cv-num">${v.p1000 != null ? money(v.p1000) : 'Consultar'}</td>` : ''}</tr>`).join('');
    return `<details class="cv-details" ${p.variants.length <= 6 ? 'open' : ''}><summary>Códigos y colores disponibles (${p.variants.length})</summary><div class="cv-table-wrap"><table class="cv-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div></details>`;
  }
  function priceBox(v) {
    if (v.p100 == null && v.p1000 == null) return '<div class="cv-pricebox cv-pricebox-ask">Precio a consultar · te lo enviamos en tu cotización</div>';
    const cell = (label, n) => `<div><small>${label}</small><strong>${n == null ? 'Consultar' : money(n)}</strong>${n == null ? '' : '<span>c/u</span>'}</div>`;
    return `<p class="cv-block-title">Precio por unidad</p><div class="cv-pricebox">${cell('Pedido de 100 u.', v.p100)}${cell('Pedido de 1,000 u.', v.p1000)}</div>`;
  }

  function renderModal() {
    const { p, vi, img, qty } = mState;
    const v = p.variants[vi];
    const many = p.variants.length > 1;
    const qtyNum = qty === 'other' ? parseInt(mState.other || '0', 10) || null : +qty;
    inner.innerHTML = `
      <button type="button" class="cv-close" data-close aria-label="Cerrar ficha"><svg class="cv-ico"><use href="#cv-i-close"/></svg></button>
      <div class="cv-gallery">
        <div class="cv-gallery-main">${p.images.length ? `<img src="${esc(p.images[img])}" alt="${esc(p.name)}${v.color ? ' · ' + esc(v.color) : ''}">` : '<span class="cv-noimg">Imagen no disponible</span>'}</div>
        ${p.images.length > 1 ? `<div class="cv-thumbs">${p.images.map((src, i) => `<button type="button" class="cv-thumb" data-img="${i}" aria-pressed="${i === img}" aria-label="Ver imagen ${i + 1}"><img src="${esc(src)}" alt=""></button>`).join('')}</div>` : ''}
      </div>
      <div class="cv-info">
        <span class="cv-card-cat">${esc(catLabel[p.category])}${p.section ? ' · ' + esc(p.section) : ''}</span>
        <h2 id="cv-m-title">${esc(p.name)}</h2>
        <div class="cv-ids">${p.sku ? `<span>SKU <b>${esc(p.sku)}</b></span>` : ''}${v.code ? `<span>Código <b>${esc(v.code)}</b></span>` : ''}${p.sublimable ? '<span class="cv-badge">Sublimable</span>' : ''}</div>
        ${priceBox(v)}
        <p class="cv-pricenote">${v.p100 != null || v.p1000 != null ? 'Precios de referencia por unidad según la cantidad del pedido. El precio final se confirma en tu cotización.' : 'Este producto se cotiza a pedido.'}</p>
        ${many ? `<p class="cv-block-title">Elige color o variante</p>
        <div class="cv-variants" role="radiogroup" aria-label="Color o variante">${p.variants.map((x, i) => `<button type="button" class="cv-variant${swatch(x.color) ? '' : ' cv-variant-noc'}" role="radio" aria-checked="${i === vi}" data-v="${i}">${dot(x.color)}${esc(variantLabel(x, i))}</button>`).join('')}</div>` : ''}
        <p class="cv-selected">${v.color ? `Color: <b>${esc(v.color)}</b>` : ''}${v.color && v.code ? ' · ' : ''}${v.code ? `Código: <b>${esc(v.code)}</b>` : ''}${v.detail ? ` · ${esc(v.detail)}` : ''}</p>
        ${specsList(p)}
        ${variantsTable(p)}
        ${productLink(p) ? '<div class="cv-share"><button type="button" class="cv-btn cv-btn-ghost cv-btn-sm" data-copy><svg class="cv-ico"><use href="#cv-i-link"/></svg> Copiar enlace del producto</button></div>' : ''}
        <div class="cv-buy">
          ${mState.added
            ? `<p class="cv-added" role="status"><svg class="cv-ico"><use href="#cv-i-check"/></svg> ${esc(mState.added)} <button type="button" class="cv-linkbtn" data-open-cart>Ver carrito</button></p>`
            : mState.hint ? `<p class="cv-hint" role="status">${many ? 'Elige el color arriba, la cantidad aquí' : 'Elige la cantidad'} y toca «Añadir al carrito».</p>` : ''}
          <div class="cv-qty" role="radiogroup" aria-label="Cantidad a cotizar">
            <span class="cv-qty-label">Cantidad</span>
            <label><input type="radio" name="cv-qty" value="100" ${qty === '100' ? 'checked' : ''}><span>100 u.</span></label>
            <label><input type="radio" name="cv-qty" value="1000" ${qty === '1000' ? 'checked' : ''}><span>1,000 u.</span></label>
            <label><input type="radio" name="cv-qty" value="other" ${qty === 'other' ? 'checked' : ''}><span>Otra</span></label>
            ${qty === 'other' ? `<input class="cv-qty-other" id="cv-qty-n" type="number" min="1" step="1" inputmode="numeric" value="${mState.other || ''}" placeholder="Ej. 300" aria-label="Cantidad de unidades">` : ''}
          </div>
          <div class="cv-cta">
            <button type="button" class="cv-btn cv-btn-primary cv-btn-cart" data-add-cart><svg class="cv-ico"><use href="#cv-i-cart"/></svg> Añadir al carrito</button>
            <a class="cv-btn cv-btn-wa" id="cv-m-wa" href="${esc(waUrl(quoteMessage(p, v, qtyNum)))}" target="_blank" rel="noopener" aria-label="Cotizar solo este producto por WhatsApp" title="Cotizar solo este producto por WhatsApp"><svg class="cv-ico"><use href="#cv-i-wa"/></svg><span>WhatsApp</span></a>
          </div>
        </div>
      </div>`;
  }
  function refreshWa() {
    const { p, vi, qty } = mState;
    const n = qty === 'other' ? parseInt(mState.other || '0', 10) || null : +qty;
    const a = $('#cv-m-wa', inner);
    if (a) a.href = waUrl(quoteMessage(p, p.variants[vi], n));
  }

  function openProduct(id, push = true, hint = false) {
    const p = byId.get(id);
    if (!p) return;
    lastFocus = document.activeElement;
    mState = { p, vi: 0, img: 0, qty: '100', other: '', hint, added: '' };
    renderModal();
    if (!modal.open) {
      if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', '');
    }
    inner.scrollTop = 0;
    document.documentElement.style.overflow = 'hidden';
    if (push) history.replaceState(history.state, '', location.pathname + location.search + '#p=' + p.id);
    (hint && $('[data-v]', inner) || $('.cv-close', inner)).focus();
  }
  function closeProduct() {
    if (modal.open) { if (typeof modal.close === 'function') modal.close(); else modal.removeAttribute('open'); }
  }
  modal.addEventListener('close', () => {
    document.documentElement.style.overflow = '';
    if (location.hash.startsWith('#p=')) history.replaceState(history.state, '', location.pathname + location.search);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) closeProduct(); });
  inner.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-close]')) return closeProduct();
    const vb = t.closest('[data-v]');
    if (vb) {
      mState.vi = +vb.dataset.v;
      mState.added = '';
      const vimg = mState.p.variants[mState.vi].img;
      if (vimg != null) mState.img = vimg;
      renderModal();
      $(`[data-v="${mState.vi}"]`, inner).focus();
      return;
    }
    if (t.closest('[data-add-cart]')) {
      const qty = mState.qty === 'other' ? parseInt(mState.other || '0', 10) : +mState.qty;
      const field = $('#cv-qty-n', inner);
      if (!(qty >= 1)) { field.setCustomValidity('Escribe cuántas unidades necesitas.'); field.reportValidity(); field.focus(); return; }
      const v = mState.p.variants[mState.vi];
      window.VanysCarrito.add(mState.p.id, mState.vi, qty);
      mState.hint = false;
      mState.added = `Añadido: ${qty.toLocaleString('es-PE')} u.${v.color ? ' · ' + v.color : v.code ? ' · ' + v.code : ''}.`;
      renderModal();
      $('[data-open-cart]', inner).focus();
      return;
    }
    const ib = t.closest('[data-img]');
    if (ib) { mState.img = +ib.dataset.img; renderModal(); $(`[data-img="${mState.img}"]`, inner).focus(); return; }
    const cb = t.closest('[data-copy]');
    if (cb) {
      const link = productLink(mState.p);
      const done = () => { cb.insertAdjacentHTML('afterend', '<span class="cv-copied" role="status">¡Enlace copiado!</span>'); setTimeout(() => $('.cv-copied', inner)?.remove(), 2200); };
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => prompt('Copia este enlace:', link));
      else prompt('Copia este enlace:', link);
    }
  });
  inner.addEventListener('change', (e) => {
    if (e.target.name === 'cv-qty') {
      mState.qty = e.target.value;
      renderModal();
      if (mState.qty === 'other') $('#cv-qty-n', inner).focus();
      else $(`input[name="cv-qty"][value="${mState.qty}"]`, inner).focus();
    }
  });
  inner.addEventListener('input', (e) => {
    if (e.target.id === 'cv-qty-n') { e.target.setCustomValidity(''); mState.other = e.target.value; refreshWa(); }
  });
  // Flechas para moverse entre colores (patrón radiogroup)
  inner.addEventListener('keydown', (e) => {
    const vb = e.target.closest('[data-v]');
    if (!vb || !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const n = mState.p.variants.length;
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    $(`[data-v="${(+vb.dataset.v + step + n) % n}"]`, inner).click();
  });

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (b) return openProduct(b.dataset.open);
    const a = e.target.closest('[data-add]');
    if (!a) return;
    const p = byId.get(a.dataset.add);
    // Un solo color/código: se añade directo (100 u.). Varios: se abre la ficha para elegir.
    if (p.variants.length === 1) window.VanysCarrito.add(p.id, 0, 100);
    else openProduct(p.id, true, true);
  });
  function fromHash() {
    const m = location.hash.match(/^#p=([\w-]+)/);
    if (m && byId.has(m[1])) openProduct(m[1], false);
    else if (modal.open && !location.hash) closeProduct();
  }
  window.addEventListener('hashchange', fromHash);

  // API mínima para carrito.js (que se carga después de este archivo).
  window.VanysCatalogo = { data, byId, catLabel, money, esc, dot, waUrl, productLink, closeProduct, WHATSAPP_NUMBER };

  update();
  fromHash();
})();
