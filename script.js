// VANYS · Interacciones y envío de consultas por WhatsApp.
// Todas las páginas comparten este archivo. Cambia el número aquí si cambia el WhatsApp comercial.
// Las promociones (flyers del carrusel) se editan en promos.js.
(() => {
  const WHATSAPP_NUMBER = '51952350797';
  const DEFAULT_MESSAGE = 'Hola VANYS 👋 Quisiera información sobre sus servicios.';
  const catalogs = {
    products: { title: 'Catálogo de productos', url: 'https://heyzine.com/flip-book/eefcd7b8f8.html' },
    promos: { title: 'Catálogo de promociones', url: 'https://heyzine.com/flip-book/6099e2ac34.html' },
    pens: { title: 'Catálogo de lapiceros', url: 'https://heyzine.com/flip-book/4ddea0a2d4.html' }
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const waUrl = (message) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  const openWhatsApp = (message) => {
    const url = waUrl(message);
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) window.location.href = url;
  };

  // --- Año en el pie ---------------------------------------------------------
  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  // --- Menú móvil ------------------------------------------------------------
  const menuToggle = $('#menuToggle');
  const navlinks = $('#navlinks');
  if (menuToggle && navlinks) {
    const setMenu = (open) => {
      navlinks.classList.toggle('open', open);
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      menuToggle.textContent = open ? '✕' : '☰';
    };
    menuToggle.addEventListener('click', () => setMenu(!navlinks.classList.contains('open')));
    $$('a', navlinks).forEach((link) => link.addEventListener('click', () => setMenu(false)));
  }

  // --- Visor ampliado (flyers del carrusel) ----------------------------------
  let lightbox;
  const openLightbox = (src, alt) => {
    if (!lightbox) {
      lightbox = document.createElement('dialog');
      lightbox.className = 'lightbox';
      lightbox.innerHTML = '<div class="lightbox-frame"><button type="button" class="lightbox-close" aria-label="Cerrar">✕</button><img alt=""></div>';
      lightbox.addEventListener('click', (event) => {
        if (event.target === lightbox || event.target.classList.contains('lightbox-close')) lightbox.close();
      });
      document.body.appendChild(lightbox);
    }
    const image = $('img', lightbox);
    image.src = src;
    image.alt = alt || '';
    if (typeof lightbox.showModal === 'function') lightbox.showModal();
    else window.open(src, '_blank', 'noopener');
  };

  // --- Carrusel de promociones -----------------------------------------------
  // Los flyers salen del sistema (Ventas → Anuncios), por la zona de data-zone (mer, tec), a través de
  // catalogo/api/anuncios.php, que guarda la API key en el servidor. Si el sistema no responde (o la página
  // se abre sin PHP), se usan los flyers de promos.js. Si la zona no tiene anuncios prendidos, la sección se oculta.
  // Ocupa todo el ancho; muestra hasta 2 flyers completos a la vez (1 en celular), nunca corta una imagen
  // y avanza solo cada 5 s. Con 2 flyers muestra uno a la vez (clase "duo"), para que también se mueva.
  // En promos.js la línea (merch/web) se deduce de la carpeta del flyer: assets/promociones/merch o assets/promociones/web.
  const ADS_ENDPOINT = 'catalogo/api/anuncios.php';
  const promoLine = (promo) => {
    if (promo.line) return promo.line;
    if (/\/promociones\/web\//i.test(promo.image || '')) return 'web';
    if (/\/promociones\/merch\//i.test(promo.image || '')) return 'merch';
    return 'all';
  };
  const promos = (Array.isArray(window.VANYS_PROMOS) ? window.VANYS_PROMOS : []).map((promo) => ({ ...promo, line: promoLine(promo) }));
  // Anuncios de la zona, ya ordenados; null si no se pudieron leer.
  const loadAds = async (zone) => {
    try {
      const res = await fetch(`${ADS_ENDPOINT}?zona=${encodeURIComponent(zone)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined });
      if (!res.ok) return null;
      const json = await res.json(); // sin PHP llega el código como texto: aquí falla y se usa promos.js
      return json && json.success && Array.isArray(json.ads) ? json.ads : null;
    } catch (error) {
      return null;
    }
  };
  const isExternal = (url) => { try { return new URL(url, window.location.href).origin !== window.location.origin; } catch (error) { return true; } };

  $$('[data-promos]').forEach(async (carousel) => {
    const filter = carousel.dataset.promos || 'all';
    const ads = carousel.dataset.zone ? await loadAds(carousel.dataset.zone) : null;
    const list = ads
      ? ads.map((ad) => ({ image: ad.image_url, alt: ad.title, link: ad.link_url, line: filter }))
      : promos.filter((promo) => filter === 'all' || promo.line === 'all' || promo.line === filter);
    const section = carousel.closest('section');
    if (!list.length) {
      if (section) section.hidden = true;
      return;
    }
    const hasLinks = list.some((promo) => promo.link);
    carousel.classList.add('promo-carousel');
    carousel.classList.toggle('single', list.length === 1);
    carousel.classList.toggle('duo', list.length === 2);
    carousel.innerHTML = `
      <div class="promo-viewport">
        <button type="button" class="promo-nav prev" aria-label="Promoción anterior">‹</button>
        <div class="promo-track" tabindex="0" aria-label="Ofertas y promociones">
          ${list.map((promo, index) => {
            const images = promo.image ? `<img class="promo-bg" src="${escapeHtml(promo.image)}" alt="" aria-hidden="true" decoding="async"><img class="promo-img" src="${escapeHtml(promo.image)}" alt="${escapeHtml(promo.alt || 'Promoción VANYS')}" decoding="async">` : '';
            const target = promo.link && isExternal(promo.link) ? ' target="_blank" rel="noopener"' : '';
            return `<figure class="promo-slide${promo.link ? ' has-link' : ''}" data-index="${index}" data-message="${escapeHtml(promo.message || `Hola VANYS 👋 Vi la promoción "${promo.alt || ''}" y quiero más información.`)}">
            ${promo.link ? `<a class="promo-link" href="${escapeHtml(promo.link)}"${target}>${images}</a>` : images}
            <span class="promo-zoom" aria-hidden="true">${promo.link ? 'Ver promoción ↗' : '🔍 Ampliar'}</span>
          </figure>`;
          }).join('')}
        </div>
        <button type="button" class="promo-nav next" aria-label="Promoción siguiente">›</button>
      </div>
      <div class="promo-dots" role="tablist" aria-label="Ir a una promoción"></div>
      <div class="promo-cta"><a class="btn btn-wa wa-link" href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank" rel="noopener noreferrer"><svg class="ico"><use href="#i-wa"/></svg> Quiero esta promoción</a><small>${hasLinks ? 'Toca un flyer para ver más' : 'Toca un flyer para ampliarlo'}<span class="promo-hint"> · Desliza para ver más</span></small></div>`;

    const track = $('.promo-track', carousel);
    const slides = $$('.promo-slide', track);
    const dotsBox = $('.promo-dots', carousel);
    const cta = $('.promo-cta .wa-link', carousel);
    let active = 0;   // índice del primer flyer visible
    let perView = 1;  // flyers completos que caben a la vez
    let dots = [];
    let timer;
    let settling = 0;

    const showPlaceholder = (slide, promo) => {
      slide.classList.add('is-placeholder');
      const mascot = promo.line === 'web' ? 'mascota-web' : 'mascota-promociones';
      slide.insertAdjacentHTML('afterbegin', `<div class="promo-placeholder"><span class="promo-badge">Promoción</span><strong>${escapeHtml(promo.alt || 'Promoción VANYS')}</strong><img class="promo-mascot" src="assets/mascotas/${mascot}.webp" alt="" aria-hidden="true"></div>`);
    };

    const gap = () => parseFloat(getComputedStyle(track).columnGap) || 0;
    const stepWidth = () => slides[0].offsetWidth + gap();
    const maxIndex = () => Math.max(0, slides.length - perView);
    const setActive = (index) => {
      active = index;
      dots.forEach((dot, i) => { dot.classList.toggle('active', i === index); dot.setAttribute('aria-selected', String(i === index)); });
      if (cta) cta.href = waUrl(slides[index].dataset.message || DEFAULT_MESSAGE);
    };
    const goTo = (index) => {
      const next = index > maxIndex() ? 0 : index < 0 ? maxIndex() : index;
      setActive(next);
      // Mientras dura el desplazamiento programado, el scroll no recalcula el flyer activo.
      window.clearTimeout(settling);
      settling = window.setTimeout(() => { settling = 0; }, reduceMotion ? 50 : 900);
      track.scrollTo({ left: slides[next].offsetLeft, behavior: reduceMotion ? 'auto' : 'smooth' });
    };
    const buildDots = () => {
      const positions = maxIndex() + 1;
      dotsBox.innerHTML = positions > 1 ? Array.from({ length: positions }, (_, i) => `<button type="button" role="tab" aria-label="Promociones ${i + 1}"></button>`).join('') : '';
      dots = $$('button', dotsBox);
      dots.forEach((dot, index) => dot.addEventListener('click', () => goTo(index)));
    };
    const layout = () => {
      const width = slides[0].offsetWidth || 1;
      perView = Math.max(1, Math.min(slides.length, Math.round((track.clientWidth + gap()) / (width + gap()))));
      carousel.classList.toggle('is-static', slides.length <= perView);
      carousel.classList.toggle('no-images', !slides.some((slide) => slide.classList.contains('has-image')));
      buildDots();
      setActive(Math.min(active, maxIndex()));
    };
    const updateActive = () => {
      if (settling) return;
      const index = Math.min(maxIndex(), Math.round(track.scrollLeft / stepWidth()));
      if (index !== active) setActive(index);
    };

    slides.forEach((slide, index) => {
      const promo = list[index];
      const image = $('.promo-img', slide);
      if (!image) { showPlaceholder(slide, promo); layout(); return; }
      const ready = () => { slide.classList.add('has-image'); layout(); };
      const missing = () => { $$('img', slide).forEach((img) => img.remove()); showPlaceholder(slide, promo); layout(); };
      if (image.complete) { if (image.naturalWidth) ready(); else missing(); }
      image.addEventListener('load', ready);
      image.addEventListener('error', missing);
      // Con enlace, el clic lo abre el propio <a>; sin enlace, se amplía el flyer.
      slide.addEventListener('click', () => { if (!promo.link && slide.classList.contains('has-image')) openLightbox(image.currentSrc || image.src, image.alt); });
    });

    let ticking = false;
    track.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => { updateActive(); ticking = false; });
    });
    let resizeTimer;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => { layout(); track.scrollLeft = slides[active].offsetLeft; start(); }, 150);
    });
    $('.promo-nav.prev', carousel).addEventListener('click', () => goTo(active - 1));
    $('.promo-nav.next', carousel).addEventListener('click', () => goTo(active + 1));
    track.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); goTo(active + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(active - 1); }
    });

    // Avance automático cada 5 s, también con el cursor encima: el carrusel ocupa todo el ancho y, si se
    // detuviera con el cursor, casi nunca se movería. Espera mientras se toca, se navega con el teclado o
    // hay un flyer ampliado. Tras usar las flechas o los puntos cuenta 5 s completos antes de avanzar.
    let touching = false;
    const paused = () => slides.length <= perView || document.hidden || touching
      || Boolean(document.querySelector('dialog[open]') || carousel.querySelector(':focus-visible'));
    const start = () => {
      window.clearInterval(timer);
      if (!reduceMotion) timer = window.setInterval(() => { if (!paused()) goTo(active + 1); }, 5000);
    };
    carousel.addEventListener('touchstart', () => { touching = true; }, { passive: true });
    ['touchend', 'touchcancel'].forEach((type) => carousel.addEventListener(type, () => { touching = false; start(); }, { passive: true }));
    carousel.addEventListener('click', start);
    layout();
    start();
  });

  // --- Fotos de las categorías del catálogo (merchandising.html) -------------
  // Cada <img data-sku> muestra la foto que tiene ese producto en el sistema. Se piden al acercarse a la
  // sección, a catalogo/api/productos.php (la misma copia que usa el catálogo). Sin foto, queda el recuadro.
  const skuImages = $$('img[data-sku]');
  if (skuImages.length) {
    const loadSkuImages = async () => {
      try {
        const res = await fetch('catalogo/api/productos.php', { headers: { Accept: 'application/json' } });
        const json = res.ok ? await res.json() : null;
        const bySku = new Map((json && Array.isArray(json.products) ? json.products : []).map((p) => [String(p.sku).toUpperCase(), p.image_url]));
        skuImages.forEach((img) => {
          const src = bySku.get(img.dataset.sku.toUpperCase());
          if (!src) return;
          img.addEventListener('load', () => { img.hidden = false; }, { once: true });
          img.src = src;
        });
      } catch (error) { /* sin PHP o sin sistema: quedan los recuadros sin foto */ }
    };
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        loadSkuImages();
      }, { rootMargin: '600px 0px' });
      skuImages.forEach((img) => observer.observe(img.closest('a') || img));
    } else {
      loadSkuImages();
    }
  }

  // --- Enlaces de WhatsApp ---------------------------------------------------
  // Cada enlace .wa-link abre WhatsApp con el mensaje de su atributo data-message.
  // Se reescribe el href para que funcione incluso con el clic central o "abrir en nueva pestaña".
  $$('.wa-link').forEach((link) => {
    if (link.dataset.message || !link.href.includes('?text=')) link.href = waUrl(link.dataset.message || DEFAULT_MESSAGE);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });

  // --- Preselección del cotizador desde enlaces ------------------------------
  const selectByText = (select, text) => {
    if (!select || !text) return;
    const match = [...select.options].find((option) => option.text.toLowerCase().includes(text.toLowerCase()));
    if (match) select.value = match.value;
  };
  $$('[data-service], [data-product], [data-interest]').forEach((link) => link.addEventListener('click', () => {
    selectByText($('#service'), link.dataset.service);
    selectByText($('#product'), link.dataset.product);
    selectByText($('#interest'), link.dataset.interest);
  }));

  // --- Visor de catálogos ----------------------------------------------------
  const viewer = $('#catalogViewer');
  const frame = $('#catalogFrame');
  const viewerTitle = $('#viewerTitle');
  const openCatalog = $('#openCatalog');
  const fallbackLink = $('#fallbackLink');
  const viewerQuote = $('#viewerQuote');
  $$('[data-catalog]').forEach((button) => button.addEventListener('click', () => {
    const catalog = catalogs[button.dataset.catalog];
    if (!catalog || !viewer || !frame || !viewerTitle) return;
    viewerTitle.textContent = catalog.title;
    if (openCatalog) openCatalog.href = catalog.url;
    if (fallbackLink) fallbackLink.href = catalog.url;
    if (viewerQuote) viewerQuote.href = waUrl(`Hola VANYS 👋 Vi el ${catalog.title.toLowerCase()} y quiero cotizar: ___ (producto o código). Cantidad aproximada: ___`);
    if (frame.src !== catalog.url) frame.src = catalog.url;
    viewer.classList.add('open');
    viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  // --- Cotizador: arma el mensaje de WhatsApp con los campos del formulario --
  $$('form[data-wa-form]').forEach((form) => form.addEventListener('submit', (event) => {
    event.preventDefault();
    const lines = [form.dataset.intro || 'Hola VANYS 👋 Quiero una cotización:'];
    $$('input, select, textarea', form).forEach((field) => {
      if (!field.name || field.type === 'submit' || field.type === 'button' || field.type === 'hidden') return;
      const value = (field.value || '').trim();
      if (!value) return;
      const labelElement = field.id ? $(`label[for="${field.id}"]`, form) : null;
      const label = (field.dataset.label || (labelElement ? labelElement.textContent : field.name)).replace(/\s*\*\s*$/, '').trim();
      lines.push(`• ${label}: ${value}`);
    });
    if (form.dataset.outro) lines.push('', form.dataset.outro);
    openWhatsApp(lines.join('\n'));
    const result = $('.form-result', form);
    if (result) result.textContent = '✅ Tu mensaje está listo en WhatsApp. Revísalo y envíalo.';
  }));

  // --- Preguntas frecuentes: una abierta a la vez por grupo -----------------
  $$('.faq').forEach((group) => {
    const items = $$('details', group);
    items.forEach((item) => item.addEventListener('toggle', () => {
      if (item.open) items.forEach((other) => { if (other !== item) other.open = false; });
    }));
  });

  // --- Animaciones al hacer scroll ------------------------------------------
  const revealItems = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    }), { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    revealItems.forEach((element) => observer.observe(element));
  } else {
    revealItems.forEach((element) => element.classList.add('visible'));
  }

  // --- Portada: la grulla guía entre Merchandising y Sistemas/Web -----------
  const guideTour = $('#guideTour');
  if (guideTour) {
    const guideMessage = $('#guideMessage');
    const guideMascot = $('#guideMascot');
    const choiceCards = $$('.choice-card');
    const guideMessages = [
      '¿Tienes un evento o quieres impulsar tu marca? Mira nuestro merchandising.',
      '¿Necesitas una página web o un sistema para trabajar mejor? Te mostramos Sistemas y Web.'
    ];
    const standingMascot = 'assets/mascotas/mascota-web.webp';
    const runningMascot = 'assets/mascotas/vanys_grulla_corriendo_sin_fondo.gif';
    if (!reduceMotion) {
      const runnerPreload = new Image();
      runnerPreload.src = runningMascot;
    }
    let guideStep = 0;
    let guideTimer;
    let walkTimer;

    const finishGuideRun = () => {
      window.clearTimeout(walkTimer);
      if (!guideMascot.classList.contains('is-moving')) return;
      guideMascot.classList.remove('is-moving');
      guideMascot.classList.add('has-arrived');
      guideMascot.src = standingMascot;
    };
    guideMascot.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'left') finishGuideRun();
    });

    const moveGuideTo = (nextStep) => {
      choiceCards.forEach((card, index) => card.classList.toggle('is-guide-stop', index === nextStep));
      if (nextStep === guideStep) return;
      guideTour.dataset.direction = nextStep > guideStep ? 'right' : 'left';
      guideStep = nextStep;
      guideTour.dataset.step = nextStep === 0 ? 'merch' : 'web';
      guideMessage.classList.add('is-changing');
      if (!reduceMotion) {
        guideMascot.classList.remove('has-arrived');
        guideMascot.src = runningMascot;
        guideMascot.classList.add('is-moving');
      }
      window.setTimeout(() => {
        guideMessage.textContent = guideMessages[nextStep];
        guideMessage.classList.remove('is-changing');
      }, 180);
      if (!reduceMotion) {
        window.clearTimeout(walkTimer);
        walkTimer = window.setTimeout(finishGuideRun, 4300);
      }
    };

    const scheduleGuide = (delay = 6200) => {
      window.clearTimeout(guideTimer);
      if (reduceMotion) return;
      guideTimer = window.setTimeout(() => {
        if (document.hidden) {
          scheduleGuide(1200);
          return;
        }
        moveGuideTo(guideStep === 0 ? 1 : 0);
        scheduleGuide(6500);
      }, delay);
    };

    const pauseGuide = () => window.clearTimeout(guideTimer);
    const resumeGuide = () => {
      window.setTimeout(() => {
        const userIsChoosing = choiceCards.some((card) => card.matches(':hover') || card.contains(document.activeElement));
        if (!userIsChoosing) scheduleGuide(4200);
      }, 80);
    };

    choiceCards.forEach((card, index) => {
      card.addEventListener('pointerenter', () => { pauseGuide(); moveGuideTo(index); });
      card.addEventListener('pointerleave', resumeGuide);
      card.addEventListener('focusin', () => { pauseGuide(); moveGuideTo(index); });
      card.addEventListener('focusout', (event) => { if (!card.contains(event.relatedTarget)) resumeGuide(); });
    });

    choiceCards[0]?.classList.add('is-guide-stop');
    scheduleGuide(5200);
  }
})();
