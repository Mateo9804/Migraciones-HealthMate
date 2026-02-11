"""
Script genérico para mapear XML de DRICloud hacia las plantillas
de bonos, clientes, historial y citas.

Uso:
    python dricloud_to_plantillas.py --input-xml "Completa_2536.xml"
    
Los CSV se generarán en la carpeta script con el nombre:
- bonos_Completa_2536.csv
- clientes_y_bonos_Completa_2536.csv
- etc.
"""
import argparse
import csv
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
    """Convierte fecha de formato XML a formato DD/MM/YYYY."""
    if not fecha_str:
        return ""
    
    # Intentar parsear formato ISO: 2019-03-15T14:30:00
    match = re.match(r'(\d{4})-(\d{2})-(\d{2})', fecha_str)
    if match:
        return f"{match.group(3)}/{match.group(2)}/{match.group(1)}"
    
    return fecha_str


def formatear_fecha_hora(fecha_str: str) -> str:
    """Convierte fecha/hora de formato XML a formato DD/MM/YYYY."""
    if not fecha_str:
        return ""
    
    match = re.match(r'(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})', fecha_str)
    if match:
        return f"{match.group(3)}/{match.group(2)}/{match.group(1)}"
    
    return formatear_fecha(fecha_str)


def formatear_hora(fecha_str: str) -> str:
    """Extrae la hora de un datetime ISO."""
    if not fecha_str:
        return ""
    
    match = re.match(r'\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})', fecha_str)
    if match:
        return f"{match.group(1)}:{match.group(2)}:00"
    
    return ""


# ---------------------------------------------------------------------------
# Extracción de datos del XML
# ---------------------------------------------------------------------------


def extraer_elementos_xml(xml_path: Path, tag_name: str) -> List[Dict[str, str]]:
    """
    Extrae todos los elementos de un tag del XML usando regex.
    Retorna una lista de diccionarios con los campos de cada elemento.
    """
    elementos = []
    pattern = re.compile(
        rf'<{re.escape(tag_name)}>(.*?)</{re.escape(tag_name)}>',
        re.DOTALL | re.IGNORECASE
    )
    
    chunk_size = 10 * 1024 * 1024  # 10MB chunks
    buffer = ""
    
    try:
        with xml_path.open('r', encoding='utf-8', errors='replace') as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                
                buffer += chunk
                
                # Buscar matches en el buffer
                matches = list(pattern.finditer(buffer))
                for match in matches:
                    contenido = match.group(1)
                    
                    # Extraer campos (sub-elementos)
                    campos_pattern = re.compile(r'<([A-Z_][A-Z0-9_]*)>(.*?)</\1>', re.DOTALL)
                    campos = {}
                    for campo_match in campos_pattern.finditer(contenido):
                        campo_nombre = campo_match.group(1)
                        campo_valor = campo_match.group(2).strip()
                        campos[campo_nombre] = campo_valor
                    
                    if campos:  # Solo agregar si tiene campos
                        elementos.append(campos)
                
                # Mantener solo el último 1MB del buffer para el siguiente chunk
                if len(buffer) > 1024 * 1024:
                    buffer = buffer[-1024 * 1024:]
    except Exception as e:
        print(f"[ERROR] Error leyendo XML: {e}", file=sys.stderr)
    
    return elementos


