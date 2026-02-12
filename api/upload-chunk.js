const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Importar formidable - usar la misma forma que en upload.js
const formidable = require('formidable');

// Almacenar chunks temporalmente en memoria (en producción usar Redis o similar)
const chunksStore = new Map();

module.exports = async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'POST') {
    // Recibir un chunk usando FormData
    try {
      const uploadDir = process.env.VERCEL ? '/tmp' : require('os').tmpdir();
      
      // formidable v3 puede necesitar ser llamado de forma diferente
      let form;
      try {
        if (typeof formidable === 'function') {
          form = formidable({
            multiples: false,
            maxFileSize: 5 * 1024 * 1024, // 5MB máximo por chunk
            uploadDir: uploadDir,
            keepExtensions: false
          });
        } else if (formidable.formidable && typeof formidable.formidable === 'function') {
          form = formidable.formidable({
            multiples: false,
            maxFileSize: 5 * 1024 * 1024,
            uploadDir: uploadDir,
            keepExtensions: false
          });
        } else {
          throw new Error(`formidable no es una función. Tipo: ${typeof formidable}`);
        }
      } catch (e) {
        console.error('Error al crear form:', e);
        console.error('formidable:', formidable);
        console.error('typeof formidable:', typeof formidable);
        throw new Error(`Error al inicializar formidable: ${e.message}`);
      }

      const [fields, files] = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          else resolve([fields, files]);
        });
      });

      const chunkIndex = parseInt(Array.isArray(fields.chunkIndex) ? fields.chunkIndex[0] : fields.chunkIndex);
      const totalChunks = parseInt(Array.isArray(fields.totalChunks) ? fields.totalChunks[0] : fields.totalChunks);
      const fileId = Array.isArray(fields.fileId) ? fields.fileId[0] : fields.fileId;
      const fileName = Array.isArray(fields.fileName) ? fields.fileName[0] : fields.fileName;
      const page = Array.isArray(fields.page) ? fields.page[0] : fields.page;

      // Obtener el chunk como archivo
      const chunkFile = Array.isArray(files.chunk) ? files.chunk[0] : files.chunk;
      
      if (!chunkFile || !chunkFile.filepath) {
        return res.status(400).json({
          success: false,
          message: 'No se recibió el chunk'
        });
      }

      if (!chunksStore.has(fileId)) {
        chunksStore.set(fileId, {
          fileName,
          page,
          chunkPaths: {},
          totalChunks,
          receivedChunks: 0
        });
      }

      const fileInfo = chunksStore.get(fileId);
      // Guardar la ruta del chunk temporal
      fileInfo.chunkPaths[chunkIndex] = chunkFile.filepath;
      fileInfo.receivedChunks++;

      // Si recibimos todos los chunks, reconstruir el archivo
      if (fileInfo.receivedChunks === totalChunks) {
        // Reconstruir archivo desde los chunks guardados
        const chunks = [];
        for (let i = 0; i < totalChunks; i++) {
          const chunkPath = fileInfo.chunkPaths[i];
          if (fs.existsSync(chunkPath)) {
            chunks.push(fs.readFileSync(chunkPath));
            // Eliminar chunk temporal
            try { fs.unlinkSync(chunkPath); } catch(e) {}
          }
        }
        const fileBuffer = Buffer.concat(chunks);

        // Guardar archivo temporal
        const tmpDir = process.env.VERCEL ? '/tmp' : require('os').tmpdir();
        const uploadDir = path.join(tmpDir, 'uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Usar el page como prefijo para organizar mejor
        const fileName = fileInfo.fileName.replace(/[<>:"|?*]/g, '_');
        const filePath = path.join(uploadDir, `${fileInfo.page}_${fileId}_${fileName}`);
        fs.writeFileSync(filePath, fileBuffer);

        // Limpiar chunks de memoria
        chunksStore.delete(fileId);

        // Verificar si hay un parámetro "processNow" para procesar inmediatamente
        const processNow = Array.isArray(fields.processNow) ? fields.processNow[0] : fields.processNow;
        
        if (processNow === 'true') {
          // Procesar el archivo inmediatamente en esta misma función
          try {
            const result = await processFile(filePath, fileInfo.page, tmpDir);
            return res.json(result);
          } catch (processError) {
            return res.status(500).json({
              success: false,
              message: `Error al procesar: ${processError.message}`
            });
          }
        }

        return res.json({
          success: true,
          message: 'Archivo reconstruido exitosamente',
          filePath,
          fileId,
          page: fileInfo.page,
          ready: true
        });
      }

      return res.json({
        success: true,
        message: `Chunk ${chunkIndex + 1}/${totalChunks} recibido`,
        received: fileInfo.receivedChunks,
        total: totalChunks
      });

    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  } else if (req.method === 'GET') {
    // Verificar estado de chunks
    const { fileId } = req.query;
    if (!fileId || !chunksStore.has(fileId)) {
      return res.status(404).json({
        success: false,
        message: 'File ID no encontrado'
      });
    }

    const fileInfo = chunksStore.get(fileId);
    return res.json({
      success: true,
      received: fileInfo.receivedChunks,
      total: fileInfo.totalChunks
    });
  } else if (req.method === 'DELETE') {
    // Limpiar chunks
    const { fileId } = req.query;
    if (fileId) {
      chunksStore.delete(fileId);
    }
    return res.json({ success: true });
  }

  return res.status(405).json({ success: false, message: 'Método no permitido' });
};

// Función auxiliar para procesar archivos
async function findFiles(dir, extensions) {
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
    console.error('Error al crear ZIP:', e);
    return false;
  }
}

