# 📦 Solución de Chunked Upload para Archivos Grandes

## Problema Resuelto

Vercel tiene un límite de **4.5 MB** para el payload de las Serverless Functions. Los archivos grandes (como tu `clientes.csv` de 15.51 MB) excedían este límite y causaban el error **413 "Request Entity Too Large"**.

## Solución Implementada

Se implementó un sistema de **chunked upload** (carga por fragmentos) que:

1. **Divide archivos grandes** en chunks de 4 MB cada uno
2. **Sube cada chunk** por separado a `/api/upload-chunk`
3. **Reconstruye el archivo** en el servidor
4. **Procesa todos los archivos** juntos con `/api/process`

## Cómo Funciona

### Para Archivos Grandes (>4.5 MB):
1. El frontend detecta automáticamente archivos grandes
2. Divide el archivo en chunks de 4 MB
3. Sube cada chunk secuencialmente
4. El servidor reconstruye el archivo completo
5. Una vez reconstruido, procesa con Python
6. Devuelve el ZIP con los resultados

### Para Archivos Pequeños (<4.5 MB):
- Se suben normalmente usando el método tradicional
- O se guardan temporalmente y se procesan todos juntos

## Archivos Creados

- `api/upload-chunk.js` - Recibe y reconstruye chunks
- `api/process.js` - Procesa archivos ya subidos
- Modificaciones en `script.js` - Lógica de chunked upload

## Límites

- ✅ **Sin límite práctico** para tamaño de archivo (solo limitado por tiempo de ejecución)
- ⚠️ **Tiempo máximo**: 60 segundos (plan Pro) o 10 segundos (plan gratuito)
- ⚠️ **Memoria**: Limitada por Vercel (1GB en plan Pro)

## Pruebas

Para probar:
1. Sube un archivo grande (>4.5 MB)
2. Verás en la consola: "Archivos grandes detectados, usando chunked upload"
3. Verás el progreso: "Subiendo chunk X/Y..."
4. Luego: "Procesando archivos..."
5. Finalmente recibirás el ZIP con los resultados

## Notas

- Los chunks se almacenan temporalmente en memoria del servidor
- Los archivos reconstruidos se guardan en `/tmp/uploads`
- Se limpian automáticamente después del procesamiento
- Para producción a gran escala, considera usar Redis o una base de datos para almacenar chunks

