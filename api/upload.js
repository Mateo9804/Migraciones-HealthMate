const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Configuración
const MAX_FILE_SIZE = 1000 * 1024 * 1024; // 1000MB
const MAX_EXECUTION_TIME = 50000; // 50 segundos (Vercel tiene límite de 60s en Pro)

// Función auxiliar para limpiar directorios
function deleteDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      deleteDirectory(filePath);
    } else {
      fs.unlinkSync(filePath);
    }
  });
  fs.rmdirSync(dirPath);
}

// Función auxiliar para encontrar archivos recursivamente
function findFiles(dir, extensions) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      results.push(...findFiles(filePath, extensions));
    } else {
      const ext = path.extname(file).toLowerCase().substring(1);
      if (extensions.includes(ext) || (extensions.includes('') && ext === '')) {
        results.push(filePath);
      }
    }
  });
  return results;
}

// Función para crear ZIP usando adm-zip
function createZip(files, zipPath) {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    
    files.forEach(filePath => {
      const fileName = path.basename(filePath);
      const fileContent = fs.readFileSync(filePath);
      zip.addFile(fileName, fileContent);
    });
    
    fs.writeFileSync(zipPath, zip.toBuffer());
    return true;
  } catch (e) {
    console.error('Error al crear ZIP con adm-zip:', e);
    return false;
  }
}

