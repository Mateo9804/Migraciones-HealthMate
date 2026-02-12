const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
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
  name = name.replace(/[^\w\-_\.]/g, '_');
  name = name.replace(/_+/g, '_');
  return name.trim('_');
}

function extractFolderSuffix(inputDir) {
  const folderName = path.basename(inputDir);
  const patterns = [
    /bkprogram\d+/i,
    /\d+_adv\w+/i,
    /[a-zA-Z0-9_]+/i,
  ];
  
  for (const pattern of patterns) {
    const match = folderName.match(pattern);
    if (match) {
      return sanitizeFilename(match[0]);
    }
  }
  
  return sanitizeFilename(folderName);
}

// Leer CSV con manejo de encoding
// IMPORTANTE: priorizamos latin1 porque los CSV de MN Program suelen venir en Windows‑1252
function readCSV(filePath) {
  return new Promise((resolve) => {
    console.log(`[DEBUG] readCSV: leyendo ${filePath}`);
    const rows = [];
    // latin1 primero para que acentos/ñ salgan bien
    const encodings = ['latin1', 'utf-8-sig', 'utf8'];
    let currentEncoding = 0;
    let headersSeen = false;

    function tryRead() {
      if (currentEncoding >= encodings.length) {
        console.log(
          `[DEBUG] readCSV: se intentaron todos los encodings, filas leídas: ${rows.length}`,
        );
        resolve(rows);
        return;
      }

      const encoding = encodings[currentEncoding];
      console.log(`[DEBUG] readCSV: intentando encoding ${encoding}`);
      const stream = fs.createReadStream(filePath, { encoding });

      rows.length = 0;
      headersSeen = false;

      stream
        .pipe(csv())
        .on('data', (row) => {
          if (!headersSeen) {
            console.log(
              `[DEBUG] readCSV: headers encontrados (${encoding}):`,
              Object.keys(row).slice(0, 10),
            );
            headersSeen = true;
          }

          // Limpiar BOM de las claves
          const cleanedRow = {};
          for (const [key, value] of Object.entries(row)) {
            const cleanKey = key.replace(/^\ufeff/, '').trim();
            cleanedRow[cleanKey] = value;
          }
          rows.push(cleanedRow);
        })
        .on('end', () => {
          console.log(
            `[DEBUG] readCSV: lectura completada con encoding ${encoding}, ${rows.length} filas`,
          );
          resolve(rows);
        })
        .on('error', (err) => {
          console.log(
            `[DEBUG] readCSV: error con encoding ${encoding}:`,
            err && err.message ? err.message : err,
          );
          currentEncoding += 1;
          tryRead();
        });
    }

    tryRead();
  });
}

