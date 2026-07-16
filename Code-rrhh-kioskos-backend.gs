/**
 * Backend RRHH — Ecosistema Kioskos (independiente del RRHH de Lorito).
 *
 * Versión mínima: por ahora solo la pestaña "Personal", con el campo
 * "Kiosko" para saber a qué ubicación pertenece cada colaborador. Alimenta
 * el dropdown de "Encargado" en cierres.html (?modulo=personal). Se puede
 * ampliar más adelante con vacaciones/amonestaciones/horarios, siguiendo el
 * mismo patrón que Code-rrhh-backend.gs de Lorito.
 *
 * Cómo desplegarlo:
 * 1. Creá un Google Sheet nuevo, ej. "RRHH - Kioskos".
 * 2. Extensiones → Apps Script, pegá este código.
 * 3. Corré UNA VEZ configurarHojas() desde el editor (▶ con esa función
 *    seleccionada) para crear la pestaña "Personal" con sus encabezados.
 * 4. Implementar → Nueva implementación → Tipo: Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquiera
 * 5. Copiá la URL /exec resultante en APPS_SCRIPT_RRHH dentro de cierres.html.
 * 6. Cargá el personal manualmente en la pestaña "Personal" del Sheet (una
 *    fila por colaborador, con Estado = ACTIVO para que aparezca en el
 *    dropdown), o llamá a doPost({modulo:'nuevo_ingreso', ...}) desde una
 *    futura pantalla de alta de personal.
 */

const HOJA_PERSONAL = 'Personal';

const ENCABEZADOS_PERSONAL = [
  'Nombre completo', 'Cédula', 'Puesto', 'Estado', 'Kiosko',
  'Fecha ingreso', 'Teléfono', 'Email', 'Salario', 'Observaciones'
];

// Corré esta función UNA VEZ desde el editor de Apps Script para preparar el Sheet.
function configurarHojas() {
  prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
}

function prepararHoja(nombre, encabezados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) hoja = ss.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
    hoja.getRange(1, 1, 1, encabezados.length).setFontWeight('bold');
    hoja.setFrozenRows(1);
  } else {
    // Si se agrega una columna nueva a ENCABEZADOS_PERSONAL después de que la
    // hoja ya tenía datos, completar los encabezados faltantes al final sin
    // tocar los existentes. Las columnas nuevas SIEMPRE van al final del array.
    const actuales = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0];
    const faltantes = encabezados.filter(function (h) { return actuales.indexOf(h) === -1; });
    if (faltantes.length) {
      hoja.getRange(1, actuales.length + 1, 1, faltantes.length).setValues([faltantes]);
      hoja.getRange(1, actuales.length + 1, 1, faltantes.length).setFontWeight('bold');
    }
  }
  return hoja;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── doGet ──────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const modulo = e.parameter.modulo;
    let hoja;
    switch (modulo) {
      case 'personal': hoja = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL); break;
      default:
        return jsonOut({ ok: false, error: 'Módulo no reconocido: ' + modulo });
    }
    return jsonOut({ ok: true, registros: filasComoObjetos(hoja) });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function filasComoObjetos(hoja) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return [];
  const nCols = hoja.getLastColumn();
  const encabezados = hoja.getRange(1, 1, 1, nCols).getValues()[0];
  const datos = hoja.getRange(2, 1, nFilas, nCols).getValues();
  return datos.map(function (fila) {
    const obj = {};
    encabezados.forEach(function (h, i) {
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

    let result;
    switch (payload.modulo) {
      case 'nuevo_ingreso': result = nuevoIngreso(payload); break;
      case 'cambiar_estado': result = cambiarEstado(payload); break;
      default:
        throw new Error('Módulo no reconocido: ' + payload.modulo);
    }
    return jsonOut({ ok: true, result: result });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function escribirFilaPorEncabezado(hoja, fila, encabezados, valores) {
  const datos = encabezados.map(function (h) { return (h in valores) ? valores[h] : ''; });
  hoja.getRange(fila, 1, 1, encabezados.length).setValues([datos]);
}

// Busca la fila (1-indexada) de un colaborador por "Nombre completo"
// (case-insensitive, sin espacios extra). Devuelve -1 si no existe.
function filaColaborador(hoja, nombre) {
  if (!nombre) return -1;
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const colNombre = ENCABEZADOS_PERSONAL.indexOf('Nombre completo') + 1;
  const nombres = hoja.getRange(2, colNombre, nFilas, 1).getValues();
  const buscado = String(nombre).trim().toLowerCase();
  for (let i = 0; i < nombres.length; i++) {
    if (String(nombres[i][0]).trim().toLowerCase() === buscado) return i + 2;
  }
  return -1;
}

function nuevoIngreso(p) {
  if (!p.nombre) throw new Error('Falta el nombre del colaborador.');
  const hoja = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  if (filaColaborador(hoja, p.nombre) !== -1) {
    throw new Error('Ya existe un colaborador con ese nombre.');
  }
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PERSONAL, {
    'Nombre completo': p.nombre,
    'Cédula': p.cedula || '',
    'Puesto': p.puesto || '',
    'Estado': p.estado || 'ACTIVO',
    'Kiosko': p.kiosko || '',
    'Fecha ingreso': p.fechaIngreso || hoyCR(),
    'Teléfono': p.telefono || '',
    'Email': p.email || '',
    'Salario': Number(p.salario) || 0,
    'Observaciones': p.observaciones || ''
  });
  return { fila: fila };
}

function cambiarEstado(p) {
  if (!p.nombre) throw new Error('Falta el nombre del colaborador.');
  const hoja = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  const fila = filaColaborador(hoja, p.nombre);
  if (fila === -1) throw new Error('No se encontró ese colaborador.');
  const colEstado = ENCABEZADOS_PERSONAL.indexOf('Estado') + 1;
  hoja.getRange(fila, colEstado).setValue(p.estado || 'INACTIVO');
  return { fila: fila };
}

function hoyCR() {
  return Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd');
}
