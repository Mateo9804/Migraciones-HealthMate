# Migraciones HealthMate

Una aplicación web moderna para procesar archivos de migración de bases de datos (CSV, XML, JSON) con una interfaz atractiva y funcional.

## Características

- ✅ Interfaz moderna y responsive
- ✅ Drag & Drop para subir archivos
- ✅ Validación de tipos de archivo según la base de datos seleccionada
- ✅ Vista previa del contenido de los archivos
- ✅ Información detallada de cada archivo (nombre, tamaño, tipo)
- ✅ Subida múltiple de archivos y carpetas
- ✅ Procesamiento con scripts Python
- ✅ Generación de archivos ZIP con resultados
- ✅ Compatible con Vercel (Serverless Functions)

## Estructura de Archivos

```
.
├── index.html              # Página principal
├── styles.css              # Estilos CSS
├── script.js               # Lógica JavaScript
├── api/
│   └── upload.js          # Serverless Function para Vercel
├── CLINNI/                 # Scripts y datos de CLINNI
├── DRICloud/               # Scripts y datos de DRICloud
├── MN Program/              # Scripts y datos de MN Program
├── package.json            # Dependencias Node.js
├── vercel.json             # Configuración de Vercel
└── .vercelignore           # Archivos a ignorar en Vercel
```

## Despliegue en Vercel

### Requisitos Previos

1. **Cuenta de Vercel** (gratuita en [vercel.com](https://vercel.com))
2. **Vercel CLI** instalado (opcional, pero recomendado):
   ```bash
   npm install -g vercel
   ```
3. **Python 3.x** debe estar disponible en el entorno de Vercel (ya está incluido)

### Pasos para Desplegar

#### Opción 1: Usando Vercel CLI (Recomendado)

1. **Instala las dependencias**:
   ```bash
   npm install
   ```

2. **Inicia sesión en Vercel**:
   ```bash
   vercel login
   ```

3. **Despliega el proyecto**:
   ```bash
   vercel
   ```
   
   Sigue las instrucciones en pantalla. Vercel detectará automáticamente la configuración.

4. **Para producción**:
   ```bash
   vercel --prod
   ```

#### Opción 2: Usando la Interfaz Web de Vercel

1. Ve a [vercel.com](https://vercel.com) e inicia sesión
2. Haz clic en "Add New Project"
3. Conecta tu repositorio de GitHub/GitLab/Bitbucket
4. Vercel detectará automáticamente la configuración del proyecto
5. Haz clic en "Deploy"

### Configuración Importante

- **Tiempo de ejecución**: Las funciones serverless tienen un límite de 60 segundos en el plan Pro de Vercel (10 segundos en el plan gratuito). Para procesar archivos grandes, considera actualizar al plan Pro.
- **Python**: Los scripts Python se ejecutan automáticamente en Vercel. Asegúrate de que todos los scripts estén en sus carpetas correspondientes.
- **Archivos temporales**: Vercel usa `/tmp` para archivos temporales, que se limpian automáticamente después de cada ejecución.

### Variables de Entorno

No se requieren variables de entorno adicionales para el funcionamiento básico.

## Uso Local (Desarrollo)

### Con XAMPP (PHP)

Si quieres probar localmente con PHP:

1. **Inicia XAMPP** y asegúrate de que **Apache** esté ejecutándose
2. Abre tu navegador y accede a:
   ```
   http://localhost/Migraciones%20HealthMate/index.html
   ```

### Con Node.js (Vercel Local)

Para probar localmente con el mismo entorno que Vercel:

1. **Instala las dependencias**:
   ```bash
   npm install
   ```

2. **Ejecuta el servidor de desarrollo de Vercel**:
   ```bash
   vercel dev
   ```

3. Abre tu navegador en `http://localhost:3000`

## Pasos para Usar la Aplicación

1. Selecciona la base de datos (Clinni, DriCloud o MN Program)
2. Arrastra y suelta archivos en el área de carga, o haz clic en "Seleccionar archivos"
3. También puedes seleccionar una carpeta completa
4. Revisa la lista de archivos seleccionados
5. Haz clic en "Procesar archivos" para procesarlos con el script correspondiente
6. Descarga el archivo ZIP con los resultados procesados

## Requisitos

- **Node.js 18.x o superior** (para Vercel)
- **Python 3.x** (disponible automáticamente en Vercel)
- Los scripts Python deben estar en sus respectivas carpetas:
  - `CLINNI/script/clinni_to_plantillas.py`
  - `DRICloud/script/dricloud_to_plantillas.py`
  - `MN Program/script/mn_program_to_plantillas.py`

## Notas

- Los archivos se procesan temporalmente y se eliminan después de generar el ZIP
- El tamaño máximo de archivo está limitado por Vercel (50MB en el plan gratuito, más en planes superiores)
- Los resultados se devuelven como ZIP en base64 para descarga directa
- Para archivos muy grandes o procesamiento largo, considera usar el plan Pro de Vercel

