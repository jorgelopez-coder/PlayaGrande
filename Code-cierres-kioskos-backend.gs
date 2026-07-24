// === Backend de Cierres de Caja — Ecosistema Kioskos ===
// Adaptado de Code-cierres-backend.gs (Ecosistema Lorito), simplificado para
// kioskos de cerveza y cocteles (sin crédito, sin plataformas de delivery,
// sin 10% de servicio — esas categorías no aplican a un kiosko de playa).
//
// Cómo desplegarlo:
// 1. Creá un Google Sheet nuevo, ej. "Registro Ventas - Kioskos".
// 2. Extensiones → Apps Script, pegá este código completo.
// 3. Corré UNA VEZ agregarEncabezados() desde el editor (▶ con esa función
//    seleccionada) para crear la pestaña "Cierres" con sus encabezados.
// 4. Implementar → Nueva implementación → Tipo: Aplicación web.
//    - Ejecutar como: Yo
//    - Quién tiene acceso: Cualquiera
// 5. Copiá la URL /exec resultante en SHEETS_URL dentro de cierres.html.
// 6. Creá una carpeta en Drive para las fotos de respaldo (ej. "Cierres de
//    caja - Kioskos"), copiá su ID y pegalo en FOLDER_ID_CIERRES más abajo.
// 7. Corré también UNA VEZ agregarEncabezadosTipsPagos() para crear la
//    pestaña "TipsPagos" (control de pago de propinas, control-tips.html).
//
// Si se agregan columnas nuevas: actualizar HEADERS al FINAL del array (nunca
// insertar en el medio), volver a pegar el código, Implementar → Gestionar
// implementaciones → Editar → Nueva versión (la URL /exec no cambia), y
// correr agregarEncabezados() de nuevo para que la fila de encabezados se
// actualice sin tocar los datos ya guardados.

// API key de Anthropic (Claude) para extraer datos del cierre de tarjeta por
// foto. Configurala en Extensiones → Apps Script → Configuración del
// proyecto (⚙️) → Propiedades del script → agregar ANTHROPIC_API_KEY.
const ANTHROPIC_API_KEY = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');

const HEADERS = [
  'ID', 'Fecha', 'Hora', 'Kiosko', 'Encargado', 'Turno',
  'Ventas Efectivo ₡', 'Ventas Tarjeta ₡', 'Ventas SINPE ₡', 'Otras Ventas ₡',
  'Total Ventas ₡',
  'Fondo Caja Inicial ₡',
  'Billetes ₡50.000', 'Billetes ₡20.000', 'Billetes ₡10.000', 'Billetes ₡5.000',
  'Billetes ₡2.000', 'Billetes ₡1.000', 'Monedas ₡500', 'Monedas ₡100',
  'Monedas ₡50', 'Monedas ₡25', 'Monedas ₡10', 'Monedas ₡5',
  'Tipo de Cambio', 'USD Total en ₡',
  'Billetes $100', 'Billetes $50', 'Billetes $20', 'Billetes $10', 'Billetes $5', 'Billetes $1',
  'Total USD Contado $',
  'Caja Total Contada ₡', 'Efectivo Esperado ₡', 'Diferencia Caja ₡', 'Caja Cuadra',
  'Total Datáfono ₡', 'Diferencia Tarjeta ₡', 'Tarjeta Cuadra',
  'Foto Cierre Sistema (URL)', 'Foto Cierre Datáfono (URL)',
  'Observaciones',
  'Tips ₡'
];

const HEADERS_DEPOSITOS = [
  'ID', 'Fecha registro', 'Fecha depósito', 'Kiosko', 'Número de referencia',
  'Monto CRC comprobante', 'Monto USD comprobante', 'Fechas cubiertas',
  'Monto CRC calculado', 'Monto USD calculado', 'Diferencia CRC', 'Diferencia USD',
  'Foto comprobante (URL)', 'Notas'
];

