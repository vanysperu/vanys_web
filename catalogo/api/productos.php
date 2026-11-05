<?php
/* VANYS · Catálogo digital · Productos desde el sistema
   Lee el catálogo activo del sistema (GET /api/public/products) con la API key, que vive solo aquí en el
   servidor (api/config.php), y lo entrega al navegador como JSON. Guarda una copia en cache/productos.json:
   responde rápido mientras la copia tenga menos de "ttl" segundos y la sigue usando si el sistema no responde.
   Forzar una lectura nueva: api/productos.php?refrescar=<refresh_token de config.php>  */
declare(strict_types=1);
require __DIR__ . '/comun.php';

$cfg = config();
$ttl = max(60, (int)($cfg['ttl'] ?? 600));

cachedJson($cfg, 'productos', $ttl, 120, function () use ($cfg): array {
    // Proveedores cuyos colores se leyeron de la foto (la ficha lo avisa). El nombre del proveedor no se publica.
    $photoSuppliers = array_map('mb_strtolower', (array)($cfg['colors_from_photo_suppliers'] ?? []));
    $products = [];
    $seen = [];
    $page = 1;
    do {
        $data = getSystem($cfg, '/api/public/products', [
            'page' => $page, 'limit' => 100,
            // Con el orden por defecto (fecha de creación) los productos creados en la misma tanda se
            // repiten o se saltan entre páginas; por SKU el orden es estable.
            'orderBy' => 'sku', 'orderDir' => 'asc',
        ]);
        foreach ($data['data'] ?? [] as $p) {
            $sku = strtoupper((string)($p['sku'] ?? ''));
            if ($sku === '' || isset($seen[$sku])) continue;
            $seen[$sku] = true;
            $fromPhoto = false;
            $codes = [];
            foreach ($p['codes'] ?? [] as $c) {
                if (in_array(mb_strtolower((string)($c['supplier'] ?? '')), $photoSuppliers, true)) $fromPhoto = true;
                $codes[] = ['code' => $c['code'], 'color' => $c['color'] ?? null];
            }
            $products[] = [
                'sku' => $p['sku'],
                'name' => $p['name'],
                'description' => $p['description'] ?? null,
                'price_unit' => $p['price_unit'] ?? null,
                'price_hundred' => $p['price_hundred'] ?? null,
                'price_half_thousand' => $p['price_half_thousand'] ?? null,
                'price_thousand' => $p['price_thousand'] ?? null,
                'category' => $p['category'] ?? null,
                'subcategory' => $p['subcategory'] ?? null,
                'colors' => $p['colors'] ?? [],
                'codes' => $codes,
                'colors_from_photo' => $fromPhoto,
                'image_url' => $p['image_url'] ?? null,
            ];
        }
        $totalPages = (int)($data['meta']['totalPages'] ?? 1);
        $page++;
    } while ($page <= $totalPages && $page <= 100);

    return ['success' => true, 'generated' => gmdate('c'), 'source' => 'sistema', 'products' => $products];
});
