const fs = require('fs');
const path = require('path');
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
      const form = formidable({
        multiples: false,
        maxFileSize: 5 * 1024 * 1024, // 5MB máximo por chunk
        uploadDir: uploadDir,
        keepExtensions: false
      });

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

        return res.json({
          success: true,
          message: 'Archivo reconstruido exitosamente',
          filePath,
          fileId,
          page: fileInfo.page
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

