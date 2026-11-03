/* ==========================================================================
   VANYS · Catálogo digital · Configuración
   Único archivo que hay que editar para conectar el carrito con el sistema.
   ========================================================================== */
window.VANYS_CATALOGO_CONFIG = {
  // URL del sistema que recibe las solicitudes del carrito (POST con JSON).
  // Al publicar, cambia localhost:4750 por el dominio del sistema.
  // Vacío = el carrito envía la solicitud por WhatsApp (funciona sin sistema).
  endpoint: 'http://localhost:4750/api/public/quotation-request',

  // API key del sistema (Configuración → API keys). Define la empresa/tienda que recibe los pedidos.
  // Es visible para cualquiera que vea el código de la página: si llegan pedidos falsos,
  // revócala en el sistema y pon aquí una nueva.
  headers: { 'X-Api-Key': 'vnk_c31avrOHTPgGMm2Hc8d0HT-z31MhIQ4ao9YsOMeLkKA' },

  // Tiempo máximo de espera de la respuesta del endpoint, en milisegundos.
  timeoutMs: 15000,

  // Si el endpoint falla, ofrecer enviar la misma solicitud por WhatsApp.
  whatsappFallback: true,
};