// Escribir CSV con BOM UTF-8
function writeCSV(outputPath, headers, rows) {
  return new Promise((resolve, reject) => {
    // Crear directorio si no existe
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

// Cargar clientes
async function loadClientes(inputDir) {
  console.log(`[DEBUG] loadClientes: buscando en ${inputDir}`);
  
  // Buscar archivo clientes.csv (puede tener diferentes nombres)
  const possibleNames = ['clientes.csv', 'Clientes.csv', 'CLIENTES.csv'];
  let clientesPath = null;
  
  for (const name of possibleNames) {
    const testPath = path.join(inputDir, name);
    if (fs.existsSync(testPath)) {
      clientesPath = testPath;
      console.log(`[DEBUG] Encontrado: ${testPath}`);
      break;
    }
  }
  
  // Si no se encuentra con esos nombres, buscar cualquier CSV
  if (!clientesPath) {
    console.log(`[DEBUG] No se encontró clientes.csv, buscando cualquier CSV en ${inputDir}`);
    const files = fs.readdirSync(inputDir);
    console.log(`[DEBUG] Archivos en inputDir:`, files);
    
    for (const file of files) {
      if (file.toLowerCase().includes('cliente') && file.toLowerCase().endsWith('.csv')) {
        clientesPath = path.join(inputDir, file);
        console.log(`[DEBUG] Usando archivo: ${clientesPath}`);
        break;
      }
    }
    
    // Si aún no se encuentra, usar el primer CSV
    if (!clientesPath) {
      for (const file of files) {
        if (file.toLowerCase().endsWith('.csv')) {
          clientesPath = path.join(inputDir, file);
          console.log(`[DEBUG] Usando primer CSV encontrado: ${clientesPath}`);
          break;
        }
      }
    }
  }
  
  if (!clientesPath || !fs.existsSync(clientesPath)) {
    console.error(`[AVISO] No se encontró archivo de clientes en ${inputDir}`);
    console.error(`[AVISO] Archivos disponibles:`, fs.existsSync(inputDir) ? fs.readdirSync(inputDir) : 'directorio no existe');
    return {};
  }
  
  console.log(`[DEBUG] Leyendo clientes desde: ${clientesPath}`);
  const rows = await readCSV(clientesPath);
  console.log(`[DEBUG] Filas leídas: ${rows.length}`);
  
  if (rows.length === 0) {
    console.error('[AVISO] clientes.csv no tiene filas de datos');
    return {};
  }
  
  console.log(`[DEBUG] Primera fila (muestra):`, Object.keys(rows[0]));
  console.log(`[DEBUG] Primeras claves:`, Object.keys(rows[0]).slice(0, 5));
  
  const clientes = {};
  const sample = rows[0];
  const bom = '\ufeff';
  const possibleKeys = ['icodcli', 'ICODCLI', 'IdCliente', 'idcliente', 'id'];
  let keyField = null;
  
  for (const cand of possibleKeys) {
    for (const realKey of Object.keys(sample)) {
      const cleanKey = realKey.replace(/^\ufeff/, '').trim();
      if (cleanKey.toLowerCase() === cand.toLowerCase()) {
        keyField = realKey;
        console.log(`[DEBUG] Clave encontrada: '${realKey}' (limpia: '${cleanKey}')`);
        break;
      }
    }
    if (keyField) break;
  }
  
  if (!keyField) {
    keyField = Object.keys(sample)[0];
    const cleanKey = keyField.replace(/^\ufeff/, '').trim();
    console.error(`[AVISO] No se encontró columna 'icodcli'; se usará: '${cleanKey}'`);
  }
  
  for (const r of rows) {
    const key = r[keyField];
    if (key) {
      clientes[String(key)] = r;
    }
  }
  
  const cleanKey = keyField.replace(/^\ufeff/, '').trim();
  console.log(`[INFO] Cargados ${Object.keys(clientes).length} clientes (clave: '${cleanKey}')`);
  return clientes;
}

// Headers de plantillas
const PLANTILLA_CLIENTES_Y_BONOS_HEADERS = [
  "Nombre", "Apellidos", "CIF/NIF", "Direccion", "Codigo Postal", "Ciudad",
  "Provincia", "Pais", "Email", "Telefono", "Tipo Cliente", "Fecha Nacimiento",
  "Genero", "Notas Medicas", "Fecha seguimiento", "Tipo seguimiento",
  "Descripción", "Recomendaciones", "Nombre Bono", "Servicio", "Precio",
  "Sesiones Totales", "Sesiones Consumidas", "Fecha Caducidad", "Notas Bono"
];

const PLANTILLA_BONOS_HEADERS = [
  "Teléfono", "Nombre Cliente", "Nombre Bono", "Servicio", "Sesiones Totales",
  "Sesiones Consumidas", "Precio Total", "Pagado", "Importe Pagado", "Fecha Caducidad"
];

const PLANTILLA_HISTORIAL_BASICA_HEADERS = [
  "Teléfono", "Profesional", "Motivo Consulta", "Tiempo Evolución",
  "Descripción Detallada", "Enfermedades Crónicas", "Alergias Medicamentosas",
  "Medicación Habitual", "Diagnóstico", "Recomendaciones", "Observaciones"
];

const PLANTILLA_HISTORIAL_COMPLETA_HEADERS = [
  "Teléfono Cliente", "Profesional", "Motivo Consulta", "Tiempo Evolución",
  "Descripción Detallada", "Inicio Evolución", "Factores Agravantes", "Factores Atenuantes",
  "Intensidad Síntomas", "Frecuencia Síntomas", "Localización", "Impacto Vida Diaria",
  "Enfermedades Crónicas", "Enfermedades Agudas", "Cirugías Previas", "Alergias Medicamentosas",
  "Alergias Alimentarias", "Alergias Ambientales", "Medicación Habitual", "Hospitalizaciones Previas",
  "Accidentes/Traumatismos", "Enfermedades Hereditarias", "Patologías Padres", "Patologías Hermanos",
  "Patologías Abuelos", "Alimentación", "Actividad Física", "Consumo Tabaco", "Cantidad Tabaco",
  "Tiempo Tabaco", "Consumo Alcohol", "Cantidad Alcohol", "Frecuencia Alcohol", "Otras Sustancias",
  "Calidad Sueño", "Horas Sueño", "Nivel Estrés", "Apetito", "Digestión", "Evacuaciones",
  "Frecuencia Evacuaciones", "Consistencia Evacuaciones", "Cambios Evacuaciones", "Náuseas/Vómitos",
  "Reflujo", "Frecuencia Urinaria", "Dolor al Urinar", "Incontinencia", "Cambios Color Orina",
  "Cambios Olor Orina", "Palpitaciones", "Disnea", "Dolor Torácico", "Tos", "Esputo",
  "Dolor Articular", "Dolor Muscular", "Limitaciones Movimiento", "Debilidad/Fatiga",
  "Mareos/Vértigo", "Pérdida Sensibilidad", "Pérdida Fuerza", "Cefaleas", "Alteraciones Visuales",
  "Alteraciones Auditivas", "Estado Ánimo", "Ansiedad", "Depresión", "Cambios Conducta",
  "Trastornos Sueño", "Sistema Cutáneo", "Sistema Endocrino", "Sistema Hematológico",
  "Tensión Arterial", "Frecuencia Cardíaca", "Frecuencia Respiratoria", "Temperatura",
  "Saturación O2", "Peso", "Talla", "IMC", "Observaciones Clínicas", "Pruebas Complementarias",
  "Diagnóstico", "Medicación Prescrita", "Recomendaciones", "Derivaciones", "Seguimiento",
  "Observaciones Adicionales"
];

const PLANTILLA_CITAS_HEADERS = [
  "professional_name", "client_phone", "service_name", "date", "start_time",
  "end_time", "duration", "status", "notes", "modalidad"
];

// Generar clientes_y_bonos
async function generarClientesYBonos(inputDir, outputPath) {
  console.log(`[DEBUG] generarClientesYBonos: inputDir=${inputDir}, outputPath=${outputPath}`);
  const clientes = await loadClientes(inputDir);
  console.log(`[DEBUG] Clientes cargados: ${Object.keys(clientes).length}`);
  
  const rowsOut = [];
  
  // Si no hay clientes, mostrar muestra de qué hay disponible
  if (Object.keys(clientes).length === 0) {
    console.error(`[ERROR] No se cargaron clientes. Verifica que el archivo clientes.csv existe en ${inputDir}`);
    // Intentar listar archivos disponibles
    if (fs.existsSync(inputDir)) {
      const files = fs.readdirSync(inputDir);
      console.error(`[ERROR] Archivos disponibles en inputDir:`, files);
    }
  }
  
  for (const cli of Object.values(clientes)) {
    // Intentar múltiples variantes de nombres de columnas
    const nombreCompleto = firstNoEmpty(
      cli.snombrecli, cli.SNOMBRECLI, cli.nombre, cli.NOMBRE,
      cli.Nombre, cli.sNombreCli, cli.s_nombre_cli
    ).trim();
    
    console.log(`[DEBUG] Procesando cliente: nombre=${nombreCompleto}, claves disponibles:`, Object.keys(cli).slice(0, 10));
    
    rowsOut.push({
      "Nombre": nombreCompleto,
      "Apellidos": "",
      "CIF/NIF": firstNoEmpty(cli.snifcli, cli.SNIFCLI, cli.nif, cli.NIF, cli.dni, cli.DNI),
      "Direccion": firstNoEmpty(cli.sdomiciliocli, cli.SDOMICILIOCLI, cli.direccion, cli.DIRECCION, cli.domicilio),
      "Codigo Postal": firstNoEmpty(cli.scodpostalcli, cli.SCODPOSTALCLI, cli.codpostal, cli.CODPOSTAL, cli.cp, cli.CP),
      "Ciudad": firstNoEmpty(cli.spoblacioncli, cli.SPOBLACIONCLI, cli.poblacion, cli.POBLACION, cli.ciudad, cli.CIUDAD),
      "Provincia": firstNoEmpty(cli.sprovinciacli, cli.SPROVINCIACLI, cli.provincia, cli.PROVINCIA),
      "Pais": firstNoEmpty(cli.sNombrePais, cli.SNOMBREPAIS, cli.pais, cli.PAIS, "España"),
      "Email": firstNoEmpty(cli.email, cli.EMAIL, cli.correo, cli.CORREO),
      "Telefono": firstNoEmpty(cli.smovilcli, cli.SMOVILCLI, cli.stelefonocli, cli.STELEFONOCLI, cli.telefono, cli.TELEFONO),
      "Tipo Cliente": firstNoEmpty(cli.NaturJuridica, cli.NATURJURIDICA, cli.tipo, cli.TIPO),
      "Fecha Nacimiento": firstNoEmpty(cli.fechanacimiento, cli.FECHANACIMIENTO, cli.fecha_nac, cli.FECHA_NAC),
      "Genero": firstNoEmpty(cli.sexo, cli.SEXO, cli.genero, cli.GENERO),
      "Notas Medicas": firstNoEmpty(cli.textoalerta, cli.TEXTOALERTA, cli.notas, cli.NOTAS),
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
      "Notas Bono": ""
    });
  }
  
  console.log(`[DEBUG] Filas generadas: ${rowsOut.length}`);
  await writeCSV(outputPath, PLANTILLA_CLIENTES_Y_BONOS_HEADERS, rowsOut);
  console.log(`[OK] Generado ${outputPath} (${rowsOut.length} filas)`);
}

// Generar bonos
async function generarBonos(inputDir, outputPath) {
  const clientes = await loadClientes(inputDir);
  const bonosPath = path.join(inputDir, 'Bonos.csv');
  const bonosRows = fs.existsSync(bonosPath) ? await readCSV(bonosPath) : [];
  
  const outRows = [];
  
  for (const b of bonosRows) {
    const icodcli = b.icodcliClientes || "";
    const cli = clientes[icodcli] || {};
    
    const telefono = firstNoEmpty(cli.smovilcli, cli.stelefonocli);
    const nombreCliente = cli.snombrecli || "";
    
    outRows.push({
      "Teléfono": telefono,
      "Nombre Cliente": nombreCliente,
      "Nombre Bono": b.Descripcion || "",
      "Servicio": "",
      "Sesiones Totales": b.unidades || "",
      "Sesiones Consumidas": "",
      "Precio Total": b.Importe || "",
      "Pagado": "",
      "Importe Pagado": "",
      "Fecha Caducidad": b.FechaCaducidad || ""
    });
  }
  
  await writeCSV(outputPath, PLANTILLA_BONOS_HEADERS, outRows);
  console.log(`[OK] Generado ${outputPath} (${outRows.length} filas)`);
}

// Generar historial_basica
async function generarHistorialBasica(inputDir, outputPath) {
  const clientes = await loadClientes(inputDir);
  const diagnosticoPath = path.join(inputDir, 'diagnosticoPac.csv');
  const diagnosticoRows = fs.existsSync(diagnosticoPath) ? await readCSV(diagnosticoPath) : [];
  
  const outRows = [];
  
  for (const diag of diagnosticoRows) {
    const icodcli = diag.icodcli || "";
    const cli = clientes[icodcli] || {};
    
    const telefono = firstNoEmpty(cli.smovilcli, cli.stelefonocli);
    
    let fecha = diag.dfecha || "";
    if (fecha && fecha.length >= 10) {
      const fechaParts = fecha.split(' ')[0];
      fecha = fechaParts;
    }
    
    outRows.push({
      "Teléfono": telefono,
      "Profesional": "",
      "Motivo Consulta": "",
      "Tiempo Evolución": "",
      "Descripción Detallada": diag.diagnostico || "",
      "Enfermedades Crónicas": "",
      "Alergias Medicamentosas": "",
      "Medicación Habitual": "",
      "Diagnóstico": diag.diagnostico || "",
      "Recomendaciones": "",
      "Observaciones": `Tipo: ${diag.tipo || ''} | Fecha: ${fecha}`
    });
  }
  
  await writeCSV(outputPath, PLANTILLA_HISTORIAL_BASICA_HEADERS, outRows);
  console.log(`[OK] Generado ${outputPath} (${outRows.length} filas)`);
}

// Generar historial_completa
async function generarHistorialCompleta(inputDir, outputPath) {
  const clientes = await loadClientes(inputDir);
  const diagnosticoPath = path.join(inputDir, 'diagnosticoPac.csv');
  const diagnosticoRows = fs.existsSync(diagnosticoPath) ? await readCSV(diagnosticoPath) : [];
  
  const outRows = [];
  
  for (const diag of diagnosticoRows) {
    const icodcli = diag.icodcli || "";
    const cli = clientes[icodcli] || {};
    
    const telefono = firstNoEmpty(cli.smovilcli, cli.stelefonocli);
    
    let fecha = diag.dfecha || "";
    if (fecha && fecha.length >= 10) {
      const fechaParts = fecha.split(' ')[0];
      fecha = fechaParts;
    }
    
    const observaciones = [];
    if (diag.tipo) observaciones.push(`Tipo: ${diag.tipo}`);
    if (diag.principal) observaciones.push(`Principal: ${diag.principal}`);
    if (diag.codigocie9) observaciones.push(`CIE-9: ${diag.codigocie9}`);
    const observacionesText = observaciones.join(' | ');
    
    const row = {};
    for (const h of PLANTILLA_HISTORIAL_COMPLETA_HEADERS) {
      row[h] = "";
    }
    
    row["Teléfono Cliente"] = telefono;
    row["Diagnóstico"] = diag.diagnostico || "";
    row["Descripción Detallada"] = diag.diagnostico || "";
    row["Observaciones Clínicas"] = observacionesText;
    row["Observaciones Adicionales"] = `Fecha: ${fecha} | Estado: ${diag.estado || ''}`;
    
    outRows.push(row);
  }
  
  await writeCSV(outputPath, PLANTILLA_HISTORIAL_COMPLETA_HEADERS, outRows);
  console.log(`[OK] Generado ${outputPath} (${outRows.length} filas)`);
}

// Generar citas
async function generarCitas(inputDir, outputPath) {
  const clientes = await loadClientes(inputDir);
  const eventsPath = path.join(inputDir, 'events.csv');
  const eventsitPath = path.join(inputDir, 'eventsit.csv');
  
  const eventsRows = fs.existsSync(eventsPath) ? await readCSV(eventsPath) : [];
  const eventsitRows = fs.existsSync(eventsitPath) ? await readCSV(eventsitPath) : [];
  
  const eventsitByEventid = {};
  for (const eit of eventsitRows) {
    const eventid = eit.eventid || "";
    if (eventid) {
      eventsitByEventid[eventid] = eit;
    }
  }
  
  const outRows = [];
  
  for (const ev of eventsRows) {
    let contactId = firstNoEmpty(ev.contactid, ev.contact, ev.icodcli);
    
    if (!contactId) {
      const eventid = ev.eventid || "";
      if (eventid && eventsitByEventid[eventid]) {
        const eit = eventsitByEventid[eventid];
        contactId = eit.contactid || eit.icodcli || "";
      }
    }
    
    const cli = clientes[contactId] || {};
    const nombreCli = firstNoEmpty(cli.snombrecli, cli.nombre, cli.name);
    const apellidosCli = firstNoEmpty(cli.sapellidoscli, cli.apellidos, cli.surname);
    const nombreCompleto = `${nombreCli} ${apellidosCli}`.trim();
    const telefono = firstNoEmpty(cli.smovilcli, cli.stelefonocli);
    
    let startDate = ev.startdate || "";
    let startTime = ev.starttime || "";
    let endTime = ev.endtime || "";
    
    const startDatetime = ev.startdatetime || "";
    if (startDatetime && !startDate) {
      const parts = startDatetime.split(' ');
      if (parts.length >= 2) {
        startDate = parts[0];
        if (!startTime) {
          startTime = parts[1].substring(0, 8);
        }
      }
    }
    
    let duration = ev.durationminutes || "";
    
    let status = (ev.status || "").toLowerCase();
    if (status.includes('done') || status.includes('complet') || ev.done === 'True') {
      status = "confirmed";
    } else if (status.includes('pending') || status.includes('pendiente')) {
      status = "pending";
    } else if (status.includes('cancel')) {
      status = "cancelled";
    } else {
      status = status || "pending";
    }
    
    let modalidad = "presencial";
    const location = (ev.location || "").toLowerCase();
    if (location.includes('online') || location.includes('virtual') || location.includes('tele')) {
      modalidad = "online";
    }
    
    outRows.push({
      "professional_name": ev.resourceid ? `Prof_${ev.resourceid.trim()}` : "",
      "client_name": nombreCompleto,
      "client_phone": telefono,
      "service_name": ev.subject || "",
      "date": startDate,
      "start_time": startTime,
      "end_time": endTime,
      "duration": duration,
      "status": status,
      "notes": ev.notes || "",
      "modalidad": modalidad
    });
  }
  
  await writeCSV(outputPath, PLANTILLA_CITAS_HEADERS, outRows);
  console.log(`[OK] Generado ${outputPath} (${outRows.length} filas)`);
}

// Función principal
async function processMNProgram(inputDir, outputDir) {
  try {
    console.log(`[INFO] processMNProgram iniciado`);
    console.log(`[INFO] inputDir: ${inputDir}`);
    console.log(`[INFO] outputDir: ${outputDir}`);
    
    // Asegurar que outputDir existe
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`[INFO] Creado outputDir: ${outputDir}`);
    }
    
    const folderSuffix = extractFolderSuffix(inputDir);
    console.log(`[INFO] folderSuffix: ${folderSuffix}`);
    
    await generarClientesYBonos(
      inputDir,
      path.join(outputDir, `clientes_y_bonos_${folderSuffix}.csv`)
    );
    
    await generarBonos(
      inputDir,
      path.join(outputDir, `bonos_${folderSuffix}.csv`)
    );
    
    await generarHistorialBasica(
      inputDir,
      path.join(outputDir, `historial_basica_${folderSuffix}.csv`)
    );
    
    await generarHistorialCompleta(
      inputDir,
      path.join(outputDir, `historial_completa_${folderSuffix}.csv`)
    );
    
    await generarCitas(
      inputDir,
      path.join(outputDir, `citas_${folderSuffix}.csv`)
    );
    
    console.log(`\n[OK] Proceso completado. Archivos generados en: ${outputDir}`);
    
    // Verificar que los archivos se crearon
    const files = fs.readdirSync(outputDir);
    console.log(`[INFO] Archivos en outputDir:`, files);
  } catch (error) {
    console.error(`[ERROR] Error en processMNProgram:`, error);
    throw error;
  }
}

module.exports = { processMNProgram };