def cargar_tablas_relacionadas(xml_path: Path) -> Dict:
    """
    Carga todas las tablas necesarias en memoria para hacer joins.
    Retorna un diccionario con las tablas indexadas por ID.
    """
    print("[INFO] Cargando tablas relacionadas del XML...")
    
    tablas = {
        'PACIENTE': {},
        'PACIENTE_BONOS': [],
        'CITA_PACIENTE': [],
        'CITA_PACIENTE_CONSULTA': {},
        'TURNO_CITA': {},
        'TIPO_CITA': {},
        'USUARIO': {},
        'USUARIO_DOCTOR': {},
        'TRATAMIENTO': {},
        'PACIENTE_DATOS_PREVIOS': {},
    }
    
    # Cargar PACIENTE (indexado por PAC_ID)
    print("  Cargando PACIENTE...")
    pacientes = extraer_elementos_xml(xml_path, "PACIENTE")
    for p in pacientes:
        pac_id = p.get("PAC_ID", "")
        if pac_id:
            tablas['PACIENTE'][pac_id] = p
    print(f"    {len(tablas['PACIENTE'])} pacientes cargados")
    
    # Cargar PACIENTE_BONOS (lista)
    print("  Cargando PACIENTE_BONOS...")
    tablas['PACIENTE_BONOS'] = extraer_elementos_xml(xml_path, "PACIENTE_BONOS")
    print(f"    {len(tablas['PACIENTE_BONOS'])} bonos cargados")
    
    # Cargar CITA_PACIENTE (lista)
    print("  Cargando CITA_PACIENTE...")
    tablas['CITA_PACIENTE'] = extraer_elementos_xml(xml_path, "CITA_PACIENTE")
    print(f"    {len(tablas['CITA_PACIENTE'])} citas cargadas")
    
    # Cargar CITA_PACIENTE_CONSULTA (indexado por CPA_ID)
    print("  Cargando CITA_PACIENTE_CONSULTA...")
    consultas = extraer_elementos_xml(xml_path, "CITA_PACIENTE_CONSULTA")
    for c in consultas:
        cpa_id = c.get("CPA_ID", "")
        if cpa_id:
            tablas['CITA_PACIENTE_CONSULTA'][cpa_id] = c
    print(f"    {len(tablas['CITA_PACIENTE_CONSULTA'])} consultas cargadas")
    
    # Cargar TURNO_CITA (indexado por TCO_ID)
    print("  Cargando TURNO_CITA...")
    turnos = extraer_elementos_xml(xml_path, "TURNO_CITA")
    for t in turnos:
        tco_id = t.get("TCO_ID", "")
        if tco_id:
            tablas['TURNO_CITA'][tco_id] = t
    print(f"    {len(tablas['TURNO_CITA'])} turnos cargados")
    
    # Cargar TIPO_CITA (indexado por TCI_ID)
    print("  Cargando TIPO_CITA...")
    tipos = extraer_elementos_xml(xml_path, "TIPO_CITA")
    for t in tipos:
        tci_id = t.get("TCI_ID", "")
        if tci_id:
            tablas['TIPO_CITA'][tci_id] = t
    print(f"    {len(tablas['TIPO_CITA'])} tipos de cita cargados")
    
    # Cargar USUARIO (indexado por USU_ID)
    print("  Cargando USUARIO...")
    usuarios = extraer_elementos_xml(xml_path, "USUARIO")
    for u in usuarios:
        usu_id = u.get("USU_ID", "")
        if usu_id:
            tablas['USUARIO'][usu_id] = u
    print(f"    {len(tablas['USUARIO'])} usuarios cargados")
    
    # Cargar USUARIO_DOCTOR (indexado por USU_ID)
    print("  Cargando USUARIO_DOCTOR...")
    doctores = extraer_elementos_xml(xml_path, "USUARIO_DOCTOR")
    for d in doctores:
        usu_id = d.get("USU_ID", "")
        if usu_id:
            tablas['USUARIO_DOCTOR'][usu_id] = d
    print(f"    {len(tablas['USUARIO_DOCTOR'])} doctores cargados")
    
    # Cargar TRATAMIENTO (indexado por TRA_ID)
    print("  Cargando TRATAMIENTO...")
    tratamientos = extraer_elementos_xml(xml_path, "TRATAMIENTO")
    for t in tratamientos:
        tra_id = t.get("TRA_ID", "")
        if tra_id:
            tablas['TRATAMIENTO'][tra_id] = t
    print(f"    {len(tablas['TRATAMIENTO'])} tratamientos cargados")
    
    # Cargar PACIENTE_DATOS_PREVIOS (indexado por PAC_ID)
    print("  Cargando PACIENTE_DATOS_PREVIOS...")
    datos_previos = extraer_elementos_xml(xml_path, "PACIENTE_DATOS_PREVIOS")
    for d in datos_previos:
        pac_id = d.get("PAC_ID", "")
        if pac_id:
            tablas['PACIENTE_DATOS_PREVIOS'][pac_id] = d
    print(f"    {len(tablas['PACIENTE_DATOS_PREVIOS'])} datos previos cargados")
    
    return tablas


