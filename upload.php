<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Directorio donde se guardarán los archivos
$uploadDir = 'uploads/';

// Crear directorio si no existe
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

$response = [
    'success' => false,
    'message' => '',
    'files' => []
];

// Verificar que se hayan enviado archivos
if (!isset($_FILES['files'])) {
    $response['message'] = 'No se recibieron archivos';
    echo json_encode($response);
    exit;
}

$allowedExtensions = ['csv', 'xml', 'json'];
$uploadedFiles = [];

// Procesar cada archivo
foreach ($_FILES['files']['name'] as $key => $fileName) {
    $fileTmpName = $_FILES['files']['tmp_name'][$key];
    $fileSize = $_FILES['files']['size'][$key];
    $fileError = $_FILES['files']['error'][$key];
    
    // Verificar errores de subida
    if ($fileError !== UPLOAD_ERR_OK) {
        $uploadedFiles[] = [
            'name' => $fileName,
            'success' => false,
            'message' => 'Error al subir el archivo'
        ];
        continue;
    }
    
    // Obtener extensión
    $fileExtension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    
    // Validar extensión
    if (!in_array($fileExtension, $allowedExtensions)) {
        $uploadedFiles[] = [
            'name' => $fileName,
            'success' => false,
            'message' => 'Extensión no permitida'
        ];
        continue;
    }
    
    // Generar nombre único
    $newFileName = uniqid() . '_' . time() . '.' . $fileExtension;
    $destination = $uploadDir . $newFileName;
    
    // Mover archivo
    if (move_uploaded_file($fileTmpName, $destination)) {
        $uploadedFiles[] = [
            'name' => $fileName,
            'saved_as' => $newFileName,
            'size' => $fileSize,
            'success' => true,
            'message' => 'Archivo subido correctamente'
        ];
    } else {
        $uploadedFiles[] = [
            'name' => $fileName,
            'success' => false,
            'message' => 'Error al guardar el archivo'
        ];
    }
}

$response['success'] = true;
$response['message'] = 'Proceso completado';
$response['files'] = $uploadedFiles;

echo json_encode($response);
?>

