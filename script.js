const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const selectBtn = document.getElementById('selectBtn');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const filesList = document.getElementById('filesList');
const uploadBtn = document.getElementById('uploadBtn');
const clearBtn = document.getElementById('clearBtn');
const actions = document.getElementById('actions');
const pageSelect = document.getElementById('pageSelect');
const resultSection = document.getElementById('resultSection');
const downloadBtn = document.getElementById('downloadBtn');

let selectedFiles = [];

// Iconos por tipo de archivo
const fileIcons = {
    csv: '📊',
    xml: '📄',
    json: '📋'
};

// Validar tipo de archivo según la base de datos seleccionada
function isValidFileType(file) {
    const selectedPage = pageSelect.value;
    const fileName = file.name.toLowerCase();
    
    // Para CLINNI: acepta archivos sin extensión, csv, xml, json, gz, txt
    if (selectedPage === 'clinni') {
        // Si no tiene extensión, es válido
        if (!fileName.includes('.')) {
            return true;
        }
        const validExtensions = ['.csv', '.xml', '.json', '.gz', '.txt'];
        return validExtensions.some(ext => fileName.endsWith(ext));
    }
    
    // Para DRICloud: solo XML
    if (selectedPage === 'dricloud') {
        return fileName.endsWith('.xml');
    }
    
    // Para MN Program: CSV, XML, JSON, ZIP
    if (selectedPage === 'mnprogram') {
        const validExtensions = ['.csv', '.xml', '.json', '.zip'];
        return validExtensions.some(ext => fileName.endsWith(ext));
    }
    
    // Por defecto: csv, xml, json
    const validExtensions = ['.csv', '.xml', '.json'];
    return validExtensions.some(ext => fileName.endsWith(ext));
}

// Formatear tamaño de archivo
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Obtener extensión del archivo
function getFileExtension(fileName) {
    return fileName.split('.').pop().toLowerCase();
}

// Leer contenido del archivo para preview
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        
        if (file.type === 'application/json' || getFileExtension(file.name) === 'json') {
            reader.readAsText(file);
        } else {
            reader.readAsText(file);
        }
    });
}

// Crear preview del contenido
function createPreview(content, type) {
    try {
        if (type === 'json') {
            const parsed = JSON.parse(content);
            return JSON.stringify(parsed, null, 2);
        } else if (type === 'xml') {
            // Mostrar solo las primeras líneas del XML
            const lines = content.split('\n').slice(0, 20);
            return lines.join('\n') + (content.split('\n').length > 20 ? '\n...' : '');
        } else {
            // CSV - mostrar primeras líneas
            const lines = content.split('\n').slice(0, 10);
            return lines.join('\n') + (content.split('\n').length > 10 ? '\n...' : '');
        }
    } catch (e) {
        return content.substring(0, 500) + (content.length > 500 ? '...' : '');
    }
}

// Agregar archivo a la lista
async function addFile(file, showWarning = true) {
    if (!isValidFileType(file)) {
        // Si showWarning es false (cuando se sube una carpeta), solo ignorar el archivo
        if (showWarning) {
            const selectedPage = pageSelect.value;
            let errorMsg = `El archivo "${file.name}" no es válido. `;
            
            if (selectedPage === 'clinni') {
                errorMsg += 'Formatos permitidos: archivos sin extensión, .csv, .xml, .json, .gz, .txt';
            } else if (selectedPage === 'dricloud') {
                errorMsg += 'Solo se permiten archivos .xml';
            } else if (selectedPage === 'mnprogram') {
                errorMsg += 'Formatos permitidos: .csv, .xml, .json, .zip';
            } else {
                errorMsg += 'Formatos permitidos: .csv, .xml, .json';
            }
            
            alert(errorMsg);
        }
        return false; // Retornar false para indicar que no se agregó
    }

    // Verificar si el archivo ya está en la lista
    if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
        if (showWarning) {
            alert(`El archivo "${file.name}" ya está en la lista`);
        }
        return false;
    }

    const fileObj = {
        file: file,
        id: Date.now() + Math.random(),
        preview: null
    };

    selectedFiles.push(fileObj);

    // Solo leer preview si hay pocos archivos (<50) para no sobrecargar la memoria
    const MAX_FILES_FOR_PREVIEW = 50;
    if (selectedFiles.length <= MAX_FILES_FOR_PREVIEW) {
        try {
            const content = await readFileContent(file);
            fileObj.preview = createPreview(content, getFileExtension(file.name));
        } catch (e) {
            console.error('Error al leer archivo:', e);
        }
    }

    // Renderizar solo si no hay muchos archivos, o hacerlo de forma optimizada
    if (selectedFiles.length <= 100) {
        renderFilesList();
    } else {
        // Si hay muchos archivos, actualizar solo el contador sin renderizar todo
        updateFileCount();
    }
    
    updateActions();
    return true; // Retornar true para indicar que se agregó exitosamente
}

