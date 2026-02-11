import argparse
import csv
import re
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Optional


# ---------------------------------------------------------------------------
# Utilidades básicas
# ---------------------------------------------------------------------------


def _read_csv(path: Path, encoding: str = "latin-1") -> Iterable[Dict[str, str]]:
    """
    Lee un CSV de MN Program y devuelve diccionarios por fila.

    - Intenta primero con utf-8-sig (que maneja BOM automáticamente).
    - Si falla, usa latin-1 para acentos típicos de MN Program.
    - Si el fichero no existe, devuelve lista vacía y saca aviso por stderr.
    - Limpia el BOM (Byte Order Mark) de las claves del diccionario si existe.
    """
    if not path.exists():
        print(f"[AVISO] No se encontró el fichero: {path}", file=sys.stderr)
        return []

    encodings_to_try = ["utf-8-sig", encoding]
    rows = []
    
    for enc in encodings_to_try:
        try:
            with path.open("r", encoding=enc, newline="") as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                break
        except (UnicodeDecodeError, UnicodeError):
            continue
    
    if rows:
        bom = '\ufeff'
        cleaned_rows = []
        for row in rows:
            cleaned_row = {}
            for key, value in row.items():
                # Eliminar BOM del inicio de la clave
                clean_key = key.lstrip(bom).strip()
                cleaned_row[clean_key] = value
            cleaned_rows.append(cleaned_row)
        return cleaned_rows
    
    return rows


