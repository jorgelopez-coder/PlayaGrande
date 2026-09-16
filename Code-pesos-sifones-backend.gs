/**
 * Backend de Toma de Pesos - Sifones (pesos-sifones.html, Ecosistema Kioskos)
 * — formulario simple y standalone pensado para que el personal de piso
 * registre el peso de un sifón (barril) de cerveza por kiosko, con foto
 * obligatoria como evidencia. A propósito NO calcula saldo esperado ni
 * compara contra compras/ventas/mermas — es solo una bitácora de pesajes
 * con foto. Eso otro (saldo esperado, punto de partida, arqueos con
 * diferencia, historial, catálogo de estilos) ya lo hace la pestaña
 * "Arqueo" de Controles (balance-barriles.html) — este módulo es aparte,
 * pensado para captura rápida sin ver el resto de ese módulo.
 *
 * Mismo patrón que Flujo de Caja / Recetas / Cuentas Square: vive en su
 * PROPIO Sheet y proyecto de Apps Script.
 *
 * Cómo desplegarlo (primera vez):
 * 1. Creá un Google Sheet nuevo, p.ej. "Toma de Pesos - Sifones - Kioskos"
 *    (no hace falta compartirlo públicamente: pesos-sifones.html nunca lo
 *    lee por gviz, siempre pasa por este Apps Script).
 * 2. Extensiones > Apps Script (proyecto nuevo, atado a ESTE Sheet). Pegá
 *    el contenido completo de este archivo.
 * 3. Creá en Google Drive una carpeta nueva, p.ej. "Pesos Sifones - Fotos".
 *    Abrila, copiá el ID de la URL (el texto largo después de /folders/)
 *    y pegalo abajo en FOLDER_ID_PESOS_SIFONES.
 * 4. Corré UNA VEZ, a mano desde este editor, la función configurarHojas()
 *    para crear la pestaña "Registros" (Apps Script va a pedir autorizar
 *    permisos de Sheets/Drive la primera vez — es normal).
 * 5. Implementar > Nueva implementación > Aplicación web
 *    (Ejecutar como: Yo · Quién tiene acceso: Cualquiera).
 * 6. Copiá la URL /exec y pegala en pesos-sifones.html, constante
 *    PESOS_SIFONES_URL (reemplazá el placeholder que empieza con "TODO_").
 *
 * Para actualizar código más adelante: pegá el archivo completo de nuevo
 * acá, corré configurarHojas() otra vez (no toca datos existentes) e
 * Implementar > Gestionar implementaciones > Editar > Nueva versión
 * (la URL /exec no cambia).
 */

// ── REGISTROS ───────────────────────────────────────────────────────
// Una fila = un pesaje de un sifón en un kiosko, en un momento dado.
const HOJA_REGISTROS = 'Registros';
const ENCABEZADOS_REGISTROS = [
  'ID', 'Fecha', 'Kiosko', 'Sifón / Estilo', 'Peso Bruto (g)', 'Tara (g)',
  'Peso Neto (g)', 'Foto URL', 'Registrado por', 'Registrado', 'Notas'
];

// ── CARPETA DE FOTOS ────────────────────────────────────────────────
// Reemplazá esto por el ID real de la carpeta de Drive (ver paso 3 arriba).
const FOLDER_ID_PESOS_SIFONES = 'TODO_PEGAR_ID_CARPETA_DRIVE';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Pesos Sifones')
    .addItem('Configurar hojas (correr una vez)', 'configurarHojas')
    .addToUi();
}

function configurarHojas() {
  prepararHoja(HOJA_REGISTROS, ENCABEZADOS_REGISTROS);
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
    asegurarEncabezados_(hoja, encabezados);
  }
  return hoja;
}

