/**
 * Backend de Toma de Pesos - Sifones (pesos-sifones.html, Ecosistema Kioskos)
 * — formulario simple y standalone pensado para que el personal de piso
 * registre, por kiosko, el peso y la existencia (barriles llenos en
 * bodega) de TODOS los tipos de cerveza a la vez, con foto obligatoria
 * (si hay peso) como evidencia. A propósito NO calcula saldo esperado ni
 * compara contra compras/ventas/mermas, y tampoco pide tara — es solo una
 * bitácora de datos crudos (el cálculo se hace después, aparte). Eso otro
 * (saldo esperado, punto de partida, arqueos con diferencia, historial,
 * catálogo de estilos) ya lo hace la pestaña "Arqueo" de Controles
 * (balance-barriles.html) — este módulo es aparte, pensado para captura
 * rápida sin ver el resto de ese módulo. pesos-sifones.html SÍ lee (solo
 * lectura, ?modulo=estilos) el catálogo de tipos de cerveza de Controles
 * para no duplicarlo, pero nunca escribe ahí.
 *
 * Guarda todo en UN solo request por lote (acción registros_guardar_lote):
 * el formulario manda un item por cada tipo de cerveza que sí tenga datos
 * (peso y/o barriles llenos), y este backend crea una fila por item y sube
 * su foto (si vino) a Drive, todo en una sola ejecución — así se evita
 * mandar muchos POST seguidos desde el navegador para una sola ronda.
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
// Una fila = un pesaje/conteo de un tipo de cerveza en un kiosko, en una
// ronda dada. Sin tara ni peso neto — eso se calcula después, aparte.
const HOJA_REGISTROS = 'Registros';
const ENCABEZADOS_REGISTROS = [
  'ID', 'Fecha', 'Kiosko', 'Estilo', 'Peso Bruto (g)', 'Barriles Llenos Bodega',
  'Foto URL', 'Registrado por', 'Registrado', 'Notas'
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

// ── REGISTROS: guardar por lote ──────────────────────────────────────
// Un item por cada tipo de cerveza que el formulario mandó con datos
// (peso y/o barriles llenos > 0 — los vacíos ya se filtran del lado del
// cliente, pero se vuelven a filtrar acá por si acaso). Cada item genera
// su propia fila y su propia foto en Drive; todo en una sola ejecución
// para no depender de varios POST seguidos desde el navegador.
function registrosGuardarLote(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!Array.isArray(p.items) || !p.items.length) throw new Error('No hay datos para guardar.');

  const hoja = prepararHoja(HOJA_REGISTROS, ENCABEZADOS_REGISTROS);
  const fecha = p.fecha || hoyCR();
  const resultado = [];

  p.items.forEach(function (item) {
    const pesoBruto = Number(item.pesoBruto) || 0;
    const barrilesLlenos = Number(item.barrilesLlenos) || 0;
    if (!pesoBruto && !barrilesLlenos) return; // fila vacía, se ignora

    const id = generarId_('PS');
    const fotoUrl = guardarFotoEnDrive(item, id, p.kiosko, fecha);
    const fila = hoja.getLastRow() + 1;
    escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_REGISTROS, {
      'ID': id,
      'Fecha': fecha,
      'Kiosko': p.kiosko,
      'Estilo': item.identificacion || '',
      'Peso Bruto (g)': pesoBruto,
      'Barriles Llenos Bodega': barrilesLlenos,
      'Foto URL': fotoUrl,
      'Registrado por': p.registrado_por || '',
      'Registrado': p.registrado_en || new Date().toISOString(),
      'Notas': p.notas || ''
    });
    resultado.push({
      id: id, identificacion: item.identificacion || '',
      pesoBruto: pesoBruto, barrilesLlenos: barrilesLlenos, fotoUrl: fotoUrl
    });
  });

  if (!resultado.length) throw new Error('No hay datos para guardar.');
  return { ok: true, items: resultado };
}

// ── FOTO → GOOGLE DRIVE (mismo patrón que Controles/Mermas: una
// subcarpeta por kiosko dentro de la carpeta raíz del módulo) ──────
function guardarFotoEnDrive(item, id, kiosko, fecha) {
  if (!item.foto) return '';
  const datos = extraerBase64(item.foto);
  if (!datos) return '';
  const carpeta = getOrCreateCarpetaKiosko(kiosko);
  const slug = String(item.identificacion || 'sifon').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sifon';
  const nombre = `${fecha}_${slug}_${id}.${extensionParaMime_(datos.mime)}`;
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

// El frontend comprime a WebP cuando el navegador lo soporta (más liviano
// que JPEG a igual calidad) y cae a JPEG si no — esto solo decide la
// extensión del archivo en Drive según el mime real que llegó.
function extensionParaMime_(mime) {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  return 'jpg';
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
      case 'registros_guardar_lote': return jsonOut(registrosGuardarLote(payload));
      default: throw new Error('Acción desconocida: ' + payload.accion);
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
