const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Utilidades básicas
function firstNoEmpty(...values) {
  for (const v of values) {
    if (v != null && String(v).trim() !== '') {
      return String(v);
    }
  }
  return '';
}

function sanitizeFilename(name) {
  name = path.parse(name).name; // Quitar extensión
  name = name.replace(/[^\w\-_\.]/g, '_');
  name = name.replace(/_+/g, '_');
  return name.trim('_');
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const match = fechaStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return fechaStr;
}

function formatearFechaHora(fechaStr) {
  if (!fechaStr) return "";
  const match = fechaStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return formatearFecha(fechaStr);
}

function formatearHora(fechaStr) {
  if (!fechaStr) return "";
  const match = fechaStr.match(/\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]}:00`;
  }
  return "";
}

// Leer headers de plantilla CSV
function readCSVHeaders(plantillaPath) {
  if (!fs.existsSync(plantillaPath)) {
    console.error(`[AVISO] Plantilla no encontrada: ${plantillaPath}`);
    return [];
  }
  
  const content = fs.readFileSync(plantillaPath, 'utf-8-sig');
  const lines = content.split('\n');
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^\ufeff/, ''));
  return headers.filter(h => h);
}

// Escribir CSV con BOM UTF-8
function writeCSV(outputPath, headers, rows) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const csvWriter = createCsvWriter({
      path: outputPath,
      header: headers.map(h => ({ id: h, title: h })),
      encoding: 'utf8',
      bom: true
    });
    
    csvWriter.writeRecords(rows)
      .then(() => resolve())
      .catch(reject);
  });
}

// Extraer elementos XML usando regex (para archivos grandes)
function extraerElementosXML(xmlPath, tagName) {
  return new Promise((resolve) => {
    const elementos = [];
    const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`<${escapedTag}>(.*?)</${escapedTag}>`, 'gis');
    
    try {
      const content = fs.readFileSync(xmlPath, 'utf-8');
      let match;
      const processedMatches = new Set();
      
      while ((match = pattern.exec(content)) !== null) {
        const matchKey = match[0].substring(0, 100); // Usar inicio del match como clave única
        if (processedMatches.has(matchKey)) continue;
        processedMatches.add(matchKey);
        
        const contenido = match[1];
        const camposPattern = /<([A-Z_][A-Z0-9_]*)>(.*?)<\/\1>/gis;
        const campos = {};
        let campoMatch;
        let campoProcessed = new Set();
        
        while ((campoMatch = camposPattern.exec(contenido)) !== null) {
          const campoKey = campoMatch[0].substring(0, 50);
          if (campoProcessed.has(campoKey)) continue;
          campoProcessed.add(campoKey);
          
          const campoNombre = campoMatch[1];
          const campoValor = campoMatch[2].trim();
          campos[campoNombre] = campoValor;
        }
        
        if (Object.keys(campos).length > 0) {
          elementos.push(campos);
        }
      }
      
      resolve(elementos);
    } catch (e) {
      console.error(`[ERROR] Error leyendo XML: ${e.message}`);
      resolve([]);
    }
  });
}

// Cargar tablas relacionadas
async function cargarTablasRelacionadas(xmlPath) {
  console.log("[INFO] Cargando tablas relacionadas del XML...");
  
  const tablas = {
    'PACIENTE': {},
    'PACIENTE_BONOS': [],
    'CITA_PACIENTE': [],
    'CITA_PACIENTE_CONSULTA': {},
    'TURNO_CITA': {},
    'TIPO_CITA': {},
    'USUARIO': {},
    'USUARIO_DOCTOR': {},
    'TRATAMIENTO': {},
    'PACIENTE_DATOS_PREVIOS': {}
  };
  
  // Cargar PACIENTE
  console.log("  Cargando PACIENTE...");
  const pacientes = await extraerElementosXML(xmlPath, "PACIENTE");
  for (const p of pacientes) {
    const pacId = p.PAC_ID || "";
    if (pacId) {
      tablas['PACIENTE'][pacId] = p;
    }
  }
  console.log(`    ${Object.keys(tablas['PACIENTE']).length} pacientes cargados`);
  
  // Cargar PACIENTE_BONOS
  console.log("  Cargando PACIENTE_BONOS...");
  tablas['PACIENTE_BONOS'] = await extraerElementosXML(xmlPath, "PACIENTE_BONOS");
  console.log(`    ${tablas['PACIENTE_BONOS'].length} bonos cargados`);
  
  // Cargar CITA_PACIENTE
  console.log("  Cargando CITA_PACIENTE...");
  tablas['CITA_PACIENTE'] = await extraerElementosXML(xmlPath, "CITA_PACIENTE");
  console.log(`    ${tablas['CITA_PACIENTE'].length} citas cargadas`);
  
  // Cargar CITA_PACIENTE_CONSULTA
  console.log("  Cargando CITA_PACIENTE_CONSULTA...");
  const consultas = await extraerElementosXML(xmlPath, "CITA_PACIENTE_CONSULTA");
  for (const c of consultas) {
    const cpaId = c.CPA_ID || "";
    if (cpaId) {
      tablas['CITA_PACIENTE_CONSULTA'][cpaId] = c;
    }
  }
  console.log(`    ${Object.keys(tablas['CITA_PACIENTE_CONSULTA']).length} consultas cargadas`);
  
  // Cargar TURNO_CITA
  console.log("  Cargando TURNO_CITA...");
  const turnos = await extraerElementosXML(xmlPath, "TURNO_CITA");
  for (const t of turnos) {
    const tcoId = t.TCO_ID || "";
    if (tcoId) {
      tablas['TURNO_CITA'][tcoId] = t;
    }
  }
  console.log(`    ${Object.keys(tablas['TURNO_CITA']).length} turnos cargados`);
  
  // Cargar TIPO_CITA
  console.log("  Cargando TIPO_CITA...");
  const tipos = await extraerElementosXML(xmlPath, "TIPO_CITA");
  for (const t of tipos) {
    const tciId = t.TCI_ID || "";
    if (tciId) {
      tablas['TIPO_CITA'][tciId] = t;
    }
  }
  console.log(`    ${Object.keys(tablas['TIPO_CITA']).length} tipos de cita cargados`);
  
  // Cargar USUARIO
  console.log("  Cargando USUARIO...");
  const usuarios = await extraerElementosXML(xmlPath, "USUARIO");
  for (const u of usuarios) {
    const usuId = u.USU_ID || "";
    if (usuId) {
      tablas['USUARIO'][usuId] = u;
    }
  }
  console.log(`    ${Object.keys(tablas['USUARIO']).length} usuarios cargados`);
  
  // Cargar USUARIO_DOCTOR
  console.log("  Cargando USUARIO_DOCTOR...");
  const doctores = await extraerElementosXML(xmlPath, "USUARIO_DOCTOR");
  for (const d of doctores) {
    const usuId = d.USU_ID || "";
    if (usuId) {
      tablas['USUARIO_DOCTOR'][usuId] = d;
    }
  }
  console.log(`    ${Object.keys(tablas['USUARIO_DOCTOR']).length} doctores cargados`);
  
  // Cargar TRATAMIENTO
  console.log("  Cargando TRATAMIENTO...");
  const tratamientos = await extraerElementosXML(xmlPath, "TRATAMIENTO");
  for (const t of tratamientos) {
    const traId = t.TRA_ID || "";
    if (traId) {
      tablas['TRATAMIENTO'][traId] = t;
    }
  }
  console.log(`    ${Object.keys(tablas['TRATAMIENTO']).length} tratamientos cargados`);
  
  // Cargar PACIENTE_DATOS_PREVIOS
  console.log("  Cargando PACIENTE_DATOS_PREVIOS...");
  const datosPrevios = await extraerElementosXML(xmlPath, "PACIENTE_DATOS_PREVIOS");
  for (const d of datosPrevios) {
    const pacId = d.PAC_ID || "";
    if (pacId) {
      tablas['PACIENTE_DATOS_PREVIOS'][pacId] = d;
    }
  }
  console.log(`    ${Object.keys(tablas['PACIENTE_DATOS_PREVIOS']).length} datos previos cargados`);
  
  return tablas;
}

function calcularSesionesConsumidas(bono) {
  let sesionesConsumidas = bono.PAC_BON_USOS || "";
  
  if (!sesionesConsumidas) {
    for (const key of Object.keys(bono)) {
      if (key.toUpperCase().includes('CONSUMID') || key.toUpperCase().includes('USOS')) {
        sesionesConsumidas = bono[key] || "";
        if (sesionesConsumidas) break;
      }
    }
  }
  
  if (!sesionesConsumidas) {
    const sesionesTotalesStr = bono.PAC_BON_NUM_SESIONES || "";
    let sesionesSinConsumir = null;
    
    for (const key of Object.keys(bono)) {
      if (key.toUpperCase().includes('SIN_CONSUMIR') || 
          key.toUpperCase().includes('RESTANTES') || 
          key.toUpperCase().includes('DISPONIBLES')) {
        sesionesSinConsumir = bono[key] || "";
        if (sesionesSinConsumir) break;
      }
    }
    
    if (sesionesSinConsumir && sesionesTotalesStr) {
      try {
        const totales = parseInt(parseFloat(sesionesTotalesStr));
        const sinConsumir = parseInt(parseFloat(sesionesSinConsumir));
        sesionesConsumidas = String(totales - sinConsumir);
      } catch (e) {
        // Ignorar error
      }
    }
  }
  
  return sesionesConsumidas;
}

// Generar clientes_y_bonos
async function generarClientesYBonos(xmlPath, tablas, outputPath, plantillaPath) {
  const headers = readCSVHeaders(plantillaPath);
  const pacientes = tablas['PACIENTE'];
  const bonos = tablas['PACIENTE_BONOS'];
  
  const rowsOut = [];
  
  // Crear índice de bonos por PAC_ID
  const bonosPorPaciente = {};
  for (const b of bonos) {
    const pacId = b.PAC_ID || "";
    if (pacId) {
      if (!bonosPorPaciente[pacId]) {
        bonosPorPaciente[pacId] = [];
      }
      bonosPorPaciente[pacId].push(b);
    }
  }
  
  // Generar una fila por cada paciente
  for (const [pacId, paciente] of Object.entries(pacientes)) {
    const bonosPac = bonosPorPaciente[pacId] || [];
    const bono = bonosPac[0] || {};
    
    const nombre = paciente.PAC_NOMBRE || "";
    const apellidos = paciente.PAC_APELLIDOS || "";
    const telefono = paciente.PAC_TELEFONO1 || "";
    
    const row = {};
    for (const h of headers) {
      row[h] = "";
    }
    
    row["Nombre"] = nombre;
    row["Apellidos"] = apellidos;
    row["CIF/NIF"] = paciente.PAC_NIF || "";
    row["Direccion"] = paciente.PAC_DIRECCION || "";
    row["Codigo Postal"] = paciente.PAC_COD_POSTAL || "";
    row["Ciudad"] = paciente.PAC_POBLACION || "";
    row["Provincia"] = paciente.PAC_PROVINCIA || "";
    row["Pais"] = paciente.PAC_PAIS || "";
    row["Email"] = paciente.PAC_EMAIL || "";
    row["Telefono"] = telefono;
    row["Fecha Nacimiento"] = formatearFecha(paciente.PAC_FECHA_NACIMIENTO || "");
    row["Genero"] = paciente.SEX_ID === "1" ? "male" : (paciente.SEX_ID === "2" ? "female" : "");
    row["Notas Medicas"] = paciente.PAC_ANOTACIONES || "";
    row["Nombre Bono"] = bono.PAC_BON_CABECERA || "";
    row["Precio"] = bono.PAC_BON_PRECIO || "";
    row["Sesiones Totales"] = bono.PAC_BON_NUM_SESIONES || "";
    row["Sesiones Consumidas"] = calcularSesionesConsumidas(bono);
    row["Fecha Caducidad"] = formatearFecha(bono.PAC_BON_FECHA_VENCIMIENTO || "");
    row["Notas Bono"] = bono.PAC_BON_CONDICIONES || "";
    
    rowsOut.push(row);
  }
  
  await writeCSV(outputPath, headers, rowsOut);
  console.log(`[OK] Generado ${outputPath} (${rowsOut.length} filas)`);
}

// Generar bonos
async function generarBonos(xmlPath, tablas, outputPath, plantillaPath) {
  const headers = readCSVHeaders(plantillaPath);
  const pacientes = tablas['PACIENTE'];
  const bonos = tablas['PACIENTE_BONOS'];
  
  const outRows = [];
  
  for (const b of bonos) {
    const pacId = b.PAC_ID || "";
    const paciente = pacientes[pacId] || {};
    
    const nombre = paciente.PAC_NOMBRE || "";
    const apellidos = paciente.PAC_APELLIDOS || "";
    const telefono = paciente.PAC_TELEFONO1 || "";
    
    let precio = b.PAC_BON_PRECIO || "";
    if (precio) {
      try {
        precio = String(Math.floor(parseFloat(precio)));
      } catch (e) {
        // Mantener original
      }
    }
    
    const pagado = b.PAC_BON_PAGADO || "";
    let pagadoStr = "";
    let importePagado = "";
    if (pagado && ["1", "S", "SÍ", "SI", "YES", "TRUE"].includes(pagado.toUpperCase())) {
      pagadoStr = "Sí";
      importePagado = precio;
    }
    
    outRows.push({
      "Teléfono": telefono,
      "Nombre Cliente": `${nombre} ${apellidos}`.trim(),
      "Nombre Bono": b.PAC_BON_CABECERA || "",
      "Servicio": "",
      "Sesiones Totales": b.PAC_BON_NUM_SESIONES || "",
      "Sesiones Consumidas": calcularSesionesConsumidas(b),
      "Precio Total": precio,
      "Pagado": pagadoStr,
      "Importe Pagado": importePagado,
      "Fecha Caducidad": formatearFecha(b.PAC_BON_FECHA_VENCIMIENTO || "")
    });
  }
  
  await writeCSV(outputPath, headers, outRows);
  console.log(`[OK] Generado ${outputPath} (${outRows.length} filas)`);
}

// Generar historial_basica
async function generarHistorialBasica(xmlPath, tablas, outputPath, plantillaPath) {
  const headers = readCSVHeaders(plantillaPath);
  const pacientes = tablas['PACIENTE'];
  const consultas = tablas['CITA_PACIENTE_CONSULTA'];
  const citas = tablas['CITA_PACIENTE'];
  
  // Crear índice de citas por CPA_ID
  const citasPorConsulta = {};
  for (const cita of citas) {
    const cpaId = cita.CPA_ID || "";
    if (cpaId) {
      citasPorConsulta[cpaId] = cita;
    }
  }
  
  const outRows = [];
  
  for (const [cpaId, consulta] of Object.entries(consultas)) {
    const cita = citasPorConsulta[cpaId] || {};
    const pacId = cita.PAC_ID || "";
    const paciente = pacientes[pacId] || {};
    
    const telefono = paciente.PAC_TELEFONO1 || "";
    
    const row = {};
    for (const h of headers) {
      row[h] = "";
    }
    
    row["Teléfono"] = telefono;
    row["Descripción Detallada"] = consulta.CPA_DIAGNOSTICO || "";
    row["Diagnóstico"] = consulta.CPA_DIAGNOSTICO || "";
    row["Observaciones"] = consulta.CPA_NOTAS_ODONTOGRAMA || "";
    
    outRows.push(row);
  }
  
  await writeCSV(outputPath, headers, outRows);
  console.log(`[OK] Generado ${outputPath} (${outRows.length} filas)`);
}

// Generar historial_completa
async function generarHistorialCompleta(xmlPath, tablas, outputPath, plantillaPath) {
  const headers = readCSVHeaders(plantillaPath);
  const pacientes = tablas['PACIENTE'];
  const consultas = tablas['CITA_PACIENTE_CONSULTA'];
  const citas = tablas['CITA_PACIENTE'];
  const datosPrevios = tablas['PACIENTE_DATOS_PREVIOS'];
  
  const citasPorConsulta = {};
  for (const cita of citas) {
    const cpaId = cita.CPA_ID || "";
    if (cpaId) {
      citasPorConsulta[cpaId] = cita;
    }
  }
  
  const outRows = [];
  
  for (const [cpaId, consulta] of Object.entries(consultas)) {
    const cita = citasPorConsulta[cpaId] || {};
    const pacId = cita.PAC_ID || "";
    const paciente = pacientes[pacId] || {};
    const datosPac = datosPrevios[pacId] || {};
    
    const telefono = paciente.PAC_TELEFONO1 || "";
    const diagnostico = consulta.CPA_DIAGNOSTICO || "";
    
    const row = {};
    for (const h of headers) {
      row[h] = "";
    }
    
    row["Teléfono Cliente"] = telefono;
    row["Diagnóstico"] = diagnostico;
    row["Descripción Detallada"] = diagnostico;
    row["Observaciones Adicionales"] = consulta.CPA_NOTAS_ODONTOGRAMA || "";
    
    outRows.push(row);
  }
  
  await writeCSV(outputPath, headers, outRows);
  console.log(`[OK] Generado ${outputPath} (${outRows.length} filas)`);
}

// Generar citas
async function generarCitas(xmlPath, tablas, outputPath, plantillaPath) {
  const headers = readCSVHeaders(plantillaPath);
  const pacientes = tablas['PACIENTE'];
  const citas = tablas['CITA_PACIENTE'];
  const turnos = tablas['TURNO_CITA'];
  const tiposCita = tablas['TIPO_CITA'];
  const usuarios = tablas['USUARIO'];
  
  const outRows = [];
  
  for (const cita of citas) {
    const pacId = cita.PAC_ID || "";
    const paciente = pacientes[pacId] || {};
    
    const tcoId = cita.TCO_ID || "";
    const turno = turnos[tcoId] || {};
    
    const tciId = cita.TCI_ID || "";
    const tipoCita = tiposCita[tciId] || {};
    
    const usuId = turno.USU_ID || "";
    const usuario = usuarios[usuId] || {};
    
    const nombreProf = usuario.USU_NOMBRE || "";
    const apellidosProf = usuario.USU_APELLIDOS || "";
    const profesional = `${nombreProf} ${apellidosProf}`.trim() || usuario.USU_USUARIO || "";
    
    const nombrePac = paciente.PAC_NOMBRE || "";
    const apellidosPac = paciente.PAC_APELLIDOS || "";
    const nombreCompleto = `${nombrePac} ${apellidosPac}`.trim();
    
    const telefono = paciente.PAC_TELEFONO1 || "";
    const fechaInicio = cita.CPA_FECHA_INICIO || "";
    
    const minutos = cita.CPA_MINUTOS_CITA || "0";
    const duracion = minutos || "";
    
    let estado = (cita.CPA_ESTADO || "").toLowerCase();
    let status = "pending";
    if (estado.includes('realizad') || estado.includes('complet')) {
      status = "confirmed";
    } else if (estado.includes('cancel')) {
      status = "cancelled";
    }
    
    outRows.push({
      "professional_name": profesional,
      "client_name": nombreCompleto,
      "client_phone": telefono,
      "service_name": tipoCita.TCI_NOMBRE || "",
      "date": formatearFechaHora(fechaInicio),
      "start_time": formatearHora(fechaInicio),
      "end_time": "",
      "duration": duracion,
      "status": status,
      "notes": "",
      "modalidad": "presencial"
    });
  }
  
  await writeCSV(outputPath, headers, outRows);
  console.log(`[OK] Generado ${outputPath} (${outRows.length} filas)`);
}

// Función principal
async function processDRICloud(inputXml, outputDir, plantillasDir) {
  const xmlSuffix = sanitizeFilename(path.basename(inputXml));
  
  console.log(`[INFO] Procesando XML: ${path.basename(inputXml)}`);
  console.log(`[INFO] Sufijo para archivos de salida: ${xmlSuffix}`);
  
  // Cargar tablas del XML
  const tablas = await cargarTablasRelacionadas(inputXml);
  
  // Rutas de plantillas
  const plantillaClientesYBonos = path.join(plantillasDir, "plantilla_clientes_y_bonos.csv");
  const plantillaBonos = path.join(plantillasDir, "plantilla_bonos.csv");
  const plantillaHistorialBasica = path.join(plantillasDir, "plantilla_historial_basica.csv");
  const plantillaHistorialCompleta = path.join(plantillasDir, "plantilla_historial_completa.csv");
  const plantillaCitas = path.join(plantillasDir, "plantilla-citas.csv");
  
  await generarClientesYBonos(
    inputXml, tablas,
    path.join(outputDir, `clientes_y_bonos_${xmlSuffix}.csv`),
    plantillaClientesYBonos
  );
  
  await generarBonos(
    inputXml, tablas,
    path.join(outputDir, `bonos_${xmlSuffix}.csv`),
    plantillaBonos
  );
  
  await generarHistorialBasica(
    inputXml, tablas,
    path.join(outputDir, `historial_basica_${xmlSuffix}.csv`),
    plantillaHistorialBasica
  );
  
  await generarHistorialCompleta(
    inputXml, tablas,
    path.join(outputDir, `historial_completa_${xmlSuffix}.csv`),
    plantillaHistorialCompleta
  );
  
  await generarCitas(
    inputXml, tablas,
    path.join(outputDir, `citas_${xmlSuffix}.csv`),
    plantillaCitas
  );
  
  console.log(`\n[OK] Proceso completado. Archivos generados en: ${outputDir}`);
}

module.exports = { processDRICloud };