// Pagos de propinas a colaboradores (tips cobrados en el cierre de tarjeta,
// depositados aparte). Cada fila es un PAGO (puede cubrir varios cierres a
// la vez, de uno o más kioskos), no un cierre individual — los cierres
// cubiertos quedan en "IDs cierres cubiertos" (JSON con los ID de la hoja
// "Cierres"), igual que "Fechas cubiertas" en Depositos.
const HEADERS_TIPS_PAGOS = [
  'ID', 'Fecha registro', 'Fecha de pago', 'Número de referencia',
  'IDs cierres cubiertos', 'Kioskos', 'Monto total ₡', 'Notas'
];

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    let data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter && e.parameter.payload) {
      data = JSON.parse(e.parameter.payload);
    } else {
      throw new Error('No data received');
    }

    if (data.type === 'saveConfig') {
      let configSheet = ss.getSheetByName('Config');
      if (!configSheet) configSheet = ss.insertSheet('Config');
      configSheet.clearContents();
      configSheet.getRange(1, 1).setValue(JSON.stringify(data.config));
      return jsonOut({ result: 'ok' });
    }

    if (data.type === 'deposito') {
      return guardarDeposito(ss, data);
    }

    if (data.type === 'tipsPago') {
      return guardarPagoTips(ss, data);
    }

    if (data.type === 'extraerIA') {
      return extraerDatosTarjetaConIA(data);
    }

    let sheet = ss.getSheetByName('Cierres');
    if (!sheet) sheet = ss.insertSheet('Cierres');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    const fotoUrls = guardarFotosEnDrive(data);

    sheet.appendRow([
      data.id,                       // ID
      data.fecha,                    // Fecha
      data.hora,                     // Hora
      data.kiosko,                   // Kiosko
      data.encargado,                // Encargado
      data.turno,                    // Turno
      data.efectivo || 0,            // Ventas Efectivo ₡
      data.tarjeta || 0,             // Ventas Tarjeta ₡
      data.sinpe || 0,               // Ventas SINPE ₡
      data.otras || 0,               // Otras Ventas ₡
      data.totalVentas || 0,         // Total Ventas ₡
      data.fondoCajaInicial || 0,    // Fondo Caja Inicial ₡
      data.d50000 || 0, data.d20000 || 0, data.d10000 || 0, data.d5000 || 0,
      data.d2000 || 0, data.d1000 || 0, data.d500 || 0, data.d100 || 0,
      data.d50 || 0, data.d25 || 0, data.d10 || 0, data.d5 || 0,
      data.tc || 0,                  // Tipo de Cambio
      data.usdTotalCrc || 0,         // USD Total en ₡
      data.usdD100 || 0, data.usdD50 || 0, data.usdD20 || 0,
      data.usdD10 || 0, data.usdD5 || 0, data.usdD1 || 0,
      data.usdCajaTotalContado || 0, // Total USD Contado $
      data.cajaTotalContada || 0,    // Caja Total Contada ₡
      data.efectivoEsperado || 0,    // Efectivo Esperado ₡
      data.diferenciaCaja || 0,      // Diferencia Caja ₡
      data.cajaCuadra ? 'SI' : 'NO', // Caja Cuadra
      data.datafonoTotal || 0,       // Total Datáfono ₡
      data.diferenciaTarjeta || 0,   // Diferencia Tarjeta ₡
      data.tarjetaCuadra ? 'SI' : 'NO', // Tarjeta Cuadra
      fotoUrls.fotoSistemaUrl || '', // Foto Cierre Sistema (URL)
      fotoUrls.fotoDatafonoUrl || '',// Foto Cierre Datáfono (URL)
      data.obs || '',                // Observaciones
      data.tips || 0                 // Tips ₡
    ]);

    return jsonOut({ result: 'ok' });

  } catch (err) {
    return jsonOut({ result: 'error', message: err.toString() });
  }
}

