<?php
/* VANYS · Carrito → pedido de cotización
   El carrito (carrito.js) envía aquí { client, items } y este archivo lo reenvía al sistema
   (POST /api/public/quotation-request) con la API key de config.php, que el navegador nunca ve.
   Solo pasan los campos que el sistema acepta. Límite: "limite_cotizaciones" pedidos por conexión cada
   10 minutos, para que nadie llene el sistema de pedidos falsos.  */
declare(strict_types=1);
require __DIR__ . '/comun.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'Usa POST.');

// Solo desde las páginas de esta web: el navegador indica de qué sitio viene el pedido.
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '' && strcasecmp((string)parse_url($origin, PHP_URL_HOST), (string)preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? ''))) !== 0) {
    fail(403, 'Origen no permitido.');
}

$raw = (string)file_get_contents('php://input', false, null, 0, 65536);
$in = json_decode($raw, true);
if (!is_array($in) || !is_array($in['client'] ?? null) || !is_array($in['items'] ?? null)) fail(400, 'Solicitud incompleta.');

$cfg = config();

// --- Límite de pedidos por conexión -----------------------------------------
$max = max(1, (int)($cfg['limite_cotizaciones'] ?? 6));
$window = 600;
$dir = cacheDir();
$limitFile = $dir . '/' . hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $cfg['api_key']) . '.limite';
$now = time();
$fh = fopen($limitFile, 'c+');
if ($fh) {
    flock($fh, LOCK_EX);
    $hits = array_filter((array)json_decode((string)stream_get_contents($fh), true), fn($t) => is_int($t) && $now - $t < $window);
    if (count($hits) >= $max) {
        flock($fh, LOCK_UN);
        fclose($fh);
        fail(429, 'Recibimos varias solicitudes seguidas desde tu conexión. Espera unos minutos y vuelve a intentarlo.');
    }
    $hits[] = $now;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode(array_values($hits)));
    flock($fh, LOCK_UN);
    fclose($fh);
}
if (mt_rand(1, 50) === 1) { // limpieza de vez en cuando
    foreach (glob($dir . '/*.limite') ?: [] as $f) if ($now - filemtime($f) > $window) @unlink($f);
}

// --- Cuerpo para el sistema: solo los campos que acepta ----------------------
$text = fn($v, int $len) => is_scalar($v) ? mb_substr(trim((string)$v), 0, $len) : '';
$c = $in['client'];
$client = ['phone' => $text($c['phone'] ?? '', 20)];
foreach (['name' => 255, 'email' => 150, 'document_type' => 2, 'document_number' => 20, 'address' => 255] as $field => $len) {
    $value = $text($c[$field] ?? '', $len);
    if ($value !== '') $client[$field] = $value;
}
$items = [];
foreach (array_slice($in['items'], 0, 50) as $it) {
    if (!is_array($it)) continue;
    $line = [];
    foreach (['code' => 60, 'sku' => 50, 'color' => 60] as $field => $len) {
        $value = $text($it[$field] ?? '', $len);
        if ($value !== '') $line[$field] = $value;
    }
    $line['quantity'] = max(1, min(1000000, (int)($it['quantity'] ?? 1)));
    if (isset($line['code']) || isset($line['sku'])) $items[] = $line;
}
if (!$items) fail(400, 'El carrito está vacío.');

// --- Envío -------------------------------------------------------------------
try {
    [$status, $json] = callSystem($cfg, 'POST', '/api/public/quotation-request', [], ['client' => $client, 'items' => $items], 20);
} catch (Throwable $e) {
    error_log('catalogo/api/cotizar.php: ' . $e->getMessage());
    fail(502, 'El sistema de cotizaciones no responde.');
}
header('Cache-Control: no-store');
if (($status === 200 || $status === 201) && !empty($json['success'])) {
    $d = $json['data'] ?? [];
    if (!empty($d['missing_items']) || !empty($d['warnings'])) {
        error_log('catalogo/api/cotizar.php: COT-' . ($d['quotation_id'] ?? '?') . ' ' . json_encode(['missing_items' => $d['missing_items'] ?? [], 'warnings' => $d['warnings'] ?? []], JSON_UNESCAPED_UNICODE));
    }
    http_response_code(201);
    echo json_encode(['success' => true, 'message' => $json['message'] ?? '', 'data' => ['quotation_id' => $d['quotation_id'] ?? null]], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($status === 400 && !empty($json['message'])) fail(400, (string)$json['message'], ['errors' => $json['errors'] ?? null]);
error_log('catalogo/api/cotizar.php: el sistema respondió ' . $status . ' ' . ($json['message'] ?? ''));
fail(502, 'El sistema de cotizaciones no aceptó el pedido.');
