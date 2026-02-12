# 🚀 Guía para Subir a Git y Desplegar en Vercel

## ✅ Pasos para que Funcione

### 1. Subir a Git (GitHub/GitLab/Bitbucket)

```bash
# Si aún no tienes repositorio Git inicializado
git init

# Agregar todos los archivos (excepto los ignorados en .gitignore)
git add .

# Hacer commit
git commit -m "Migración a Vercel con Serverless Functions"

# Conectar con tu repositorio remoto (reemplaza con tu URL)
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git

# Subir a Git
git push -u origin main
# O si tu rama es "master":
# git push -u origin master
```

### 2. Conectar con Vercel

#### Opción A: Desde la Web de Vercel (Más Fácil)

1. Ve a [vercel.com](https://vercel.com) e inicia sesión
2. Haz clic en **"Add New Project"**
3. Selecciona tu repositorio de Git (GitHub/GitLab/Bitbucket)
4. Vercel detectará automáticamente:
   - ✅ `package.json` → Instalará dependencias
   - ✅ `vercel.json` → Usará la configuración
   - ✅ `api/upload.js` → Creará la Serverless Function
5. Haz clic en **"Deploy"**
6. ¡Listo! Vercel desplegará la nueva versión automáticamente

#### Opción B: Desde la CLI de Vercel

```bash
# Si ya tienes el proyecto en Vercel, solo necesitas hacer pull
cd "D:\xampp\htdocs\Migraciones HealthMate"

# Conectar con el proyecto existente
vercel link

# Desplegar la nueva versión
vercel --prod
```

### 3. Verificar que Funciona

Después del despliegue:

1. Vercel te dará una URL (ej: `tu-proyecto.vercel.app`)
2. Abre esa URL en tu navegador
3. Prueba subir un archivo pequeño primero
4. Si funciona, ¡está listo!

## ⚠️ Importante

### Si ya tienes el proyecto en Vercel:

- **Opción 1**: Conecta el repositorio Git desde el dashboard de Vercel
  - Ve a tu proyecto en Vercel
  - Settings → Git → Connect Repository
  - Selecciona tu repo y rama
  - Cada vez que hagas `git push`, Vercel desplegará automáticamente

- **Opción 2**: Despliega manualmente con CLI
  ```bash
  vercel --prod
  ```

## 🔍 Verificar Archivos Importantes

Asegúrate de que estos archivos estén en Git:

- ✅ `package.json`
- ✅ `vercel.json`
- ✅ `api/upload.js`
- ✅ `index.html`
- ✅ `script.js`
- ✅ `styles.css`
- ✅ Scripts Python en sus carpetas:
  - `CLINNI/script/clinni_to_plantillas.py`
  - `DRICloud/script/dricloud_to_plantillas.py`
  - `MN Program/script/mn_program_to_plantillas.py`
- ✅ Plantillas CSV en la raíz

## 🐛 Si No Funciona

1. **Revisa los logs en Vercel**:
   - Ve a tu proyecto → Deployments → Click en el último deployment → Logs

2. **Verifica que las dependencias estén instaladas**:
   - Vercel debería ejecutar `npm install` automáticamente

3. **Comprueba que Python esté disponible**:
   - Vercel incluye Python 3.x por defecto

4. **Revisa el tiempo de ejecución**:
   - Plan gratuito: 10 segundos máximo
   - Plan Pro: 60 segundos máximo

## 📝 Comandos Útiles

```bash
# Ver el estado de Git
git status

# Ver qué archivos se subirán
git add -n .

# Probar localmente antes de subir
vercel dev
```