// A diferencia del Sheet de RRHH, este backend nunca fuerza formato de texto
// en sus columnas de fecha/hora ('Fecha', 'Hora', 'Fecha registro', 'Fecha
// depósito', 'Fecha de pago'...). Si Google Sheets autoconvirtió alguna
// celda a un valor de fecha/hora real (Date object) — algo que puede pasar
// fila por fila según cómo se haya escrito el dato — JSON.stringify serializa
// ese Date en UTC. Los consumidores (cierres.html, depositos.html,
// control-tips.html, servicio-10.html, index.html) solo hacen
// String(fecha).slice(0,10), así que una fila afectada puede aparecer con la
// fecha corrida y quedar excluida de los cálculos de ese día (ej.: Venta Neta
// en ₡0 para una fecha con cierre real). Esta función reformatea cualquier
// celda Date de vuelta a texto en hora de Costa Rica antes de mandarla, para
// que la fecha/hora mostrada sea siempre la que se guardó, sin importar cómo
// la haya autoconvertido Sheets.
function normalizarFilaFechas(fila) {
  return fila.map(function (v) {
    if (!(v instanceof Date)) return v;
    const horaTxt = Utilities.formatDate(v, 'America/Costa_Rica', 'HH:mm');
    if (horaTxt === '00:00') {
      return Utilities.formatDate(v, 'America/Costa_Rica', 'yyyy-MM-dd');
    }
    return horaTxt;
  });
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (e && e.parameter && e.parameter.action === 'getConfig') {
    const configSheet = ss.getSheetByName('Config');
    if (!configSheet || configSheet.getLastRow() === 0) {
      return jsonOut({ config: null });
    }
    return jsonOut({ config: JSON.parse(configSheet.getRange(1, 1).getValue()) });
  }

  if (e && e.parameter && e.parameter.action === 'depositos') {
    const depSheet = ss.getSheetByName('Depositos');
    if (!depSheet || depSheet.getLastRow() === 0) return jsonOut({ records: [] });
    const rows = depSheet.getDataRange().getValues();
    return jsonOut({ records: rows.slice(1).map(normalizarFilaFechas) });
  }

  if (e && e.parameter && e.parameter.action === 'tipspagos') {
    const tipsSheet = ss.getSheetByName('TipsPagos');
    if (!tipsSheet || tipsSheet.getLastRow() === 0) return jsonOut({ records: [] });
    const rows = tipsSheet.getDataRange().getValues();
    return jsonOut({ records: rows.slice(1).map(normalizarFilaFechas) });
  }

  let sheet = ss.getSheetByName('Cierres');
  if (!sheet) sheet = ss.getActiveSheet();
  const rows = sheet.getDataRange().getValues();
  return jsonOut({ records: rows.slice(1).map(normalizarFilaFechas) });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function agregarEncabezados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Cierres');
  if (!sheet) sheet = ss.insertSheet('Cierres');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  } else {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function agregarEncabezadosDepositos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Depositos');
  if (!sheet) sheet = ss.insertSheet('Depositos');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS_DEPOSITOS);
  } else {
    sheet.getRange(1, 1, 1, HEADERS_DEPOSITOS.length).setValues([HEADERS_DEPOSITOS]);
  }
  sheet.getRange(1, 1, 1, HEADERS_DEPOSITOS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function agregarEncabezadosTipsPagos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('TipsPagos');
  if (!sheet) sheet = ss.insertSheet('TipsPagos');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS_TIPS_PAGOS);
  } else {
    sheet.getRange(1, 1, 1, HEADERS_TIPS_PAGOS.length).setValues([HEADERS_TIPS_PAGOS]);
  }
  sheet.getRange(1, 1, 1, HEADERS_TIPS_PAGOS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

// ── DEPÓSITOS BANCARIOS ───────────────────────────────────────────
function guardarDeposito(ss, data) {
  let sheet = ss.getSheetByName('Depositos');
  if (!sheet) sheet = ss.insertSheet('Depositos');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS_DEPOSITOS);
    sheet.getRange(1, 1, 1, HEADERS_DEPOSITOS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  let fotoUrl = '';
  if (data.fotoComprobante) {
    const carpeta = getOrCreateCarpetaComprobantes();
    const nombre = `${data.fechaDeposito || hoyCR()}_${data.kiosko || 'kiosko'}_${data.referencia || 'sin-ref'}_${data.id || Date.now()}.jpg`
      .replace(/[^\w\-.]+/g, '_');
    fotoUrl = guardarImagenBase64(carpeta, data.fotoComprobante, data.fotoComprobanteMime || 'image/jpeg', nombre);
  }

  sheet.appendRow([
    data.id || Date.now(),
    hoyCR(),
    data.fechaDeposito || '',
    data.kiosko || '',
    data.referencia || '',
    data.montoCrcComprobante || 0,
    data.montoUsdComprobante || 0,
    JSON.stringify(data.fechasCubiertas || []),
    data.montoCrcCalculado || 0,
    data.montoUsdCalculado || 0,
    data.diferenciaCrc || 0,
    data.diferenciaUsd || 0,
    fotoUrl,
    data.notas || ''
  ]);

  return jsonOut({ result: 'ok' });
}

// ── PAGOS DE PROPINAS (TIPS) ──────────────────────────────────────
// data: { id, fechaPago, referencia, idsCubiertos:[ID de Cierres...],
//         kioskos:[nombre...], montoTotal, notas }
function guardarPagoTips(ss, data) {
  let sheet = ss.getSheetByName('TipsPagos');
  if (!sheet) sheet = ss.insertSheet('TipsPagos');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS_TIPS_PAGOS);
    sheet.getRange(1, 1, 1, HEADERS_TIPS_PAGOS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([
    data.id || Date.now(),
    hoyCR(),
    data.fechaPago || '',
    data.referencia || '',
    JSON.stringify(data.idsCubiertos || []),
    (data.kioskos || []).join(', '),
    data.montoTotal || 0,
    data.notas || ''
  ]);

  return jsonOut({ result: 'ok' });
}

function getOrCreateCarpetaComprobantes() {
  const root = getRootFolderFotos();
  const padre = root.getParents().hasNext() ? root.getParents().next() : root;
  const nombre = 'Depósitos - Comprobantes';
  const existing = padre.getFoldersByName(nombre);
  return existing.hasNext() ? existing.next() : padre.createFolder(nombre);
}

// ── FOTOS DE CIERRE → GOOGLE DRIVE ───────────────────────────────
// Carpeta raíz fija (FOLDER_ID_CIERRES más abajo), con una subcarpeta por
// kiosko y, dentro, una subcarpeta por fecha (YYYY-MM-DD).

function guardarFotosEnDrive(payload) {
  if (!payload.fotoSistema && !payload.fotoDatafono) return {};

  const carpetaDia = getOrCreateCarpetaDia(payload.kiosko, payload.fecha);
  const encargado = (payload.encargado || 'sin-encargado').toString().replace(/[^\w\-]+/g, '_');
  const turno = (payload.turno || '').toString().replace(/[^\w\-]+/g, '_');
  const prefijo = `${payload.fecha || hoyCR()}_${turno}_${encargado}_${payload.id || Date.now()}`;

  const urls = {};
  if (payload.fotoSistema) {
    urls.fotoSistemaUrl = guardarImagenBase64(
      carpetaDia, payload.fotoSistema, payload.fotoSistemaMime || 'image/jpeg', `${prefijo}_sistema.jpg`
    );
  }
  if (payload.fotoDatafono) {
    urls.fotoDatafonoUrl = guardarImagenBase64(
      carpetaDia, payload.fotoDatafono, payload.fotoDatafonoMime || 'image/jpeg', `${prefijo}_datafono.jpg`
    );
  }
  return urls;
}

function getOrCreateCarpetaDia(kiosko, fecha) {
  const carpetaKiosko = getOrCreateCarpetaKiosko(kiosko);
  const nombreCarpeta = fecha || hoyCR();
  const existing = carpetaKiosko.getFoldersByName(nombreCarpeta);
  return existing.hasNext() ? existing.next() : carpetaKiosko.createFolder(nombreCarpeta);
}

function getOrCreateCarpetaKiosko(kiosko) {
  const root = getRootFolderFotos();
  const nombre = (kiosko || 'Sin kiosko').toString();
  const existing = root.getFoldersByName(nombre);
  return existing.hasNext() ? existing.next() : root.createFolder(nombre);
}

// Carpeta "Cierres de caja - Kioskos" en Drive (ver paso 6 en el comentario
// de arriba). Adentro se crea una subcarpeta por kiosko y, dentro de esa,
// una subcarpeta por fecha (yyyy-MM-dd) donde se guardan las fotos de cada
// cierre.
const FOLDER_ID_CIERRES = '1bx45Q9J16XTfFZ2QBlg9o3-ACGLynB_l';

function getRootFolderFotos() {
  return DriveApp.getFolderById(FOLDER_ID_CIERRES);
}

function guardarImagenBase64(folder, base64, mimeType, fileName) {
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const file = folder.createFile(blob);
  return file.getUrl();
}

function hoyCR() {
  return Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd');
}

// Corré esta función UNA VEZ manualmente desde el editor (▶ con
// "autorizarPermisos" seleccionada en el desplegable de arriba) para que
// Apps Script pida el permiso "Conectarse a un servicio externo"
// (script.external_request), necesario para que extraerDatosTarjetaConIA()
// pueda llamar a la API de Claude. Sin este paso, el extractor con IA falla
// con "No cuentas con el permiso para llamar a UrlFetchApp.fetch".
function autorizarPermisos() {
  UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { method: 'post', muteHttpExceptions: true });
  Logger.log('Permiso de conexión externa autorizado correctamente.');
}