// Si la hoja ya desplegada gana columnas nuevas al final de la lista de
// encabezados, esto las agrega sin tocar las que ya existen.
function asegurarEncabezados_(hoja, encabezados) {
  const colActuales = hoja.getLastColumn();
  if (colActuales >= encabezados.length) return;
  const faltantes = encabezados.slice(colActuales);
  const rango = hoja.getRange(1, colActuales + 1, 1, faltantes.length);
  rango.setValues([faltantes]);
  rango.setFontWeight('bold');
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

// Escribe un objeto {NombreDeEncabezado: valor} en una fila, ubicando cada
// valor por el NOMBRE real de la columna en la hoja (fila 1), no por posición.
function escribirFilaPorEncabezado(hoja, fila, encabezadosEsperados, valores) {
  const nCols = Math.max(hoja.getLastColumn(), encabezadosEsperados.length);
  const encabezadosReales = hoja.getRange(1, 1, 1, nCols).getValues()[0];
  const datos = encabezadosReales.map(function (h) { return (h && (h in valores)) ? valores[h] : ''; });
  hoja.getRange(fila, 1, 1, datos.length).setValues([datos]);
}

function generarId_(prefijo) {
  const marca = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Costa_Rica', 'yyyyMMdd-HHmmss');
  const azar = Math.floor(100 + Math.random() * 900);
  return prefijo + '-' + marca + '-' + azar;
}

function hoyCR() {
  return Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd');
}

// ── REGISTRO: guardar ───────────────────────────────────────────────
// Siempre crea una fila nueva (esto es una bitácora de pesajes, no un
// registro editable) — p.id solo se usa como semilla del ID legible.
function registroGuardar(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  const pesoBruto = Number(p.pesoBruto);
  if (!pesoBruto || pesoBruto <= 0) throw new Error('Falta el peso bruto o no es válido.');
  if (!p.foto) throw new Error('Falta la foto de evidencia.');

  const hoja = prepararHoja(HOJA_REGISTROS, ENCABEZADOS_REGISTROS);
  const id = generarId_('PS');
  const tara = Number(p.tara) || 0;
  const pesoNeto = Math.max(0, pesoBruto - tara);
  const fotoUrl = guardarFotoEnDrive(p, id);

  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_REGISTROS, {
    'ID': id,
    'Fecha': p.fecha || hoyCR(),
    'Kiosko': p.kiosko,
    'Sifón / Estilo': p.identificacion || '',
    'Peso Bruto (g)': pesoBruto,
    'Tara (g)': tara,
    'Peso Neto (g)': pesoNeto,
    'Foto URL': fotoUrl,
    'Registrado por': p.registrado_por || '',
    'Registrado': p.registrado_en || new Date().toISOString(),
    'Notas': p.notas || ''
  });
  return { ok: true, id: id, pesoNeto: pesoNeto, fotoUrl: fotoUrl };
}

// ── FOTO → GOOGLE DRIVE (mismo patrón que Controles/Mermas: una
// subcarpeta por kiosko dentro de la carpeta raíz del módulo) ──────
function guardarFotoEnDrive(p, id) {
  if (!p.foto) return '';
  const datos = extraerBase64(p.foto);
  if (!datos) return '';
  const carpeta = getOrCreateCarpetaKiosko(p.kiosko);
  const nombre = `${p.fecha || hoyCR()}_sifon_${id}.jpg`;
  const bytes = Utilities.base64Decode(datos.base64);
  const blob = Utilities.newBlob(bytes, datos.mime, nombre);
  const file = carpeta.createFile(blob);
  return file.getUrl();
}

function getOrCreateCarpetaKiosko(kiosko) {
  const root = DriveApp.getFolderById(FOLDER_ID_PESOS_SIFONES);
  const nombre = (kiosko || 'Sin kiosko').toString();
  const existing = root.getFoldersByName(nombre);
  return existing.hasNext() ? existing.next() : root.createFolder(nombre);
}

function extraerBase64(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

// ── doGet / doPost ───────────────────────────────────────────────────
// Solo lectura del log completo por ahora (?modulo=registros) — no hay
// pantalla de historial en pesos-sifones.html todavía, pero dejar esto
// listo no cuesta nada y sirve para revisar datos o construir un
// historial más adelante sin otro despliegue.
function doGet(e) {
  try {
    const modulo = (e && e.parameter && e.parameter.modulo) || 'registros';
    if (modulo !== 'registros') return jsonOut({ ok: false, error: 'Módulo no reconocido: ' + modulo });
    const hoja = prepararHoja(HOJA_REGISTROS, ENCABEZADOS_REGISTROS);
    return jsonOut({ ok: true, registros: filasComoObjetos(hoja) });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

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
      case 'registro_guardar': return jsonOut(registroGuardar(payload));
      default: throw new Error('Acción desconocida: ' + payload.accion);
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
