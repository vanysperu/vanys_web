/* ==========================================================================
   VANYS · Catálogo digital · Carrito de cotización
   El cliente junta productos (color + cantidad), deja sus datos y la solicitud
   se envía directo al sistema de cotizaciones (endpoint y API key en config.js).
   Sin endpoint, o si falla, se envía por WhatsApp.
   No hay pagos: es una solicitud de cotización.
   Depende de window.VanysCatalogo (catalogo.js) y window.VANYS_CATALOGO_CONFIG.
   ========================================================================== */
(function () {
  'use strict';

  const C = window.VanysCatalogo;
  if (!C) return;
  const cfg = Object.assign({ endpoint: '', headers: {}, timeoutMs: 15000, whatsappFallback: true }, window.VANYS_CATALOGO_CONFIG || {});
  const { byId, catLabel, money, esc, dot, waUrl } = C;
  const $ = (sel, root = document) => root.querySelector(sel);
  const STORAGE_KEY = 'vanys-catalogo-carrito-v1';
  const MAX_QTY = 1000000;
  const MAX_ITEMS = 50;   // límite del sistema por solicitud (SKU distintos)

  // --- Estado ----------------------------------------------------------------
  // Solo se guarda { id, code, color, vi, qty }: precios y nombres se leen siempre del catálogo vigente.
  const storage = {
    read() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { return []; } },
    write(list) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* modo privado */ } },
  };
  const clampQty = (n) => Math.max(1, Math.min(MAX_QTY, parseInt(n, 10) || 1));
  // Ubica la variante por código y color (por si el catálogo se regeneró y cambió el orden).
  function resolve(it) {
    const p = byId.get(it && it.id);
    if (!p) return null;
    let vi = p.variants.findIndex((v) => (v.code || null) === (it.code || null) && (v.color || null) === (it.color || null));
    if (vi < 0 && Number.isInteger(it.vi) && p.variants[it.vi]) vi = it.vi;
    if (vi < 0) return null;
    return { id: p.id, vi, code: p.variants[vi].code, color: p.variants[vi].color, qty: clampQty(it.qty) };
  }
  let items = storage.read().map(resolve).filter(Boolean);
  const save = () => { storage.write(items); renderCount(); };

  function line(it) {
    const p = byId.get(it.id);
    const v = p.variants[it.vi];
    let unit = null; let tier = null;
    if (it.qty >= 1000 && v.p1000 != null) { unit = v.p1000; tier = 'x1000'; } else if (it.qty >= 100 && v.p100 != null) { unit = v.p100; tier = 'x100'; }
    return { it, p, v, unit, tier, subtotal: unit == null ? null : Math.round(unit * it.qty * 100) / 100 };
  }
  function totals() {
    const lines = items.map(line);
    return {
      lines,
      units: lines.reduce((n, l) => n + l.it.qty, 0),
      total: Math.round(lines.reduce((n, l) => n + (l.subtotal || 0), 0) * 100) / 100,
      unpriced: lines.filter((l) => l.unit == null).length,
    };
  }

  function add(id, vi, qty) {
    const p = byId.get(id);
    if (!p || !p.variants[vi]) return;
    const found = items.find((x) => x.id === id && x.vi === vi);
    if (found) found.qty = clampQty(found.qty + qty);
    else items.push({ id, vi, code: p.variants[vi].code, color: p.variants[vi].color, qty: clampQty(qty) });
    save();
    if (drawer.open) render();
    const v = p.variants[vi];
    toast(`Añadido al carrito: <b>${esc(p.name)}</b>${v.color ? ' · ' + esc(v.color) : ''} (${qty.toLocaleString('es-PE')} u.)`);
  }

  // --- Contador y aviso ------------------------------------------------------
  function renderCount() {
    const n = items.length;
    document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = n; el.classList.toggle('cv-has', n > 0); });
    document.querySelectorAll('.cv-cart-btn').forEach((b) => b.setAttribute('aria-label', `Ver carrito (${n} ${n === 1 ? 'producto' : 'productos'})`));
  }
  const toastEl = $('#cv-toast');
  let toastTimer;
  function toast(html) {
    toastEl.innerHTML = `<svg class="cv-ico"><use href="#cv-i-check"/></svg><span>${html}</span><button type="button" class="cv-linkbtn" data-open-cart>Ver carrito</button>`;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4500);
  }

  // --- Panel del carrito -------------------------------------------------------
  const drawer = $('#cv-cart');
  const inner = $('#cv-cart-inner');
  const productModal = $('#cv-modal');
  let step = 'cart';       // cart | form | sent
  let sending = false;
  let lastResult = null;   // { mode: 'endpoint' | 'whatsapp', numero }
  let form = { nombre: '', empresa: '', ruc: '', telefono: '', email: '', comentarios: '' };
  let formError = '';

  function head(title, back) {
    return `<div class="cv-drawer-head">
      ${back ? `<button type="button" class="cv-iconbtn" data-step="${back}" aria-label="Volver"><svg class="cv-ico"><use href="#cv-i-back"/></svg></button>` : ''}
      <h2 id="cv-cart-title">${title}</h2>
      <button type="button" class="cv-iconbtn" data-cart-close aria-label="Cerrar carrito"><svg class="cv-ico"><use href="#cv-i-close"/></svg></button>
    </div>`;
  }
  function summary(t) {
    return `<div class="cv-sum">
      <div><span>Productos</span><b>${t.lines.length}</b></div>
      <div><span>Unidades</span><b>${t.units.toLocaleString('es-PE')}</b></div>
      <div class="cv-sum-total"><span>Total referencial</span><b>${t.total > 0 ? money(t.total) : 'A cotizar'}</b></div>
      <p>${t.unpriced ? `${t.unpriced} ${t.unpriced === 1 ? 'producto se cotiza' : 'productos se cotizan'} aparte (sin precio publicado o menos de 100 u.). ` : ''}Precios referenciales por unidad según la cantidad; el precio final se confirma en tu cotización.</p>
    </div>`;
  }
  function itemRow(l) {
    const { it, p, v } = l;
    const img = p.images[v.img != null ? v.img : 0] || p.images[0];
    const meta = [p.sku && `SKU ${p.sku}`, v.code && `Cód. ${v.code}`].filter(Boolean).join(' · ');
    const price = l.unit == null
      ? '<span class="cv-li-ask">A cotizar</span>'
      : `${money(l.unit)} c/u <small>(precio ${l.tier === 'x1000' ? 'x 1,000' : 'x 100'})</small> · <b>${money(l.subtotal)}</b>`;
    return `<li class="cv-li" data-line="${items.indexOf(it)}">
      <div class="cv-li-img">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}</div>
      <div class="cv-li-body">
        <strong>${esc(p.name)}</strong>
        <span class="cv-li-meta">${esc(meta)}</span>
        ${v.color || v.detail ? `<span class="cv-li-meta">${dot(v.color)}${esc([v.color, v.detail].filter(Boolean).join(' · '))}</span>` : ''}
        <div class="cv-li-row">
          <label class="cv-li-qty"><span class="cv-sr">Cantidad de ${esc(p.name)}</span><input type="number" min="1" max="${MAX_QTY}" step="1" inputmode="numeric" value="${it.qty}" data-qty> <span aria-hidden="true">u.</span></label>
          <button type="button" class="cv-iconbtn cv-li-del" data-del aria-label="Quitar ${esc(p.name)} del carrito"><svg class="cv-ico"><use href="#cv-i-trash"/></svg></button>
        </div>
        <span class="cv-li-price">${price}</span>
      </div>
    </li>`;
  }

  function render() {
    if (step === 'sent') return renderSent();
    if (!items.length) {
      step = 'cart';
      inner.innerHTML = `${head('Tu carrito')}<div class="cv-drawer-body cv-cart-empty">
        <svg class="cv-ico" aria-hidden="true"><use href="#cv-i-cart"/></svg>
        <strong>Tu carrito está vacío</strong>
        <p>Añade los productos que te interesan, con su color y cantidad, y envíanos una sola solicitud de cotización.</p>
        <button type="button" class="cv-btn cv-btn-primary" data-cart-close>Ver productos</button></div>`;
      return;
    }
    const t = totals();
    if (step === 'cart') {
      inner.innerHTML = `${head('Tu carrito')}
        <div class="cv-drawer-body"><ul class="cv-list">${t.lines.map(itemRow).join('')}</ul>
          <button type="button" class="cv-linkbtn cv-clear" data-clear>Vaciar carrito</button></div>
        <div class="cv-drawer-foot">${summary(t)}
          <button type="button" class="cv-btn cv-btn-primary cv-btn-block" data-step="form">Continuar con mis datos <svg class="cv-ico"><use href="#cv-i-arrow"/></svg></button></div>`;
      return;
    }
    // step === 'form'
    const f = (name, label, attrs = '', type = 'text') => `<label class="cv-field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(form[name])}" ${attrs}></label>`;
    inner.innerHTML = `${head('Tus datos', 'cart')}
      <form class="cv-drawer-body cv-form" id="cv-cart-form" novalidate>
        <p class="cv-form-intro">Te enviaremos la cotización de tus <b>${t.lines.length} ${t.lines.length === 1 ? 'producto' : 'productos'}</b> (${t.units.toLocaleString('es-PE')} u.).</p>
        ${f('nombre', 'Nombre y apellido *', 'required maxlength="120" autocomplete="name"')}
        ${f('telefono', 'Celular / WhatsApp *', 'required maxlength="20" autocomplete="tel" inputmode="tel" placeholder="Ej. 987 654 321"', 'tel')}
        ${f('email', 'Correo electrónico', 'maxlength="120" autocomplete="email" placeholder="Opcional"', 'email')}
        ${cfg.endpoint
          // El sistema no recibe empresa ni comentarios: con endpoint solo se piden los datos que sí guarda.
          ? f('ruc', 'RUC', 'maxlength="11" inputmode="numeric" pattern="\\d{11}" placeholder="Opcional"')
          : `<div class="cv-field-row">
          ${f('empresa', 'Empresa', 'maxlength="120" autocomplete="organization" placeholder="Opcional"')}
          ${f('ruc', 'RUC', 'maxlength="11" inputmode="numeric" pattern="\\d{11}" placeholder="Opcional"')}
        </div>
        <label class="cv-field"><span>Comentarios</span><textarea name="comentarios" rows="3" maxlength="1000" placeholder="Logo, fecha de entrega, técnica de impresión… (opcional)">${esc(form.comentarios)}</textarea></label>`}
        <label class="cv-hp" aria-hidden="true">Sitio web <input name="website" tabindex="-1" autocomplete="off"></label>
        ${formError ? `<div class="cv-form-error" role="alert">${formError}</div>` : ''}
      </form>
      <div class="cv-drawer-foot">${summary(t)}
        <button type="submit" form="cv-cart-form" class="cv-btn ${cfg.endpoint ? 'cv-btn-primary' : 'cv-btn-wa'} cv-btn-block" ${sending ? 'disabled' : ''}>
          ${sending ? 'Enviando…' : cfg.endpoint ? 'Enviar solicitud de cotización' : '<svg class="cv-ico"><use href="#cv-i-wa"/></svg> Enviar solicitud por WhatsApp'}</button>
        <p class="cv-privacy">Usaremos tus datos solo para responder esta solicitud.</p>
      </div>`;
  }
  function renderSent() {
    const r = lastResult || {};
    inner.innerHTML = `${head(r.mode === 'whatsapp' ? 'Revisa WhatsApp' : '¡Solicitud enviada!')}
      <div class="cv-drawer-body cv-sent">
        <span class="cv-sent-ico"><svg class="cv-ico"><use href="#${r.mode === 'whatsapp' ? 'cv-i-wa' : 'cv-i-check'}"/></svg></span>
        ${r.mode === 'whatsapp'
          ? `<strong>Abrimos WhatsApp con tu solicitud</strong>
             <p>Solo falta tocar <b>Enviar</b> en WhatsApp. Si no se abrió, <a href="${esc(r.url)}" target="_blank" rel="noopener">ábrelo aquí</a>.</p>
             <div class="cv-sent-actions"><button type="button" class="cv-btn cv-btn-primary" data-clear-done>Ya la envié, vaciar carrito</button>
             <button type="button" class="cv-btn cv-btn-ghost" data-step="cart">Volver al carrito</button></div>`
          : `<strong>Recibimos tu solicitud${r.numero ? ` ${esc(r.numero)}` : ''}</strong>
             <p>Te enviaremos la cotización al ${esc(r.telefono || 'contacto que nos dejaste')} en menos de 24 horas.</p>
             <p>¿Quieres contarnos más (logo, fecha de entrega, técnica)? <a href="${esc(waUrl(`Hola VANYS 👋 Envié la solicitud de cotización${r.numero ? ' ' + r.numero : ''} desde el catálogo y quiero agregar: `))}" target="_blank" rel="noopener">Escríbenos por WhatsApp</a>.</p>
             <div class="cv-sent-actions"><button type="button" class="cv-btn cv-btn-primary" data-cart-close>Seguir viendo productos</button></div>`}
      </div>`;
  }

  function openCart() {
    const show = () => {
      if (step === 'sent' && lastResult && lastResult.mode === 'endpoint') step = 'cart';
      render();
      if (!drawer.open) { if (typeof drawer.showModal === 'function') drawer.showModal(); else drawer.setAttribute('open', ''); }
      document.documentElement.style.overflow = 'hidden';
      ($('.cv-drawer-body [data-qty]', inner) || $('[data-cart-close]', inner)).focus();
    };
    toastEl.hidden = true;
    // Si la ficha está abierta, se cierra primero (espera su evento "close" para no pelear por el foco).
    if (productModal.open) { productModal.addEventListener('close', show, { once: true }); C.closeProduct(); } else show();
  }
  function closeCart() { if (drawer.open) { if (typeof drawer.close === 'function') drawer.close(); else drawer.removeAttribute('open'); } }
  drawer.addEventListener('close', () => {
    document.documentElement.style.overflow = '';
    if (step === 'sent' && lastResult && lastResult.mode === 'endpoint') { step = 'cart'; lastResult = null; }
  });
  drawer.addEventListener('click', (e) => { if (e.target === drawer) closeCart(); });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-cart]')) { e.preventDefault(); openCart(); }
  });
  inner.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-cart-close]')) return closeCart();
    const st = t.closest('[data-step]');
    if (st) { step = st.dataset.step; formError = ''; render(); ($('input', inner) || $('button', inner)).focus(); return; }
    const del = t.closest('[data-del]');
    if (del) {
      items.splice(+del.closest('[data-line]').dataset.line, 1);
      save(); render();
      ($('[data-del]', inner) || $('[data-cart-close]', inner)).focus();
      return;
    }
    if (t.closest('[data-clear]')) {
      if (confirm('¿Quitar todos los productos del carrito?')) { items = []; save(); render(); $('[data-cart-close]', inner).focus(); }
      return;
    }
    if (t.closest('[data-clear-done]')) { items = []; save(); step = 'cart'; lastResult = null; render(); }
  });
  inner.addEventListener('change', (e) => {
    if (!e.target.matches('[data-qty]')) return;
    const idx = +e.target.closest('[data-line]').dataset.line;
    items[idx].qty = clampQty(e.target.value);
    save(); render();
    $(`[data-line="${idx}"] [data-qty]`, inner).focus();
  });
  inner.addEventListener('input', (e) => {
    const el = e.target;
    if (el.form && el.form.id === 'cv-cart-form' && el.name in form) { form[el.name] = el.value; el.setCustomValidity(''); }
  });
  inner.addEventListener('submit', (e) => { e.preventDefault(); submit(e.target); });

  // --- Envío -----------------------------------------------------------------
  // Celular en dígitos, sin el 51 de Perú: el sistema acepta de 6 a 9 dígitos.
  function phoneDigits(s) {
    const d = String(s || '').replace(/\D/g, '');
    return d.length === 11 && d.startsWith('51') ? d.slice(2) : d;
  }
  const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  function validate(f) {
    const tel = phoneDigits(form.telefono);
    f.telefono.setCustomValidity(tel.length >= 6 && tel.length <= 9 ? '' : 'Escribe un número de celular válido (9 dígitos).');
    f.ruc.setCustomValidity(!form.ruc || /^\d{11}$/.test(form.ruc.trim()) ? '' : 'El RUC tiene 11 dígitos.');
    const name = cleanName(form.nombre);
    // El sistema guarda el nombre solo con letras (sin números ni signos).
    f.nombre.setCustomValidity(name.length < 2 ? 'Escribe tu nombre.' : cfg.endpoint && !/^[\p{L} ]+$/u.test(name) ? 'Escribe tu nombre solo con letras.' : '');
    if (!f.checkValidity()) { const bad = f.querySelector(':invalid'); bad.reportValidity(); bad.focus(); return false; }
    return true;
  }
  // Resumen completo de la solicitud (se usa para el mensaje de WhatsApp y para armar el envío al sistema).
  function buildPayload() {
    const t = totals();
    const clean = (s) => String(s || '').trim();
    return {
      origen: 'catalogo-web',
      version: 1,
      fecha: new Date().toISOString(),
      pagina: location.href,
      catalogo: { generado: C.data.generated, fuente: C.data.source },
      cliente: {
        nombre: clean(form.nombre), telefono: clean(form.telefono), email: clean(form.email),
        empresa: clean(form.empresa), ruc: clean(form.ruc), comentarios: clean(form.comentarios),
      },
      items: t.lines.map((l) => ({
        productoId: l.p.id, sku: l.p.sku, codigo: l.v.code, nombre: l.p.name,
        categoria: catLabel[l.p.category], color: l.v.color, detalle: l.v.detail,
        cantidad: l.it.qty,
        precioUnitarioReferencial: l.unit, tarifa: l.tier, subtotalReferencial: l.subtotal,
      })),
      totales: { productos: t.lines.length, unidades: t.units, totalReferencial: t.total, productosACotizar: t.unpriced, moneda: 'PEN' },
    };
  }
  // Cuerpo que recibe el sistema (POST /api/public/quotation-request).
  // Cada color va con su código (A1100-02); si no tiene código, con el SKU del producto.
  // Los SKU repetidos se suman. Documentado en catalogo-generador/LEEME.txt.
  function apiPayload(payload) {
    const c = payload.cliente;
    const client = { phone: phoneDigits(c.telefono), name: cleanName(c.nombre) };
    if (c.email) client.email = c.email;
    if (c.ruc) { client.document_type = 6; client.document_number = c.ruc; }
    const bySku = new Map();
    payload.items.forEach((it) => {
      const sku = it.codigo || it.sku;
      const k = sku.toUpperCase();
      if (bySku.has(k)) bySku.get(k).quantity = Math.min(MAX_QTY, bySku.get(k).quantity + it.cantidad);
      else bySku.set(k, { sku, quantity: it.cantidad });
    });
    return { client, items: [...bySku.values()] };
  }
  function whatsappText(payload) {
    const c = payload.cliente;
    const out = ['Hola VANYS 👋 Quiero cotizar estos productos del catálogo:', ''];
    payload.items.forEach((it, i) => {
      out.push(`${i + 1}. ${it.nombre}${it.sku ? ` (SKU ${it.sku})` : ''}`);
      out.push('   ' + [it.codigo && 'Cód. ' + it.codigo, it.color, it.detalle, `${it.cantidad.toLocaleString('es-PE')} u.`,
        it.precioUnitarioReferencial != null && `ref. ${money(it.precioUnitarioReferencial)} c/u`].filter(Boolean).join(' · '));
    });
    out.push('', `Total referencial: ${payload.totales.totalReferencial > 0 ? money(payload.totales.totalReferencial) : 'a cotizar'}`, '');
    out.push(`Nombre: ${c.nombre}`, `Celular: ${c.telefono}`);
    if (c.email) out.push(`Correo: ${c.email}`);
    if (c.empresa) out.push(`Empresa: ${c.empresa}`);
    if (c.ruc) out.push(`RUC: ${c.ruc}`);
    if (c.comentarios) out.push(`Comentarios: ${c.comentarios}`);
    return out.join('\n');
  }
  function sendWhatsapp(payload) {
    const url = waUrl(whatsappText(payload));
    window.open(url, '_blank', 'noopener');
    lastResult = { mode: 'whatsapp', url };
    step = 'sent';
    render();
  }

  async function submit(f) {
    if (sending || !validate(f)) return;
    formError = '';
    // Trampa anti-spam: los bots suelen llenar el campo oculto "website".
    if (f.website && f.website.value) { lastResult = { mode: 'endpoint' }; step = 'sent'; items = []; save(); return render(); }
    const payload = buildPayload();
    if (!cfg.endpoint) return sendWhatsapp(payload);
    const body = apiPayload(payload);
    if (body.items.length > MAX_ITEMS) {
      formError = `Puedes enviar hasta ${MAX_ITEMS} productos por solicitud. Quita algunos del carrito y envíalos en otra solicitud.`;
      return render();
    }

    sending = true; render();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    const fallback = cfg.whatsappFallback ? ' Puedes reintentar o <button type="button" class="cv-linkbtn" data-wa-fallback>enviarla por WhatsApp</button>.' : ' Por favor, reintenta en unos minutos.';
    try {
      const res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, cfg.headers),
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      let r = {};
      try { r = await res.json(); } catch (e) { /* sin JSON */ }
      if (res.ok && r.success) {
        const id = r.data && r.data.quotation_id;
        lastResult = { mode: 'endpoint', numero: id ? `COT-${id}` : '', telefono: payload.cliente.telefono };
        items = []; save();
        step = 'sent';
      } else if (res.status === 400 && r.message) {
        // Dato que el sistema no acepta: su mensaje ya viene en español para el cliente.
        formError = esc(r.message);
      } else if (res.status === 429 && r.message) {
        formError = esc(r.message) + fallback;
      } else {
        throw new Error('HTTP ' + res.status);
      }
    } catch (err) {
      formError = (err.name === 'AbortError' ? 'El sistema tardó demasiado en responder.' : 'No pudimos enviar tu solicitud en este momento.') + fallback;
    } finally {
      clearTimeout(timer);
      sending = false;
      render();
      if (step === 'sent') $('.cv-sent .cv-btn', inner).focus(); else ($('[data-wa-fallback]', inner) || $('[type="submit"]', inner)).focus();
    }
  }
  inner.addEventListener('click', (e) => { if (e.target.closest('[data-wa-fallback]')) sendWhatsapp(buildPayload()); });

  window.VanysCarrito = { add, open: openCart, get items() { return items.map(line); } };
  renderCount();
})();