module.exports = async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }

  const response = {
    success: false,
    message: '',
    download_url: '',
    filename: ''
  };

  let tempDir = null;
  let resultsDir = null;

  try {
    // Parsear FormData
    // En Vercel, formidable necesita configuración especial
    const uploadDir = process.env.VERCEL ? '/tmp' : require('os').tmpdir();
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE,
      multiples: true,
      keepExtensions: true,
      uploadDir: uploadDir
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });
    
    // Obtener la página seleccionada
    const selectedPage = Array.isArray(fields.page) ? fields.page[0] : fields.page;
    const saveOnly = Array.isArray(fields.saveOnly) ? fields.saveOnly[0] : fields.saveOnly;
    
    if (!selectedPage || !['clinni', 'dricloud', 'mnprogram'].includes(selectedPage)) {
      return res.status(400).json({
        success: false,
        message: 'Base de datos no válida o no seleccionada'
      });
    }

    // Verificar que hay archivos
    const uploadedFiles = Array.isArray(files.files) ? files.files : [files.files].filter(Boolean);
    
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se recibieron archivos válidos'
      });
    }

    // Si saveOnly está activado, solo guardar archivos sin procesar
    if (saveOnly === 'true') {
      const tmpDir = process.env.VERCEL ? '/tmp' : require('os').tmpdir();
      const uploadDir = path.join(tmpDir, 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const savedFiles = [];
      for (const file of uploadedFiles) {
        const fileName = (file.originalFilename || file.name || 'file').replace(/[<>:"|?*]/g, '_');
        const fileId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const filePath = path.join(uploadDir, `${selectedPage}_${fileId}_${fileName}`);
        
        if (fs.existsSync(file.filepath)) {
          fs.copyFileSync(file.filepath, filePath);
          savedFiles.push(fileName);
        }
      }

      return res.json({
        success: true,
        message: `${savedFiles.length} archivo(s) guardado(s) exitosamente`,
        saved_files: savedFiles
      });
    }

    // Crear directorios temporales
    // En Vercel, usar /tmp para archivos temporales
    const baseDir = process.cwd();
    const tmpBase = process.env.VERCEL ? '/tmp' : path.join(baseDir, 'temp');
    tempDir = path.join(tmpBase, `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    resultsDir = path.join(tempDir, 'results');
    
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(resultsDir, { recursive: true });

    const inputPath = path.join(tempDir, 'input');
    fs.mkdirSync(inputPath, { recursive: true });

    // Procesar archivos subidos
    let inputPathFinal = inputPath;
    // En Vercel siempre usar python3, localmente puede variar
    const pythonCmd = process.env.VERCEL ? 'python3' : (process.platform === 'win32' ? 'python' : 'python3');

    // Mover archivos a directorio temporal
    for (const file of uploadedFiles) {
      const fileName = file.originalFilename || file.name || 'file';
      // Limpiar nombre de archivo para evitar problemas con rutas
      const cleanFileName = fileName.replace(/[<>:"|?*]/g, '_');
      const filePath = path.join(inputPath, cleanFileName);
      
      // Crear subdirectorios si es necesario
      const fileDir = path.dirname(filePath);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }
      
      // Mover archivo (formidable ya lo guardó en file.filepath)
      if (fs.existsSync(file.filepath)) {
        fs.renameSync(file.filepath, filePath);
      } else {
        // Si no existe, copiar
        fs.copyFileSync(file.filepath, filePath);
      }
      
      // Si es ZIP, extraerlo (solo para MN Program)
      if (selectedPage === 'mnprogram' && fileName.toLowerCase().endsWith('.zip')) {
        try {
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(filePath);
          zip.extractAllTo(inputPath, true);
          fs.unlinkSync(filePath); // Eliminar ZIP después de extraer
        } catch (e) {
          // Si no se puede extraer con adm-zip, intentar con unzip del sistema
          try {
            await execAsync(`unzip -o "${filePath}" -d "${inputPath}"`);
            fs.unlinkSync(filePath);
          } catch (unzipError) {
            throw new Error(`No se pudo extraer el archivo ZIP: ${e.message}`);
          }
        }
      }
    }

    // Determinar script Python según la base de datos
    let scriptPath = '';
    let command = '';
    const projectRoot = baseDir;

    switch (selectedPage) {
      case 'clinni':
        scriptPath = path.join(projectRoot, 'CLINNI', 'script', 'clinni_to_plantillas.py');
        
        // Buscar archivos CSV/TXT en el directorio
        const csvFiles = findFiles(inputPath, ['csv', 'txt', '']);
        
        if (csvFiles.length === 0) {
          throw new Error('No se encontraron archivos CSV válidos');
        }

        // Procesar cada archivo CSV
        for (const csvFile of csvFiles) {
          const inputPathEscaped = `"${csvFile}"`;
          const resultsDirEscaped = `"${resultsDir}"`;
          const projectRootEscaped = `"${projectRoot}"`;
          
          command = `${pythonCmd} "${scriptPath}" --input-file ${inputPathEscaped} --output-dir ${resultsDirEscaped} --plantillas-dir ${projectRootEscaped}`;
          
          const { stdout, stderr } = await execAsync(command, {
            cwd: projectRoot,
            maxBuffer: 10 * 1024 * 1024, // 10MB
            timeout: MAX_EXECUTION_TIME
          });
          
          if (stderr && !stderr.includes('[INFO]') && !stderr.includes('[OK]')) {
            console.error('Error al procesar:', stderr);
          }
        }
        break;

      case 'dricloud':
        scriptPath = path.join(projectRoot, 'DRICloud', 'script', 'dricloud_to_plantillas.py');
        
        // Buscar archivos XML
        const xmlFiles = findFiles(inputPath, ['xml']);
        
        if (xmlFiles.length === 0) {
          throw new Error('No se encontraron archivos XML válidos');
        }

        // Procesar cada archivo XML
        for (const xmlFile of xmlFiles) {
          const inputPathEscaped = `"${xmlFile}"`;
          const resultsDirEscaped = `"${resultsDir}"`;
          const projectRootEscaped = `"${projectRoot}"`;
          
          command = `${pythonCmd} "${scriptPath}" --input-xml ${inputPathEscaped} --output-dir ${resultsDirEscaped} --plantillas-dir ${projectRootEscaped}`;
          
          const { stdout, stderr } = await execAsync(command, {
            cwd: projectRoot,
            maxBuffer: 10 * 1024 * 1024,
            timeout: MAX_EXECUTION_TIME
          });
          
          if (stderr && !stderr.includes('[INFO]') && !stderr.includes('[OK]')) {
            console.error('Error al procesar:', stderr);
          }
        }
        break;

      case 'mnprogram':
        scriptPath = path.join(projectRoot, 'MN Program', 'script', 'mn_program_to_plantillas.py');
        const inputDirEscaped = `"${inputPath}"`;
        const resultsDirEscaped = `"${resultsDir}"`;
        
        command = `${pythonCmd} "${scriptPath}" --input-dir ${inputDirEscaped} --output-dir ${resultsDirEscaped}`;
        
        const { stdout, stderr } = await execAsync(command, {
          cwd: projectRoot,
          maxBuffer: 10 * 1024 * 1024,
          timeout: MAX_EXECUTION_TIME
        });
        
        if (stderr && !stderr.includes('[INFO]') && !stderr.includes('[OK]')) {
          console.error('Error al procesar:', stderr);
        }
        break;
    }

    // Buscar archivos CSV generados
    const generatedCsvFiles = findFiles(resultsDir, ['csv']);
    
    if (generatedCsvFiles.length === 0) {
      throw new Error('No se generaron archivos CSV. Verifica el script y los datos de entrada.');
    }

    // Crear directorio downloads si no existe
    // En Vercel, guardar en /tmp/downloads temporalmente
    const downloadsBase = process.env.VERCEL ? '/tmp' : projectRoot;
    const downloadsDir = path.join(downloadsBase, 'downloads');
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    // Crear ZIP
    const zipFileName = `resultados_${selectedPage}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.zip`;
    const zipPath = path.join(downloadsDir, zipFileName);
    
    let zipCreated = false;
    try {
      zipCreated = createZip(generatedCsvFiles, zipPath);
    } catch (e) {
      console.error('Error al crear ZIP:', e);
    }

    if (!zipCreated) {
      // Si no se pudo crear ZIP, copiar archivos individuales
      const individualFiles = [];
      for (const csvFile of generatedCsvFiles) {
        const destFile = path.join(downloadsDir, path.basename(csvFile));
        fs.copyFileSync(csvFile, destFile);
        individualFiles.push(path.basename(csvFile));
      }
      
      return res.json({
        success: true,
        message: `Archivos procesados exitosamente. ${individualFiles.length} archivo(s) generado(s).`,
        download_url: null,
        individual_files: individualFiles,
        downloads_dir: 'downloads/',
        files_count: individualFiles.length,
        zip_created: false
      });
    }

    // Limpiar archivos temporales (opcional, comentar para debug)
    // deleteDirectory(tempDir);

    // En Vercel, necesitamos devolver el ZIP como base64 o crear una ruta de descarga
    // Por ahora, devolvemos la ruta y el contenido base64 del ZIP
    const zipBuffer = fs.readFileSync(zipPath);
    const zipBase64 = zipBuffer.toString('base64');
    
    // Preparar respuesta con ZIP
    response.success = true;
    response.message = `Archivos procesados exitosamente. ${generatedCsvFiles.length} archivo(s) generado(s).`;
    response.download_url = `/api/download?file=${encodeURIComponent(zipFileName)}`;
    response.filename = zipFileName;
    response.files_count = generatedCsvFiles.length;
    response.zip_created = true;
    response.zip_base64 = zipBase64; // Incluir ZIP en base64 para descarga directa

    return res.json(response);

  } catch (error) {
    console.error('Error en upload:', error);
    
    // Limpiar en caso de error
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        deleteDirectory(tempDir);
      } catch (cleanupError) {
        console.error('Error al limpiar:', cleanupError);
      }
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'Error al procesar archivos',
      error: true
    });
  }
}

