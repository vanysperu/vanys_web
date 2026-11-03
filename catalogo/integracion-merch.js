/* VANYS · Muestra en merchandising.html cuántos productos lleva el cliente en el carrito del catálogo.
   Lee la misma clave de localStorage que usa catalogo/carrito.js. */
(function () {
  'use strict';
  const STORAGE_KEY = 'vanys-catalogo-carrito-v1';
  function count() {
    try { const list = JSON.parse(localStorage.getItem(STORAGE_KEY)); return Array.isArray(list) ? list.length : 0; } catch (e) { return 0; }
  }
  function render() {
    const n = count();
    document.querySelectorAll('[data-vc-count]').forEach((el) => {
      el.textContent = n;
      el.classList.toggle('vc-has', n > 0);
      el.setAttribute('aria-label', `${n} ${n === 1 ? 'producto' : 'productos'} en el carrito`);
    });
  }
  render();

  // Botón flotante: se despliega solo (muestra "Ver catálogo completo") y se vuelve a guardar.
  // Primero a los 1.2 s, luego cada 12 s durante 4 s. Con "reducir movimiento" queda siempre desplegado.
  const float = document.querySelector('.vc-float');
  if (float) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      float.classList.add('vc-open');
    } else {
      const OPEN_MS = 4000;
      const EVERY_MS = 12000;
      let timer;
      const cycle = () => {
        float.classList.add('vc-open');
        timer = setTimeout(() => { float.classList.remove('vc-open'); timer = setTimeout(cycle, EVERY_MS - OPEN_MS); }, OPEN_MS);
      };
      timer = setTimeout(cycle, 1200);
      // Con la pestaña oculta no se anima; al volver arranca de nuevo.
      document.addEventListener('visibilitychange', () => {
        clearTimeout(timer);
        float.classList.remove('vc-open');
        if (!document.hidden) timer = setTimeout(cycle, 1200);
      });
    }
  }

  // Si el carrito cambia en otra pestaña o al volver con el botón "atrás", se actualiza.
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) render(); });
  window.addEventListener('pageshow', render);
})();
