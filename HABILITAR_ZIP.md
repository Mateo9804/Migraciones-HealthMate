# Cómo habilitar la extensión ZipArchive en XAMPP

Si ves el error "Class 'ZipArchive' not found", necesitas habilitar la extensión `zip` en PHP.

## Pasos para habilitar ZipArchive en XAMPP:

### 1. Encontrar el archivo php.ini

1. Abre **XAMPP Control Panel**
2. Haz clic en **Config** junto a Apache
3. Selecciona **PHP (php.ini)**
4. Se abrirá el archivo `php.ini` en el editor

### 2. Habilitar la extensión zip

1. Busca la línea (usa Ctrl+F):
   ```ini
   ;extension=zip
   ```

2. Quita el punto y coma (`;`) al inicio para descomentarla:
   ```ini
   extension=zip
   ```

3. Guarda el archivo (Ctrl+S)

### 3. Reiniciar Apache

1. En **XAMPP Control Panel**, detén Apache (Stop)
2. Inicia Apache nuevamente (Start)

### 4. Verificar que funciona

Crea un archivo `test_zip.php` en tu carpeta del proyecto con este contenido:

```php
<?php
if (class_exists('ZipArchive')) {
    echo "✅ ZipArchive está habilitado";
} else {
    echo "❌ ZipArchive NO está habilitado";
}
?>
```

Accede a `http://localhost/Migraciones%20HealthMate/test_zip.php` y deberías ver el mensaje de éxito.

## Nota importante

Si después de estos pasos aún no funciona:
- Verifica que el archivo `php_zip.dll` exista en la carpeta `C:\xampp\php\ext\`
- Si no existe, descarga XAMPP nuevamente o reinstala la extensión

## Alternativa

Si no puedes habilitar ZipArchive, la aplicación automáticamente ofrecerá descargar los archivos CSV individuales en lugar de un ZIP.

