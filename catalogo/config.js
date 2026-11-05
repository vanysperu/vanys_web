/* ==========================================================================
   VANYS · Catálogo digital · Configuración del carrito
   ========================================================================== */
window.VANYS_CATALOGO_CONFIG = {
  // Dónde envía el carrito la solicitud (POST con JSON). api/cotizar.php la reenvía al sistema de
  // cotizaciones con la API key de api/config.php: la key nunca llega al navegador.
  // Vacío = el carrito envía la solicitud por WhatsApp (funciona sin sistema).
  endpoint: 'api/cotizar.php',

  // Cabeceras extra del envío. No pongas aquí la API key: va en api/config.php.
  headers: {},

  // Tiempo máximo de espera de la respuesta, en milisegundos.
  timeoutMs: 25000,

  // Si el envío falla, ofrecer enviar la misma solicitud por WhatsApp.
  whatsappFallback: true,
};
