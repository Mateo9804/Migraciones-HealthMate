const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const selectBtn = document.getElementById('selectBtn');
const filesList = document.getElementById('filesList');
const uploadBtn = document.getElementById('uploadBtn');
const clearBtn = document.getElementById('clearBtn');
const actions = document.getElementById('actions');

let selectedFiles = [];

// Iconos por tipo de archivo
const fileIcons = {
    csv: '📊',
    xml: '📄',
    json: '📋'
};

// Validar tipo de archivo
function isValidFileType(file) {
    const validExtensions = ['.csv', '.xml', '.json'];
    const fileName = file.name.toLowerCase();
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
async function addFile(file) {
    if (!isValidFileType(file)) {
        alert(`El archivo "${file.name}" no es válido. Solo se permiten archivos .csv, .xml o .json`);
        return;
    }

    // Verificar si el archivo ya está en la lista
    if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
        alert(`El archivo "${file.name}" ya está en la lista`);
        return;
    }

    const fileObj = {
        file: file,
        id: Date.now() + Math.random(),
        preview: null
    };

    selectedFiles.push(fileObj);

    // Leer contenido para preview
    try {
        const content = await readFileContent(file);
        fileObj.preview = createPreview(content, getFileExtension(file.name));
    } catch (e) {
        console.error('Error al leer archivo:', e);
    }

    renderFilesList();
    updateActions();
}

// Renderizar lista de archivos
function renderFilesList() {
    filesList.innerHTML = '';

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

// Escapar HTML para prevenir XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

// Subir archivos
async function uploadFiles() {
    if (selectedFiles.length === 0) {
        alert('No hay archivos para subir');
        return;
    }

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Subiendo...';

    try {
        const formData = new FormData();
        
        selectedFiles.forEach((fileObj) => {
            formData.append('files[]', fileObj.file);
        });

        // Aquí puedes cambiar la URL por tu endpoint de backend
        const response = await fetch('upload.php', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            alert(`¡Archivos subidos exitosamente!`);
            selectedFiles = [];
            renderFilesList();
            updateActions();
        } else {
            throw new Error('Error al subir archivos');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al subir los archivos. Por favor, inténtalo de nuevo.');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Subir archivos';
    }
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

// Event Listeners
selectBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(file => {
        addFile(file);
    });
    fileInput.value = ''; // Reset input
});

uploadArea.addEventListener('click', () => {
    fileInput.click();
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

