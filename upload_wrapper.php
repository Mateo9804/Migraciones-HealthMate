<?php
// Wrapper para capturar TODOS los errores y devolver JSON
error_reporting(0);
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
ini_set('log_errors', 1);

// Iniciar buffer inmediatamente
ob_start();

// Handler de errores
set_error_handler(function($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

// Handler de excepciones no capturadas
set_exception_handler(function($exception) {
    ob_clean();
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => true,
        'message' => 'Error fatal: ' . $exception->getMessage(),
        'download_url' => '',
        'filename' => ''
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    ob_end_flush();
    exit;
});

// Incluir el archivo principal
try {
    include 'upload.php';
} catch (Throwable $e) {
    ob_clean();
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => true,
        'message' => 'Error: ' . $e->getMessage(),
        'download_url' => '',
        'filename' => ''
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    ob_end_flush();
    exit;
}
?>