def calcular_sesiones_consumidas(bono: Dict) -> str:
    """Calcula las sesiones consumidas de forma flexible."""
    sesiones_consumidas = bono.get("PAC_BON_USOS", "")
    
    if not sesiones_consumidas:
        for key in bono.keys():
            if "CONSUMID" in key.upper() or "USOS" in key.upper():
                sesiones_consumidas = bono.get(key, "")
                if sesiones_consumidas:
                    break
    
    if not sesiones_consumidas:
        sesiones_totales_str = bono.get("PAC_BON_NUM_SESIONES", "")
        sesiones_sin_consumir = None
        for key in bono.keys():
            if "SIN_CONSUMIR" in key.upper() or "RESTANTES" in key.upper() or "DISPONIBLES" in key.upper():
                sesiones_sin_consumir = bono.get(key, "")
                if sesiones_sin_consumir:
                    break
        
        if sesiones_sin_consumir and sesiones_totales_str:
            try:
                totales = int(float(sesiones_totales_str))
                sin_consumir = int(float(sesiones_sin_consumir))
                sesiones_consumidas = str(totales - sin_consumir)
            except (ValueError, TypeError):
                pass
    
    return sesiones_consumidas


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla_clientes_y_bonos.csv
# ---------------------------------------------------------------------------


def generar_clientes_y_bonos(xml_path: Path, tablas: Dict, output_path: Path, plantilla_path: Path) -> None:
    """Genera plantilla_clientes_y_bonos.csv desde XML de DRICloud."""
    headers = _read_csv_headers(plantilla_path)
    pacientes = tablas['PACIENTE']
    bonos = tablas['PACIENTE_BONOS']
    
    rows_out: List[Dict[str, str]] = []
    
    # Crear un índice de bonos por PAC_ID
    bonos_por_paciente = defaultdict(list)
    for b in bonos:
        pac_id = b.get("PAC_ID", "")
        if pac_id:
            bonos_por_paciente[pac_id].append(b)
    
    # Generar una fila por cada paciente (con su primer bono si tiene)
    for pac_id, paciente in pacientes.items():
        bonos_pac = bonos_por_paciente.get(pac_id, [])
        bono = bonos_pac[0] if bonos_pac else {}
        
        nombre = paciente.get("PAC_NOMBRE", "")
        apellidos = paciente.get("PAC_APELLIDOS", "")
        telefono = paciente.get("PAC_TELEFONO1", "")
        
        row = {
            "Nombre": nombre,
            "Apellidos": apellidos,
            "CIF/NIF": paciente.get("PAC_NIF", ""),
            "Direccion": paciente.get("PAC_DIRECCION", ""),
            "Codigo Postal": paciente.get("PAC_COD_POSTAL", ""),
            "Ciudad": paciente.get("PAC_POBLACION", ""),
            "Provincia": paciente.get("PAC_PROVINCIA", ""),
            "Pais": paciente.get("PAC_PAIS", ""),
            "Email": paciente.get("PAC_EMAIL", ""),
            "Telefono": telefono,
            "Tipo Cliente": "",
            "Fecha Nacimiento": formatear_fecha(paciente.get("PAC_FECHA_NACIMIENTO", "")),
            "Genero": "male" if paciente.get("SEX_ID") == "1" else "female" if paciente.get("SEX_ID") == "2" else "",
            "Notas Medicas": paciente.get("PAC_ANOTACIONES", ""),
            "Fecha seguimiento": "",
            "Tipo seguimiento": "",
            "Descripción": "",
            "Recomendaciones": "",
            "Nombre Bono": bono.get("PAC_BON_CABECERA", ""),
            "Servicio": "",
            "Precio": bono.get("PAC_BON_PRECIO", ""),
            "Sesiones Totales": bono.get("PAC_BON_NUM_SESIONES", ""),
            "Sesiones Consumidas": calcular_sesiones_consumidas(bono),
            "Fecha Caducidad": formatear_fecha(bono.get("PAC_BON_FECHA_VENCIMIENTO", "")),
            "Notas Bono": bono.get("PAC_BON_CONDICIONES", ""),
        }
        rows_out.append(row)
    
    _write_csv(output_path, headers, rows_out)
    print(f"[OK] Generado {output_path} ({len(rows_out)} filas)")


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla_bonos.csv
# ---------------------------------------------------------------------------


