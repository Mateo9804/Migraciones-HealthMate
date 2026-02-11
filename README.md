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

### ⚠️ IMPORTANTE: Acceso a través de XAMPP

**NO abras el archivo `index.html` directamente desde el explorador de archivos.**

Debes acceder a través de XAMPP:

1. **Inicia XAMPP** y asegúrate de que **Apache** esté ejecutándose
2. Abre tu navegador y accede a:
   ```
   http://localhost/Migraciones%20HealthMate/index.html
   ```
   O simplemente:
   ```
   http://localhost/Migraciones HealthMate/
   ```

### Pasos para usar la aplicación:

1. Selecciona la base de datos (Clinni, DriCloud o MN Program)
2. Arrastra y suelta archivos en el área de carga, o haz clic en "Seleccionar archivos"
3. Revisa la lista de archivos seleccionados
4. Haz clic en "Procesar archivos" para procesarlos con el script correspondiente
5. Descarga el archivo ZIP con los resultados procesados

## Requisitos

- **XAMPP** (o WAMP, MAMP, etc.) con Apache y PHP ejecutándose
- **PHP 7.0 o superior**
- **Python 3.x** instalado y accesible desde la línea de comandos
- Los scripts Python deben estar en sus respectivas carpetas:
  - `CLINNI/script/clinni_to_plantillas.py`
  - `DRICloud/script/dricloud_to_plantillas.py`
  - `MN Program/script/mn_program_to_plantillas.py`

## Notas

- Los archivos se guardan en el directorio `uploads/` con nombres únicos
- El tamaño máximo de archivo está limitado por la configuración de PHP (`upload_max_filesize` y `post_max_size`)
- Para cambiar el tamaño máximo, edita `php.ini` o `.htaccess`