// Actualizar solo el contador de archivos sin renderizar toda la lista
function updateFileCount() {
    // Solo actualizar si hay un resumen visible
    const summaryItem = filesList.querySelector('.summary-item');
    if (summaryItem) {
        const fileTypes = {};
        let totalSize = 0;
        selectedFiles.forEach(fileObj => {
            const ext = getFileExtension(fileObj.file.name);
            fileTypes[ext] = (fileTypes[ext] || 0) + 1;
            totalSize += fileObj.file.size;
        });
        
        const typesList = Object.entries(fileTypes)
            .map(([ext, count]) => `${count} ${ext.toUpperCase()}`)
            .join(', ');
        
        const details = summaryItem.querySelector('.file-details');
        if (details) {
            details.querySelector('h3').textContent = `${selectedFiles.length} archivo(s) seleccionado(s)`;
            details.querySelector('.file-size').textContent = `${formatFileSize(totalSize)} • ${typesList}`;
        }
    }
}

// Renderizar lista de archivos
function renderFilesList() {
    filesList.innerHTML = '';

    // Mostrar página seleccionada si hay archivos
    if (selectedFiles.length > 0 && pageSelect.value) {
        const pageNames = {
            'clinni': 'Clinni',
            'dricloud': 'DriCloud',
            'mnprogram': 'MN Program'
        };
        const selectedPageName = pageNames[pageSelect.value] || pageSelect.value;
        const pageIndicator = document.createElement('div');
        pageIndicator.className = 'page-indicator';
        pageIndicator.innerHTML = `<strong>Página seleccionada:</strong> ${selectedPageName}`;
        filesList.appendChild(pageIndicator);
    }

    // Si hay muchos archivos (>50), mostrar solo un resumen
    const MAX_FILES_TO_SHOW = 50;
    if (selectedFiles.length > MAX_FILES_TO_SHOW) {
        const summaryItem = document.createElement('div');
        summaryItem.className = 'file-item summary-item';
        
        // Agrupar por tipo de archivo
        const fileTypes = {};
        let totalSize = 0;
        selectedFiles.forEach(fileObj => {
            const ext = getFileExtension(fileObj.file.name);
            fileTypes[ext] = (fileTypes[ext] || 0) + 1;
            totalSize += fileObj.file.size;
        });
        
        const typesList = Object.entries(fileTypes)
            .map(([ext, count]) => `${count} ${ext.toUpperCase()}`)
            .join(', ');
        
        summaryItem.innerHTML = `
            <div class="file-info">
                <div class="file-icon">📁</div>
                <div class="file-details">
                    <h3>${selectedFiles.length} archivo(s) seleccionado(s)</h3>
                    <p class="file-size">${formatFileSize(totalSize)} • ${typesList}</p>
                    <p class="summary-note">Se mostrarán los primeros ${MAX_FILES_TO_SHOW} archivos. Todos los archivos se procesarán.</p>
                </div>
            </div>
        `;
        filesList.appendChild(summaryItem);
        
        // Mostrar solo los primeros archivos
        selectedFiles.slice(0, MAX_FILES_TO_SHOW).forEach((fileObj, index) => {
            const file = fileObj.file;
            const extension = getFileExtension(file.name);
            const icon = fileIcons[extension] || '📁';

            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <div class="file-icon">${icon}</div>
                    <div class="file-details">
                        <h3>${file.name}</h3>
                        <p class="file-size">${formatFileSize(file.size)} • ${extension.toUpperCase()}</p>
                    </div>
                </div>
                <button class="btn-remove" onclick="removeFile(${index})">Eliminar</button>
            `;
            filesList.appendChild(fileItem);
        });
    } else {
        // Mostrar todos los archivos si son pocos
        selectedFiles.forEach((fileObj, index) => {
            const file = fileObj.file;
            const extension = getFileExtension(file.name);
            const icon = fileIcons[extension] || '📁';

            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <div class="file-icon">${icon}</div>
                    <div class="file-details">
                        <h3>${file.name}</h3>
                        <p class="file-size">${formatFileSize(file.size)} • ${extension.toUpperCase()}</p>
                        ${fileObj.preview ? `
                            <button class="preview-toggle" onclick="togglePreview(${index})">Ver preview</button>
                            <div class="preview-content" id="preview-${index}" style="display: none;">${escapeHtml(fileObj.preview)}</div>
                        ` : ''}
                    </div>
                </div>
                <button class="btn-remove" onclick="removeFile(${index})">Eliminar</button>
            `;
            filesList.appendChild(fileItem);
        });
    }
}