def generar_bonos(xml_path: Path, tablas: Dict, output_path: Path, plantilla_path: Path) -> None:
    """Genera plantilla_bonos.csv desde XML de DRICloud."""
    headers = _read_csv_headers(plantilla_path)
    pacientes = tablas['PACIENTE']
    bonos = tablas['PACIENTE_BONOS']
    
    out_rows: List[Dict[str, str]] = []
    
    for b in bonos:
        pac_id = b.get("PAC_ID", "")
        paciente = pacientes.get(pac_id, {})
        
        nombre = paciente.get("PAC_NOMBRE", "")
        apellidos = paciente.get("PAC_APELLIDOS", "")
        telefono = paciente.get("PAC_TELEFONO1", "")
        
        precio = b.get("PAC_BON_PRECIO", "")
        if precio:
            try:
                precio = str(int(float(precio)))
            except:
                pass
        
        pagado = b.get("PAC_BON_PAGADO", "")
        if pagado and pagado.upper() in ["1", "S", "SÍ", "SI", "YES", "TRUE"]:
            pagado_str = "Sí"
            importe_pagado = precio
        else:
            pagado_str = ""
            importe_pagado = ""
        
        row = {
            "Teléfono": telefono,
            "Nombre Cliente": f"{nombre} {apellidos}".strip(),
            "Nombre Bono": b.get("PAC_BON_CABECERA", ""),
            "Servicio": "",
            "Sesiones Totales": b.get("PAC_BON_NUM_SESIONES", ""),
            "Sesiones Consumidas": calcular_sesiones_consumidas(b),
            "Precio Total": precio,
            "Pagado": pagado_str,
            "Importe Pagado": importe_pagado,
            "Fecha Caducidad": formatear_fecha(b.get("PAC_BON_FECHA_VENCIMIENTO", "")),
        }
        out_rows.append(row)
    
    _write_csv(output_path, headers, out_rows)
    print(f"[OK] Generado {output_path} ({len(out_rows)} filas)")


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla_historial_basica.csv
# ---------------------------------------------------------------------------


def generar_historial_basica(xml_path: Path, tablas: Dict, output_path: Path, plantilla_path: Path) -> None:
    """Genera plantilla_historial_basica.csv desde XML de DRICloud."""
    headers = _read_csv_headers(plantilla_path)
    pacientes = tablas['PACIENTE']
    consultas = tablas['CITA_PACIENTE_CONSULTA']
    citas = tablas['CITA_PACIENTE']
    
    # Crear índice de citas por CPA_ID
    citas_por_consulta = {}
    for cita in citas:
        cpa_id = cita.get("CPA_ID", "")
        if cpa_id:
            citas_por_consulta[cpa_id] = cita
    
    out_rows: List[Dict[str, str]] = []
    
    for cpa_id, consulta in consultas.items():
        cita = citas_por_consulta.get(cpa_id, {})
        pac_id = cita.get("PAC_ID", "")
        paciente = pacientes.get(pac_id, {})
        
        telefono = paciente.get("PAC_TELEFONO1", "")
        
        row = {
            "Teléfono": telefono,
            "Profesional": "",
            "Motivo Consulta": "",
            "Tiempo Evolución": "",
            "Descripción Detallada": consulta.get("CPA_DIAGNOSTICO", ""),
            "Enfermedades Crónicas": "",
            "Alergias Medicamentosas": "",
            "Medicación Habitual": "",
            "Diagnóstico": consulta.get("CPA_DIAGNOSTICO", ""),
            "Recomendaciones": "",
            "Observaciones": consulta.get("CPA_NOTAS_ODONTOGRAMA", ""),
        }
        out_rows.append(row)
    
    _write_csv(output_path, headers, out_rows)
    print(f"[OK] Generado {output_path} ({len(out_rows)} filas)")


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla_historial_completa.csv
# ---------------------------------------------------------------------------


