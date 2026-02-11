# Subidor de Archivos - CSV, XML, JSON

Una aplicación web moderna para subir archivos CSV, XML y JSON con una interfaz atractiva y funcional.

## Características

- ✅ Interfaz moderna y responsive
- ✅ Drag & Drop para subir archivos
- ✅ Validación de tipos de archivo (.csv, .xml, .json)
- ✅ Vista previa del contenido de los archivos
- ✅ Información detallada de cada archivo (nombre, tamaño, tipo)
- ✅ Subida múltiple de archivos
- ✅ Backend PHP para procesar los archivos

## Estructura de Archivos

```
.
├── index.html      # Página principal
├── styles.css      # Estilos CSS
├── script.js       # Lógica JavaScript
├── upload.php      # Backend para procesar archivos
└── uploads/        # Directorio donde se guardan los archivos (se crea automáticamente)
```

## Uso

1. Abre `index.html` en tu navegador
2. Arrastra y suelta archivos CSV, XML o JSON en el área de carga
3. O haz clic en "Seleccionar archivos" para elegir archivos
4. Revisa la lista de archivos seleccionados
5. Haz clic en "Subir archivos" para enviarlos al servidor

## Requisitos

- Servidor web con PHP (XAMPP, WAMP, etc.)
- PHP 7.0 o superior

## Notas

- Los archivos se guardan en el directorio `uploads/` con nombres únicos
- El tamaño máximo de archivo está limitado por la configuración de PHP (`upload_max_filesize` y `post_max_size`)
- Para cambiar el tamaño máximo, edita `php.ini` o `.htaccess`

