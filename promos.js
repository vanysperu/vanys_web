// VANYS · Carrusel de ofertas y promociones.
//
// CARPETAS:
//   assets/promociones/merch  -> flyers de merchandising (se muestran en merchandising.html)
//   assets/promociones/web    -> flyers de páginas web y sistemas (se muestran en sistemas-web.html)
//   La portada (index.html) no muestra promociones: solo sirve para elegir entre las dos líneas.
//   (Las fotos de productos de "Lo más pedido" van en assets/productos, no aquí.)
//
// CÓMO AGREGAR UN FLYER:
//   1. Guarda la imagen en la carpeta que corresponda, con un nombre sin espacios ni tildes
//      (ej. promo-navidad-2026.jpg). JPG, PNG o WebP. Si pesa más de 300 KB, comprímela antes
//      (tinypng.com o squoosh.app) para que la página cargue rápido.
//   2. Agrega una línea aquí con: image (ruta), alt (texto corto de la oferta) y, si quieres,
//      message (mensaje de WhatsApp del botón "Quiero esta promoción" cuando ese flyer está activo).
//   La página detecta por la carpeta (merch o web) en qué página mostrar cada flyer.
//   Para quitar una promoción, borra su línea. El orden de esta lista es el orden del carrusel.
window.VANYS_PROMOS = [
  {
    image: 'assets/promociones/merch/productos-desde-0-63.webp',
    alt: 'Tu marca siempre presente: productos promocionales desde S/ 0.63 + IGV con impresión de tu logo',
    message: 'Hola VANYS 👋 Vi la promoción de productos desde S/ 0.63 + IGV con impresión de logo y quiero cotizar. Producto: ___ · Cantidad aproximada: ___'
  },
  {
    image: 'assets/promociones/web/paginas-web-modernas-con-mascota-digital.webp',
    alt: 'Páginas web modernas desde S/ 250: diseño profesional, adaptada a celulares, optimizada y segura, soporte incluido',
    message: 'Hola VANYS 👋 Vi la promoción de páginas web desde S/ 250 y quiero cotizar. Mi negocio: ___'
  }
];
