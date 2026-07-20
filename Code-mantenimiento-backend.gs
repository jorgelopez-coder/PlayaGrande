/**
 * Backend Apps Script para el Sheet "Operaciones - Kioskos": módulo de
 * Mantenimiento (mantenimiento.html) y módulo de Mermas de Cerveza
 * (mermas.html). Adaptado del repo Lorito para Ecosistema Kioskos (Playa
 * Grande, Liberia, Nosara, Playa Hermosa y los que se agreguen): cada
 * registro incluye el kiosko de origen, y las fotos se organizan en una
 * subcarpeta por kiosko dentro de la carpeta raíz correspondiente.
 *
 * Sheet de datos: "Operaciones - Kioskos" (ya desplegado).
 * Carpeta de fotos de mantenimiento (raíz): https://drive.google.com/drive/folders/1MgRs-4z53D-S3Jr0N5YQGUo09v7WueHC
 *   ("Mantenimiento - Fotos", dentro de la carpeta general de Kioskos)
 * Carpeta de fotos de mermas (raíz): https://drive.google.com/drive/folders/1I5_9y1Uqv2pskynPTJi9T9jJzAMx_EDt
 *   ("Mermas - Fotos", dentro de la misma carpeta general de Kioskos)
 *
 * Cómo desplegarlo (o actualizar el despliegue existente):
 * 1. Sheet "Operaciones - Kioskos" > Extensiones > Apps Script.
 * 2. Pegá este código (reemplazando el contenido del archivo).
 * 3. Corré UNA VEZ la función configurarHoja() desde el editor (▶ con
 *    configurarHoja seleccionado) para crear/actualizar las pestañas
 *    "Reportes", "Mermas" y "MermasConfig" con sus encabezados. La primera
 *    vez va a pedir autorizar el script (accede a Drive para guardar fotos).
 * 4. Implementar > Gestionar implementaciones > Editar > Nueva versión (la
 *    URL /exec no cambia — no hace falta tocar mantenimiento.html ni
 *    mermas.html si ya tenías esto desplegado). Si es la primera vez:
 *    Implementar > Nueva implementación > Tipo: Aplicación web, Ejecutar
 *    como Yo, Acceso: Cualquiera.
 * 5. Copiá la URL del Web App resultante y pegala en mantenimiento.html
 *    (constante MANT_URL) y en mermas.html (constante MERMAS_URL) — es el
 *    mismo Sheet/Web App para los dos módulos.
 *
 * Si se agregan columnas nuevas: actualizar el ENCABEZADOS_* que corresponda
 * al FINAL del array (nunca insertar en el medio), volver a pegar el código,
 * Implementar > Gestionar implementaciones > Editar > Nueva versión (la URL
 * /exec no cambia), y correr configurarHoja() de nuevo para que la fila de
 * encabezados se actualice sin tocar los datos ya guardados.
 */

const HOJA_REPORTES = 'Reportes';

const ENCABEZADOS_REPORTES = [
  'ID', 'Fecha', 'Hora', 'Kiosko', 'Encargado', 'Tipo', 'Detalle', 'Estado',
  'Foto URL', 'Fecha Resolución', 'Notas', 'Registrado'
];

// Carpeta raíz fija de Drive donde se guardan las fotos de evidencia. Adentro
// se crea automáticamente una subcarpeta por kiosko (mismo patrón que
// Code-cierres-kioskos-backend.gs → getOrCreateCarpetaKiosko).
// https://drive.google.com/drive/folders/1MgRs-4z53D-S3Jr0N5YQGUo09v7WueHC
const FOLDER_ID_MANTENIMIENTO = '1MgRs-4z53D-S3Jr0N5YQGUo09v7WueHC';

// ── MERMAS DE CERVEZA (mermas.html) ──────────────────────────────────
// "Mermas": una fila por pesada (peso bruto del barril con lo que sobró,
// peso del contenedor vacío según la config del kiosko al momento de
// guardar, y el neto calculado = merma real en gramos).
// "MermasConfig": una fila por kiosko con el peso de tara (contenedor vacío)
// vigente — se actualiza (upsert), no se acumula historial de cambios.
const HOJA_MERMAS = 'Mermas';
const ENCABEZADOS_MERMAS = [
  'ID', 'Fecha', 'Kiosko', 'Peso Bruto (g)', 'Peso Contenedor (g)',
  'Peso Neto Merma (g)', 'Foto URL', 'Registrado por', 'Registrado'
];

