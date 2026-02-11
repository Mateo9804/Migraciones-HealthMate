<?php
// Aumentar límites para manejar muchos archivos
@ini_set('upload_max_filesize', '1000M');
@ini_set('post_max_size', '2000M'); // Aumentado para 844 archivos
@ini_set('max_file_uploads', '2000'); // Aumentado para 844 archivos
@ini_set('memory_limit', '1024M'); // Aumentado a 1GB
@ini_set('max_execution_time', '1800'); // 30 minutos para procesar muchos archivos
@ini_set('max_input_time', '1800'); // 30 minutos para recibir datos

// Deshabilitar TODA visualización de errores
error_reporting(0);
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
ini_set('log_errors', 1);

// Iniciar buffer de salida ANTES de cualquier cosa - MÚLTIPLES NIVELES
while (ob_get_level() > 0) {
    @ob_end_clean();
}
@ob_start();
@ob_start(); // Segundo nivel para mayor seguridad

// Configurar handler de errores personalizado para capturar todos los errores
set_error_handler(function($severity, $message, $file, $line) {
    // NO mostrar errores, solo lanzar excepciones
    if (!(error_reporting() & $severity)) {
        return false;
    }
    // Limpiar cualquier output antes de lanzar excepción
    while (ob_get_level() > 0) {
        @ob_end_clean();
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
}, E_ALL | E_STRICT);

// Configurar handler de excepciones no capturadas
set_exception_handler(function($exception) {
    // Limpiar TODOS los niveles de buffer
    while (ob_get_level() > 0) {
        @ob_end_clean();
    }
    @header('Content-Type: application/json', true);
    @header('Access-Control-Allow-Origin: *', true);
    echo json_encode([
        'success' => false,
        'error' => true,
        'message' => 'Error fatal: ' . $exception->getMessage(),
        'download_url' => '',
        'filename' => ''
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
});

// Establecer headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

$response = [
    'success' => false,
    'message' => '',
    'download_url' => '',
    'filename' => ''
];

// Verificar que se haya seleccionado una base de datos
// Cuando se envía FormData con archivos, los datos pueden llegar de diferentes formas
$selectedPage = null;

// Intentar obtener 'page' de múltiples fuentes (GET, POST, REQUEST)
// Primero intentar GET (si viene en la URL)
if (isset($_GET['page']) && !empty($_GET['page'])) {
    $selectedPage = $_GET['page'];
}
// Luego intentar POST
else if (isset($_POST['page']) && !empty($_POST['page'])) {
    $selectedPage = $_POST['page'];
}
// Finalmente intentar REQUEST (que incluye GET, POST y COOKIE)
else if (isset($_REQUEST['page']) && !empty($_REQUEST['page'])) {
    $selectedPage = $_REQUEST['page'];
}

if (empty($selectedPage)) {
    @ob_clean();
    header('Content-Type: application/json', true);
    $response['message'] = 'No se seleccionó una base de datos. POST: ' . json_encode($_POST) . ' | REQUEST: ' . json_encode($_REQUEST);
    $response['debug'] = [
        'post_keys' => array_keys($_POST),
        'request_keys' => array_keys($_REQUEST),
        'post_page' => isset($_POST['page']) ? $_POST['page'] : 'NO EXISTE',
        'request_method' => $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN',
        'content_type' => $_SERVER['CONTENT_TYPE'] ?? 'UNKNOWN'
    ];
    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    @ob_end_flush();
    exit;
}

// $selectedPage ya fue obtenido arriba en la validación
$allowedPages = ['clinni', 'dricloud', 'mnprogram'];

// Validar que la base de datos sea válida
if (!in_array($selectedPage, $allowedPages)) {
    @ob_clean();
    header('Content-Type: application/json', true);
    $response['message'] = 'Base de datos no válida';
    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    @ob_end_flush();
    exit;
}

// Verificar que se hayan enviado archivos
// Cuando se envían múltiples archivos con files[], la estructura puede variar
$filesReceived = false;
$fileCount = 0;

if (isset($_FILES['files'])) {
    // Verificar si es un array de archivos múltiples
    if (is_array($_FILES['files']['name'])) {
        // Contar archivos válidos
        foreach ($_FILES['files']['name'] as $index => $name) {
            if (!empty($name) && isset($_FILES['files']['tmp_name'][$index]) && $_FILES['files']['error'][$index] === UPLOAD_ERR_OK) {
                $fileCount++;
                $filesReceived = true;
            }
        }
    } 
    // O si es un solo archivo
    else if (!empty($_FILES['files']['name']) && $_FILES['files']['error'] === UPLOAD_ERR_OK) {
        $fileCount = 1;
        $filesReceived = true;
    }
}

if (!$filesReceived || $fileCount === 0) {
    @ob_clean();
    header('Content-Type: application/json', true);
    // Verificar si el problema es el tamaño del POST
    $contentLength = isset($_SERVER['CONTENT_LENGTH']) ? intval($_SERVER['CONTENT_LENGTH']) : 0;
    $postMaxSize = ini_get('post_max_size');
    $postMaxSizeBytes = return_bytes($postMaxSize);
    
    $errorMsg = 'No se recibieron archivos válidos';
    if ($contentLength > 0 && $contentLength > $postMaxSizeBytes) {
        $errorMsg .= '. El tamaño total (' . formatBytes($contentLength) . ') excede post_max_size (' . $postMaxSize . ')';
    }
    
    $response['message'] = $errorMsg;
    $response['debug'] = [
        'files_set' => isset($_FILES['files']),
        'files_structure' => isset($_FILES['files']) ? [
            'is_array' => is_array($_FILES['files']),
            'name_is_array' => is_array($_FILES['files']['name'] ?? null),
            'files_count' => $fileCount,
            'post_max_size' => ini_get('post_max_size'),
            'upload_max_filesize' => ini_get('upload_max_filesize'),
            'max_file_uploads' => ini_get('max_file_uploads'),
            'content_length' => $contentLength,
            'content_length_formatted' => formatBytes($contentLength),
            'post_max_size_bytes' => $postMaxSizeBytes,
            'exceeds_limit' => $contentLength > $postMaxSizeBytes
        ] : 'FILES not set',
        'upload_errors' => isset($_FILES['files']) && is_array($_FILES['files']['error']) ? $_FILES['files']['error'] : (isset($_FILES['files']['error']) ? [$_FILES['files']['error']] : []),
        'empty_post' => empty($_POST),
        'empty_files' => empty($_FILES)
    ];
    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    @ob_end_flush();
    exit;
}

// Directorios
$baseDir = __DIR__;
$tempDir = $baseDir . '/temp/' . uniqid() . '_' . time() . '/';
$resultsDir = $tempDir . 'results/';

// Crear directorios temporales
if (!@mkdir($tempDir, 0777, true) || !@mkdir($resultsDir, 0777, true)) {
    @ob_clean();
    header('Content-Type: application/json', true);
    $response['message'] = 'Error al crear directorios temporales';
    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    @ob_end_flush();
    exit;
}

try {
    // Detectar si estamos en Windows (necesario para extracción de ZIP)
    $isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
    
    $uploadedFile = null;
    $fileExtension = '';
    
    // Procesar el primer archivo (o todos para MN Program)
    // $fileCount ya fue calculado arriba en la validación
    // Pero lo recalculamos aquí para asegurarnos
    if (is_array($_FILES['files']['name'])) {
        $fileCount = count($_FILES['files']['name']);
    } else {
        $fileCount = 1;
    }
    
    if ($selectedPage === 'mnprogram') {
        // MN Program puede recibir múltiples archivos, una carpeta o un ZIP
        $inputDir = $tempDir . 'input/';
        @mkdir($inputDir, 0777, true);
        
        for ($i = 0; $i < $fileCount; $i++) {
            $fileName = $_FILES['files']['name'][$i];
            $fileTmpName = $_FILES['files']['tmp_name'][$i];
            
            // Obtener extensión
            $fileInfo = pathinfo($fileName);
            $fileExtension = isset($fileInfo['extension']) ? strtolower($fileInfo['extension']) : '';
            
            // Validar extensión
            if ($fileExtension !== '' && !in_array($fileExtension, ['csv', 'xml', 'json', 'zip'])) {
                continue; // Saltar archivos no válidos en lugar de lanzar error
            }
            
            // Preservar estructura de carpetas si existe
            $relativePath = str_replace('\\', '/', $fileName);
            $destPath = $inputDir . $relativePath;
            $destDir = dirname($destPath);
            
            if (!file_exists($destDir)) {
                @mkdir($destDir, 0777, true);
            }
            
            if (!@move_uploaded_file($fileTmpName, $destPath)) {
                throw new Exception("Error al mover archivo: $fileName");
            }
            
            // Si es ZIP, extraerlo
            if ($fileExtension === 'zip') {
                if (class_exists('ZipArchive')) {
                    $zip = new ZipArchive();
                    if ($zip->open($destPath) === TRUE) {
                        $zip->extractTo($inputDir);
                        $zip->close();
                        unlink($destPath); // Eliminar el ZIP después de extraer
                    }
                } else {
                    // Alternativa: usar comando del sistema
                    if ($isWindows) {
                        // PowerShell para extraer
                        $destEscaped = escapeshellarg($destPath);
                        $inputDirEscaped = escapeshellarg($inputDir);
                        $psCommand = "Expand-Archive -Path $destEscaped -DestinationPath $inputDirEscaped -Force";
                        $command = "powershell -Command \"$psCommand\"";
                        exec($command, $extractOutput, $extractReturnCode);
                        
                        if ($extractReturnCode === 0) {
                            unlink($destPath);
                        } else {
                            throw new Exception('No se pudo extraer el archivo ZIP. Asegúrate de que PowerShell esté disponible.');
                        }
                    } else {
                        // Linux/Mac usar unzip
                        $destEscaped = escapeshellarg($destPath);
                        $inputDirEscaped = escapeshellarg($inputDir);
                        $command = "unzip -o $destEscaped -d $inputDirEscaped";
                        exec($command, $extractOutput, $extractReturnCode);
                        
                        if ($extractReturnCode === 0) {
                            unlink($destPath);
                        } else {
                            throw new Exception('No se pudo extraer el archivo ZIP. Asegúrate de que "unzip" esté instalado.');
                        }
                    }
                }
            }
        }
        
        $inputPath = $inputDir;
    } else {
        // CLINNI y DRICloud pueden recibir un archivo o una carpeta con múltiples CSV
        // Si hay múltiples archivos, asumimos que es una carpeta
        if ($fileCount > 1 || (isset($_FILES['files']['name'][0]) && strpos($_FILES['files']['name'][0], '/') !== false)) {
            // Es una carpeta con múltiples archivos
            $inputDir = $tempDir . 'input/';
            @mkdir($inputDir, 0777, true);
            
            for ($i = 0; $i < $fileCount; $i++) {
                $fileName = $_FILES['files']['name'][$i];
                $fileTmpName = $_FILES['files']['tmp_name'][$i];
                
                // Obtener extensión
                $fileInfo = pathinfo($fileName);
                $fileExtension = isset($fileInfo['extension']) ? strtolower($fileInfo['extension']) : '';
                
                // Validar extensión según la base de datos
                if ($selectedPage === 'clinni') {
                    // CLINNI acepta archivos sin extensión, csv, xml, json, gz, txt
                    if ($fileExtension !== '' && !in_array($fileExtension, ['csv', 'xml', 'json', 'gz', 'txt'])) {
                        continue; // Saltar archivos no válidos
                    }
                } else if ($selectedPage === 'dricloud') {
                    // DRICloud solo acepta XML
                    if ($fileExtension !== 'xml') {
                        continue; // Saltar archivos no válidos
                    }
                }
                
                // Preservar estructura de carpetas si existe
                $relativePath = str_replace('\\', '/', $fileName);
                $destPath = $inputDir . $relativePath;
                $destDir = dirname($destPath);
                
                if (!file_exists($destDir)) {
                    @mkdir($destDir, 0777, true);
                }
                
                if (!@move_uploaded_file($fileTmpName, $destPath)) {
                    throw new Exception("Error al mover archivo: $fileName");
                }
            }
            
            $inputPath = $inputDir;
        } else {
            // Un solo archivo
            $fileName = $_FILES['files']['name'][0];
            $fileTmpName = $_FILES['files']['tmp_name'][0];
            
            // Obtener extensión (puede estar vacía para CLINNI)
            $fileInfo = pathinfo($fileName);
            $fileExtension = isset($fileInfo['extension']) ? strtolower($fileInfo['extension']) : '';
            
            // Validar extensión según la base de datos
            if ($selectedPage === 'clinni') {
                // CLINNI acepta archivos sin extensión, csv, xml, json, gz, txt
                if ($fileExtension !== '' && !in_array($fileExtension, ['csv', 'xml', 'json', 'gz', 'txt'])) {
                    throw new Exception("Extensión no permitida para CLINNI: .$fileExtension. Formatos permitidos: sin extensión, .csv, .xml, .json, .gz, .txt");
                }
            } else if ($selectedPage === 'dricloud') {
                // DRICloud solo acepta XML
                if ($fileExtension !== 'xml') {
                    throw new Exception("DRICloud solo acepta archivos .xml. Archivo recibido: $fileName");
                }
            }
            
            $uploadedFile = $tempDir . basename($fileName);
            if (!@move_uploaded_file($fileTmpName, $uploadedFile)) {
                throw new Exception("Error al mover archivo: $fileName");
            }
            
            $inputPath = $uploadedFile;
        }
    }
    
    // Determinar script y comando según la base de datos
    $scriptPath = '';
    $command = '';
    $projectRoot = $baseDir;
    
    // $isWindows ya está definido al inicio del try
    $pythonCmd = $isWindows ? 'python' : 'python3';
    
    // Convertir rutas a formato correcto según el sistema
    $normalizePath = function($path) use ($isWindows) {
        $path = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path);
        return $isWindows ? $path : $path;
    };
    
    $scriptExecuted = false;
    
    switch ($selectedPage) {
        case 'clinni':
            $scriptPath = $normalizePath($projectRoot . '/CLINNI/script/clinni_to_plantillas.py');
            $resultsDirEscaped = $isWindows ? '"' . $resultsDir . '"' : escapeshellarg($resultsDir);
            $projectRootEscaped = $isWindows ? '"' . $projectRoot . '"' : escapeshellarg($projectRoot);
            
            // Si es un directorio (carpeta con múltiples archivos), procesar cada CSV
            if (is_dir($inputPath)) {
                $scriptExecuted = true;
                // Buscar todos los CSV en el directorio y subdirectorios
                $csvFiles = [];
                $iterator = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($inputPath)
                );
                foreach ($iterator as $file) {
                    if ($file->isFile()) {
                        $ext = strtolower($file->getExtension());
                        if (in_array($ext, ['csv', 'txt']) || $ext === '') {
                            $csvFiles[] = $file->getPathname();
                        }
                    }
                }
                
                if (empty($csvFiles)) {
                    throw new Exception('No se encontraron archivos CSV válidos en la carpeta.');
                }
                
                // Cambiar al directorio del proyecto
                $oldCwd = getcwd();
                chdir($projectRoot);
                
                // Procesar cada archivo CSV
                foreach ($csvFiles as $csvFile) {
                    $inputPathEscaped = $isWindows ? '"' . $csvFile . '"' : escapeshellarg($csvFile);
                    $command = sprintf(
                        '%s "%s" --input-file %s --output-dir %s --plantillas-dir %s 2>&1',
                        $pythonCmd,
                        $scriptPath,
                        $inputPathEscaped,
                        $resultsDirEscaped,
                        $projectRootEscaped
                    );
                    
                    exec($command, $output, $returnCode);
                    if ($returnCode !== 0) {
                        chdir($oldCwd);
                        $errorMsg = implode("\n", $output);
                        throw new Exception("Error al procesar archivo " . basename($csvFile) . ": " . substr($errorMsg, 0, 200));
                    }
                }
                
                chdir($oldCwd);
            } else {
                // Un solo archivo
                $inputPathEscaped = $isWindows ? '"' . $inputPath . '"' : escapeshellarg($inputPath);
                $command = sprintf(
                    '%s "%s" --input-file %s --output-dir %s --plantillas-dir %s 2>&1',
                    $pythonCmd,
                    $scriptPath,
                    $inputPathEscaped,
                    $resultsDirEscaped,
                    $projectRootEscaped
                );
            }
            break;
            
        case 'dricloud':
            $scriptPath = $normalizePath($projectRoot . '/DRICloud/script/dricloud_to_plantillas.py');
            $resultsDirEscaped = $isWindows ? '"' . $resultsDir . '"' : escapeshellarg($resultsDir);
            $projectRootEscaped = $isWindows ? '"' . $projectRoot . '"' : escapeshellarg($projectRoot);
            
            // Si es un directorio (carpeta con múltiples archivos), procesar cada XML
            if (is_dir($inputPath)) {
                $scriptExecuted = true;
                // Buscar todos los XML en el directorio y subdirectorios
                $xmlFiles = [];
                try {
                    $iterator = new RecursiveIteratorIterator(
                        new RecursiveDirectoryIterator($inputPath, RecursiveDirectoryIterator::SKIP_DOTS)
                    );
                    foreach ($iterator as $file) {
                        if ($file->isFile()) {
                            $ext = strtolower($file->getExtension());
                            if ($ext === 'xml') {
                                $xmlFiles[] = $file->getPathname();
                            }
                        }
                    }
                } catch (Exception $dirError) {
                    throw new Exception('Error al leer la carpeta: ' . $dirError->getMessage());
                }
                
                if (empty($xmlFiles)) {
                    throw new Exception('No se encontraron archivos XML válidos en la carpeta.');
                }
                
                // Cambiar al directorio del proyecto
                $oldCwd = getcwd();
                chdir($projectRoot);
                
                // Procesar cada archivo XML
                $processedCount = 0;
                foreach ($xmlFiles as $xmlFile) {
                    $inputPathEscaped = $isWindows ? '"' . $xmlFile . '"' : escapeshellarg($xmlFile);
                    $command = sprintf(
                        '%s "%s" --input-xml %s --output-dir %s --plantillas-dir %s 2>&1',
                        $pythonCmd,
                        $scriptPath,
                        $inputPathEscaped,
                        $resultsDirEscaped,
                        $projectRootEscaped
                    );
                    
                    $output = [];
                    exec($command, $output, $returnCode);
                    if ($returnCode !== 0) {
                        chdir($oldCwd);
                        $errorMsg = implode("\n", $output);
                        throw new Exception("Error al procesar archivo " . basename($xmlFile) . ": " . substr($errorMsg, 0, 200));
                    }
                    $processedCount++;
                }
                
                // Verificar que se procesó al menos un archivo
                if ($processedCount === 0) {
                    chdir($oldCwd);
                    throw new Exception('No se pudo procesar ningún archivo XML de la carpeta.');
                }
                
                chdir($oldCwd);
            } else {
                // Un solo archivo
                $inputPathEscaped = $isWindows ? '"' . $inputPath . '"' : escapeshellarg($inputPath);
                $command = sprintf(
                    '%s "%s" --input-xml %s --output-dir %s --plantillas-dir %s 2>&1',
                    $pythonCmd,
                    $scriptPath,
                    $inputPathEscaped,
                    $resultsDirEscaped,
                    $projectRootEscaped
                );
            }
            break;
            
        case 'mnprogram':
            $scriptPath = $normalizePath($projectRoot . '/MN Program/script/mn_program_to_plantillas.py');
            $inputPathEscaped = $isWindows ? '"' . $inputPath . '"' : escapeshellarg($inputPath);
            $resultsDirEscaped = $isWindows ? '"' . $resultsDir . '"' : escapeshellarg($resultsDir);
            $command = sprintf(
                '%s "%s" --input-dir %s --output-dir %s 2>&1',
                $pythonCmd,
                $scriptPath,
                $inputPathEscaped,
                $resultsDirEscaped
            );
            break;
    }
    
    // Verificar que el script existe (solo si no se ejecutó ya)
    if (!$scriptExecuted && !file_exists($scriptPath)) {
        throw new Exception("Script no encontrado: $scriptPath");
    }
    
    // Ejecutar script Python (si no se ejecutó ya en el switch para CLINNI/DRICloud con carpetas)
    if (!$scriptExecuted && isset($command) && !empty($command)) {
        $output = [];
        $returnCode = 0;
        
        // Cambiar al directorio del proyecto para que los scripts funcionen correctamente
        $oldCwd = getcwd();
        chdir($projectRoot);
        
        // Ejecutar comando y capturar salida (capturar también stderr)
        // El comando ya tiene 2>&1 al final, así que no necesitamos agregarlo de nuevo
        exec($command, $output, $returnCode);
        
        // Restaurar directorio anterior
        chdir($oldCwd);
        
        // Log de salida para debugging (solo en caso de error)
        if ($returnCode !== 0) {
            $errorMsg = implode("\n", array_slice($output, 0, 10)); // Solo primeros 10 líneas
            $errorDetails = "Comando ejecutado: $command\n";
            $errorDetails .= "Código de retorno: $returnCode\n";
            $errorDetails .= "Salida: " . substr($errorMsg, 0, 500);
            
            // Guardar en log si es posible
            @error_log("Error ejecutando script Python: " . substr($errorDetails, 0, 1000));
            
            throw new Exception("Error al ejecutar script Python (código $returnCode). " . 
                              "Verifica que Python esté instalado y que el script exista. " .
                              "Detalles: " . substr($errorMsg, 0, 200));
        }
    }
    
    // Buscar archivos CSV generados en resultsDir (buscar recursivamente)
    $csvFiles = [];
    if (is_dir($resultsDir)) {
        try {
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($resultsDir, RecursiveDirectoryIterator::SKIP_DOTS)
            );
            foreach ($iterator as $file) {
                if ($file->isFile() && strtolower($file->getExtension()) === 'csv') {
                    $csvFiles[] = $file->getPathname();
                }
            }
        } catch (Exception $dirError) {
            // Si falla la búsqueda recursiva, intentar búsqueda simple
            $csvFiles = glob($resultsDir . '*.csv');
        }
    }
    
    // Si aún no hay archivos, intentar búsqueda simple
    if (empty($csvFiles)) {
        $csvFiles = glob($resultsDir . '*.csv');
    }
    
    if (empty($csvFiles)) {
        // Intentar obtener más información sobre el error
        $errorInfo = '';
        if (isset($output) && !empty($output)) {
            $errorInfo = ' Últimas líneas de salida: ' . implode(' | ', array_slice($output, -5));
        }
        throw new Exception('No se generaron archivos CSV. Verifica el script y los datos de entrada. El script Python puede haber fallado silenciosamente.' . $errorInfo);
    }
    
    // Crear directorio downloads si no existe
    $downloadsDir = $baseDir . '/downloads/';
    if (!file_exists($downloadsDir)) {
        @mkdir($downloadsDir, 0777, true);
    }
    
    // Intentar crear ZIP con ZipArchive (método preferido)
    $zipCreated = false;
    $zipFileName = 'resultados_' . $selectedPage . '_' . date('Y-m-d_H-i-s') . '.zip';
    $zipPath = $downloadsDir . $zipFileName;
    
    if (class_exists('ZipArchive')) {
        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) === TRUE) {
            foreach ($csvFiles as $csvFile) {
                $zip->addFile($csvFile, basename($csvFile));
            }
            $zip->close();
            $zipCreated = true;
        }
    }
    
    // Si no se pudo crear el ZIP, copiar los archivos directamente a downloads
    if (!$zipCreated) {
        // Copiar archivos CSV individuales a downloads
        $individualFiles = [];
        foreach ($csvFiles as $csvFile) {
            $destFile = $downloadsDir . basename($csvFile);
            if (copy($csvFile, $destFile)) {
                $individualFiles[] = basename($csvFile);
            }
        }
        
        if (empty($individualFiles)) {
            throw new Exception('No se pudieron copiar los archivos procesados.');
        }
        
        // Preparar respuesta con archivos individuales
        $response['success'] = true;
        $response['message'] = 'Archivos procesados exitosamente. ' . count($individualFiles) . ' archivo(s) generado(s).';
        $response['download_url'] = null; // No hay ZIP
        $response['individual_files'] = $individualFiles;
        $response['downloads_dir'] = 'downloads/';
        $response['files_count'] = count($individualFiles);
        $response['zip_created'] = false;
        
        // Limpiar archivos temporales
        // deleteDirectory($tempDir);
        
        // Limpiar buffer y enviar respuesta
        ob_clean();
        echo json_encode($response);
        ob_end_flush();
        exit;
    }
    
    // Limpiar archivos temporales (opcional, puedes comentar esto para debug)
    // deleteDirectory($tempDir);
    
    // Preparar respuesta con ZIP
    $response['success'] = true;
    $response['message'] = 'Archivos procesados exitosamente. ' . count($csvFiles) . ' archivo(s) generado(s).';
    $response['download_url'] = 'downloads/' . $zipFileName;
    $response['filename'] = $zipFileName;
    $response['files_count'] = count($csvFiles);
    $response['zip_created'] = true;
    
} catch (Exception $e) {
    $response['message'] = $e->getMessage();
    
    // Limpiar en caso de error
    if (isset($tempDir) && file_exists($tempDir)) {
        deleteDirectory($tempDir);
    }
} catch (Error $e) {
    // Capturar errores fatales de PHP
    $response['message'] = 'Error fatal: ' . $e->getMessage();
    $response['error'] = true;
    
    // Limpiar en caso de error
    if (isset($tempDir) && file_exists($tempDir)) {
        try {
            deleteDirectory($tempDir);
        } catch (Exception $cleanupError) {
            // Ignorar errores de limpieza
        }
    }
} catch (Throwable $e) {
    // Capturar cualquier otro error
    $response['message'] = 'Error inesperado: ' . $e->getMessage();
    $response['error'] = true;
    
    // Limpiar en caso de error
    if (isset($tempDir) && file_exists($tempDir)) {
        try {
            deleteDirectory($tempDir);
        } catch (Exception $cleanupError) {
            // Ignorar errores de limpieza
        }
    }
}

