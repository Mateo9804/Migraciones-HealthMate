const fs = require('fs');
const path = require('path');

// Importar formidable - usar la misma forma que en upload.js
const formidable = require('formidable');

// Importar módulos de procesamiento JavaScript
const { processMNProgram } = require('../scripts/mn_program_to_plantillas');
const { processDRICloud } = require('../scripts/dricloud_to_plantillas');
const { processCLINNI } = require('../scripts/clinni_to_plantillas');

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
function findFiles(dir, extensions) {
  const results = [];
  try {
    if (!fs.existsSync(dir)) {
      console.log(`[DEBUG] Directorio no existe: ${dir}`);
      return results;
    }
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          const subResults = findFiles(filePath, extensions);
          results.push(...subResults);
        } else {
          const ext = path.extname(file).toLowerCase().substring(1);
          if (extensions.includes(ext) || (extensions.includes('') && ext === '')) {
            results.push(filePath);
          }
        }
      } catch (e) {
        console.error(`[ERROR] Error procesando archivo ${filePath}:`, e.message);
        // Continuar con el siguiente archivo
      }
    }
  } catch (e) {
    console.error(`[ERROR] Error en findFiles para ${dir}:`, e.message);
  }
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

  // Procesar con módulos JavaScript
  try {
    console.log(`[DEBUG] Procesando con página: ${selectedPage}`);
    console.log(`[DEBUG] inputPath: ${inputPath}`);
    console.log(`[DEBUG] resultsDir: ${resultsDir}`);
    console.log(`[DEBUG] baseDir: ${baseDir}`);
    
    switch (selectedPage) {
      case 'clinni':
        // Para CLINNI, buscar todos los archivos en inputPath
        const clinniFiles = findFiles(inputPath, ['csv', 'txt', 'gz', 'json', 'xml', '']);
        console.log(`[DEBUG] Archivos CLINNI encontrados: ${clinniFiles.length}`);
        for (const clinniFile of clinniFiles) {
          console.log(`[DEBUG] Procesando archivo CLINNI: ${clinniFile}`);
          await processCLINNI(clinniFile, resultsDir, baseDir);
        }
        break;
      case 'dricloud':
        // Para DRICloud, buscar archivos XML
        const xmlFiles = findFiles(inputPath, ['xml']);
        console.log(`[DEBUG] Archivos XML encontrados: ${xmlFiles.length}`);
        for (const xmlFile of xmlFiles) {
          console.log(`[DEBUG] Procesando archivo XML: ${xmlFile}`);
          await processDRICloud(xmlFile, resultsDir, baseDir);
        }
        break;
      case 'mnprogram':
        // Para MN Program, verificar si hay un solo archivo o un directorio
        const mnFiles = fs.readdirSync(inputPath);
        console.log(`[DEBUG] Archivos en inputPath para MN Program:`, mnFiles);
        
        // Si solo hay un archivo CSV, copiarlo como clientes.csv
        if (mnFiles.length === 1 && mnFiles[0].toLowerCase().endsWith('.csv')) {
          const singleFile = path.join(inputPath, mnFiles[0]);
          const clientesPath = path.join(inputPath, 'clientes.csv');
          if (singleFile !== clientesPath) {
            console.log(`[DEBUG] Copiando ${mnFiles[0]} como clientes.csv`);
            fs.copyFileSync(singleFile, clientesPath);
          }
        }
        
        console.log(`[DEBUG] Procesando MN Program desde: ${inputPath}`);
        await processMNProgram(inputPath, resultsDir);
        break;
      default:
        throw new Error(`Página no reconocida: ${selectedPage}`);
    }
    
    console.log(`[DEBUG] Procesamiento completado. Buscando CSV en: ${resultsDir}`);
  } catch (error) {
    console.error('Error al procesar:', error);
    console.error('Stack trace:', error.stack);
    throw new Error(`Error al procesar archivo: ${error.message}`);
  }

  // Buscar CSV generados
  console.log(`[DEBUG] Buscando archivos CSV en: ${resultsDir}`);
  console.log(`[DEBUG] ¿Existe resultsDir?: ${fs.existsSync(resultsDir)}`);
  
  if (fs.existsSync(resultsDir)) {
    const dirContents = fs.readdirSync(resultsDir);
    console.log(`[DEBUG] Contenido de resultsDir:`, dirContents);
  }
  
  let generatedCsvFiles = findFiles(resultsDir, ['csv']);
  console.log(`[DEBUG] Archivos CSV encontrados (primera búsqueda): ${generatedCsvFiles.length}`);
  
  // Asegurar que sea un array
  if (!Array.isArray(generatedCsvFiles)) {
    console.error('findFiles no devolvió un array:', typeof generatedCsvFiles, generatedCsvFiles);
    generatedCsvFiles = [];
  }
  
  if (generatedCsvFiles.length === 0) {
    // Intentar buscar de nuevo después de un pequeño delay
    console.log(`[DEBUG] No se encontraron CSV, esperando 500ms y buscando de nuevo...`);
    await new Promise(resolve => setTimeout(resolve, 500));
    generatedCsvFiles = findFiles(resultsDir, ['csv']);
    console.log(`[DEBUG] Archivos CSV encontrados (segunda búsqueda): ${generatedCsvFiles.length}`);
    
    if (!Array.isArray(generatedCsvFiles)) {
      generatedCsvFiles = [];
    }
    
    if (generatedCsvFiles.length === 0) {
      // Listar todos los archivos en resultsDir para debug
      if (fs.existsSync(resultsDir)) {
        const allFiles = findFiles(resultsDir, []);
        console.error(`[ERROR] No se encontraron CSV. Archivos en resultsDir:`, allFiles);
      }
      throw new Error('No se generaron archivos CSV. Verifica que los scripts de procesamiento se ejecutaron correctamente.');
    }
  }
  
  console.log(`[DEBUG] Archivos CSV finales:`, generatedCsvFiles.map(f => path.basename(f)));

  // Crear ZIP
  const zipFileName = `resultados_${selectedPage}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.zip`;
  const zipPath = path.join(tmpDir, zipFileName);
  
  const zipCreated = createZip(generatedCsvFiles, zipPath);
  
  if (!zipCreated) {
    return {
      success: true,
      message: `Archivos procesados. ${generatedCsvFiles.length} archivo(s) generado(s).`,
      individual_files: Array.isArray(generatedCsvFiles) ? generatedCsvFiles.map(f => path.basename(f)) : [],
      files_count: Array.isArray(generatedCsvFiles) ? generatedCsvFiles.length : 0,
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
    // Limpiar directorio temporal
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch(e) {
    console.error('Error al limpiar archivos temporales:', e);
  }

  return {
    success: true,
    message: `Archivos procesados exitosamente. ${generatedCsvFiles.length} archivo(s) generado(s).`,
    zip_base64: zipBase64,
    filename: zipFileName,
    files_count: generatedCsvFiles.length,
    zip_created: true
  };
}

