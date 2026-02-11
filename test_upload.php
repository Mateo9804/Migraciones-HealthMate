<?php
// Test simple para verificar que PHP funciona y devuelve JSON
error_reporting(0);
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);

ob_start();

header('Content-Type: application/json');

$response = [
    'success' => true,
    'message' => 'Test exitoso',
    'test' => 'PHP está funcionando correctamente'
];

$output = ob_get_contents();
ob_clean();

if (!empty($output)) {
    $response['buffer_content'] = substr($output, 0, 200);
}

echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
ob_end_flush();
?>