const HOJA_MERMAS_CONFIG = 'MermasConfig';
const ENCABEZADOS_MERMAS_CONFIG = ['Kiosko', 'Peso Contenedor Vacío (g)', 'Actualizado'];

// Carpeta raíz fija de Drive para las fotos de báscula de mermas — mismo
// patrón que FOLDER_ID_MANTENIMIENTO, subcarpeta por kiosko.
// https://drive.google.com/drive/folders/1I5_9y1Uqv2pskynPTJi9T9jJzAMx_EDt
const FOLDER_ID_MERMAS = '1I5_9y1Uqv2pskynPTJi9T9jJzAMx_EDt';

// Corré esta función UNA VEZ (o cada vez que se agreguen columnas nuevas)
// desde el editor de Apps Script para preparar el Sheet.
function configurarHoja() {
  prepararHoja(HOJA_REPORTES, ENCABEZADOS_REPORTES);
  prepararHoja(HOJA_MERMAS, ENCABEZADOS_MERMAS);
  prepararHoja(HOJA_MERMAS_CONFIG, ENCABEZADOS_MERMAS_CONFIG);
}

function prepararHoja(nombre, encabezados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) hoja = ss.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
    hoja.getRange(1, 1, 1, encabezados.length).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hoyCR() {
  return Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd');
}

// ── doGet ──────────────────────────────────────────────────────────
// Sin ?modulo= (o modulo=reportes): mantiene el comportamiento original de
// mantenimiento.html. modulo=mermas / modulo=mermas_config: usados por
// mermas.html.
function doGet(e) {
  try {
    const modulo = (e && e.parameter && e.parameter.modulo) || 'reportes';
    if (modulo === 'mermas') {
      const hoja = prepararHoja(HOJA_MERMAS, ENCABEZADOS_MERMAS);
      return jsonOut({ ok: true, registros: filasComoObjetos(hoja) });
    }
    if (modulo === 'mermas_config') {
      const hoja = prepararHoja(HOJA_MERMAS_CONFIG, ENCABEZADOS_MERMAS_CONFIG);
      return jsonOut({ ok: true, registros: filasComoObjetos(hoja) });
    }
    const hoja = prepararHoja(HOJA_REPORTES, ENCABEZADOS_REPORTES);
    return jsonOut({ ok: true, registros: filasComoObjetos(hoja) });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// Mapea las filas de una hoja a objetos usando la fila 1 como claves de encabezado.
function filasComoObjetos(hoja) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return [];
  const nCols = hoja.getLastColumn();
  const encabezados = hoja.getRange(1, 1, 1, nCols).getValues()[0];
  const datos = hoja.getRange(2, 1, nFilas, nCols).getValues();
  return datos.map(function(fila) {
    const obj = {};
    encabezados.forEach(function(h, i) {
      if (!h) return;
      let v = fila[i];
      if (v instanceof Date) v = Utilities.formatDate(v, 'America/Costa_Rica', 'yyyy-MM-dd');
      obj[h] = v;
    });
    return obj;
  });
}

// ── doPost ─────────────────────────────────────────────────────────
function doPost(e) {
  try {
    let payload = null;
    if (e.postData && e.postData.contents) {
      try { payload = JSON.parse(e.postData.contents); } catch (err) { payload = null; }
    }
    if (!payload && e.parameter && e.parameter.data) {
      payload = JSON.parse(e.parameter.data);
    }
    if (!payload) throw new Error('No se recibieron datos.');

    switch (payload.accion) {
      case 'cambiar_estado':       return jsonOut(cambiarEstado(payload));
      case 'fijar_resolucion':     return jsonOut(fijarResolucion(payload));
      case 'agregar_nota':         return jsonOut(agregarNota(payload));
      case 'merma_guardar':        return jsonOut(guardarMerma(payload));
      case 'merma_config_guardar': return jsonOut(guardarMermaConfig(payload));
      default:                     return jsonOut(crearReporte(payload));
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// Escribe un objeto {NombreDeEncabezado: valor} en una fila, respetando el orden real de columnas.
function escribirFilaPorEncabezado(hoja, fila, encabezados, valores) {
  const datos = encabezados.map(function(h) { return (h in valores) ? valores[h] : ''; });
  hoja.getRange(fila, 1, 1, encabezados.length).setValues([datos]);
}

// Busca la fila (1-indexada) de un reporte por ID. Devuelve -1 si no existe.
function filaReporte(hoja, id) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const colId = ENCABEZADOS_REPORTES.indexOf('ID') + 1;
  const ids = hoja.getRange(2, colId, nFilas, 1).getValues();
  const buscado = String(id);
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === buscado) return i + 2;
  }
  return -1;
}

function crearReporte(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.encargado) throw new Error('Falta quién reporta.');
  if (!p.tipo) throw new Error('Falta el tipo de incidencia.');
  const hoja = prepararHoja(HOJA_REPORTES, ENCABEZADOS_REPORTES);
  const id = p.id || Date.now();
  const fotoUrl = guardarFotoEnDrive(p, id);
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_REPORTES, {
    'ID': id,
    'Fecha': p.fecha || hoyCR(),
    'Hora': p.hora || '',
    'Kiosko': p.kiosko,
    'Encargado': p.encargado,
    'Tipo': p.tipo,
    'Detalle': p.detalle || '',
    'Estado': p.estado || 'Pendiente',
    'Foto URL': fotoUrl,
    'Fecha Resolución': '',
    'Notas': '',
    'Registrado': p.registrado_en || new Date().toISOString()
  });
  return { ok: true, fila: fila, fotoUrl: fotoUrl };
}