def _write_csv(path: Path, fieldnames: List[str], rows: Iterable[Dict[str, str]]) -> None:
    """
    Escribe un CSV en UTF‑8 con BOM para que Excel lo abra bien.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})


def _first_no_empty(*values: Optional[str]) -> str:
    for v in values:
        if v is not None and str(v).strip() != "":
            return str(v)
    return ""


def _sanitize_filename(name: str) -> str:
    """
    Limpia un nombre para que sea válido como parte de un nombre de archivo.
    Reemplaza espacios y caracteres especiales por guiones bajos.
    """
    name = re.sub(r'[^\w\-_\.]', '_', name)
    name = re.sub(r'_+', '_', name)
    name = name.strip('_')
    return name


def _extract_folder_suffix(input_dir: Path) -> str:
    """
    Extrae un sufijo del nombre de la carpeta de entrada para usar en los nombres de archivo.
    Por ejemplo: "csv desde sql de bkprogram1" -> "bkprogram1"
    """
    folder_name = input_dir.name
    
    patterns = [
        r'bkprogram\d+',  
        r'\d+_adv\w+',     
        r'[a-zA-Z0-9_]+', 
    ]
    
    for pattern in patterns:
        match = re.search(pattern, folder_name, re.IGNORECASE)
        if match:
            return _sanitize_filename(match.group())
    
    return _sanitize_filename(folder_name)


# ---------------------------------------------------------------------------
# Carga de tablas base de MN Program
# ---------------------------------------------------------------------------


def load_clientes(input_dir: Path) -> Dict[str, Dict[str, str]]:
    """
    Carga 'clientes.csv' y devuelve un dict indexado por la columna de ID.

    - Intenta usar 'icodcli' (nombre típico en MN Program).
    - Si no existe exactamente así (BOM, mayúsculas, espacios, etc.),
      toma la primera columna como identificador.
    """
    rows = _read_csv(input_dir / "clientes.csv")
    clientes: Dict[str, Dict[str, str]] = {}

    if not rows:
        print(
            "[AVISO] 'clientes.csv' no tiene filas de datos o no se pudo leer correctamente.",
            file=sys.stderr,
        )
        return clientes

    sample = rows[0]
    bom = '\ufeff'
    possible_keys = ["icodcli", "ICODCLI", "IdCliente", "idcliente", "id"]
    key_field: Optional[str] = None

    for cand in possible_keys:
        for real_key in sample.keys():
            clean_key = real_key.lstrip(bom).strip()
            if clean_key.lower() == cand.lower():
                key_field = real_key
                break
        if key_field:
            break

    if key_field is None:
        key_field = next(iter(sample.keys()))
        key_field_clean = key_field.lstrip(bom).strip()
        print(
            f"[AVISO] No se encontró columna 'icodcli'; se usará la primera columna como clave: '{key_field_clean}'",
            file=sys.stderr,
        )
    else:
        key_field_clean = key_field.lstrip(bom).strip()

    for r in rows:
        key = r.get(key_field)
        if not key:
            continue
        clientes[str(key)] = r

    print(f"[INFO] Cargados {len(clientes)} clientes desde clientes.csv (clave: '{key_field_clean}')")
    return clientes


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla_clientes_y_bonos.csv
# ---------------------------------------------------------------------------


PLANTILLA_CLIENTES_Y_BONOS_HEADERS = [
    "Nombre",
    "Apellidos",
    "CIF/NIF",
    "Direccion",
    "Codigo Postal",
    "Ciudad",
    "Provincia",
    "Pais",
    "Email",
    "Telefono",
    "Tipo Cliente",
    "Fecha Nacimiento",
    "Genero",
    "Notas Medicas",
    "Fecha seguimiento",
    "Tipo seguimiento",
    "Descripción",
    "Recomendaciones",
    "Nombre Bono",
    "Servicio",
    "Precio",
    "Sesiones Totales",
    "Sesiones Consumidas",
    "Fecha Caducidad",
    "Notas Bono",
]


def generar_clientes_y_bonos(input_dir: Path, output_path: Path) -> None:
    """
    Mapea MN Program -> plantilla_clientes_y_bonos.

    De momento:
    - Rellena solo la parte de CLIENTE desde 'clientes.csv'.
    - Deja vacíos los campos de seguimiento y bono (se pueden completar luego).
    """
    clientes = load_clientes(input_dir)

    rows_out: List[Dict[str, str]] = []

    for cli in clientes.values():
        nombre_completo = cli.get("snombrecli", "").strip()

        # Versión genérica: dejamos todo el nombre en "Nombre" y vaciamos "Apellidos".
        row = {
            "Nombre": nombre_completo,
            "Apellidos": "",
            "CIF/NIF": cli.get("snifcli", ""),
            "Direccion": cli.get("sdomiciliocli", ""),
            "Codigo Postal": cli.get("scodpostalcli", ""),
            "Ciudad": cli.get("spoblacioncli", ""),
            "Provincia": cli.get("sprovinciacli", ""),
            "Pais": _first_no_empty(cli.get("sNombrePais"), "España"),
            "Email": cli.get("email", ""),
            "Telefono": _first_no_empty(cli.get("smovilcli"), cli.get("stelefonocli")),
            "Tipo Cliente": cli.get("NaturJuridica", ""),
            "Fecha Nacimiento": cli.get("fechanacimiento", ""),
            "Genero": cli.get("sexo", ""),
            "Notas Medicas": cli.get("textoalerta", ""),
            "Fecha seguimiento": "",
            "Tipo seguimiento": "",
            "Descripción": "",
            "Recomendaciones": "",
            "Nombre Bono": "",
            "Servicio": "",
            "Precio": "",
            "Sesiones Totales": "",
            "Sesiones Consumidas": "",
            "Fecha Caducidad": "",
            "Notas Bono": "",
        }
        rows_out.append(row)

    _write_csv(output_path, PLANTILLA_CLIENTES_Y_BONOS_HEADERS, rows_out)
    print(f"[OK] Generado {output_path} ({len(rows_out)} filas)")


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla_bonos.csv
# ---------------------------------------------------------------------------


PLANTILLA_BONOS_HEADERS = [
    "Teléfono",
    "Nombre Cliente",
    "Nombre Bono",
    "Servicio",
    "Sesiones Totales",
    "Sesiones Consumidas",
    "Precio Total",
    "Pagado",
    "Importe Pagado",
    "Fecha Caducidad",
]


def generar_bonos(input_dir: Path, output_path: Path) -> None:
    """
    Mapea Bonos de MN Program -> plantilla_bonos.csv.

    - Lee 'Bonos.csv' y 'clientes.csv'.
    - Une por Bonos.icodcliClientes = clientes.icodcli.
    - Servicio, sesiones consumidas, pagado… se dejan lo más genérico posible.
    """
    clientes = load_clientes(input_dir)
    bonos_rows = _read_csv(input_dir / "Bonos.csv")

    out_rows: List[Dict[str, str]] = []

    for b in bonos_rows:
        icodcli = b.get("icodcliClientes", "")
        cli = clientes.get(icodcli, {})

        telefono = _first_no_empty(cli.get("smovilcli"), cli.get("stelefonocli"))
        nombre_cliente = cli.get("snombrecli", "")

        row = {
            "Teléfono": telefono,
            "Nombre Cliente": nombre_cliente,
            "Nombre Bono": b.get("Descripcion", ""),
            "Servicio": "",
            "Sesiones Totales": b.get("unidades", ""),
            "Sesiones Consumidas": "",
            "Precio Total": b.get("Importe", ""),
            "Pagado": "",
            "Importe Pagado": "",
            "Fecha Caducidad": b.get("FechaCaducidad", ""),
        }
        out_rows.append(row)

    _write_csv(output_path, PLANTILLA_BONOS_HEADERS, out_rows)
    print(f"[OK] Generado {output_path} ({len(out_rows)} filas)")


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla_historial_basica.csv
# ---------------------------------------------------------------------------


PLANTILLA_HISTORIAL_BASICA_HEADERS = [
    "Teléfono",
    "Profesional",
    "Motivo Consulta",
    "Tiempo Evolución",
    "Descripción Detallada",
    "Enfermedades Crónicas",
    "Alergias Medicamentosas",
    "Medicación Habitual",
    "Diagnóstico",
    "Recomendaciones",
    "Observaciones",
]


def generar_historial_basica(input_dir: Path, output_path: Path) -> None:
    """
    Mapea historial de MN Program -> plantilla_historial_basica.csv.
    
    Usa diagnosticoPac.csv que contiene diagnósticos de pacientes.
    """
    clientes = load_clientes(input_dir)
    diagnostico_rows = _read_csv(input_dir / "diagnosticoPac.csv")
    
    out_rows: List[Dict[str, str]] = []
    
    for diag in diagnostico_rows:
        icodcli = diag.get("icodcli", "")
        cli = clientes.get(icodcli, {})
        
        telefono = _first_no_empty(cli.get("smovilcli"), cli.get("stelefonocli"))
        
        fecha = diag.get("dfecha", "")
        if fecha and len(fecha) >= 10:
            try:
                fecha_parts = fecha.split()[0] 
                fecha = fecha_parts
            except:
                pass
        
        row = {
            "Teléfono": telefono,
            "Profesional": "",  
            "Motivo Consulta": "",
            "Tiempo Evolución": "",
            "Descripción Detallada": diag.get("diagnostico", ""),
            "Enfermedades Crónicas": "",
            "Alergias Medicamentosas": "",
            "Medicación Habitual": "",
            "Diagnóstico": diag.get("diagnostico", ""),
            "Recomendaciones": "",
            "Observaciones": f"Tipo: {diag.get('tipo', '')} | Fecha: {fecha}",
        }
        out_rows.append(row)
    
    _write_csv(output_path, PLANTILLA_HISTORIAL_BASICA_HEADERS, out_rows)
    print(f"[OK] Generado {output_path} ({len(out_rows)} filas)")


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla_historial_completa.csv
# ---------------------------------------------------------------------------


PLANTILLA_HISTORIAL_COMPLETA_HEADERS = [
    "Teléfono Cliente",
    "Profesional",
    "Motivo Consulta",
    "Tiempo Evolución",
    "Descripción Detallada",
    "Inicio Evolución",
    "Factores Agravantes",
    "Factores Atenuantes",
    "Intensidad Síntomas",
    "Frecuencia Síntomas",
    "Localización",
    "Impacto Vida Diaria",
    "Enfermedades Crónicas",
    "Enfermedades Agudas",
    "Cirugías Previas",
    "Alergias Medicamentosas",
    "Alergias Alimentarias",
    "Alergias Ambientales",
    "Medicación Habitual",
    "Hospitalizaciones Previas",
    "Accidentes/Traumatismos",
    "Enfermedades Hereditarias",
    "Patologías Padres",
    "Patologías Hermanos",
    "Patologías Abuelos",
    "Alimentación",
    "Actividad Física",
    "Consumo Tabaco",
    "Cantidad Tabaco",
    "Tiempo Tabaco",
    "Consumo Alcohol",
    "Cantidad Alcohol",
    "Frecuencia Alcohol",
    "Otras Sustancias",
    "Calidad Sueño",
    "Horas Sueño",
    "Nivel Estrés",
    "Apetito",
    "Digestión",
    "Evacuaciones",
    "Frecuencia Evacuaciones",
    "Consistencia Evacuaciones",
    "Cambios Evacuaciones",
    "Náuseas/Vómitos",
    "Reflujo",
    "Frecuencia Urinaria",
    "Dolor al Urinar",
    "Incontinencia",
    "Cambios Color Orina",
    "Cambios Olor Orina",
    "Palpitaciones",
    "Disnea",
    "Dolor Torácico",
    "Tos",
    "Esputo",
    "Dolor Articular",
    "Dolor Muscular",
    "Limitaciones Movimiento",
    "Debilidad/Fatiga",
    "Mareos/Vértigo",
    "Pérdida Sensibilidad",
    "Pérdida Fuerza",
    "Cefaleas",
    "Alteraciones Visuales",
    "Alteraciones Auditivas",
    "Estado Ánimo",
    "Ansiedad",
    "Depresión",
    "Cambios Conducta",
    "Trastornos Sueño",
    "Sistema Cutáneo",
    "Sistema Endocrino",
    "Sistema Hematológico",
    "Tensión Arterial",
    "Frecuencia Cardíaca",
    "Frecuencia Respiratoria",
    "Temperatura",
    "Saturación O2",
    "Peso",
    "Talla",
    "IMC",
    "Observaciones Clínicas",
    "Pruebas Complementarias",
    "Diagnóstico",
    "Medicación Prescrita",
    "Recomendaciones",
    "Derivaciones",
    "Seguimiento",
    "Observaciones Adicionales",
]


def generar_historial_completa(input_dir: Path, output_path: Path) -> None:
    """
    Mapea historial completo de MN Program -> plantilla_historial_completa.csv.
    
    Usa diagnosticoPac.csv como base y rellena los campos disponibles.
    Los campos más detallados se dejan vacíos si no están en la fuente.
    """
    clientes = load_clientes(input_dir)
    diagnostico_rows = _read_csv(input_dir / "diagnosticoPac.csv")
    
    out_rows: List[Dict[str, str]] = []
    
    for diag in diagnostico_rows:
        icodcli = diag.get("icodcli", "")
        cli = clientes.get(icodcli, {})
        
        telefono = _first_no_empty(cli.get("smovilcli"), cli.get("stelefonocli"))
        
        fecha = diag.get("dfecha", "")
        if fecha and len(fecha) >= 10:
            try:
                fecha_parts = fecha.split()[0]
                fecha = fecha_parts
            except:
                pass
        
        observaciones = []
        if diag.get("tipo"):
            observaciones.append(f"Tipo: {diag.get('tipo')}")
        if diag.get("principal"):
            observaciones.append(f"Principal: {diag.get('principal')}")
        if diag.get("codigocie9"):
            observaciones.append(f"CIE-9: {diag.get('codigocie9')}")
        observaciones_text = " | ".join(observaciones) if observaciones else ""
        
        row = {
            "Teléfono Cliente": telefono,
            "Profesional": "",  
            "Motivo Consulta": "",
            "Tiempo Evolución": "",
            "Descripción Detallada": diag.get("diagnostico", ""),
            "Inicio Evolución": "",
            "Factores Agravantes": "",
            "Factores Atenuantes": "",
            "Intensidad Síntomas": "",
            "Frecuencia Síntomas": "",
            "Localización": "",
            "Impacto Vida Diaria": "",
            "Enfermedades Crónicas": "",
            "Enfermedades Agudas": "",
            "Cirugías Previas": "",
            "Alergias Medicamentosas": "",
            "Alergias Alimentarias": "",
            "Alergias Ambientales": "",
            "Medicación Habitual": "",
            "Hospitalizaciones Previas": "",
            "Accidentes/Traumatismos": "",
            "Enfermedades Hereditarias": "",
            "Patologías Padres": "",
            "Patologías Hermanos": "",
            "Patologías Abuelos": "",
            "Alimentación": "",
            "Actividad Física": "",
            "Consumo Tabaco": "",
            "Cantidad Tabaco": "",
            "Tiempo Tabaco": "",
            "Consumo Alcohol": "",
            "Cantidad Alcohol": "",
            "Frecuencia Alcohol": "",
            "Otras Sustancias": "",
            "Calidad Sueño": "",
            "Horas Sueño": "",
            "Nivel Estrés": "",
            "Apetito": "",
            "Digestión": "",
            "Evacuaciones": "",
            "Frecuencia Evacuaciones": "",
            "Consistencia Evacuaciones": "",
            "Cambios Evacuaciones": "",
            "Náuseas/Vómitos": "",
            "Reflujo": "",
            "Frecuencia Urinaria": "",
            "Dolor al Urinar": "",
            "Incontinencia": "",
            "Cambios Color Orina": "",
            "Cambios Olor Orina": "",
            "Palpitaciones": "",
            "Disnea": "",
            "Dolor Torácico": "",
            "Tos": "",
            "Esputo": "",
            "Dolor Articular": "",
            "Dolor Muscular": "",
            "Limitaciones Movimiento": "",
            "Debilidad/Fatiga": "",
            "Mareos/Vértigo": "",
            "Pérdida Sensibilidad": "",
            "Pérdida Fuerza": "",
            "Cefaleas": "",
            "Alteraciones Visuales": "",
            "Alteraciones Auditivas": "",
            "Estado Ánimo": "",
            "Ansiedad": "",
            "Depresión": "",
            "Cambios Conducta": "",
            "Trastornos Sueño": "",
            "Sistema Cutáneo": "",
            "Sistema Endocrino": "",
            "Sistema Hematológico": "",
            "Tensión Arterial": "",
            "Frecuencia Cardíaca": "",
            "Frecuencia Respiratoria": "",
            "Temperatura": "",
            "Saturación O2": "",
            "Peso": "",
            "Talla": "",
            "IMC": "",
            "Observaciones Clínicas": observaciones_text,
            "Pruebas Complementarias": "",
            "Diagnóstico": diag.get("diagnostico", ""),
            "Medicación Prescrita": "",
            "Recomendaciones": "",
            "Derivaciones": "",
            "Seguimiento": "",
            "Observaciones Adicionales": f"Fecha: {fecha} | Estado: {diag.get('estado', '')}",
        }
        out_rows.append(row)
    
    _write_csv(output_path, PLANTILLA_HISTORIAL_COMPLETA_HEADERS, out_rows)
    print(f"[OK] Generado {output_path} ({len(out_rows)} filas)")


# ---------------------------------------------------------------------------
# GENERACIÓN: plantilla-citas.csv
# ---------------------------------------------------------------------------


PLANTILLA_CITAS_HEADERS = [
    "professional_name",
    "client_phone",
    "service_name",
    "date",
    "start_time",
    "end_time",
    "duration",
    "status",
    "notes",
    "modalidad",
]


def generar_citas(input_dir: Path, output_path: Path) -> None:
    """
    Mapea 'events.csv' de MN Program -> plantilla-citas.csv.

    Intenta relacionar eventos con clientes usando:
    - contactid (si existe)
    - icodcli (si está en campos relacionados con expedientes)
    - También busca en eventsit.csv que puede tener relaciones adicionales
    """
    clientes = load_clientes(input_dir)
    events_rows = _read_csv(input_dir / "events.csv")
    eventsit_rows = _read_csv(input_dir / "eventsit.csv")
    
    eventsit_by_eventid = {}
    for eit in eventsit_rows:
        eventid = eit.get("eventid", "")
        if eventid:
            eventsit_by_eventid[eventid] = eit

    out_rows: List[Dict[str, str]] = []

    for ev in events_rows:
        contact_id = _first_no_empty(
            ev.get("contactid"), 
            ev.get("contact"),
            ev.get("icodcli")  
        )
        
        if not contact_id:
            eventid = ev.get("eventid", "")
            if eventid and eventid in eventsit_by_eventid:
                eit = eventsit_by_eventid[eventid]
        
        cli = clientes.get(contact_id, {}) if contact_id else {}
        nombre_cli = _first_no_empty(cli.get("snombrecli"), cli.get("nombre"), cli.get("name"))
        apellidos_cli = _first_no_empty(cli.get("sapellidoscli"), cli.get("apellidos"), cli.get("surname"))
        nombre_completo = f"{nombre_cli} {apellidos_cli}".strip()
        telefono = _first_no_empty(cli.get("smovilcli"), cli.get("stelefonocli"))

        start_date = ev.get("startdate", "")
        start_time = ev.get("starttime", "")
        end_time = ev.get("endtime", "")
        
        start_datetime = ev.get("startdatetime", "")
        if start_datetime and not start_date:
            try:
                parts = start_datetime.split()
                if len(parts) >= 2:
                    start_date = parts[0]
                    if not start_time:
                        start_time = parts[1][:8] 
            except:
                pass
        
        duration = ev.get("durationminutes", "")
        if not duration and start_time and end_time:
            try:
                pass
            except:
                pass
        
        status_raw = ev.get("status", "").lower()
        if "done" in status_raw or "complet" in status_raw or ev.get("done") == "True":
            status = "confirmed"
        elif "pending" in status_raw or "pendiente" in status_raw:
            status = "pending"
        elif "cancel" in status_raw:
            status = "cancelled"
        else:
            status = status_raw or "pending"
        
        modalidad = "presencial"
        location = ev.get("location", "").lower()
        if "online" in location or "virtual" in location or "tele" in location:
            modalidad = "online"

        row = {
            "professional_name": f"Prof_{ev.get('resourceid', '').strip()}" if ev.get("resourceid") else "",
            "client_name": nombre_completo,
            "client_phone": telefono,
            "service_name": ev.get("subject", ""),
            "date": start_date,
            "start_time": start_time,
            "end_time": end_time,
            "duration": duration,
            "status": status,
            "notes": ev.get("notes", ""),
            "modalidad": modalidad,
        }
        out_rows.append(row)

    _write_csv(output_path, PLANTILLA_CITAS_HEADERS, out_rows)
    print(f"[OK] Generado {output_path} ({len(out_rows)} filas)")



def main(argv: Optional[List[str]] = None) -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Script genérico para mapear CSV de MN Program hacia las plantillas "
            "de bonos, clientes, historial y citas."
        )
    )
    parser.add_argument(
        "--input-dir",
        required=True,
        help="Carpeta con los CSV de MN Program (por ejemplo: 'MN Program/csv desde sql de bkprogram1')",
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

    input_dir = Path(args.input_dir)
    if args.output_dir is None:
        script_dir = Path(__file__).parent
        output_dir = script_dir
    else:
        output_dir = Path(args.output_dir)

    if not input_dir.exists():
        parser.error(f"La carpeta de entrada no existe: {input_dir}")

    folder_suffix = _extract_folder_suffix(input_dir)
    
    tasks = []

    def add_task(name: str, func):
        if args.solo is None or args.solo == name:
            tasks.append(func)

    add_task(
        "clientes_y_bonos",
        lambda: generar_clientes_y_bonos(
            input_dir, output_dir / f"clientes_y_bonos_{folder_suffix}.csv"
        ),
    )
    add_task(
        "bonos",
        lambda: generar_bonos(input_dir, output_dir / f"bonos_{folder_suffix}.csv"),
    )
    add_task(
        "historial_basica",
        lambda: generar_historial_basica(
            input_dir, output_dir / f"historial_basica_{folder_suffix}.csv"
        ),
    )
    add_task(
        "historial_completa",
        lambda: generar_historial_completa(
            input_dir, output_dir / f"historial_completa_{folder_suffix}.csv"
        ),
    )
    add_task(
        "citas",
        lambda: generar_citas(input_dir, output_dir / f"citas_{folder_suffix}.csv"),
    )

    if not tasks:
        print(
            "[AVISO] No hay tareas a ejecutar. Revisa el parámetro --solo.",
            file=sys.stderr,
        )
        return

    for t in tasks:
        t()


if __name__ == "__main__":
    main()


