"""
Script para intentar extraer información de backups de SQL Server (.bak)
Usando bibliotecas de Python si están disponibles.
"""
import sys
from pathlib import Path

def intentar_leer_backup(archivo_bak: Path):
    """
    Intenta leer un archivo .bak de SQL Server.
    Los backups de SQL Server son binarios y complejos de leer directamente.
    """
    print(f"Intentando leer: {archivo_bak}")
    print(f"Tamaño: {archivo_bak.stat().st_size / (1024*1024):.2f} MB")
    print("=" * 70)
    
    # Intentar leer como texto (puede haber algunos strings legibles)
    try:
        with archivo_bak.open('rb') as f:
            # Leer en chunks y buscar strings legibles
            chunk_size = 1024 * 1024  # 1MB
            strings_encontrados = []
            
            for i in range(10):  # Leer primeros 10MB
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                
                # Buscar strings UTF-8 legibles (mínimo 10 caracteres)
                try:
                    texto = chunk.decode('utf-8', errors='ignore')
                    # Buscar palabras comunes de SQL Server
                    palabras_clave = ['CREATE', 'TABLE', 'INSERT', 'SELECT', 'PACIENTE', 'BONO', 'CITA']
                    for palabra in palabras_clave:
                        if palabra in texto:
                            # Encontrar contexto alrededor de la palabra
                            idx = texto.find(palabra)
                            contexto = texto[max(0, idx-50):min(len(texto), idx+200)]
                            if contexto not in strings_encontrados:
                                strings_encontrados.append(contexto)
                except:
                    pass
            
            if strings_encontrados:
                print(f"\nEncontrados {len(strings_encontrados)} strings legibles:")
                for i, s in enumerate(strings_encontrados[:20], 1):  # Mostrar primeros 20
                    print(f"\n{i}. {s[:200]}")
            else:
                print("\nNo se encontraron strings legibles en el backup.")
                print("Este archivo requiere herramientas especializadas de SQL Server.")
                
    except Exception as e:
        print(f"Error al leer el archivo: {e}")

def main():
    """Función principal."""
    archivos_bak = [
        Path("Copia mn program 1.bak"),
        Path("Copia mn program 2.bak"),
        Path("Copia mn program 3.bak"),
    ]
    
    print("=" * 70)
    print("LECTOR DE BACKUPS SQL SERVER (.bak)")
    print("=" * 70)
    print("\nNOTA: Los archivos .bak son backups binarios de SQL Server.")
    print("Para extraer datos completos necesitas:")
    print("  1. SQL Server Management Studio (SSMS) - GRATIS")
    print("  2. Restaurar el backup en SQL Server")
    print("  3. Exportar las tablas a CSV/XML")
    print("\n" + "=" * 70)
    
    for archivo in archivos_bak:
        if archivo.exists():
            print(f"\n")
            intentar_leer_backup(archivo)
        else:
            print(f"\nArchivo no encontrado: {archivo}")
    
    print("\n" + "=" * 70)
    print("RECOMENDACIÓN:")
    print("=" * 70)
    print("1. Descarga SQL Server Management Studio (SSMS) GRATIS:")
    print("   https://aka.ms/ssmsfullsetup")
    print("\n2. O descarga SQL Server Express (gratis) si no tienes SQL Server:")
    print("   https://www.microsoft.com/sql-server/sql-server-downloads")
    print("\n3. Restaura el backup con SSMS:")
    print("   - Abre SSMS")
    print("   - Click derecho en 'Databases' > 'Restore Database'")
    print("   - Selecciona 'Device' y busca tu archivo .bak")
    print("   - Restaura y luego exporta las tablas a CSV")

if __name__ == "__main__":
    main()