function cambiarEstado(p) {
  if (!p.id) throw new Error('Falta el ID del reporte.');
  const hoja = prepararHoja(HOJA_REPORTES, ENCABEZADOS_REPORTES);
  const fila = filaReporte(hoja, p.id);
  if (fila === -1) throw new Error('No se encontró el reporte ' + p.id);
  const colEstado = ENCABEZADOS_REPORTES.indexOf('Estado') + 1;
  hoja.getRange(fila, colEstado).setValue(p.estado || 'Pendiente');
  return { ok: true, fila: fila };
}

function fijarResolucion(p) {
  if (!p.id) throw new Error('Falta el ID del reporte.');
  const hoja = prepararHoja(HOJA_REPORTES, ENCABEZADOS_REPORTES);
  const fila = filaReporte(hoja, p.id);
  if (fila === -1) throw new Error('No se encontró el reporte ' + p.id);
  const colFecha = ENCABEZADOS_REPORTES.indexOf('Fecha Resolución') + 1;
  hoja.getRange(fila, colFecha).setValue(p.fecha_resolucion || '');
  return { ok: true, fila: fila };
}

function agregarNota(p) {
  if (!p.id) throw new Error('Falta el ID del reporte.');
  if (!p.nota) throw new Error('Falta el texto de la nota.');
  const hoja = prepararHoja(HOJA_REPORTES, ENCABEZADOS_REPORTES);
  const fila = filaReporte(hoja, p.id);
  if (fila === -1) throw new Error('No se encontró el reporte ' + p.id);
  const colNotas = ENCABEZADOS_REPORTES.indexOf('Notas') + 1;
  const actual = String(hoja.getRange(fila, colNotas).getValue() || '');
  const autor = p.autor ? ' - ' + p.autor : '';
  const linea = `[${hoyCR()}${autor}] ${p.nota}`;
  const nuevo = actual ? actual + '\n' + linea : linea;
  hoja.getRange(fila, colNotas).setValue(nuevo);
  return { ok: true, fila: fila };
}

// ── FOTO DE EVIDENCIA → GOOGLE DRIVE ─────────────────────────────
// Carpeta raíz (FOLDER_ID_MANTENIMIENTO) con una subcarpeta por kiosko —
// mismo patrón que getOrCreateCarpetaKiosko en Code-cierres-kioskos-backend.gs.
function guardarFotoEnDrive(p, id) {
  if (!p.foto) return '';
  const datos = extraerBase64(p.foto);
  if (!datos) return '';
  const carpeta = getOrCreateCarpetaKiosko(p.kiosko);
  const tipo = (p.tipo || 'reporte').toString().replace(/[^\w\-]+/g, '_');
  const nombre = `${p.fecha || hoyCR()}_${tipo}_${id}.jpg`;
  const bytes = Utilities.base64Decode(datos.base64);
  const blob = Utilities.newBlob(bytes, datos.mime, nombre);
  const file = carpeta.createFile(blob);
  return file.getUrl();
}

