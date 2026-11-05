<?php
/* VANYS · Anuncios del carrusel de promociones
   api/anuncios.php?zona=mer  → flyers de merchandising.html
   api/anuncios.php?zona=tec  → flyers de sistemas-web.html
   Lee los anuncios prendidos de esa zona (GET /api/public/advertisements) con la API key de config.php,
   ya ordenados, y guarda una copia por "ttl_anuncios" segundos (60 por defecto, máximo 120: un anuncio
   eliminado borra su imagen). Si la copia es una lista vacía se vuelve a leer a los 15 s, para que un anuncio
   nuevo no quede escondido. La respuesta sale con Cache-Control: no-store: ni el CDN de Hostinger ni el
   navegador la guardan, así un cambio en el sistema se ve en la web en ttl_anuncios segundos como máximo.
   Si el sistema no responde, sigue usando la última copia; sin copia responde 502 y la página muestra los
   flyers de promos.js.
   Forzar una lectura nueva: api/anuncios.php?zona=mer&refrescar=<refresh_token de config.php>  */
declare(strict_types=1);
require __DIR__ . '/comun.php';

$cfg = config();
$zones = array_map('strtolower', (array)($cfg['zonas_anuncios'] ?? ['mer', 'tec']));
$zone = strtolower(trim((string)($_GET['zona'] ?? '')));
if (!in_array($zone, $zones, true)) fail(400, 'Zona de anuncios no válida.');
$name = 'anuncios-' . preg_replace('/[^a-z0-9-]/', '', $zone);
$ttl = min(120, max(10, (int)($cfg['ttl_anuncios'] ?? 60)));

// Copia vacía: vida corta.
$copy = cacheDir() . '/' . $name . '.json';
if (is_file($copy)) {
    $prev = json_decode((string)file_get_contents($copy), true);
    if (is_array($prev) && empty($prev['ads'])) $ttl = min($ttl, 15);
}

$isUrl = fn($u) => is_string($u) && preg_match('~^https?://~i', $u);

cachedJson($cfg, $name, $ttl, 0, function () use ($cfg, $zone, $isUrl): array {
    $data = getSystem($cfg, '/api/public/advertisements', ['zone' => $zone, 'limit' => 100], 6); // poco tiempo: la página espera esta respuesta
    $ads = [];
    foreach ($data['data'] ?? [] as $a) {
        if (!$isUrl($a['image_url'] ?? null)) continue;
        $ads[] = [
            'title' => (string)($a['title'] ?? ''),
            'image_url' => $a['image_url'],
            'link_url' => $isUrl($a['link_url'] ?? null) ? $a['link_url'] : null,
        ];
    }
    return ['success' => true, 'generated' => gmdate('c'), 'zone' => $zone, 'ads' => $ads];
});
