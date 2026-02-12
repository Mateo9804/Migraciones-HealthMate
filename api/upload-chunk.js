const fs = require('fs');
const path = require('path');

// Almacenar chunks temporalmente en memoria (en producción usar Redis o similar)
const chunksStore = new Map();

module.exports = async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'POST') {
    // Recibir un chunk
    try {
      const { chunkIndex, totalChunks, fileId, fileName, page, chunkData } = await new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
        req.on('error', reject);
      });

      if (!chunksStore.has(fileId)) {
        chunksStore.set(fileId, {
          fileName,
          page,
          chunks: {},
          totalChunks,
          receivedChunks: 0
        });
      }

      const fileInfo = chunksStore.get(fileId);
      fileInfo.chunks[chunkIndex] = chunkData;
      fileInfo.receivedChunks++;

      // Si recibimos todos los chunks, reconstruir el archivo
      if (fileInfo.receivedChunks === totalChunks) {
        // Reconstruir archivo desde base64
        const chunks = [];
        for (let i = 0; i < totalChunks; i++) {
          chunks.push(Buffer.from(fileInfo.chunks[i], 'base64'));
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