async function processFile(filePath, selectedPage, tmpDir) {
  const baseDir = process.cwd();
  const tempDir = path.join(tmpDir, `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  const resultsDir = path.join(tempDir, 'results');
  const inputPath = path.join(tempDir, 'input');
  
  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.mkdirSync(inputPath, { recursive: true });

  // Copiar archivo a inputPath
  const destPath = path.join(inputPath, path.basename(filePath));
  fs.copyFileSync(filePath, destPath);

  // Procesar con Python
  const pythonCmd = process.env.VERCEL ? 'python3' : (process.platform === 'win32' ? 'python' : 'python3');
  let scriptPath = '';

  switch (selectedPage) {
    case 'clinni':
      scriptPath = path.join(baseDir, 'CLINNI', 'script', 'clinni_to_plantillas.py');
      const csvFiles = findFiles(inputPath, ['csv', 'txt', '']);
      for (const csvFile of csvFiles) {
        const command = `${pythonCmd} "${scriptPath}" --input-file "${csvFile}" --output-dir "${resultsDir}" --plantillas-dir "${baseDir}"`;
        await execAsync(command, { cwd: baseDir, timeout: 50000 });
      }
      break;
    case 'dricloud':
      scriptPath = path.join(baseDir, 'DRICloud', 'script', 'dricloud_to_plantillas.py');
      const xmlFiles = findFiles(inputPath, ['xml']);
      for (const xmlFile of xmlFiles) {
        const command = `${pythonCmd} "${scriptPath}" --input-xml "${xmlFile}" --output-dir "${resultsDir}" --plantillas-dir "${baseDir}"`;
        await execAsync(command, { cwd: baseDir, timeout: 50000 });
      }
      break;
    case 'mnprogram':
      scriptPath = path.join(baseDir, 'MN Program', 'script', 'mn_program_to_plantillas.py');
      const command = `${pythonCmd} "${scriptPath}" --input-dir "${inputPath}" --output-dir "${resultsDir}"`;
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
    return {
      success: true,
      message: `Archivos procesados. ${generatedCsvFiles.length} archivo(s) generado(s).`,
      individual_files: generatedCsvFiles.map(f => path.basename(f)),
      files_count: generatedCsvFiles.length,
      zip_created: false
    };
  }

  // Leer ZIP y devolver como base64
  const zipBuffer = fs.readFileSync(zipPath);
  const zipBase64 = zipBuffer.toString('base64');

  // Limpiar
  try {
    fs.unlinkSync(zipPath);
    fs.unlinkSync(filePath);
  } catch(e) {}

  return {
    success: true,
    message: `Archivos procesados exitosamente. ${generatedCsvFiles.length} archivo(s) generado(s).`,
    zip_base64: zipBase64,
    filename: zipFileName,
    files_count: generatedCsvFiles.length,
    zip_created: true
  };
}