// ── EXTRACCIÓN CON IA (foto del cierre de tarjeta / datáfono) ────
// Recibe { fotoDatafono (base64), fotoDatafonoMime } y le pide a Claude
// (Anthropic) que lea el comprobante de cierre de lote del datáfono y
// devuelva venta total, base y propina.
function extraerDatosTarjetaConIA(data) {
  try {
    if (!ANTHROPIC_API_KEY) {
      return jsonOut({ result: 'error', ok: false, error: 'Falta configurar ANTHROPIC_API_KEY en Propiedades del Script.' });
    }
    if (!data.fotoDatafono) {
      return jsonOut({ result: 'error', ok: false, error: 'No se recibió ninguna foto.' });
    }

    const body = {
      model: 'claude-sonnet-5',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: data.fotoDatafonoMime || 'image/jpeg',
              data: data.fotoDatafono
            }
          },
          {
            type: 'text',
            text: 'Esta es una foto del cierre de lote (batch closing) de un datáfono/POS de tarjeta en Costa Rica. '
              + 'Extraé estos tres montos numéricos: venta total, base (monto de venta sin propina) y propina (tip). '
              + 'Respondé ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con este formato exacto: '
              + '{"ventaTotal": <número o null>, "base": <número o null>, "propina": <número o null>}. '
              + 'Usá punto decimal, sin símbolos de moneda ni separadores de miles.'
          }
        ]
      }]
    };

    const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });

    const result = JSON.parse(resp.getContentText());
    if (result.error) {
      return jsonOut({ result: 'error', ok: false, error: result.error.message || 'Error de la API de Claude' });
    }

    const textoRespuesta = (result.content || []).map(c => c.text || '').join('');
    const match = textoRespuesta.match(/\{[\s\S]*\}/);
    if (!match) {
      return jsonOut({ result: 'error', ok: false, error: 'La IA no devolvió datos reconocibles. Completá manualmente.' });
    }
    const extraido = JSON.parse(match[0]);

    return jsonOut({
      result: 'ok',
      ok: true,
      data: {
        ventaTotal: extraido.ventaTotal === null || extraido.ventaTotal === undefined ? null : Number(extraido.ventaTotal),
        base: extraido.base === null || extraido.base === undefined ? null : Number(extraido.base),
        propina: extraido.propina === null || extraido.propina === undefined ? null : Number(extraido.propina)
      }
    });
  } catch (err) {
    return jsonOut({ result: 'error', ok: false, error: err.toString() });
  }
}
