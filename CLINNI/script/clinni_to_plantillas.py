"""
Script genérico para mapear archivos de CLINNI (gz, txt, csv, etc.) hacia las plantillas
de bonos, clientes, historial y citas.

Uso:
    python clinni_to_plantillas.py --input-file "general_export_2026_01_15 (1)"
    
Los CSV se generarán en la carpeta script con el nombre:
- bonos_general_export_2026_01_15_1.csv
- clientes_y_bonos_general_export_2026_01_15_1.csv
- etc.
"""
import argparse
import csv
import gzip
import json
import re
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Optional
from collections import defaultdict


# ---------------------------------------------------------------------------
# Utilidades básicas
# ---------------------------------------------------------------------------


def _read_csv_headers(plantilla_path: Path) -> List[str]:
    """Lee las cabeceras de una plantilla CSV."""
    with plantilla_path.open("r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.reader(f)
        headers = next(reader)
        return [h.strip() for h in headers if h.strip()]


def _write_csv(path: Path, fieldnames: List[str], rows: Iterable[Dict[str, str]]) -> None:
    """Escribe un CSV en UTF‑8 con BOM para que Excel lo abra bien."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})


def _first_no_empty(*values: Optional[str]) -> str:
    """Devuelve el primer valor no vacío."""
    for v in values:
        if v is not None and str(v).strip() != "":
            return str(v)
    return ""


def _sanitize_filename(name: str) -> str:
    """Limpia un nombre para que sea válido como parte de un nombre de archivo."""
    # Quitar extensión si existe
    name = Path(name).stem
    # Reemplazar espacios y caracteres especiales por guiones bajos
    name = re.sub(r'[^\w\-_\.]', '_', name)
    # Eliminar guiones bajos múltiples
    name = re.sub(r'_+', '_', name)
    # Eliminar guiones bajos al inicio y final
    name = name.strip('_')
    return name


def formatear_fecha(fecha_str: str) -> str:
    """Convierte fecha a formato DD/MM/YYYY."""
    if not fecha_str:
        return ""
    
    # Intentar varios formatos comunes
    # ISO: 2019-03-15 o 2019-03-15T14:30:00
    match = re.match(r'(\d{4})-(\d{2})-(\d{2})', fecha_str)
    if match:
        return f"{match.group(3)}/{match.group(2)}/{match.group(1)}"
    
    # DD/MM/YYYY ya está bien
    if re.match(r'\d{2}/\d{2}/\d{4}', fecha_str):
        return fecha_str
    
    return fecha_str


def formatear_hora(fecha_str: str) -> str:
    """Extrae la hora de un datetime ISO."""
    if not fecha_str:
        return ""
    
    match = re.match(r'\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})', fecha_str)
    if match:
        return f"{match.group(1)}:{match.group(2)}:00"
    
    return ""


# ---------------------------------------------------------------------------
# Detección y lectura de archivos CLINNI
# ---------------------------------------------------------------------------


def detectar_formato_archivo(file_path: Path) -> str:
    """Detecta el formato del archivo (gz, json, csv, txt, xml)."""
    # Leer los primeros bytes para detectar el formato
    with file_path.open('rb') as f:
        header = f.read(10)
    
    # Verificar si es gzip (magic number: 1f 8b)
    if header[:2] == b'\x1f\x8b':
        return 'gz'
    
    # Verificar si es JSON (empieza con { o [)
    try:
        with file_path.open('r', encoding='utf-8', errors='ignore') as f:
            first_char = f.read(1).strip()
            if first_char in ['{', '[']:
                return 'json'
    except:
        pass
    
    # Verificar extensión
    ext = file_path.suffix.lower()
    if ext == '.gz':
        return 'gz'
    elif ext == '.json':
        return 'json'
    elif ext == '.csv':
        return 'csv'
    elif ext == '.xml':
        return 'xml'
    elif ext == '.txt':
        return 'txt'
    
    # Por defecto, intentar como texto/CSV
    return 'txt'


def leer_archivo_clinni(file_path: Path) -> Dict:
    """
    Lee un archivo de CLINNI y devuelve un diccionario estructurado.
    Maneja diferentes formatos: gz, json, csv, txt, xml.
    Retorna un dict con claves: 'pacientes', 'bonos', 'citas', 'historial'
    """
    formato = detectar_formato_archivo(file_path)
    print(f"[INFO] Formato detectado: {formato}")
    
    datos_raw = None
    
    try:
        if formato == 'gz':
            # Intentar descomprimir y leer como JSON, CSV o texto
            with gzip.open(file_path, 'rt', encoding='utf-8', errors='replace') as f:
                contenido = f.read(1000)  # Leer primeros 1000 caracteres para detectar
                f.seek(0)
                
                if contenido.strip().startswith('{') or contenido.strip().startswith('['):
                    # Es JSON
                    datos_raw = json.load(f)
                else:
                    # Intentar como CSV
                    f.seek(0)
                    reader = csv.DictReader(f)
                    datos_raw = list(reader)
        
        elif formato == 'json':
            with file_path.open('r', encoding='utf-8', errors='replace') as f:
                datos_raw = json.load(f)
        
        elif formato == 'csv':
            with file_path.open('r', encoding='utf-8', errors='replace') as f:
                reader = csv.DictReader(f)
                datos_raw = list(reader)
        
        elif formato == 'xml':
            # Leer XML de forma básica (similar a DRICloud)
            datos_raw = leer_xml_basico(file_path)
        
        else:  # txt o desconocido
            # Intentar leer como CSV primero
            try:
                with file_path.open('r', encoding='utf-8', errors='replace') as f:
                    reader = csv.DictReader(f)
                    datos_raw = list(reader)
            except:
                # Si falla, leer línea por línea y parsear manualmente
                datos_raw = leer_texto_estructurado(file_path)
    
    except Exception as e:
        print(f"[ERROR] Error leyendo archivo: {e}", file=sys.stderr)
        return {'pacientes': [], 'bonos': [], 'citas': [], 'historial': []}
    
    # Procesar datos según su estructura
    return procesar_datos_clinni(datos_raw)


def leer_xml_basico(file_path: Path) -> List[Dict[str, str]]:
    """Lee XML de forma básica usando regex (para archivos grandes)."""
    elementos = []
    
    # Buscar elementos comunes en XML de sistemas médicos
    tags_comunes = ['PACIENTE', 'CLIENTE', 'CITA', 'BONO', 'HISTORIAL', 'CONSULTA']
    
    for tag in tags_comunes:
        pattern = re.compile(
            rf'<{re.escape(tag)}>(.*?)</{re.escape(tag)}>',
            re.DOTALL | re.IGNORECASE
        )
        
        chunk_size = 10 * 1024 * 1024  # 10MB chunks
        buffer = ""
        
        try:
            with file_path.open('r', encoding='utf-8', errors='replace') as f:
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    
                    buffer += chunk
                    matches = list(pattern.finditer(buffer))
                    
                    for match in matches:
                        contenido = match.group(1)
                        campos_pattern = re.compile(r'<([A-Z_][A-Z0-9_]*)>(.*?)</\1>', re.DOTALL)
                        campos = {}
                        for campo_match in campos_pattern.finditer(contenido):
                            campo_nombre = campo_match.group(1)
                            campo_valor = campo_match.group(2).strip()
                            campos[campo_nombre] = campo_valor
                        
                        if campos:
                            elementos.append(campos)
                    
                    if len(buffer) > 1024 * 1024:
                        buffer = buffer[-1024 * 1024:]
        except:
            pass
        
        if elementos:
            break
    
    return elementos


def leer_texto_estructurado(file_path: Path) -> List[Dict[str, str]]:
    """Intenta leer un archivo de texto estructurado línea por línea."""
    datos = []
    
    with file_path.open('r', encoding='utf-8', errors='replace') as f:
        # Leer primeras líneas para detectar formato
        primeras_lineas = [f.readline() for _ in range(10)]
        f.seek(0)
        
        # Si parece JSON por líneas
        if any(l.strip().startswith('{') for l in primeras_lineas):
            for line in f:
                line = line.strip()
                if line:
                    try:
                        datos.append(json.loads(line))
                    except:
                        pass
        
        # Si parece CSV
        elif any(',' in l or ';' in l for l in primeras_lineas):
            reader = csv.DictReader(f)
            datos = list(reader)
        
        # Si no, intentar parsear como clave=valor o similar
        else:
            for line in f:
                line = line.strip()
                if line and '=' in line:
                    partes = line.split('=', 1)
                    if len(partes) == 2:
                        datos.append({partes[0].strip(): partes[1].strip()})
    
    return datos


def procesar_datos_clinni(datos_raw) -> Dict:
    """
    Procesa los datos raw de CLINNI y los estructura según el formato.
    Maneja JSON anidado con estructura {"pacientes": [...], ...}
    """
    estructurado = {
        'pacientes': [],
        'bonos': [],
        'citas': [],
        'historial': [],
    }
    
    # Si es un diccionario (JSON estructurado)
    if isinstance(datos_raw, dict):
        # Buscar clave "pacientes" o variaciones
        pacientes_key = None
        for key in datos_raw.keys():
            if 'paciente' in key.lower() or 'patient' in key.lower() or 'cliente' in key.lower():
                pacientes_key = key
                break
        
        if pacientes_key and isinstance(datos_raw[pacientes_key], list):
            pacientes = datos_raw[pacientes_key]
            
            for paciente in pacientes:
                # Agregar paciente
                estructurado['pacientes'].append(paciente)
                
                # Extraer citas de procesos
                procesos = paciente.get('procesos', [])
                if isinstance(procesos, list):
                    for proceso in procesos:
                        # Las citas están en proceso.citas
                        citas_proceso = proceso.get('citas', [])
                        if isinstance(citas_proceso, list):
                            for cita in citas_proceso:
                                # Agregar referencia al paciente en la cita
                                cita_con_paciente = cita.copy()
                                cita_con_paciente['PAC_ID'] = paciente.get('dni') or paciente.get('id')
                                cita_con_paciente['PACIENTE'] = paciente
                                estructurado['citas'].append(cita_con_paciente)
                        
                        # Las evoluciones están en proceso.evoluciones
                        evoluciones = proceso.get('evoluciones', [])
                        if isinstance(evoluciones, list):
                            for evolucion in evoluciones:
                                # Agregar referencia al paciente y proceso
                                evolucion_con_ref = evolucion.copy() if isinstance(evolucion, dict) else {'contenido': str(evolucion)}
                                evolucion_con_ref['PAC_ID'] = paciente.get('dni') or paciente.get('id')
                                evolucion_con_ref['PACIENTE'] = paciente
                                evolucion_con_ref['PROCESO'] = proceso
                                estructurado['historial'].append(evolucion_con_ref)
                        
                        # El proceso mismo puede ser historial (solo si tiene datos relevantes)
                        if proceso.get('diagnostico') or proceso.get('titulo') or proceso.get('evoluciones'):
                            proceso_con_ref = proceso.copy()
                            proceso_con_ref['PAC_ID'] = paciente.get('dni') or paciente.get('id')
                            proceso_con_ref['PACIENTE'] = paciente
                            estructurado['historial'].append(proceso_con_ref)
        
        # Buscar bonos si existen
        bonos_key = None
        for key in datos_raw.keys():
            if 'bono' in key.lower() or 'pack' in key.lower() or 'abono' in key.lower():
                bonos_key = key
                break
        
        if bonos_key and isinstance(datos_raw[bonos_key], list):
            estructurado['bonos'] = datos_raw[bonos_key]
    
    # Si es una lista, procesar como antes
    elif isinstance(datos_raw, list):
        estructurado = extraer_datos_estructurados(datos_raw)
    
    print(f"[INFO] Datos procesados: {len(estructurado['pacientes'])} pacientes, "
          f"{len(estructurado['bonos'])} bonos, {len(estructurado['citas'])} citas, "
          f"{len(estructurado['historial'])} historiales")
    
    return estructurado


def extraer_datos_estructurados(datos: List[Dict[str, str]]) -> Dict:
    """
    Extrae y organiza los datos en estructuras similares a las plantillas.
    Intenta identificar pacientes, bonos, citas, historial, etc.
    """
    estructurado = {
        'pacientes': [],
        'bonos': [],
        'citas': [],
        'historial': [],
    }
    
    # Intentar identificar el tipo de cada registro
    for registro in datos:
        # Normalizar claves a mayúsculas para comparar
        claves = {k.upper(): v for k, v in registro.items()}
        
        # Detectar pacientes
        if any(k in claves for k in ['PAC_ID', 'CLIENTE_ID', 'ID_PACIENTE', 'PATIENT_ID', 'PACIENTE']):
            estructurado['pacientes'].append(registro)
        
        # Detectar bonos
        elif any(k in claves for k in ['BONO_ID', 'BON_ID', 'PACK_ID', 'ABONO_ID']):
            estructurado['bonos'].append(registro)
        
        # Detectar citas
        elif any(k in claves for k in ['CITA_ID', 'CIT_ID', 'APPOINTMENT_ID', 'TURNO_ID']):
            estructurado['citas'].append(registro)
        
        # Detectar historial
        elif any(k in claves for k in ['HISTORIAL_ID', 'HIST_ID', 'CONSULTA_ID', 'DIAGNOSTICO']):
            estructurado['historial'].append(registro)
        
        # Si no coincide con nada, intentar adivinar por el contenido
        else:
            # Si tiene campos de paciente, es paciente
            if any(k in claves for k in ['NOMBRE', 'APELLIDOS', 'TELEFONO', 'EMAIL']):
                estructurado['pacientes'].append(registro)
            # Si tiene campos de fecha y hora, podría ser cita
            elif any(k in claves for k in ['FECHA', 'HORA', 'DATE', 'TIME']):
                estructurado['citas'].append(registro)
            # Por defecto, historial
            else:
                estructurado['historial'].append(registro)
    
    print(f"[INFO] Datos extraídos: {len(estructurado['pacientes'])} pacientes, "
          f"{len(estructurado['bonos'])} bonos, {len(estructurado['citas'])} citas, "
          f"{len(estructurado['historial'])} historiales")
    
    return estructurado


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla_clientes_y_bonos.csv
# ---------------------------------------------------------------------------


def generar_clientes_y_bonos(datos: Dict, output_path: Path, plantilla_path: Path) -> None:
    """Genera plantilla_clientes_y_bonos.csv desde datos de CLINNI."""
    headers = _read_csv_headers(plantilla_path)
    pacientes = datos.get('pacientes', [])
    bonos = datos.get('bonos', [])
    
    # Crear índice de bonos por paciente
    bonos_por_paciente = defaultdict(list)
    for bono in bonos:
        # Intentar encontrar ID de paciente en el bono
        pac_id = _first_no_empty(
            bono.get('dni'), bono.get('PAC_ID'), bono.get('CLIENTE_ID'), 
            bono.get('ID_PACIENTE'), bono.get('PATIENT_ID'), bono.get('PACIENTE_ID')
        )
        if pac_id:
            bonos_por_paciente[pac_id].append(bono)
    
    rows_out: List[Dict[str, str]] = []
    
    for paciente in pacientes:
        pac_id = _first_no_empty(
            paciente.get('dni'), paciente.get('id'), paciente.get('PAC_ID'), 
            paciente.get('CLIENTE_ID'), paciente.get('ID'), paciente.get('ID_PACIENTE'), 
            paciente.get('PATIENT_ID')
        )
        bonos_pac = bonos_por_paciente.get(pac_id, [])
        bono = bonos_pac[0] if bonos_pac else {}
        
        # Extraer campos comunes (normalizar nombres - CLINNI usa minúsculas)
        nombre = _first_no_empty(
            paciente.get('nombre'), paciente.get('NOMBRE'), paciente.get('PAC_NOMBRE'), 
            paciente.get('NAME'), paciente.get('NOMBRE_CLIENTE'), paciente.get('CLIENTE_NOMBRE')
        )
        apellidos = _first_no_empty(
            paciente.get('apellidos'), paciente.get('APELLIDOS'), paciente.get('PAC_APELLIDOS'), 
            paciente.get('SURNAME'), paciente.get('APELLIDO'), paciente.get('LAST_NAME')
        )
        telefono = _first_no_empty(
            paciente.get('movil'), paciente.get('TELEFONO'), paciente.get('PAC_TELEFONO1'), 
            paciente.get('PHONE'), paciente.get('TEL'), paciente.get('TELEFONO1'), paciente.get('MOVIL')
        )
        
        row = {
            "Nombre": nombre,
            "Apellidos": apellidos,
            "CIF/NIF": _first_no_empty(
                paciente.get('dni'), paciente.get('NIF'), paciente.get('DNI'), 
                paciente.get('CIF'), paciente.get('ID_FISCAL')
            ),
            "Direccion": _first_no_empty(
                paciente.get('direccionFacturacion'), paciente.get('DIRECCION'), 
                paciente.get('DIR'), paciente.get('ADDRESS')
            ),
            "Codigo Postal": _first_no_empty(
                paciente.get('cp'), paciente.get('CP'), paciente.get('COD_POSTAL'), 
                paciente.get('POSTAL_CODE')
            ),
            "Ciudad": _first_no_empty(
                paciente.get('localidad'), paciente.get('CIUDAD'), paciente.get('POBLACION'), 
                paciente.get('CITY')
            ),
            "Provincia": _first_no_empty(
                paciente.get('provincia'), paciente.get('PROVINCIA'), paciente.get('PROV'), 
                paciente.get('PROVINCE')
            ),
            "Pais": _first_no_empty(
                paciente.get('pais'), paciente.get('PAIS'), paciente.get('COUNTRY'), "España"
            ),
            "Email": _first_no_empty(
                paciente.get('email'), paciente.get('EMAIL'), paciente.get('E_MAIL'), 
                paciente.get('CORREO')
            ),
            "Telefono": telefono,
            "Tipo Cliente": "",
            "Fecha Nacimiento": formatear_fecha(_first_no_empty(
                paciente.get('fechaNacimiento'), paciente.get('FECHA_NACIMIENTO'), 
                paciente.get('FECHA_NAC'), paciente.get('BIRTH_DATE')
            )),
            "Genero": _first_no_empty(
                paciente.get('sexo'), paciente.get('GENERO'), paciente.get('SEXO'), 
                paciente.get('GENDER')
            ),
            "Notas Medicas": _first_no_empty(
                paciente.get('comentario'), paciente.get('antecedentes'), paciente.get('NOTAS'), 
                paciente.get('OBSERVACIONES'), paciente.get('NOTES')
            ),
            "Fecha seguimiento": "",
            "Tipo seguimiento": "",
            "Descripción": "",
            "Recomendaciones": "",
            "Nombre Bono": _first_no_empty(bono.get('NOMBRE'), bono.get('DESCRIPCION'), bono.get('NOMBRE_BONO')),
            "Servicio": "",
            "Precio": _first_no_empty(bono.get('PRECIO'), bono.get('IMPORTE'), bono.get('PRICE')),
            "Sesiones Totales": _first_no_empty(bono.get('SESIONES'), bono.get('NUM_SESIONES'), bono.get('SESIONES_TOTALES')),
            "Sesiones Consumidas": _first_no_empty(bono.get('SESIONES_CONSUMIDAS'), bono.get('USADAS'), bono.get('USOS')),
            "Fecha Caducidad": formatear_fecha(_first_no_empty(
                bono.get('FECHA_CADUCIDAD'), bono.get('FECHA_VENC'), bono.get('EXPIRES')
            )),
            "Notas Bono": _first_no_empty(bono.get('NOTAS'), bono.get('OBSERVACIONES'), bono.get('CONDICIONES')),
        }
        rows_out.append(row)
    
    _write_csv(output_path, headers, rows_out)
    print(f"[OK] Generado {output_path} ({len(rows_out)} filas)")


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla_bonos.csv
# ---------------------------------------------------------------------------


def generar_bonos(datos: Dict, output_path: Path, plantilla_path: Path) -> None:
    """Genera plantilla_bonos.csv desde datos de CLINNI."""
    headers = _read_csv_headers(plantilla_path)
    pacientes = datos.get('pacientes', [])
    bonos = datos.get('bonos', [])
    
    # Crear índice de pacientes por ID (CLINNI usa DNI como identificador común)
    pacientes_dict = {}
    for p in pacientes:
        pac_id = _first_no_empty(
            p.get('dni'), p.get('id'), p.get('PAC_ID'), p.get('CLIENTE_ID'), 
            p.get('ID'), p.get('ID_PACIENTE'), p.get('PATIENT_ID')
        )
        if pac_id:
            pacientes_dict[pac_id] = p
    
    out_rows: List[Dict[str, str]] = []
    
    for bono in bonos:
        pac_id = _first_no_empty(
            bono.get('dni'), bono.get('PAC_ID'), bono.get('CLIENTE_ID'), 
            bono.get('ID_PACIENTE'), bono.get('PATIENT_ID'), bono.get('CLIENTE')
        )
        paciente = pacientes_dict.get(pac_id, {})
        
        nombre = _first_no_empty(
            paciente.get('nombre'), paciente.get('NOMBRE'), paciente.get('PAC_NOMBRE'), 
            paciente.get('NAME')
        )
        apellidos = _first_no_empty(
            paciente.get('apellidos'), paciente.get('APELLIDOS'), paciente.get('PAC_APELLIDOS'), 
            paciente.get('SURNAME')
        )
        telefono = _first_no_empty(
            paciente.get('movil'), paciente.get('TELEFONO'), paciente.get('PAC_TELEFONO1'), 
            paciente.get('PHONE')
        )
        
        row = {
            "Teléfono": telefono,
            "Nombre Cliente": f"{nombre} {apellidos}".strip(),
            "Nombre Bono": _first_no_empty(bono.get('NOMBRE'), bono.get('DESCRIPCION'), bono.get('NOMBRE_BONO')),
            "Servicio": "",
            "Sesiones Totales": _first_no_empty(bono.get('SESIONES'), bono.get('NUM_SESIONES')),
            "Sesiones Consumidas": _first_no_empty(bono.get('SESIONES_CONSUMIDAS'), bono.get('USADAS')),
            "Precio Total": _first_no_empty(bono.get('PRECIO'), bono.get('IMPORTE')),
            "Pagado": "",
            "Importe Pagado": "",
            "Fecha Caducidad": formatear_fecha(_first_no_empty(
                bono.get('FECHA_CADUCIDAD'), bono.get('FECHA_VENC')
            )),
        }
        out_rows.append(row)
    
    _write_csv(output_path, headers, out_rows)
    print(f"[OK] Generado {output_path} ({len(out_rows)} filas)")


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla_historial_basica.csv
# ---------------------------------------------------------------------------


def generar_historial_basica(datos: Dict, output_path: Path, plantilla_path: Path) -> None:
    """Genera plantilla_historial_basica.csv desde datos de CLINNI."""
    headers = _read_csv_headers(plantilla_path)
    pacientes = datos.get('pacientes', [])
    historial = datos.get('historial', [])
    
    pacientes_dict = {}
    for p in pacientes:
        pac_id = _first_no_empty(
            p.get('dni'), p.get('id'), p.get('PAC_ID'), p.get('CLIENTE_ID'), 
            p.get('ID'), p.get('ID_PACIENTE'), p.get('PATIENT_ID')
        )
        if pac_id:
            pacientes_dict[pac_id] = p
    
    # Limpiar HTML de los textos si existen
    def limpiar_html(texto):
        if not texto:
            return ""
        # Remover tags HTML básicos
        texto = re.sub(r'<[^>]+>', '', str(texto))
        # Limpiar espacios múltiples
        texto = re.sub(r'\s+', ' ', texto)
        return texto.strip()
    
    out_rows: List[Dict[str, str]] = []
    
    for hist in historial:
        # En CLINNI, el historial puede venir con referencia al paciente
        paciente_ref = hist.get('PACIENTE', {})
        pac_id = _first_no_empty(
            hist.get('PAC_ID'), hist.get('dni'), hist.get('CLIENTE_ID'), 
            hist.get('ID_PACIENTE'), hist.get('PATIENT_ID'), hist.get('CLIENTE')
        )
        
        if not pac_id and paciente_ref:
            pac_id = paciente_ref.get('dni') or paciente_ref.get('id')
        
        paciente = pacientes_dict.get(pac_id, paciente_ref) if pac_id else paciente_ref
        
        telefono = _first_no_empty(
            paciente.get('movil'), paciente.get('TELEFONO'), paciente.get('PAC_TELEFONO1'), 
            paciente.get('PHONE')
        )
        
        # En CLINNI, el historial puede venir de procesos o evoluciones
        proceso = hist.get('PROCESO', {})
        
        # Diagnóstico: específicamente el diagnóstico médico (no el título del proceso)
        diagnostico = _first_no_empty(
            proceso.get('diagnostico'), hist.get('diagnostico'),
            hist.get('DIAGNOSTICO'), hist.get('DIAG')
        )
        
        # Motivo Consulta: el título del proceso o motivo específico
        motivo = _first_no_empty(
            proceso.get('titulo'), hist.get('MOTIVO'), hist.get('MOTIVO_CONSULTA')
        )
        
        # Descripción Detallada: descripción amplia, notas, contenido de evoluciones
        # NO incluir diagnóstico ni título aquí para evitar duplicados
        descripcion = _first_no_empty(
            hist.get('DESCRIPCION'), hist.get('DETALLES'), hist.get('contenido'),
            hist.get('DESCRIPCION'), hist.get('DETALLES')
        )
        
        # Observaciones: notas adicionales, pero no el título ni diagnóstico
        observaciones = _first_no_empty(
            hist.get('OBSERVACIONES'), hist.get('NOTAS'), hist.get('OBS')
        )
        
        # Solo agregar fila si hay algún dato relevante (no solo teléfono)
        if telefono or diagnostico or descripcion or motivo or observaciones:
            row = {
                "Teléfono": telefono,
                "Profesional": _first_no_empty(hist.get('PROFESIONAL'), hist.get('DOCTOR'), hist.get('MEDICO')),
                "Motivo Consulta": limpiar_html(motivo),
                "Tiempo Evolución": "",
                "Descripción Detallada": limpiar_html(descripcion),
                "Enfermedades Crónicas": _first_no_empty(
                    paciente.get('antecedentes'), paciente.get('ANTECEDENTES')
                ),
                "Alergias Medicamentosas": "",
                "Medicación Habitual": "",
                "Diagnóstico": limpiar_html(diagnostico),
                "Recomendaciones": _first_no_empty(hist.get('RECOMENDACIONES'), hist.get('RECOMENDACION')),
                "Observaciones": limpiar_html(observaciones),
            }
            out_rows.append(row)
    
    _write_csv(output_path, headers, out_rows)
    print(f"[OK] Generado {output_path} ({len(out_rows)} filas)")


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla_historial_completa.csv
# ---------------------------------------------------------------------------


def generar_historial_completa(datos: Dict, output_path: Path, plantilla_path: Path) -> None:
    """Genera plantilla_historial_completa.csv desde datos de CLINNI."""
    headers = _read_csv_headers(plantilla_path)
    pacientes = datos.get('pacientes', [])
    historial = datos.get('historial', [])
    
    pacientes_dict = {}
    for p in pacientes:
        pac_id = _first_no_empty(
            p.get('dni'), p.get('id'), p.get('PAC_ID'), p.get('CLIENTE_ID'), 
            p.get('ID'), p.get('ID_PACIENTE'), p.get('PATIENT_ID')
        )
        if pac_id:
            pacientes_dict[pac_id] = p
    
    out_rows: List[Dict[str, str]] = []
    
    # Limpiar HTML de los textos si existen
    def limpiar_html(texto):
        if not texto:
            return ""
        # Remover tags HTML básicos
        texto = re.sub(r'<[^>]+>', '', str(texto))
        # Limpiar espacios múltiples
        texto = re.sub(r'\s+', ' ', texto)
        return texto.strip()
    
    for hist in historial:
        # En CLINNI, el historial puede venir con referencia al paciente
        paciente_ref = hist.get('PACIENTE', {})
        pac_id = _first_no_empty(
            hist.get('PAC_ID'), hist.get('dni'), hist.get('CLIENTE_ID'), 
            hist.get('ID_PACIENTE'), hist.get('PATIENT_ID'), hist.get('CLIENTE')
        )
        
        if not pac_id and paciente_ref:
            pac_id = paciente_ref.get('dni') or paciente_ref.get('id')
        
        paciente = pacientes_dict.get(pac_id, paciente_ref) if pac_id else paciente_ref
        
        telefono = _first_no_empty(
            paciente.get('movil'), paciente.get('TELEFONO'), paciente.get('PAC_TELEFONO1'), 
            paciente.get('PHONE')
        )
        
        # En CLINNI, el historial puede venir de procesos o evoluciones
        proceso = hist.get('PROCESO', {})
        
        # Diagnóstico: específicamente el diagnóstico médico (no el título del proceso)
        diagnostico = _first_no_empty(
            proceso.get('diagnostico'), hist.get('diagnostico'),
            hist.get('DIAGNOSTICO'), hist.get('DIAG')
        )
        
        # Motivo Consulta: el título del proceso o motivo específico
        motivo = _first_no_empty(
            proceso.get('titulo'), hist.get('MOTIVO'), hist.get('MOTIVO_CONSULTA')
        )
        
        # Descripción Detallada: descripción amplia, notas, contenido de evoluciones
        # NO incluir diagnóstico ni título aquí para evitar duplicados
        descripcion = _first_no_empty(
            hist.get('DESCRIPCION'), hist.get('DETALLES'), hist.get('contenido'),
            hist.get('DESCRIPCION'), hist.get('DETALLES')
        )
        
        # Observaciones: notas adicionales, pero no el título ni diagnóstico
        observaciones = _first_no_empty(
            hist.get('OBSERVACIONES'), hist.get('NOTAS'), hist.get('OBS')
        )
        
        # Crear row con todos los campos inicializados
        row = {}
        for h in headers:
            row[h] = ""
        
        # Llenar campos conocidos
        row["Teléfono Cliente"] = telefono
        row["Profesional"] = _first_no_empty(hist.get('PROFESIONAL'), hist.get('DOCTOR'))
        row["Motivo Consulta"] = limpiar_html(motivo)
        row["Diagnóstico"] = limpiar_html(diagnostico)
        row["Descripción Detallada"] = limpiar_html(descripcion)
        row["Observaciones Adicionales"] = limpiar_html(observaciones)
        
        out_rows.append(row)
    
    _write_csv(output_path, headers, out_rows)
    print(f"[OK] Generado {output_path} ({len(out_rows)} filas)")


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla-citas.csv
# ---------------------------------------------------------------------------


def generar_citas(datos: Dict, output_path: Path, plantilla_path: Path) -> None:
    """Genera plantilla-citas.csv desde datos de CLINNI."""
    headers = _read_csv_headers(plantilla_path)
    pacientes = datos.get('pacientes', [])
    citas = datos.get('citas', [])
    
    pacientes_dict = {}
    for p in pacientes:
        pac_id = _first_no_empty(
            p.get('PAC_ID'), p.get('CLIENTE_ID'), p.get('ID'),
            p.get('ID_PACIENTE'), p.get('PATIENT_ID')
        )
        if pac_id:
            pacientes_dict[pac_id] = p
    
    out_rows: List[Dict[str, str]] = []
    
    for cita in citas:
        # En CLINNI, las citas pueden venir con referencia al paciente
        paciente_ref = cita.get('PACIENTE', {})
        pac_id = _first_no_empty(
            cita.get('PAC_ID'), cita.get('CLIENTE_ID'), cita.get('ID_PACIENTE'),
            cita.get('PATIENT_ID'), cita.get('CLIENTE')
        )
        
        # Si no hay pac_id pero hay paciente_ref, usar el DNI del paciente
        if not pac_id and paciente_ref:
            pac_id = paciente_ref.get('dni') or paciente_ref.get('id')
        
        paciente = pacientes_dict.get(pac_id, paciente_ref)
        
        nombre = _first_no_empty(
            paciente.get('nombre'), paciente.get('NOMBRE'), paciente.get('PAC_NOMBRE'), 
            paciente.get('NAME'), paciente.get('NOMBRE_CLIENTE'), paciente.get('CLIENTE_NOMBRE')
        )
        apellidos = _first_no_empty(
            paciente.get('apellidos'), paciente.get('APELLIDOS'), paciente.get('PAC_APELLIDOS'), 
            paciente.get('SURNAME'), paciente.get('APELLIDO'), paciente.get('LAST_NAME')
        )
        nombre_completo = f"{nombre} {apellidos}".strip()
        
        telefono = _first_no_empty(
            paciente.get('movil'), paciente.get('TELEFONO'), paciente.get('PAC_TELEFONO1'), 
            paciente.get('PHONE')
        )
        
        # En CLINNI, las citas tienen fecha, inicio, fin
        fecha = _first_no_empty(
            cita.get('fecha'), cita.get('FECHA'), cita.get('DATE'), cita.get('FECHA_CITA')
        )
        hora_inicio = _first_no_empty(
            cita.get('inicio'), cita.get('HORA'), cita.get('TIME'), cita.get('HORA_CITA')
        )
        hora_fin = _first_no_empty(
            cita.get('fin'), cita.get('HORA_FIN'), cita.get('END_TIME')
        )
        
        # Calcular duración si tenemos inicio y fin
        duracion = ""
        if hora_inicio and hora_fin:
            try:
                # Intentar calcular diferencia (formato HH:MM:SS)
                from datetime import datetime
                inicio = datetime.strptime(hora_inicio, '%H:%M:%S')
                fin = datetime.strptime(hora_fin, '%H:%M:%S')
                diff = fin - inicio
                duracion = str(int(diff.total_seconds() / 60))  # En minutos
            except:
                pass
        
        estado = _first_no_empty(
            cita.get('ESTADO'), cita.get('STATUS'), cita.get('ESTADO_CITA')
        ).lower()
        if 'confirm' in estado or 'realizad' in estado:
            status = "confirmed"
        elif 'cancel' in estado:
            status = "cancelled"
        else:
            status = "pending"
        
        row = {
            "professional_name": _first_no_empty(cita.get('PROFESIONAL'), cita.get('DOCTOR'), cita.get('MEDICO')),
            "client_name": nombre_completo,
            "client_phone": telefono,
            "service_name": _first_no_empty(cita.get('SERVICIO'), cita.get('TIPO_CITA'), cita.get('TRATAMIENTO')),
            "date": formatear_fecha(fecha),
            "start_time": formatear_hora(hora_inicio) or hora_inicio,
            "end_time": formatear_hora(hora_fin) or hora_fin,
            "duration": duracion or _first_no_empty(cita.get('DURACION'), cita.get('DURATION'), cita.get('MINUTOS')),
            "status": status,
            "notes": _first_no_empty(cita.get('NOTAS'), cita.get('OBSERVACIONES'), cita.get('NOTES')),
            "modalidad": "presencial",
        }
        out_rows.append(row)
    
    _write_csv(output_path, headers, out_rows)
    print(f"[OK] Generado {output_path} ({len(out_rows)} filas)")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: Optional[List[str]] = None) -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Script genérico para mapear archivos de CLINNI hacia las plantillas "
            "de bonos, clientes, historial y citas."
        )
    )
    parser.add_argument(
        "--input-file",
        required=True,
        help="Ruta al archivo de CLINNI (puede ser .gz, .json, .csv, .txt, .xml)",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help=(
            "Carpeta donde se guardarán los CSV generados "
            "(por defecto, la carpeta 'script' donde está este script)"
        ),
    )
    parser.add_argument(
        "--plantillas-dir",
        default=None,
        help=(
            "Carpeta donde están las plantillas CSV "
            "(por defecto, la raíz del proyecto)"
        ),
    )
    parser.add_argument(
        "--solo",
        choices=[
            "clientes_y_bonos",
            "bonos",
            "historial_basica",
            "historial_completa",
            "citas",
        ],
        help="Si se indica, solo genera ese tipo de plantilla.",
    )
    
    args = parser.parse_args(argv)
    
    # Determinar rutas
    script_dir = Path(__file__).parent
    proyecto_root = script_dir.parent.parent
    clinni_dir = script_dir.parent
    
    input_file = Path(args.input_file)
    if not input_file.is_absolute():
        # Buscar el archivo en varias ubicaciones
        if input_file.exists():
            pass  # Ya está bien
        elif (clinni_dir / args.input_file).exists():
            input_file = clinni_dir / args.input_file
        elif (proyecto_root / "CLINNI" / args.input_file).exists():
            input_file = proyecto_root / "CLINNI" / args.input_file
        elif (proyecto_root / args.input_file).exists():
            input_file = proyecto_root / args.input_file
    
    if not input_file.exists():
        parser.error(f"El archivo no existe: {input_file}")
    
    if args.output_dir is None:
        output_dir = script_dir
    else:
        output_dir = Path(args.output_dir)
    
    if args.plantillas_dir is None:
        plantillas_dir = proyecto_root
    else:
        plantillas_dir = Path(args.plantillas_dir)
    
    # Rutas de plantillas
    plantilla_clientes_y_bonos = plantillas_dir / "plantilla_clientes_y_bonos.csv"
    plantilla_bonos = plantillas_dir / "plantilla_bonos.csv"
    plantilla_historial_basica = plantillas_dir / "plantilla_historial_basica.csv"
    plantilla_historial_completa = plantillas_dir / "plantilla_historial_completa.csv"
    plantilla_citas = plantillas_dir / "plantilla-citas.csv"
    
    # Verificar que las plantillas existan
    for p in [plantilla_clientes_y_bonos, plantilla_bonos, plantilla_historial_basica, 
              plantilla_historial_completa, plantilla_citas]:
        if not p.exists():
            print(f"[AVISO] Plantilla no encontrada: {p}", file=sys.stderr)
    
    # Extraer sufijo del nombre del archivo
    file_suffix = _sanitize_filename(input_file.name)
    
    print(f"[INFO] Procesando archivo: {input_file.name}")
    print(f"[INFO] Sufijo para archivos de salida: {file_suffix}")
    
    # Leer y estructurar datos
    datos_estructurados = leer_archivo_clinni(input_file)
    
    tasks = []
    
    def add_task(name: str, func):
        if args.solo is None or args.solo == name:
            tasks.append(func)
    
    add_task(
        "clientes_y_bonos",
        lambda: generar_clientes_y_bonos(
            datos_estructurados, output_dir / f"clientes_y_bonos_{file_suffix}.csv",
            plantilla_clientes_y_bonos
        ),
    )
    add_task(
        "bonos",
        lambda: generar_bonos(
            datos_estructurados, output_dir / f"bonos_{file_suffix}.csv",
            plantilla_bonos
        ),
    )
    add_task(
        "historial_basica",
        lambda: generar_historial_basica(
            datos_estructurados, output_dir / f"historial_basica_{file_suffix}.csv",
            plantilla_historial_basica
        ),
    )
    add_task(
        "historial_completa",
        lambda: generar_historial_completa(
            datos_estructurados, output_dir / f"historial_completa_{file_suffix}.csv",
            plantilla_historial_completa
        ),
    )
    add_task(
        "citas",
        lambda: generar_citas(
            datos_estructurados, output_dir / f"citas_{file_suffix}.csv",
            plantilla_citas
        ),
    )
    
    if not tasks:
        print(
            "[AVISO] No hay tareas a ejecutar. Revisa el parámetro --solo.",
            file=sys.stderr,
        )
        return
    
    for t in tasks:
        t()
    
    print(f"\n[OK] Proceso completado. Archivos generados en: {output_dir}")


if __name__ == "__main__":
    main()