// Escapar HTML para prevenir XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Función auxiliar para convertir base64 a Blob
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

// Manejar éxito de upload
function handleUploadSuccess(result) {
    console.log('Respuesta JSON recibida:', result);
    
    if (result.success) {
        // Limpiar archivos seleccionados
        selectedFiles = [];
        renderFilesList();
        updateActions();
        
        // Ocultar selector de base de datos y área de upload
        document.querySelector('.page-selector').style.display = 'none';
        uploadArea.style.display = 'none';
        filesList.style.display = 'none';
        actions.style.display = 'none';
        
        if (result.zip_base64) {
            // ZIP en base64 - crear descarga directa
            const zipBlob = base64ToBlob(result.zip_base64, 'application/zip');
            const zipUrl = URL.createObjectURL(zipBlob);
            downloadBtn.href = zipUrl;
            downloadBtn.download = result.filename || 'resultados.zip';
            downloadBtn.textContent = '📥 Descargar resultados (ZIP)';
            resultSection.style.display = 'block';
            
            // Scroll a la sección de resultados
            resultSection.scrollIntoView({ behavior: 'smooth' });
        } else if (result.download_url) {
            // ZIP creado exitosamente (ruta tradicional)
            downloadBtn.href = result.download_url;
            downloadBtn.download = result.filename || 'resultados.zip';
            downloadBtn.textContent = '📥 Descargar resultados (ZIP)';
            resultSection.style.display = 'block';
            
            // Scroll a la sección de resultados
            resultSection.scrollIntoView({ behavior: 'smooth' });
        } else if (result.individual_files && result.individual_files.length > 0) {
            // No se pudo crear ZIP, mostrar archivos individuales
            showIndividualFiles(result.individual_files, result.downloads_dir);
            resultSection.style.display = 'block';
            resultSection.scrollIntoView({ behavior: 'smooth' });
        } else {
            throw new Error(result.message || 'Error al procesar archivos');
        }
    } else {
        throw new Error(result.message || 'Error al procesar archivos');
    }
}

// Toggle preview
window.togglePreview = function(index) {
    const preview = document.getElementById(`preview-${index}`);
    if (preview) {
        preview.style.display = preview.style.display === 'none' ? 'block' : 'none';
    }
};

// Eliminar archivo
window.removeFile = function(index) {
    selectedFiles.splice(index, 1);
    renderFilesList();
    updateActions();
};

// Actualizar botones de acción
function updateActions() {
    if (selectedFiles.length > 0) {
        actions.style.display = 'flex';
    } else {
        actions.style.display = 'none';
    }
}

// Dividir archivo en chunks (3MB por chunk - base64 aumenta ~33%, así que 3MB binario = ~4MB base64)
async function splitFileIntoChunks(file) {
    const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB (será ~4MB en base64)
    const chunks = [];
    let offset = 0;
    
    while (offset < file.size) {
        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        chunks.push(chunk);
        offset += CHUNK_SIZE;
    }
    
    return chunks;
}

