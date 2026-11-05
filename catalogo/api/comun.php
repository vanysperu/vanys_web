<?php
/* VANYS · Funciones que comparten productos.php, anuncios.php y cotizar.php:
   leer config.php, llamar al sistema con la API key y guardar copias en cache/.
   No se abre desde el navegador (.htaccess). */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function fail(int $status, string $message, array $extra = []): void {
    http_response_code($status);
    header('Cache-Control: no-store');
    echo json_encode(['success' => false, 'message' => $message] + $extra, JSON_UNESCAPED_UNICODE);
    exit;
}

/* $maxAge = segundos que el navegador y el CDN de Hostinger pueden reutilizar la respuesta.
   0 = no-store: nadie la guarda y cada visita la pide a PHP (que igual responde con su copia de cache/). */
function serve(string $file, string $origin, int $maxAge): void {
    header($maxAge > 0 ? 'Cache-Control: public, max-age=' . $maxAge : 'Cache-Control: no-store');
    header('X-Catalogo: ' . $origin);
    readfile($file);
    exit;
}

/** config.php con base_url y api_key ya validados. */
function config(): array {
    $file = __DIR__ . '/config.php';
    if (!is_file($file)) fail(500, 'Falta api/config.php (copia config.ejemplo.php y complétalo).');
    $cfg = require $file;
    $cfg['base_url'] = rtrim((string)($cfg['base_url'] ?? ''), '/');
    $cfg['api_key'] = (string)($cfg['api_key'] ?? '');
    if ($cfg['base_url'] === '' || $cfg['api_key'] === '') fail(500, 'api/config.php: faltan base_url o api_key.');
    return $cfg;
}

/** Llama al sistema con la API key. Devuelve [estado HTTP, JSON o null]; sin respuesta lanza una excepción. */
function callSystem(array $cfg, string $method, string $path, array $query = [], ?array $body = null, int $timeout = 25): array {
    $url = $cfg['base_url'] . $path . ($query ? '?' . http_build_query($query) : '');
    $headers = ['X-Api-Key: ' . $cfg['api_key'], 'Accept: application/json'];
    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CUSTOMREQUEST => $method,
    ];
    if ($body !== null) {
        $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE);
        $headers[] = 'Content-Type: application/json';
    }
    $opts[CURLOPT_HTTPHEADER] = $headers;
    curl_setopt_array($ch, $opts);
    $res = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($res === false) throw new RuntimeException('Sin respuesta del sistema: ' . $error);
    $json = json_decode((string)$res, true);
    return [$status, is_array($json) ? $json : null];
}

/** GET al sistema que debe responder 200 con success: true. Devuelve "data". */
function getSystem(array $cfg, string $path, array $query, int $timeout = 25): array {
    [$status, $json] = callSystem($cfg, 'GET', $path, $query, null, $timeout);
    if ($status !== 200 || !$json || empty($json['success'])) {
        throw new RuntimeException('El sistema respondió ' . $status . ': ' . ($json['message'] ?? ''));
    }
    return $json['data'] ?? [];
}

function cacheDir(): string {
    $dir = __DIR__ . '/cache';
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) fail(500, 'No se pudo crear api/cache.');
    return $dir;
}

/* Responde con la copia cache/<nombre>.json mientras tenga menos de $ttl segundos; si no, la arma de nuevo
   con $build (que devuelve el arreglo a publicar). Si el sistema no responde, sigue usando la última copia.
   ?refrescar=<refresh_token de config.php> fuerza una lectura nueva. */
function cachedJson(array $cfg, string $name, int $ttl, int $maxAge, callable $build): void {
    $dir = cacheDir();
    $file = $dir . '/' . $name . '.json';
    $force = isset($_GET['refrescar']) && !empty($cfg['refresh_token']) && hash_equals((string)$cfg['refresh_token'], (string)$_GET['refrescar']);
    $hasCache = is_file($file) && filesize($file) > 0;
    if ($hasCache && !$force && time() - filemtime($file) < $ttl) serve($file, 'copia', $maxAge);

    // Una sola lectura al sistema a la vez: si otra visita ya está actualizando, se responde con la copia.
    $lock = fopen($dir . '/' . $name . '.lock', 'c');
    if ($lock && !flock($lock, LOCK_EX | LOCK_NB)) {
        if ($hasCache) serve($file, 'copia', $maxAge);
        flock($lock, LOCK_EX); // primera vez sin copia: espera a que termine la otra lectura
        if (is_file($file)) serve($file, 'copia', $maxAge);
    }

    try {
        $out = json_encode($build(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $tmp = $file . '.tmp';
        file_put_contents($tmp, $out);
        rename($tmp, $file);
        serve($file, 'sistema', $maxAge);
    } catch (Throwable $e) {
        error_log('catalogo/api ' . $name . ': ' . $e->getMessage());
        if ($hasCache) serve($file, 'copia-anterior', $maxAge);
        fail(502, 'No se pudo leer el sistema.');
    }
}
