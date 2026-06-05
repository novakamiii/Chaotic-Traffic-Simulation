<?php

/**
 * AppDevMidterms — The Wait
 *
 * Vanilla PHP entry point. Serves the 2.5D traffic intersection simulation.
 * Strictly PHP. No framework. No framework routes. Just PHP.
 */

declare(strict_types=1);

const APP_NAME = 'AppDevMidterms';
const APP_VERSION = '1.0.0';

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// ---------------------------------------------------------------------------
// Security Headers
// ---------------------------------------------------------------------------

function sendSecurityHeaders(): void
{
    $headers = [
        'X-Content-Type-Options' => 'nosniff',
        'X-Frame-Options' => 'DENY',
        'X-XSS-Protection' => '1; mode=block',
        'Referrer-Policy' => 'strict-origin-when-cross-origin',
        'Content-Security-Policy' => "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
    ];

    foreach ($headers as $name => $value) {
        header("{$name}: {$value}");
    }
}

// ---------------------------------------------------------------------------
// Input Validation
// ---------------------------------------------------------------------------

function sanitizeString(string $input): string
{
    return htmlspecialchars(strip_tags(trim($input)), ENT_QUOTES, 'UTF-8');
}

function getQueryParam(string $key, string $default = ''): string
{
    $value = $_GET[$key] ?? $default;
    return is_string($value) ? sanitizeString($value) : $default;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function getRoute(): string
{
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $route = $uri !== false && $uri !== '' && $uri !== null ? rtrim($uri, '/') : '/';
    return $route === '' ? '/' : $route;
}

function getMethod(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderAppPage(): void
{
    $appJsPath = 'dist/app.js';
    $appJs = file_exists($appJsPath) ? $appJsPath : null;

    http_response_code(200);
    sendSecurityHeaders();
    header('Content-Type: text/html; charset=utf-8');
    ?>
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>The Wait — Avant Garde Traffic</title>
        <link rel="stylesheet" href="src/style.css">
    </head>
    <body>
        <div id="app"></div>
        <div id="hud"></div>
        <div id="controls"></div>

        <?php if ($appJs): ?>
        <script type="module" src="<?= htmlspecialchars($appJs, ENT_QUOTES, 'UTF-8') ?>"></script>
        <?php else: ?>
        <div style="padding:2rem;text-align:center;font-family:sans-serif;">
            <h1>Waiting for build...</h1>
            <p>Run <code>./start.sh</code> to build the JavaScript bundle.</p>
        </div>
        <?php endif; ?>
    </body>
    </html>
    <?php
}

function renderError(int $code, string $message): void
{
    http_response_code($code);
    sendSecurityHeaders();
    header('Content-Type: text/html; charset=utf-8');
    $title = "Error {$code}";
    ?>
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title><?= $title ?> — AppDevMidterms</title>
        <style>
            *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
            body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;color:#1a1a2e;background:#f5f6fa}
            .error-box{text-align:center;background:#fff;padding:3rem;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);max-width:480px}
            .error-box h1{font-size:4rem;color:#e74c3c;margin-bottom:.5rem}
            .error-box p{font-size:1.1rem;color:#4a4a6a;margin-bottom:1.5rem}
            .error-box a{color:#1a1a2e;text-decoration:underline}
        </style>
    </head>
    <body>
        <div class="error-box">
            <h1><?= $code ?></h1>
            <p><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></p>
            <a href="/">Back to The Wait</a>
        </div>
    </body>
    </html>
    <?php
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function dispatch(): void
{
    $route = getRoute();
    $method = getMethod();

    try {
        // Serve Vite-built static assets (dist/assets/*)
        if (str_starts_with($route, '/assets/')) {
            $file = __DIR__ . '/dist' . rawurldecode($route);
            if (file_exists($file)) {
                $mimeTypes = [
                    'mp3'  => 'audio/mpeg',
                    'js'   => 'application/javascript',
                    'css'  => 'text/css',
                    'png'  => 'image/png',
                    'jpg'  => 'image/jpeg',
                    'svg'  => 'image/svg+xml',
                    'webm' => 'video/webm',
                ];
                $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
                sendSecurityHeaders();
                header('Content-Type: ' . ($mimeTypes[$ext] ?? 'application/octet-stream'));
                readfile($file);
                return;
            }
        }

        match (true) {
            $route === '/' && $method === 'GET' => renderAppPage(),
            default => renderError(404, 'Not found. The intersection awaits at /.'),
        };
    } catch (\Throwable $e) {
        error_log(sprintf(
            '[%s] Unhandled error: %s in %s:%d',
            date('Y-m-d H:i:s'),
            $e->getMessage(),
            $e->getFile(),
            $e->getLine()
        ));
        renderError(500, 'An unexpected error occurred.');
    }
}

dispatch();