function getOrCreateCarpetaKiosko(kiosko) {
  const root = DriveApp.getFolderById(FOLDER_ID_MANTENIMIENTO);
  const nombre = (kiosko || 'Sin kiosko').toString();
  const existing = root.getFoldersByName(nombre);
  return existing.hasNext() ? existing.next() : root.createFolder(nombre);
}

// Separa una data URL ("data:image/jpeg;base64,/9j/4AAQ...") en mime + base64.
function extraerBase64(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

// ── MERMAS DE CERVEZA ────────────────────────────────────────────────
// Guarda una pesada: peso bruto (contenedor + lo que sobró) menos el peso
// del contenedor vacío enviado desde el cliente (que a su vez viene de
// MermasConfig para ese kiosko — ver mermas.html) = merma neta en gramos.
// El peso de contenedor queda grabado en cada fila (no solo en la config)
// para que el historial no cambie retroactivamente si más adelante se
// corrige la tara de un kiosko.
function guardarMerma(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (p.pesoBruto === undefined || p.pesoBruto === null || p.pesoBruto === '') {
    throw new Error('Falta el peso bruto.');
  }
  const hoja = prepararHoja(HOJA_MERMAS, ENCABEZADOS_MERMAS);
  const id = p.id || Date.now();
  const pesoBruto = Number(p.pesoBruto) || 0;
  const pesoContenedor = Number(p.pesoContenedor) || 0;
  const pesoNeto = Math.max(0, pesoBruto - pesoContenedor);
  const fotoUrl = guardarFotoMermaEnDrive(p, id);
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_MERMAS, {
    'ID': id,
    'Fecha': p.fecha || hoyCR(),
    'Kiosko': p.kiosko,
    'Peso Bruto (g)': pesoBruto,
    'Peso Contenedor (g)': pesoContenedor,
    'Peso Neto Merma (g)': pesoNeto,
    'Foto URL': fotoUrl,
    'Registrado por': p.registrado_por || '',
    'Registrado': p.registrado_en || new Date().toISOString()
  });
  return { ok: true, fila: fila, fotoUrl: fotoUrl, pesoNeto: pesoNeto };
}

function guardarFotoMermaEnDrive(p, id) {
  if (!p.foto) return '';
  const datos = extraerBase64(p.foto);
  if (!datos) return '';
  const carpeta = getOrCreateCarpetaKioskoMermas(p.kiosko);
  const nombre = `${p.fecha || hoyCR()}_merma_${id}.jpg`;
  const bytes = Utilities.base64Decode(datos.base64);
  const blob = Utilities.newBlob(bytes, datos.mime, nombre);
  const file = carpeta.createFile(blob);
  return file.getUrl();
}

function getOrCreateCarpetaKioskoMermas(kiosko) {
  const root = DriveApp.getFolderById(FOLDER_ID_MERMAS);
  const nombre = (kiosko || 'Sin kiosko').toString();
  const existing = root.getFoldersByName(nombre);
  return existing.hasNext() ? existing.next() : root.createFolder(nombre);
}

// Config de tara por kiosko: upsert por nombre de kiosko (una fila por
// kiosko en MermasConfig, se sobreescribe si ya existía).
function guardarMermaConfig(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (p.pesoContenedor === undefined || p.pesoContenedor === null || p.pesoContenedor === '') {
    throw new Error('Falta el peso del contenedor vacío.');
  }
  const hoja = prepararHoja(HOJA_MERMAS_CONFIG, ENCABEZADOS_MERMAS_CONFIG);
  const nFilas = hoja.getLastRow() - 1;
  let filaExistente = -1;
  if (nFilas > 0) {
    const kioskos = hoja.getRange(2, 1, nFilas, 1).getValues();
    for (let i = 0; i < kioskos.length; i++) {
      if (String(kioskos[i][0]) === String(p.kiosko)) { filaExistente = i + 2; break; }
    }
  }
  const fila = filaExistente > 0 ? filaExistente : hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_MERMAS_CONFIG, {
    'Kiosko': p.kiosko,
    'Peso Contenedor Vacío (g)': Number(p.pesoContenedor) || 0,
    'Actualizado': new Date().toISOString()
  });
  return { ok: true, fila: fila };
}
