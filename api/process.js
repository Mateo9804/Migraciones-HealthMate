const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

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

// Función para crear ZIP
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }

  try {
    // Obtener page desde query string (más simple y no requiere formidable)
    const selectedPage = req.query.page;
    
    if (!selectedPage || !['clinni', 'dricloud', 'mnprogram'].includes(selectedPage)) {
      return res.status(400).json({
        success: false,
        message: 'Base de datos no válida'
      });
    }

    // Obtener rutas de archivos desde upload-chunk
    const tmpDir = process.env.VERCEL ? '/tmp' : require('os').tmpdir();
    const uploadDir = path.join(tmpDir, 'uploads');
    
    if (!fs.existsSync(uploadDir)) {
      return res.status(400).json({
        success: false,
        message: 'No se encontraron archivos para procesar'
      });
    }

    // Buscar archivos subidos
    const uploadedFiles = fs.readdirSync(uploadDir).filter(f => 
      f.startsWith(selectedPage) || fs.statSync(path.join(uploadDir, f)).isFile()
    );

    if (uploadedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se encontraron archivos para procesar'
      });
    }

    // Crear directorios temporales
    const baseDir = process.cwd();
    const tempDir = path.join(tmpDir, `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    const resultsDir = path.join(tempDir, 'results');
    const inputPath = path.join(tempDir, 'input');
    
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.mkdirSync(inputPath, { recursive: true });

    // Mover archivos a inputPath
    for (const file of uploadedFiles) {
      const srcPath = path.join(uploadDir, file);
      const destPath = path.join(inputPath, file.replace(/^[^_]+_/, ''));
      fs.copyFileSync(srcPath, destPath);
    }

    // Procesar con Python
    const pythonCmd = process.env.VERCEL ? 'python3' : (process.platform === 'win32' ? 'python' : 'python3');
    let scriptPath = '';
    let command = '';

    switch (selectedPage) {
      case 'clinni':
        scriptPath = path.join(baseDir, 'CLINNI', 'script', 'clinni_to_plantillas.py');
        const csvFiles = findFiles(inputPath, ['csv', 'txt', '']);
        for (const csvFile of csvFiles) {
          command = `${pythonCmd} "${scriptPath}" --input-file "${csvFile}" --output-dir "${resultsDir}" --plantillas-dir "${baseDir}"`;
          await execAsync(command, { cwd: baseDir, timeout: 50000 });
        }
        break;
      case 'dricloud':
        scriptPath = path.join(baseDir, 'DRICloud', 'script', 'dricloud_to_plantillas.py');
        const xmlFiles = findFiles(inputPath, ['xml']);
        for (const xmlFile of xmlFiles) {
          command = `${pythonCmd} "${scriptPath}" --input-xml "${xmlFile}" --output-dir "${resultsDir}" --plantillas-dir "${baseDir}"`;
          await execAsync(command, { cwd: baseDir, timeout: 50000 });
        }
        break;
      case 'mnprogram':
        scriptPath = path.join(baseDir, 'MN Program', 'script', 'mn_program_to_plantillas.py');
        command = `${pythonCmd} "${scriptPath}" --input-dir "${inputPath}" --output-dir "${resultsDir}"`;
        await execAsync(command, { cwd: baseDir, timeout: 50000 });
        break;
    }

    // Buscar CSV generados
    const generatedCsvFiles = findFiles(resultsDir, ['csv']);
    
    if (generatedCsvFiles.length === 0) {
      throw new Error('No se generaron archivos CSV');
    }

    // Crear ZIP
    const zipFileName = `resultados_${selectedPage}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.zip`;
    const zipPath = path.join(tmpDir, zipFileName);
    
    const zipCreated = createZip(generatedCsvFiles, zipPath);
    
    if (!zipCreated) {
      return res.json({
        success: true,
        message: `Archivos procesados. ${generatedCsvFiles.length} archivo(s) generado(s).`,
        individual_files: generatedCsvFiles.map(f => path.basename(f)),
        files_count: generatedCsvFiles.length,
        zip_created: false
      });
    }

    // Leer ZIP y devolver como base64
    const zipBuffer = fs.readFileSync(zipPath);
    const zipBase64 = zipBuffer.toString('base64');

    // Limpiar
    try {
      fs.unlinkSync(zipPath);
      uploadedFiles.forEach(f => {
        try { fs.unlinkSync(path.join(uploadDir, f)); } catch(e) {}
      });
    } catch(e) {}

    return res.json({
      success: true,
      message: `Archivos procesados exitosamente. ${generatedCsvFiles.length} archivo(s) generado(s).`,
      zip_base64: zipBase64,
      filename: zipFileName,
      files_count: generatedCsvFiles.length,
      zip_created: true
    });

  } catch (error) {
    console.error('Error en process:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error al procesar archivos'
    });
  }
};

