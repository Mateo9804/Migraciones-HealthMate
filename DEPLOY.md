# Guía Rápida de Despliegue en Vercel

## Pasos Rápidos

### 1. Instalar Dependencias
```bash
npm install
```

### 2. Desplegar con Vercel CLI
```bash
# Iniciar sesión (solo la primera vez)
vercel login

# Desplegar
vercel

# Para producción
vercel --prod
```

### 3. O desde la Web
1. Ve a [vercel.com](https://vercel.com)
2. Conecta tu repositorio
3. Haz clic en "Deploy"

## ⚠️ Consideraciones Importantes

### Límites de Vercel

- **Plan Gratuito**: 
  - 10 segundos máximo de ejecución por función
  - 50MB máximo por archivo
  - Puede no ser suficiente para archivos grandes

- **Plan Pro** (Recomendado):
  - 60 segundos máximo de ejecución
  - 4.5GB máximo por archivo
  - Mejor para procesamiento de archivos

### Requisitos

- ✅ Python 3.x (incluido automáticamente en Vercel)
- ✅ Node.js 18.x (incluido automáticamente)
- ✅ Scripts Python en sus carpetas correspondientes

### Estructura Necesaria

Asegúrate de que estos archivos existan:
- `CLINNI/script/clinni_to_plantillas.py`
- `DRICloud/script/dricloud_to_plantillas.py`
- `MN Program/script/mn_program_to_plantillas.py`
- `plantilla_*.csv` (en la raíz del proyecto)

## Solución de Problemas

### Error: "Function execution timeout"
- **Causa**: El procesamiento toma más de 10 segundos (plan gratuito)
- **Solución**: Actualiza al plan Pro de Vercel o reduce el tamaño de los archivos

### Error: "Python not found"
- **Causa**: Los scripts Python no están en las rutas correctas
- **Solución**: Verifica que todos los scripts estén en sus carpetas correspondientes

### Error: "Module not found"
- **Causa**: Faltan dependencias
- **Solución**: Ejecuta `npm install` antes de desplegar

## Prueba Local

Para probar localmente antes de desplegar:

```bash
# Instalar dependencias
npm install

# Ejecutar servidor de desarrollo de Vercel
vercel dev
```

Luego abre `http://localhost:3000` en tu navegador.

