<?php
/* Copia este archivo como config.php (en esta misma carpeta, en el hosting) y complétalo.
   config.php tiene la API key: no se sube al repositorio (.gitignore) ni se puede abrir desde el navegador. */
return [
    'base_url' => 'https://gestor.vanysperu.com',
    'api_key' => 'vnk_PEGA_AQUI_LA_KEY',
    // Segundos que se reutiliza la copia del catálogo antes de volver a leer el sistema.
    'ttl' => 600,
    // Para ver un cambio al instante: api/productos.php?refrescar=<este texto>. Vacío = desactivado.
    'refresh_token' => '',
    // Proveedores cuyos colores se leyeron de la foto: la ficha avisa que el tono puede variar.
    'colors_from_photo_suppliers' => ['BEQ Partners'],
    // Zonas de anuncios (Ventas → Anuncios del sistema) que puede pedir la web: mer = merchandising.html,
    // tec = sistemas-web.html. Si la empresa cambia el código de una zona, cámbialo aquí y en esa página.
    'zonas_anuncios' => ['mer', 'tec'],
    // Segundos que se reutiliza la copia de los anuncios (10 a 120; un anuncio eliminado borra su imagen).
    'ttl_anuncios' => 60,
    // Pedidos de cotización que acepta cotizar.php por conexión cada 10 minutos.
    'limite_cotizaciones' => 6,
];
