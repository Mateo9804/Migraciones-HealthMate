const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const pako = require('pako');

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
  name = path.parse(name).name;
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
  if (fechaStr.match(/\d{2}\/\d{2}\/\d{4}/)) {
    return fechaStr;
  }
  return fechaStr;
}

function formatearHora(fechaStr) {
  if (!fechaStr) return "";
  const match = fechaStr.match(/\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]}:00`;
  }
  return "";
}

// Cabeceras fijas de las plantillas (fallback cuando no se encuentra la plantilla en disco)
const PLANTILLA_CLIENTES_Y_BONOS_HEADERS = [
  "Nombre","Apellidos","CIF/NIF","Direccion","Codigo Postal","Ciudad","Provincia",
  "Pais","Email","Telefono","Tipo Cliente","Fecha Nacimiento","Genero","Notas Medicas",
  "Fecha seguimiento","Tipo seguimiento","Descripción","Recomendaciones",
  "Nombre Bono","Servicio","Precio","Sesiones Totales","Sesiones Consumidas",
  "Fecha Caducidad","Notas Bono"
];

const PLANTILLA_BONOS_HEADERS = [
  "Teléfono","Nombre Cliente","Nombre Bono","Servicio","Sesiones Totales",
  "Sesiones Consumidas","Precio Total","Pagado","Importe Pagado","Fecha Caducidad"
];

const PLANTILLA_HISTORIAL_BASICA_HEADERS = [
  "Teléfono","Profesional","Motivo Consulta","Tiempo Evolución",
  "Descripción Detallada","Enfermedades Crónicas","Alergias Medicamentosas",
  "Medicación Habitual","Diagnóstico","Recomendaciones","Observaciones"
];

const PLANTILLA_HISTORIAL_COMPLETA_HEADERS = [
  "Teléfono Cliente","Profesional","Motivo Consulta","Tiempo Evolución",
  "Descripción Detallada","Inicio Evolución","Factores Agravantes","Factores Atenuantes",
  "Intensidad Síntomas","Frecuencia Síntomas","Localización","Impacto Vida Diaria",
  "Enfermedades Crónicas","Enfermedades Agudas","Cirugías Previas","Alergias Medicamentosas",
  "Alergias Alimentarias","Alergias Ambientales","Medicación Habitual","Hospitalizaciones Previas",
  "Accidentes/Traumatismos","Enfermedades Hereditarias","Patologías Padres","Patologías Hermanos",
  "Patologías Abuelos","Alimentación","Actividad Física","Consumo Tabaco","Cantidad Tabaco",
  "Tiempo Tabaco","Consumo Alcohol","Cantidad Alcohol","Frecuencia Alcohol","Otras Sustancias",
  "Calidad Sueño","Horas Sueño","Nivel Estrés","Apetito","Digestión","Evacuaciones",
  "Frecuencia Evacuaciones","Consistencia Evacuaciones","Cambios Evacuaciones","Náuseas/Vómitos",
  "Reflujo","Frecuencia Urinaria","Dolor al Urinar","Incontinencia","Cambios Color Orina",
  "Cambios Olor Orina","Palpitaciones","Disnea","Dolor Torácico","Tos","Esputo",
  "Dolor Articular","Dolor Muscular","Limitaciones Movimiento","Debilidad/Fatiga",
  "Mareos/Vértigo","Pérdida Sensibilidad","Pérdida Fuerza","Cefaleas","Alteraciones Visuales",
  "Alteraciones Auditivas","Estado Ánimo","Ansiedad","Depresión","Cambios Conducta",
  "Trastornos Sueño","Sistema Cutáneo","Sistema Endocrino","Sistema Hematológico",
  "Tensión Arterial","Frecuencia Cardíaca","Frecuencia Respiratoria","Temperatura",
  "Saturación O2","Peso","Talla","IMC","Observaciones Clínicas","Pruebas Complementarias",
  "Diagnóstico","Medicación Prescrita","Recomendaciones","Derivaciones","Seguimiento",
  "Observaciones Adicionales"
];

const PLANTILLA_CITAS_HEADERS = [
  "professional_name","client_phone","service_name","date","start_time",
  "end_time","duration","status","notes","modalidad"
];

// Leer headers de plantilla con fallback
function readCSVHeaders(plantillaPath, fallbackHeaders) {
  if (!fs.existsSync(plantillaPath)) {
    console.error(
      `[AVISO] Plantilla no encontrada: ${plantillaPath}, usando fallback en memoria`,
    );
    return fallbackHeaders;
  }

  try {
    const content = fs.readFileSync(plantillaPath, 'utf-8-sig');
    const lines = content.split('\n');
    if (lines.length === 0) return fallbackHeaders;

    const headers = lines[0]
      .split(',')
      .map((h) => h.trim().replace(/^\ufeff/, ''))
      .filter(Boolean);

    if (!headers.length) {
      console.error(
        `[AVISO] La plantilla ${plantillaPath} no tiene cabeceras válidas, usando fallback`,
      );
      return fallbackHeaders;
    }

    return headers;
  } catch (e) {
    console.error(`[ERROR] Leyendo plantilla ${plantillaPath}:`, e.message);
    return fallbackHeaders;
  }
}

// Escribir CSV con BOM
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

// Detectar formato de archivo
function detectarFormatoArchivo(filePath) {
  const header = Buffer.alloc(10);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, header, 0, 10, 0);
  fs.closeSync(fd);
  
  // Verificar si es gzip
  if (header[0] === 0x1f && header[1] === 0x8b) {
    return 'gz';
  }
  
  // Verificar extensión
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.gz') return 'gz';
  if (ext === '.json') return 'json';
  if (ext === '.csv') return 'csv';
  if (ext === '.xml') return 'xml';
  if (ext === '.txt') return 'txt';
  
  return 'txt';
}

// Leer archivo CLINNI
async function leerArchivoClinni(filePath) {
  const formato = detectarFormatoArchivo(filePath);
  console.log(`[INFO] Formato detectado: ${formato}`);
  
  let datosRaw = null;
  
  try {
    if (formato === 'gz') {
      const compressed = fs.readFileSync(filePath);
      let decompressed;
      try {
        decompressed = pako.inflate(compressed, { to: 'string' });
      } catch (e) {
        // Si falla con pako, intentar con zlib nativo
        const zlib = require('zlib');
        decompressed = zlib.gunzipSync(compressed).toString('utf-8');
      }
      
      // Intentar como JSON
      if (decompressed.trim().startsWith('{') || decompressed.trim().startsWith('[')) {
        try {
          datosRaw = JSON.parse(decompressed);
        } catch (e) {
          // Si falla JSON, intentar como CSV
          datosRaw = await parseCSVFromString(decompressed);
        }
      } else {
        // Intentar como CSV
        datosRaw = await parseCSVFromString(decompressed);
      }
    } else if (formato === 'json') {
      const content = fs.readFileSync(filePath, 'utf-8');
      datosRaw = JSON.parse(content);
    } else if (formato === 'csv') {
      datosRaw = await readCSV(filePath);
    } else if (formato === 'xml') {
      datosRaw = await leerXMLBasico(filePath);
    } else {
      // txt o desconocido - intentar como CSV
      try {
        datosRaw = await readCSV(filePath);
      } catch (e) {
        datosRaw = leerTextoEstructurado(filePath);
      }
    }
  } catch (e) {
    console.error(`[ERROR] Error leyendo archivo: ${e.message}`);
    return { pacientes: [], bonos: [], citas: [], historial: [] };
  }
  
  return procesarDatosClinni(datosRaw);
}

// Parsear CSV desde string
function parseCSVFromString(content) {
  return new Promise((resolve) => {
    const rows = [];
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      resolve([]);
      return;
    }
    
    // Intentar detectar delimitador
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';
    const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
    
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || "";
        });
        rows.push(row);
      }
    }
    
    resolve(rows);
  });
}

// Leer CSV
function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath, { encoding: 'utf-8' })
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

// Leer XML básico
async function leerXMLBasico(filePath) {
  const elementos = [];
  const tagsComunes = ['PACIENTE', 'CLIENTE', 'CITA', 'BONO', 'HISTORIAL', 'CONSULTA'];
  
  for (const tag of tagsComunes) {
    const pattern = new RegExp(`<${tag}>(.*?)</${tag}>`, 'gis');
    const content = fs.readFileSync(filePath, 'utf-8');
    let match;
    
    while ((match = pattern.exec(content)) !== null) {
      const contenido = match[1];
      const camposPattern = /<([A-Z_][A-Z0-9_]*)>(.*?)<\/\1>/gis;
      const campos = {};
      let campoMatch;
      
      while ((campoMatch = camposPattern.exec(contenido)) !== null) {
        const campoNombre = campoMatch[1];
        const campoValor = campoMatch[2].trim();
        campos[campoNombre] = campoValor;
      }
      
      if (Object.keys(campos).length > 0) {
        elementos.push(campos);
      }
    }
    
    if (elementos.length > 0) break;
  }
  
  return elementos;
}

// Leer texto estructurado
function leerTextoEstructurado(filePath) {
  const datos = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  // Si parece JSON por líneas
  if (lines.some(l => l.trim().startsWith('{'))) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        try {
          datos.push(JSON.parse(trimmed));
        } catch (e) {
          // Ignorar
        }
      }
    }
  } else if (lines.some(l => l.includes(',') || l.includes(';'))) {
    // Intentar como CSV manualmente
    if (lines.length > 0) {
      const headers = lines[0].split(/[,;]/).map(h => h.trim());
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(/[,;]/).map(v => v.trim());
          const row = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx] || "";
          });
          datos.push(row);
        }
      }
    }
  } else {
    // Parsear como clave=valor
    for (const line of lines) {
      if (line.includes('=')) {
        const partes = line.split('=', 2);
        if (partes.length === 2) {
          datos.push({ [partes[0].trim()]: partes[1].trim() });
        }
      }
    }
  }
  
  return datos;
}

// Procesar datos CLINNI
function procesarDatosClinni(datosRaw) {
  const estructurado = {
    pacientes: [],
    bonos: [],
    citas: [],
    historial: []
  };
  
  if (typeof datosRaw === 'object' && !Array.isArray(datosRaw)) {
    // Es un diccionario (JSON estructurado)
    for (const key of Object.keys(datosRaw)) {
      const keyLower = key.toLowerCase();
      if (keyLower.includes('paciente') || keyLower.includes('patient') || keyLower.includes('cliente')) {
        const pacientes = Array.isArray(datosRaw[key]) ? datosRaw[key] : [datosRaw[key]];
        for (const paciente of pacientes) {
          estructurado.pacientes.push(paciente);
          
          // Extraer procesos, citas, evoluciones
          const procesos = paciente.procesos || [];
          for (const proceso of procesos) {
            const citasProceso = proceso.citas || [];
            for (const cita of citasProceso) {
              cita.PAC_ID = paciente.dni || paciente.id;
              cita.PACIENTE = paciente;
              estructurado.citas.push(cita);
            }
            
            const evoluciones = proceso.evoluciones || [];
            for (const evolucion of evoluciones) {
              const evol = typeof evolucion === 'object' ? evolucion : { contenido: String(evolucion) };
              evol.PAC_ID = paciente.dni || paciente.id;
              evol.PACIENTE = paciente;
              evol.PROCESO = proceso;
              estructurado.historial.push(evol);
            }
            
            if (proceso.diagnostico || proceso.titulo || proceso.evoluciones) {
              proceso.PAC_ID = paciente.dni || paciente.id;
              proceso.PACIENTE = paciente;
              estructurado.historial.push(proceso);
            }
          }
        }
      } else if (keyLower.includes('bono') || keyLower.includes('pack') || keyLower.includes('abono')) {
        estructurado.bonos = Array.isArray(datosRaw[key]) ? datosRaw[key] : [datosRaw[key]];
      }
    }
  } else if (Array.isArray(datosRaw)) {
    // Es una lista
    for (const registro of datosRaw) {
      const claves = {};
      for (const [k, v] of Object.entries(registro)) {
        claves[k.toUpperCase()] = v;
      }
      
      if (claves['PAC_ID'] || claves['CLIENTE_ID'] || claves['ID_PACIENTE'] || claves['PATIENT_ID'] || claves['PACIENTE']) {
        estructurado.pacientes.push(registro);
      } else if (claves['BONO_ID'] || claves['BON_ID'] || claves['PACK_ID'] || claves['ABONO_ID']) {
        estructurado.bonos.push(registro);
      } else if (claves['CITA_ID'] || claves['CIT_ID'] || claves['APPOINTMENT_ID'] || claves['TURNO_ID']) {
        estructurado.citas.push(registro);
      } else if (claves['HISTORIAL_ID'] || claves['HIST_ID'] || claves['CONSULTA_ID'] || claves['DIAGNOSTICO']) {
        estructurado.historial.push(registro);
      } else if (claves['NOMBRE'] || claves['APELLIDOS'] || claves['TELEFONO'] || claves['EMAIL']) {
        estructurado.pacientes.push(registro);
      } else if (claves['FECHA'] || claves['DATE'] || claves['TIME']) {
        estructurado.citas.push(registro);
      } else {
        estructurado.historial.push(registro);
      }
    }
  }
  
  console.log(`[INFO] Datos procesados: ${estructurado.pacientes.length} pacientes, ` +
    `${estructurado.bonos.length} bonos, ${estructurado.citas.length} citas, ` +
    `${estructurado.historial.length} historiales`);
  
  return estructurado;
}

// Generar clientes_y_bonos
async function generarClientesYBonos(datos, outputPath, plantillaPath) {
  const headers = readCSVHeaders(plantillaPath, PLANTILLA_CLIENTES_Y_BONOS_HEADERS);
  const pacientes = datos.pacientes || [];
  const bonos = datos.bonos || [];
  
  // Crear índice de bonos por paciente
  const bonosPorPaciente = {};
  for (const bono of bonos) {
    const pacId = firstNoEmpty(
      bono.dni, bono.PAC_ID, bono.CLIENTE_ID,
      bono.ID_PACIENTE, bono.PATIENT_ID, bono.PACIENTE_ID
    );
    if (pacId) {
      if (!bonosPorPaciente[pacId]) {
        bonosPorPaciente[pacId] = [];
      }
      bonosPorPaciente[pacId].push(bono);
    }
  }
  
  const rowsOut = [];
  
  for (const paciente of pacientes) {
    const pacId = firstNoEmpty(
      paciente.dni, paciente.id, paciente.PAC_ID,
      paciente.CLIENTE_ID, paciente.ID, paciente.ID_PACIENTE, paciente.PATIENT_ID
    );
    const bonosPac = bonosPorPaciente[pacId] || [];
    const bono = bonosPac[0] || {};
    
    const nombre = firstNoEmpty(
      paciente.nombre, paciente.NOMBRE, paciente.PAC_NOMBRE,
      paciente.NAME, paciente.NOMBRE_CLIENTE, paciente.CLIENTE_NOMBRE
    );
    const apellidos = firstNoEmpty(
      paciente.apellidos, paciente.APELLIDOS, paciente.PAC_APELLIDOS,
      paciente.SURNAME, paciente.APELLIDO, paciente.LAST_NAME
    );
    const telefono = firstNoEmpty(
      paciente.movil, paciente.TELEFONO, paciente.PAC_TELEFONO1,
      paciente.PHONE, paciente.TEL, paciente.TELEFONO1, paciente.MOVIL
    );
    
    rowsOut.push({
      "Nombre": nombre,
      "Apellidos": apellidos,
      "CIF/NIF": firstNoEmpty(paciente.dni, paciente.NIF, paciente.DNI, paciente.CIF, paciente.ID_FISCAL),
      "Direccion": firstNoEmpty(paciente.direccionFacturacion, paciente.DIRECCION, paciente.DIR, paciente.ADDRESS),
      "Codigo Postal": firstNoEmpty(paciente.cp, paciente.CP, paciente.COD_POSTAL, paciente.POSTAL_CODE),
      "Ciudad": firstNoEmpty(paciente.localidad, paciente.CIUDAD, paciente.POBLACION, paciente.CITY),
      "Provincia": firstNoEmpty(paciente.provincia, paciente.PROVINCIA, paciente.PROV, paciente.PROVINCE),
      "Pais": firstNoEmpty(paciente.pais, paciente.PAIS, paciente.COUNTRY, "España"),
      "Email": firstNoEmpty(paciente.email, paciente.EMAIL, paciente.E_MAIL, paciente.CORREO),
      "Telefono": telefono,
      "Tipo Cliente": "",
      "Fecha Nacimiento": formatearFecha(firstNoEmpty(
        paciente.fechaNacimiento, paciente.FECHA_NACIMIENTO,
        paciente.FECHA_NAC, paciente.BIRTH_DATE
      )),
      "Genero": firstNoEmpty(paciente.sexo, paciente.GENERO, paciente.SEXO, paciente.GENDER),
      "Notas Medicas": firstNoEmpty(
        paciente.comentario, paciente.antecedentes, paciente.NOTAS,
        paciente.OBSERVACIONES, paciente.NOTES
      ),
      "Fecha seguimiento": "",
      "Tipo seguimiento": "",
      "Descripción": "",
      "Recomendaciones": "",
      "Nombre Bono": firstNoEmpty(bono.NOMBRE, bono.DESCRIPCION, bono.NOMBRE_BONO),
      "Servicio": "",
      "Precio": firstNoEmpty(bono.PRECIO, bono.IMPORTE, bono.PRICE),
      "Sesiones Totales": firstNoEmpty(bono.SESIONES, bono.NUM_SESIONES, bono.SESIONES_TOTALES),
      "Sesiones Consumidas": firstNoEmpty(bono.SESIONES_CONSUMIDAS, bono.USADAS, bono.USOS),
      "Fecha Caducidad": formatearFecha(firstNoEmpty(
        bono.FECHA_CADUCIDAD, bono.FECHA_VENC, bono.EXPIRES
      )),
      "Notas Bono": firstNoEmpty(bono.NOTAS, bono.OBSERVACIONES, bono.CONDICIONES)
    });
  }
  
  await writeCSV(outputPath, headers, rowsOut);
  console.log(`[OK] Generado ${outputPath} (${rowsOut.length} filas)`);
}

// Generar bonos
async function generarBonos(datos, outputPath, plantillaPath) {
  const headers = readCSVHeaders(plantillaPath, PLANTILLA_BONOS_HEADERS);
  const pacientes = datos.pacientes || [];
  const bonos = datos.bonos || [];
  
  const pacientesDict = {};
  for (const p of pacientes) {
    const pacId = firstNoEmpty(
      p.dni, p.id, p.PAC_ID, p.CLIENTE_ID,
      p.ID, p.ID_PACIENTE, p.PATIENT_ID
    );
    if (pacId) {
      pacientesDict[pacId] = p;
    }
  }
  
  const outRows = [];
  
  for (const bono of bonos) {
    const pacId = firstNoEmpty(
      bono.dni, bono.PAC_ID, bono.CLIENTE_ID,
      bono.ID_PACIENTE, bono.PATIENT_ID, bono.CLIENTE
    );
    const paciente = pacientesDict[pacId] || {};
    
    const nombre = firstNoEmpty(paciente.nombre, paciente.NOMBRE, paciente.PAC_NOMBRE, paciente.NAME);
    const apellidos = firstNoEmpty(paciente.apellidos, paciente.APELLIDOS, paciente.PAC_APELLIDOS, paciente.SURNAME);
    const telefono = firstNoEmpty(paciente.movil, paciente.TELEFONO, paciente.PAC_TELEFONO1, paciente.PHONE);
    
    outRows.push({
      "Teléfono": telefono,
      "Nombre Cliente": `${nombre} ${apellidos}`.trim(),
      "Nombre Bono": firstNoEmpty(bono.NOMBRE, bono.DESCRIPCION, bono.NOMBRE_BONO),
      "Servicio": "",
      "Sesiones Totales": firstNoEmpty(bono.SESIONES, bono.NUM_SESIONES),
      "Sesiones Consumidas": firstNoEmpty(bono.SESIONES_CONSUMIDAS, bono.USADAS),
      "Precio Total": firstNoEmpty(bono.PRECIO, bono.IMPORTE),
      "Pagado": "",
      "Importe Pagado": "",
      "Fecha Caducidad": formatearFecha(firstNoEmpty(bono.FECHA_CADUCIDAD, bono.FECHA_VENC))
    });
  }
  
  await writeCSV(outputPath, headers, outRows);
  console.log(`[OK] Generado ${outputPath} (${outRows.length} filas)`);
}

// Generar historial_basica
async function generarHistorialBasica(datos, outputPath, plantillaPath) {
  const headers = readCSVHeaders(plantillaPath, PLANTILLA_HISTORIAL_BASICA_HEADERS);
  const pacientes = datos.pacientes || [];
  const historial = datos.historial || [];
  
  const pacientesDict = {};
  for (const p of pacientes) {
    const pacId = firstNoEmpty(
      p.dni, p.id, p.PAC_ID, p.CLIENTE_ID,
      p.ID, p.ID_PACIENTE, p.PATIENT_ID
    );
    if (pacId) {
      pacientesDict[pacId] = p;
    }
  }
  
  function limpiarHTML(texto) {
    if (!texto) return "";
    texto = String(texto).replace(/<[^>]+>/g, '');
    texto = texto.replace(/\s+/g, ' ');
    return texto.trim();
  }
  
  const outRows = [];
  
  for (const hist of historial) {
    const pacienteRef = hist.PACIENTE || {};
    let pacId = firstNoEmpty(
      hist.PAC_ID, hist.dni, hist.CLIENTE_ID,
      hist.ID_PACIENTE, hist.PATIENT_ID, hist.CLIENTE
    );
    
    if (!pacId && pacienteRef) {
      pacId = pacienteRef.dni || pacienteRef.id;
    }
    
    const paciente = pacientesDict[pacId] || pacienteRef;
    const telefono = firstNoEmpty(
      paciente.movil, paciente.TELEFONO, paciente.PAC_TELEFONO1, paciente.PHONE
    );
    
    const proceso = hist.PROCESO || {};
    const diagnostico = firstNoEmpty(
      proceso.diagnostico, hist.diagnostico, hist.DIAGNOSTICO, hist.DIAG
    );
    const motivo = firstNoEmpty(
      proceso.titulo, hist.MOTIVO, hist.MOTIVO_CONSULTA
    );
    const descripcion = firstNoEmpty(
      hist.DESCRIPCION, hist.DETALLES, hist.contenido
    );
    const observaciones = firstNoEmpty(hist.OBSERVACIONES, hist.NOTAS, hist.OBS);
    
    if (telefono || diagnostico || descripcion || motivo || observaciones) {
      outRows.push({
        "Teléfono": telefono,
        "Profesional": firstNoEmpty(hist.PROFESIONAL, hist.DOCTOR, hist.MEDICO),
        "Motivo Consulta": limpiarHTML(motivo),
        "Tiempo Evolución": "",
        "Descripción Detallada": limpiarHTML(descripcion),
        "Enfermedades Crónicas": firstNoEmpty(paciente.antecedentes, paciente.ANTECEDENTES),
        "Alergias Medicamentosas": "",
        "Medicación Habitual": "",
        "Diagnóstico": limpiarHTML(diagnostico),
        "Recomendaciones": firstNoEmpty(hist.RECOMENDACIONES, hist.RECOMENDACION),
        "Observaciones": limpiarHTML(observaciones)
      });
    }
  }
  
  await writeCSV(outputPath, headers, outRows);
  console.log(`[OK] Generado ${outputPath} (${outRows.length} filas)`);
}

// Generar historial_completa
async function generarHistorialCompleta(datos, outputPath, plantillaPath) {
  const headers = readCSVHeaders(plantillaPath, PLANTILLA_HISTORIAL_COMPLETA_HEADERS);
  const pacientes = datos.pacientes || [];
  const historial = datos.historial || [];
  
  const pacientesDict = {};
  for (const p of pacientes) {
    const pacId = firstNoEmpty(
      p.dni, p.id, p.PAC_ID, p.CLIENTE_ID,
      p.ID, p.ID_PACIENTE, p.PATIENT_ID
    );
    if (pacId) {
      pacientesDict[pacId] = p;
    }
  }
  
  function limpiarHTML(texto) {
    if (!texto) return "";
    texto = String(texto).replace(/<[^>]+>/g, '');
    texto = texto.replace(/\s+/g, ' ');
    return texto.trim();
  }
  
  const outRows = [];
  
  for (const hist of historial) {
    const pacienteRef = hist.PACIENTE || {};
    let pacId = firstNoEmpty(
      hist.PAC_ID, hist.dni, hist.CLIENTE_ID,
      hist.ID_PACIENTE, hist.PATIENT_ID, hist.CLIENTE
    );
    
    if (!pacId && pacienteRef) {
      pacId = pacienteRef.dni || pacienteRef.id;
    }
    
    const paciente = pacientesDict[pacId] || pacienteRef;
    const telefono = firstNoEmpty(
      paciente.movil, paciente.TELEFONO, paciente.PAC_TELEFONO1, paciente.PHONE
    );
    
    const proceso = hist.PROCESO || {};
    const diagnostico = firstNoEmpty(
      proceso.diagnostico, hist.diagnostico, hist.DIAGNOSTICO, hist.DIAG
    );
    const motivo = firstNoEmpty(proceso.titulo, hist.MOTIVO, hist.MOTIVO_CONSULTA);
    const descripcion = firstNoEmpty(hist.DESCRIPCION, hist.DETALLES, hist.contenido);
    const observaciones = firstNoEmpty(hist.OBSERVACIONES, hist.NOTAS, hist.OBS);
    
    const row = {};
    for (const h of headers) {
      row[h] = "";
    }
    
    row["Teléfono Cliente"] = telefono;
    row["Profesional"] = firstNoEmpty(hist.PROFESIONAL, hist.DOCTOR);
    row["Motivo Consulta"] = limpiarHTML(motivo);
    row["Diagnóstico"] = limpiarHTML(diagnostico);
    row["Descripción Detallada"] = limpiarHTML(descripcion);
    row["Observaciones Adicionales"] = limpiarHTML(observaciones);
    
    outRows.push(row);
  }
  
  await writeCSV(outputPath, headers, outRows);
  console.log(`[OK] Generado ${outputPath} (${outRows.length} filas)`);
}

// Generar citas
async function generarCitas(datos, outputPath, plantillaPath) {
  const headers = readCSVHeaders(plantillaPath, PLANTILLA_CITAS_HEADERS);
  const pacientes = datos.pacientes || [];
  const citas = datos.citas || [];
  
  const pacientesDict = {};
  for (const p of pacientes) {
    const pacId = firstNoEmpty(
      p.PAC_ID, p.CLIENTE_ID, p.ID,
      p.ID_PACIENTE, p.PATIENT_ID
    );
    if (pacId) {
      pacientesDict[pacId] = p;
    }
  }
  
  const outRows = [];
  
  for (const cita of citas) {
    const pacienteRef = cita.PACIENTE || {};
    let pacId = firstNoEmpty(
      cita.PAC_ID, cita.CLIENTE_ID, cita.ID_PACIENTE,
      cita.PATIENT_ID, cita.CLIENTE
    );
    
    if (!pacId && pacienteRef) {
      pacId = pacienteRef.dni || pacienteRef.id;
    }
    
    const paciente = pacientesDict[pacId] || pacienteRef;
    
    const nombre = firstNoEmpty(
      paciente.nombre, paciente.NOMBRE, paciente.PAC_NOMBRE,
      paciente.NAME, paciente.NOMBRE_CLIENTE, paciente.CLIENTE_NOMBRE
    );
    const apellidos = firstNoEmpty(
      paciente.apellidos, paciente.APELLIDOS, paciente.PAC_APELLIDOS,
      paciente.SURNAME, paciente.APELLIDO, paciente.LAST_NAME
    );
    const nombreCompleto = `${nombre} ${apellidos}`.trim();
    
    const telefono = firstNoEmpty(
      paciente.movil, paciente.TELEFONO, paciente.PAC_TELEFONO1, paciente.PHONE
    );
    
    const fecha = firstNoEmpty(cita.fecha, cita.FECHA, cita.DATE, cita.FECHA_CITA);
    const horaInicio = firstNoEmpty(cita.inicio, cita.HORA, cita.TIME, cita.HORA_CITA);
    const horaFin = firstNoEmpty(cita.fin, cita.HORA_FIN, cita.END_TIME);
    
    let duracion = "";
    if (horaInicio && horaFin) {
      try {
        const [h1, m1, s1] = horaInicio.split(':').map(Number);
        const [h2, m2, s2] = horaFin.split(':').map(Number);
        const diff = (h2 * 3600 + m2 * 60 + s2) - (h1 * 3600 + m1 * 60 + s1);
        duracion = String(Math.floor(diff / 60));
      } catch (e) {
        // Ignorar
      }
    }
    
    let estado = (firstNoEmpty(cita.ESTADO, cita.STATUS, cita.ESTADO_CITA) || "").toLowerCase();
    let status = "pending";
    if (estado.includes('confirm') || estado.includes('realizad')) {
      status = "confirmed";
    } else if (estado.includes('cancel')) {
      status = "cancelled";
    }
    
    outRows.push({
      "professional_name": firstNoEmpty(cita.PROFESIONAL, cita.DOCTOR, cita.MEDICO),
      "client_name": nombreCompleto,
      "client_phone": telefono,
      "service_name": firstNoEmpty(cita.SERVICIO, cita.TIPO_CITA, cita.TRATAMIENTO),
      "date": formatearFecha(fecha),
      "start_time": formatearHora(horaInicio) || horaInicio,
      "end_time": formatearHora(horaFin) || horaFin,
      "duration": duracion || firstNoEmpty(cita.DURACION, cita.DURATION, cita.MINUTOS),
      "status": status,
      "notes": firstNoEmpty(cita.NOTAS, cita.OBSERVACIONES, cita.NOTES),
      "modalidad": "presencial"
    });
  }
  
  await writeCSV(outputPath, headers, outRows);
  console.log(`[OK] Generado ${outputPath} (${outRows.length} filas)`);
}

// Función principal
async function processCLINNI(inputFile, outputDir, plantillasDir) {
  const fileSuffix = sanitizeFilename(path.basename(inputFile));
  
  console.log(`[INFO] Procesando archivo: ${path.basename(inputFile)}`);
  console.log(`[INFO] Sufijo para archivos de salida: ${fileSuffix}`);
  
  // Leer y estructurar datos
  const datosEstructurados = await leerArchivoClinni(inputFile);
  
  // Rutas de plantillas
  const plantillaClientesYBonos = path.join(plantillasDir, "plantilla_clientes_y_bonos.csv");
  const plantillaBonos = path.join(plantillasDir, "plantilla_bonos.csv");
  const plantillaHistorialBasica = path.join(plantillasDir, "plantilla_historial_basica.csv");
  const plantillaHistorialCompleta = path.join(plantillasDir, "plantilla_historial_completa.csv");
  const plantillaCitas = path.join(plantillasDir, "plantilla-citas.csv");
  
  await generarClientesYBonos(
    datosEstructurados,
    path.join(outputDir, `clientes_y_bonos_${fileSuffix}.csv`),
    plantillaClientesYBonos
  );
  
  await generarBonos(
    datosEstructurados,
    path.join(outputDir, `bonos_${fileSuffix}.csv`),
    plantillaBonos
  );
  
  await generarHistorialBasica(
    datosEstructurados,
    path.join(outputDir, `historial_basica_${fileSuffix}.csv`),
    plantillaHistorialBasica
  );
  
  await generarHistorialCompleta(
    datosEstructurados,
    path.join(outputDir, `historial_completa_${fileSuffix}.csv`),
    plantillaHistorialCompleta
  );
  
  await generarCitas(
    datosEstructurados,
    path.join(outputDir, `citas_${fileSuffix}.csv`),
    plantillaCitas
  );
  
  console.log(`\n[OK] Proceso completado. Archivos generados en: ${outputDir}`);
}

module.exports = { processCLINNI };