def generar_historial_completa(xml_path: Path, tablas: Dict, output_path: Path, plantilla_path: Path) -> None:
    """Genera plantilla_historial_completa.csv desde XML de DRICloud."""
    headers = _read_csv_headers(plantilla_path)
    pacientes = tablas['PACIENTE']
    consultas = tablas['CITA_PACIENTE_CONSULTA']
    citas = tablas['CITA_PACIENTE']
    datos_previos = tablas['PACIENTE_DATOS_PREVIOS']
    
    citas_por_consulta = {}
    for cita in citas:
        cpa_id = cita.get("CPA_ID", "")
        if cpa_id:
            citas_por_consulta[cpa_id] = cita
    
    out_rows: List[Dict[str, str]] = []
    
    for cpa_id, consulta in consultas.items():
        cita = citas_por_consulta.get(cpa_id, {})
        pac_id = cita.get("PAC_ID", "")
        paciente = pacientes.get(pac_id, {})
        datos_pac = datos_previos.get(pac_id, {})
        
        telefono = paciente.get("PAC_TELEFONO1", "")
        diagnostico = consulta.get("CPA_DIAGNOSTICO", "")
        
        row = {h: "" for h in headers}
        row["Teléfono Cliente"] = telefono
        row["Diagnóstico"] = diagnostico
        row["Descripción Detallada"] = diagnostico
        row["Observaciones Adicionales"] = consulta.get("CPA_NOTAS_ODONTOGRAMA", "")
        
        out_rows.append(row)
    
    _write_csv(output_path, headers, out_rows)
    print(f"[OK] Generado {output_path} ({len(out_rows)} filas)")


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla-citas.csv
# ---------------------------------------------------------------------------