// Limpiar CUALQUIER salida no deseada ANTES de enviar JSON
// Esto es crítico para evitar que HTML de errores se mezcle con JSON
while (ob_get_level() > 0) {
    @ob_end_clean();
}

// Reiniciar buffer limpio
@ob_start();

// Asegurar que siempre devolvemos JSON (incluso si hay errores)
@header('Content-Type: application/json', true);
@header('Access-Control-Allow-Origin: *', true);
@header('Access-Control-Allow-Methods: POST', true);
@header('Access-Control-Allow-Headers: Content-Type', true);

// Enviar respuesta JSON
$jsonResponse = @json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

// Si json_encode falla, enviar un error básico
if ($jsonResponse === false) {
    $jsonResponse = json_encode([
        'success' => false,
        'error' => true,
        'message' => 'Error al generar respuesta JSON: ' . json_last_error_msg(),
        'download_url' => '',
        'filename' => ''
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

// Limpiar cualquier salida adicional antes de enviar JSON
@ob_clean();

echo $jsonResponse;

// Finalizar buffer
@ob_end_flush();

// Restaurar handlers
@restore_error_handler();
@restore_exception_handler();

// Función auxiliar para convertir tamaño a bytes
function return_bytes($val) {
    $val = trim($val);
    $last = strtolower($val[strlen($val)-1]);
    $val = (int)$val;
    switch($last) {
        case 'g': $val *= 1024;
        case 'm': $val *= 1024;
        case 'k': $val *= 1024;
    }
    return $val;
}

// Función auxiliar para formatear bytes
function formatBytes($bytes, $precision = 2) {
    $units = array('B', 'KB', 'MB', 'GB', 'TB');
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}

// Función auxiliar para eliminar directorio recursivamente
function deleteDirectory($dir) {
    if (!file_exists($dir)) {
        return;
    }
    
    $files = array_diff(scandir($dir), ['.', '..']);
    foreach ($files as $file) {
        $path = $dir . '/' . $file;
        is_dir($path) ? deleteDirectory($path) : unlink($path);
    }
    rmdir($dir);
}
?>