// Subir archivo usando chunks si es muy grande
async function uploadFileInChunks(file, selectedPage, processNow = false) {
    const fileId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const chunks = await splitFileIntoChunks(file);
    const totalChunks = chunks.length;
    
    console.log(`Dividiendo archivo ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB) en ${totalChunks} chunks`);
    
    // Subir cada chunk usando FormData (más eficiente que JSON)
    for (let i = 0; i < chunks.length; i++) {
        uploadBtn.textContent = `Subiendo chunk ${i + 1}/${totalChunks}...`;
        
        // Usar FormData en lugar de JSON para ser más eficiente
        const formData = new FormData();
        formData.append('chunkIndex', i.toString());
        formData.append('totalChunks', totalChunks.toString());
        formData.append('fileId', fileId);
        formData.append('fileName', file.name);
        formData.append('page', selectedPage);
        formData.append('chunk', chunks[i]); // Enviar el Blob directamente
        // Si es el último chunk y processNow es true, indicar que procese inmediatamente
        const isLastChunk = (i === chunks.length - 1);
        formData.append('processNow', (isLastChunk && processNow) ? 'true' : 'false');
        
        const response = await fetch('/api/upload-chunk', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error en chunk ${i + 1}:`, errorText);
            throw new Error(`Error al subir chunk ${i + 1}: ${errorText.substring(0, 200)}`);
        }
        
        const result = await response.json();
        
        // Si el archivo está completo y se procesó, devolver el resultado completo
        if (result.zip_base64) {
            // El archivo se procesó inmediatamente, devolver el resultado
            return result;
        }
        
        // Si el archivo está completo pero no se procesó, devolver la información
        if (result.filePath || result.ready) {
            return {
                fileId: result.fileId,
                filePath: result.filePath,
                fileName: result.fileName,
                page: result.page
            };
        }
    }
    
    // Esperar a que el servidor termine de reconstruir
    let attempts = 0;
    while (attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const statusResponse = await fetch(`/api/upload-chunk?fileId=${fileId}`);
        if (statusResponse.ok) {
            const status = await statusResponse.json();
            if (status.received === status.total) {
                // El archivo está completo, ahora procesarlo
                return {
                    fileId: fileId,
                    fileName: file.name,
                    page: selectedPage
                };
            }
        }
        attempts++;
    }
    
    throw new Error('Timeout esperando que el archivo se reconstruya');
}

// Subir archivos
async function uploadFiles() {
    if (selectedFiles.length === 0) {
        alert('No hay archivos para subir');
        return;
    }

    // Validar que se haya seleccionado una página
    const selectedPage = pageSelect.value;
    console.log('=== DEBUG: Iniciando upload ===');
    console.log('Valor de pageSelect:', selectedPage);
    
    if (!selectedPage) {
        console.error('ERROR: No se seleccionó una base de datos');
        alert('Por favor, selecciona una página antes de subir los archivos');
        pageSelect.focus();
        return;
    }

    // De momento procesamos solo un archivo por vez (para evitar rutas antiguas /api/upload)
    if (selectedFiles.length > 1) {
        alert(
            'Por ahora solo se puede procesar un archivo por vez.\n\n' +
            'Si necesitas subir muchos ficheros (por ejemplo, carpeta de MN Program), ' +
            'comprímelos en un único ZIP o súbelos en varios pasos.'
        );
        return;
    }

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Subiendo...';

    try {
        // Nueva estrategia simplificada:
        // - Siempre usamos chunked upload contra /api/upload-chunk
        // - Solo un archivo por vez (validado arriba)
        console.log('Usando chunked upload simplificado (un archivo por vez)');

        const fileObj = selectedFiles[0];
        uploadBtn.textContent = 'Subiendo archivo...';

        const result = await uploadFileInChunks(fileObj.file, selectedPage, true);

        if (result && result.zip_base64) {
            console.log('Respuesta JSON recibida:', result);
            handleUploadSuccess(result);
            return;
        }

        throw new Error('No se recibió un ZIP válido desde el servidor.');
    } catch (error) {
        console.error('=== ERROR COMPLETO ===');
        console.error('Tipo de error:', error.constructor.name);
        console.error('Mensaje:', error.message);
        console.error('Stack trace:', error.stack);
        console.error('Error completo:', error);
        console.error('=====================');
        
        // Mostrar error detallado
        let errorMsg = 'Error al procesar los archivos.\n\n';
        errorMsg += 'Tipo: ' + error.constructor.name + '\n';
        errorMsg += 'Mensaje: ' + (error.message || 'Error desconocido');
        errorMsg += '\n\nRevisa la consola del navegador (F12) para más detalles.';
        
        alert(errorMsg);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Procesar archivos';
    }
}

// Mostrar archivos individuales para descarga
function showIndividualFiles(files, downloadsDir) {
    const resultCard = resultSection.querySelector('.result-card');
    resultCard.innerHTML = `
        <h3>✅ Procesamiento completado</h3>
        <p>Los archivos han sido procesados exitosamente. Descarga los archivos individuales:</p>
        <div class="individual-files-list">
            ${files.map((file, index) => `
                <a href="${downloadsDir}${file}" class="btn-download-file" download="${file}">
                    📄 ${file}
                </a>
            `).join('')}
        </div>
        <p class="files-count">Total: ${files.length} archivo(s)</p>
        <button id="processMoreBtn" class="btn-process-more">
            🔄 Procesar más archivos
        </button>
    `;
    // Re-asignar el event listener al nuevo botón
    const newProcessMoreBtn = document.getElementById('processMoreBtn');
    if (newProcessMoreBtn) {
        newProcessMoreBtn.addEventListener('click', resetInterface);
    }
}

// Función para resetear la interfaz y volver a procesar archivos
function resetInterface() {
    // Limpiar todo
    selectedFiles = [];
    pageSelect.value = '';
    fileInput.value = '';
    folderInput.value = '';
    
    // Ocultar resultados
    resultSection.style.display = 'none';
    
    // Mostrar de nuevo selector y área de upload
    document.querySelector('.page-selector').style.display = 'block';
    uploadArea.style.display = 'none'; // Se mostrará cuando se seleccione una base de datos
    filesList.style.display = 'block';
    filesList.innerHTML = '';
    actions.style.display = 'none';
    
    // Resetear botones
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Procesar archivos';
}

// Limpiar lista
function clearFiles() {
    if (selectedFiles.length === 0) return;
    
    if (confirm('¿Estás seguro de que quieres limpiar la lista de archivos?')) {
        selectedFiles = [];
        renderFilesList();
        updateActions();
    }
}

// Event listener para el botón "Procesar más archivos"
if (processMoreBtn) {
    processMoreBtn.addEventListener('click', resetInterface);
}

// Event Listeners
selectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    fileInput.click();
});

selectFolderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    folderInput.click();
});

fileInput.addEventListener('change', (e) => {
    e.stopPropagation();
    Array.from(e.target.files).forEach(file => {
        addFile(file, true); // Mostrar advertencias para archivos individuales
    });
    fileInput.value = ''; // Reset input
});

folderInput.addEventListener('change', (e) => {
    e.stopPropagation();
    e.preventDefault();
    
    const files = Array.from(e.target.files);
    
    if (files.length === 0) {
        folderInput.value = '';
        return;
    }
    
    let validFiles = 0;
    let invalidFiles = 0;
    
    // Procesar archivos en lotes para no bloquear la UI
    const BATCH_SIZE = 50;
    let currentIndex = 0;
    
    function processBatch() {
        const batch = files.slice(currentIndex, currentIndex + BATCH_SIZE);
        batch.forEach(file => {
            const added = addFile(file, false); // No mostrar advertencias individuales
            if (added) {
                validFiles++;
            } else {
                invalidFiles++;
            }
        });
        
        currentIndex += BATCH_SIZE;
        
        if (currentIndex < files.length) {
            // Procesar siguiente lote después de un pequeño delay
            setTimeout(processBatch, 10);
        } else {
            // Todos los archivos procesados, mostrar mensaje final
            if (invalidFiles > 0) {
                const selectedPage = pageSelect.value;
                let formatMsg = '';
                if (selectedPage === 'clinni') {
                    formatMsg = 'archivos sin extensión, .csv, .xml, .json, .gz, .txt';
                } else if (selectedPage === 'dricloud') {
                    formatMsg = 'archivos .xml';
                } else if (selectedPage === 'mnprogram') {
                    formatMsg = 'archivos .csv, .xml, .json, .zip';
                }
                
                if (validFiles > 0) {
                    alert(`Se agregaron ${validFiles} archivo(s) válido(s). Se ignoraron ${invalidFiles} archivo(s) que no son del formato correcto (${formatMsg}).`);
                } else {
                    alert(`No se encontraron archivos válidos en la carpeta. Formatos permitidos: ${formatMsg}`);
                }
            }
            
            // Renderizar lista final
            renderFilesList();
            updateActions();
        }
    }
    
    // Iniciar procesamiento por lotes
    processBatch();
    
    // Reset input después de un pequeño delay para evitar que se abra de nuevo
    setTimeout(() => {
        folderInput.value = '';
    }, 100);
});

// Prevenir que el área de upload abra el selector de archivos cuando se hace clic en los botones
uploadArea.addEventListener('click', (e) => {
    // No hacer nada si se hace clic en los botones, inputs o sus contenedores
    if (e.target.closest('button') || 
        e.target.closest('input') || 
        e.target.closest('.upload-buttons')) {
        return;
    }
    // Solo abrir selector si se hace clic directamente en el área
    if (e.target === uploadArea || 
        (e.target.classList.contains('upload-content') && 
         !e.target.closest('button') && 
         !e.target.closest('input'))) {
        fileInput.click();
    }
});

// Prevenir que el área de upload abra el selector de archivos cuando se hace clic en los botones
uploadArea.addEventListener('click', (e) => {
    // Solo abrir selector si se hace clic directamente en el área, no en los botones o inputs
    if (e.target === uploadArea || 
        (e.target.classList.contains('upload-content') && 
         !e.target.closest('.upload-buttons') && 
         !e.target.closest('button'))) {
        fileInput.click();
    }
});

// Drag and Drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    Array.from(e.dataTransfer.files).forEach(file => {
        addFile(file);
    });
});

uploadBtn.addEventListener('click', uploadFiles);
clearBtn.addEventListener('click', clearFiles);

// Verificar si se está ejecutando desde file:// y mostrar advertencia
if (window.location.protocol === 'file:') {
    const warningDiv = document.createElement('div');
    warningDiv.style.cssText = 'background: #ff6b6b; color: white; padding: 15px; margin: 20px; border-radius: 10px; text-align: center;';
    warningDiv.innerHTML = `
        <strong>⚠️ Advertencia:</strong> Estás abriendo el archivo directamente desde el explorador.<br>
        Para que funcione correctamente, accede a través de XAMPP usando:<br>
        <strong>http://localhost/Migraciones%20HealthMate/index.html</strong><br>
        <small>Asegúrate de que Apache esté ejecutándose en XAMPP</small>
    `;
    document.body.insertBefore(warningDiv, document.body.firstChild);
}

// Actualizar texto de formatos permitidos
function updateFileTypesText() {
    const selectedPage = pageSelect.value;
    const fileTypesText = document.getElementById('fileTypesText');
    
    if (selectedPage === 'clinni') {
        fileTypesText.textContent = 'Formatos permitidos: archivos sin extensión, .csv, .xml, .json, .gz, .txt (también puedes subir una carpeta con múltiples CSV)';
    } else if (selectedPage === 'dricloud') {
        fileTypesText.textContent = 'Formato permitido: .xml (también puedes subir una carpeta con múltiples XML)';
    } else if (selectedPage === 'mnprogram') {
        fileTypesText.textContent = 'Formatos permitidos: .csv, .xml, .json, .zip (múltiples archivos o carpeta)';
    } else {
        fileTypesText.textContent = 'Formatos permitidos: .csv, .xml, .json';
    }
}

// Mostrar/ocultar área de upload según selección de base de datos
pageSelect.addEventListener('change', () => {
    const selectedPage = pageSelect.value;
    
    if (selectedPage) {
        // Mostrar área de upload
        uploadArea.style.display = 'block';
        updateFileTypesText();
        
        // Si hay archivos seleccionados, limpiarlos al cambiar de base de datos
        if (selectedFiles.length > 0) {
            if (confirm('¿Estás seguro de cambiar de base de datos? Se limpiará la lista de archivos seleccionados.')) {
                selectedFiles = [];
                renderFilesList();
                updateActions();
                resultSection.style.display = 'none';
            } else {
                // Revertir selección
                pageSelect.value = pageSelect.dataset.previousValue || '';
                return;
            }
        }
    } else {
        // Ocultar área de upload si no hay selección
        uploadArea.style.display = 'none';
        selectedFiles = [];
        renderFilesList();
        updateActions();
        resultSection.style.display = 'none';
    }
    
    pageSelect.dataset.previousValue = selectedPage;
});