def generar_citas(xml_path: Path, tablas: Dict, output_path: Path, plantilla_path: Path) -> None:
    """Genera plantilla-citas.csv desde XML de DRICloud."""
    headers = _read_csv_headers(plantilla_path)
    pacientes = tablas['PACIENTE']
    citas = tablas['CITA_PACIENTE']
    turnos = tablas['TURNO_CITA']
    tipos_cita = tablas['TIPO_CITA']
    usuarios = tablas['USUARIO']
    
    out_rows: List[Dict[str, str]] = []
    
    for cita in citas:
        pac_id = cita.get("PAC_ID", "")
        paciente = pacientes.get(pac_id, {})
        
        tco_id = cita.get("TCO_ID", "")
        turno = turnos.get(tco_id, {})
        
        tci_id = cita.get("TCI_ID", "")
        tipo_cita = tipos_cita.get(tci_id, {})
        
        usu_id = turno.get("USU_ID", "")
        usuario = usuarios.get(usu_id, {})
        
        nombre_prof = usuario.get("USU_NOMBRE", "")
        apellidos_prof = usuario.get("USU_APELLIDOS", "")
        profesional = f"{nombre_prof} {apellidos_prof}".strip() or usuario.get("USU_USUARIO", "")
        
        nombre_pac = paciente.get("PAC_NOMBRE", "")
        apellidos_pac = paciente.get("PAC_APELLIDOS", "")
        nombre_completo = f"{nombre_pac} {apellidos_pac}".strip()
        
        telefono = paciente.get("PAC_TELEFONO1", "")
        fecha_inicio = cita.get("CPA_FECHA_INICIO", "")
        
        minutos = cita.get("CPA_MINUTOS_CITA", "0")
        duracion = minutos if minutos else ""
        
        # Determinar estado
        estado_raw = cita.get("CPA_ESTADO", "").lower()
        if "realizad" in estado_raw or "complet" in estado_raw:
            status = "confirmed"
        elif "cancel" in estado_raw:
            status = "cancelled"
        else:
            status = "pending"
        
        row = {
            "professional_name": profesional,
            "client_name": nombre_completo,
            "client_phone": telefono,
            "service_name": tipo_cita.get("TCI_NOMBRE", ""),
            "date": formatear_fecha_hora(fecha_inicio),
            "start_time": formatear_hora(fecha_inicio),
            "end_time": "",
            "duration": duracion,
            "status": status,
            "notes": "",
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
            "Script genérico para mapear XML de DRICloud hacia las plantillas "
            "de bonos, clientes, historial y citas."
        )
    )
    parser.add_argument(
        "--input-xml",
        required=True,
        help="Ruta al archivo XML de DRICloud (ej: 'Completa_2536.xml')",
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
    dricloud_dir = script_dir.parent
    
    input_xml = Path(args.input_xml)
    if not input_xml.is_absolute():
        # Si es relativo, intentar varias ubicaciones
        # 1. Desde donde se ejecuta el script (directorio actual de trabajo)
        if input_xml.exists():
            pass  # Ya está bien
        else:
            # 2. Si el path ya incluye "DRICloud/", buscar desde proyecto_root
            path_str = str(args.input_xml)
            if "DRICloud" in path_str:
                # Ya tiene DRICloud en el path, buscar desde proyecto_root
                posible_path = proyecto_root / path_str
                if posible_path.exists():
                    input_xml = posible_path
                else:
                    # Si no existe, intentar sin el prefijo DRICloud/ desde dricloud_dir
                    path_sin_prefijo = path_str.replace("DRICloud/", "").replace("DRICloud\\", "")
                    posible_path = dricloud_dir / path_sin_prefijo
                    if posible_path.exists():
                        input_xml = posible_path
            else:
                # 3. Buscar desde la carpeta DRICloud directamente
                posible_path = dricloud_dir / args.input_xml
                if posible_path.exists():
                    input_xml = posible_path
                else:
                    # 4. Último intento: desde proyecto_root
                    posible_path = proyecto_root / args.input_xml
                    if posible_path.exists():
                        input_xml = posible_path
    
    if not input_xml.exists():
        parser.error(f"El archivo XML no existe: {input_xml}")
    
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
    
    # Extraer sufijo del nombre del archivo XML
    xml_suffix = _sanitize_filename(input_xml.name)
    
    print(f"[INFO] Procesando XML: {input_xml.name}")
    print(f"[INFO] Sufijo para archivos de salida: {xml_suffix}")
    
    # Cargar tablas del XML
    tablas = cargar_tablas_relacionadas(input_xml)
    
    tasks = []
    
    def add_task(name: str, func):
        if args.solo is None or args.solo == name:
            tasks.append(func)
    
    add_task(
        "clientes_y_bonos",
        lambda: generar_clientes_y_bonos(
            input_xml, tablas, output_dir / f"clientes_y_bonos_{xml_suffix}.csv",
            plantilla_clientes_y_bonos
        ),
    )
    add_task(
        "bonos",
        lambda: generar_bonos(
            input_xml, tablas, output_dir / f"bonos_{xml_suffix}.csv",
            plantilla_bonos
        ),
    )
    add_task(
        "historial_basica",
        lambda: generar_historial_basica(
            input_xml, tablas, output_dir / f"historial_basica_{xml_suffix}.csv",
            plantilla_historial_basica
        ),
    )
    add_task(
        "historial_completa",
        lambda: generar_historial_completa(
            input_xml, tablas, output_dir / f"historial_completa_{xml_suffix}.csv",
            plantilla_historial_completa
        ),
    )
    add_task(
        "citas",
        lambda: generar_citas(
            input_xml, tablas, output_dir / f"citas_{xml_suffix}.csv",
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

