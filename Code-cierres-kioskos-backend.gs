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
//
// v2 (2026-07-29): pestaña nueva "SalidasFondoCaja" — cuando en
// cuentas-por-pagar.html se paga a un proveedor con Medio de pago = "Fondo de
// caja", ese pago se registra acá (doPost type:'salidaFondo') para que
// depositos.html/indicadores.html/index.html puedan rebajarlo del "efectivo
// pendiente de depositar" de la fecha de cierre que corresponda (antes esos
// tres módulos solo calculaban caja − fondo, sin enterarse de estas salidas).
// Para desplegar: pegá el código completo de nuevo, corré UNA VEZ (a mano,
// desde el editor) agregarEncabezadosSalidasFondo(), e Implementar → Gestionar
// implementaciones → Editar → Nueva versión. No hace falta tocar nada más en
// este Sheet — la URL /exec no cambia y cuentas-por-pagar.html/depositos.html/
// indicadores.html/index.html apuntan todos a esta misma URL.

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

// Salidas de fondo de caja (2026-07-29): cuando en cuentas-por-pagar.html se
// registra un pago/abono a proveedor con Medio de pago = "Fondo de caja", ese
// dinero salió del efectivo retenido en un cierre de caja puntual (no de una
// cuenta bancaria) — así que hay que rebajarlo del "efectivo pendiente de
// depositar" de esa fecha/kiosko en depositos.html/indicadores.html/
// index.html (que hasta ahora solo calculaban caja − fondo). Cada fila acá es
// UN pago con Fondo de caja; "Fecha del efectivo" es la fecha del cierre de
// caja que Jorge elige a mano en el modal (no necesariamente la fecha en que
// se registra el pago). Ver guardarSalidaFondo()/doGet 'salidasfondo' abajo.
const HEADERS_SALIDAS_FONDO = [
  'ID', 'Fecha registro', 'Fecha del efectivo', 'Kiosko', 'Monto CRC',
  'Proveedor', 'Factura', 'Referencia', 'Notas', 'Origen'
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

    if (data.type === 'salidaFondo') {
      return guardarSalidaFondo(ss, data);
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

    invalidarCache(['cierres_v1', 'pendientes_v1']);
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
    return jsonOut(conCache('depositos_v1', function () {
      const depSheet = ss.getSheetByName('Depositos');
      if (!depSheet || depSheet.getLastRow() === 0) return { records: [] };
      const rows = depSheet.getDataRange().getValues();
      return { records: rows.slice(1).map(normalizarFilaFechas) };
    }));
  }

  if (e && e.parameter && e.parameter.action === 'tipspagos') {
    return jsonOut(conCache('tipspagos_v1', function () {
      const tipsSheet = ss.getSheetByName('TipsPagos');
      if (!tipsSheet || tipsSheet.getLastRow() === 0) return { records: [] };
      const rows = tipsSheet.getDataRange().getValues();
      return { records: rows.slice(1).map(normalizarFilaFechas) };
    }));
  }

  if (e && e.parameter && e.parameter.action === 'salidasfondo') {
    return jsonOut(conCache('salidasfondo_v1', function () {
      const salidasSheet = ss.getSheetByName('SalidasFondoCaja');
      if (!salidasSheet || salidasSheet.getLastRow() === 0) return { records: [] };
      const rows = salidasSheet.getDataRange().getValues();
      return { records: rows.slice(1).map(normalizarFilaFechas) };
    }));
  }

  // action=pendientes (2026-08-12): tips y efectivo pendientes de pago/
  // depósito, calculados acá cruzando Cierres/TipsPagos/Depositos/
  // SalidasFondoCaja — ver calcularPendientes() más abajo. Reemplaza el
  // cálculo que antes hacía cada frontend (index.html/indicadores.html)
  // después de traerse el historial COMPLETO de las 4 hojas: lo pendiente
  // es casi siempre una lista chica (lo normal es que se resuelva rápido),
  // así que no crece con los años de historial como sí crecía "action=read".
  if (e && e.parameter && e.parameter.action === 'pendientes') {
    return jsonOut(conCache('pendientes_v1', function () {
      return calcularPendientes(ss);
    }));
  }

  const desde = e && e.parameter && e.parameter.desde || '';
  const hasta = e && e.parameter && e.parameter.hasta || '';

  // Cache separado por rango cuando se pasa desde/hasta — no se invalida
  // puntualmente en cada escritura (solo la llave sin rango, 'cierres_v1',
  // se limpia al guardar un cierre), así que una vista con rango puede
  // quedar hasta CACHE_TTL_SEGUNDOS (2 min) desactualizada tras guardar un
  // cierre nuevo. Igual que "action=read" sin parámetros, sigue devolviendo
  // TODO el historial si no se pasa ninguno de los dos — nada cambia para
  // quien no los use.
  const cacheKey = (desde || hasta) ? ('cierres_v1|' + desde + '|' + hasta) : 'cierres_v1';

  return jsonOut(conCache(cacheKey, function () {
    let sheet = ss.getSheetByName('Cierres');
    if (!sheet) sheet = ss.getActiveSheet();
    const rows = sheet.getDataRange().getValues();
    let registros = rows.slice(1).map(normalizarFilaFechas);
    if (desde) registros = registros.filter(function (r) { return String(r[1] || '').slice(0, 10) >= desde; });
    if (hasta) registros = registros.filter(function (r) { return String(r[1] || '').slice(0, 10) <= hasta; });
    return { records: registros };
  }));
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// === Cache de lecturas (2026-08-12) ===================================
// CacheService evita releer el Sheet completo (getDataRange().getValues())
// en cada carga de pantalla — index.html, cierres.html, depositos.html,
// control-tips.html e indicadores.html pegan todos contra este mismo
// doGet, muchas veces en el mismo minuto. TTL corto (2 min) para no mostrar
// datos viejos por mucho tiempo; además cada doPost que escribe una de estas
// hojas borra su llave de cache de inmediato (ver invalidarCache() abajo),
// así que un cierre/depósito/pago nuevo se ve de inmediato para quien lo
// guardó, aunque otra persona mirando el dashboard tarde hasta 2 min en
// verlo reflejado.
var CACHE_TTL_SEGUNDOS = 120;

function conCache(key, calcular) {
  var cache = CacheService.getScriptCache();
  try {
    var cached = cache.get(key);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* si falla la lectura de cache, seguimos y recalculamos */ }

  var resultado = calcular();

  try {
    cache.put(key, JSON.stringify(resultado), CACHE_TTL_SEGUNDOS);
  } catch (e) {
    // Sheets muy grandes pueden superar el límite de ~100KB por llave de
    // CacheService — en ese caso simplemente no se cachea, sin romper nada.
  }

  return resultado;
}

function invalidarCache(keys) {
  try {
    CacheService.getScriptCache().removeAll(keys);
  } catch (e) { /* no crítico */ }
}

// === Pendientes (tips y efectivo) calculados server-side (2026-08-12) ===
// Misma lógica que index.html (renderTipsPendientes/renderEfectivoPendiente)
// e indicadores.html — si se cambia el cálculo acá, cambiarlo también ahí
// (o, mejor, migrar esos frontends a consumir action=pendientes en vez de
// recalcular con el historial completo, ver README). Índices de columna
// tomados de HEADERS/HEADERS_DEPOSITOS/HEADERS_TIPS_PAGOS/
// HEADERS_SALIDAS_FONDO de arriba — si esos arrays cambian, actualizar acá.
function calcularPendientes(ss) {
  const cierresSheet = ss.getSheetByName('Cierres');
  const cierresRaw = (cierresSheet && cierresSheet.getLastRow() > 1)
    ? cierresSheet.getDataRange().getValues().slice(1).map(normalizarFilaFechas)
    : [];

  const tipsSheet = ss.getSheetByName('TipsPagos');
  const tipsPagosRaw = (tipsSheet && tipsSheet.getLastRow() > 1)
    ? tipsSheet.getDataRange().getValues().slice(1).map(normalizarFilaFechas)
    : [];

  const depSheet = ss.getSheetByName('Depositos');
  const depositosRaw = (depSheet && depSheet.getLastRow() > 1)
    ? depSheet.getDataRange().getValues().slice(1).map(normalizarFilaFechas)
    : [];

  const salidasSheet = ss.getSheetByName('SalidasFondoCaja');
  const salidasFondoRaw = (salidasSheet && salidasSheet.getLastRow() > 1)
    ? salidasSheet.getDataRange().getValues().slice(1).map(normalizarFilaFechas)
    : [];

  // ── Tips pendientes de pago (Cierres.Tips > 0 sin cubrir en TipsPagos) ──
  const idsPagados = {};
  tipsPagosRaw.forEach(function (r) {
    var ids = [];
    try { ids = JSON.parse(r[4] || '[]'); } catch (e) { ids = []; }
    if (Array.isArray(ids)) ids.forEach(function (id) { idsPagados[String(id)] = true; });
  });
  const tipsPendientes = cierresRaw
    .filter(function (r) { return (+r[43] || 0) > 0 && !idsPagados[String(r[0])]; })
    .map(function (r) { return { fecha: String(r[1] || '').slice(0, 10), kiosko: r[3] || '', monto: +r[43] || 0 }; })
    .sort(function (a, b) { return b.fecha.localeCompare(a.fecha); });

  // ── Efectivo pendiente de depositar (Cierres agregado por kiosko+fecha,
  //    menos Depositos ya asignados, menos SalidasFondoCaja) ──
  const COL_FECHA = 1, COL_KIOSKO = 3, COL_FONDO = 11, COL_USD_TOTAL = 32;
  const COL_BILLETES_CRC = [12, 13, 14, 15, 16, 17];
  const COL_MONEDAS_CRC = [18, 19, 20, 21, 22, 23];
  const DENOMS_BILLETES_CRC = [50000, 20000, 10000, 5000, 2000, 1000];
  const DENOMS_MONEDAS_CRC = [500, 100, 50, 25, 10, 5];

  const porKioskoFecha = {};
  cierresRaw.forEach(function (r) {
    const fecha = String(r[COL_FECHA] || '').slice(0, 10);
    const kiosko = r[COL_KIOSKO] || '';
    if (!fecha || !kiosko) return;
    const key = kiosko + '|' + fecha;
    if (!porKioskoFecha[key]) porKioskoFecha[key] = { kiosko: kiosko, fecha: fecha, crc: 0, usd: 0 };
    const fondo = +r[COL_FONDO] || 0, usdTotal = +r[COL_USD_TOTAL] || 0;
    let caja = 0;
    COL_BILLETES_CRC.forEach(function (c, i) { caja += (+r[c] || 0) * DENOMS_BILLETES_CRC[i]; });
    COL_MONEDAS_CRC.forEach(function (c, i) { caja += (+r[c] || 0) * DENOMS_MONEDAS_CRC[i]; });
    porKioskoFecha[key].crc += (caja - fondo);
    porKioskoFecha[key].usd += usdTotal;
  });

  salidasFondoRaw.forEach(function (r) {
    if (!r[0]) return;
    const kiosko = r[3] || '';
    const fecha = String(r[2] || '').slice(0, 10);
    const key = kiosko + '|' + fecha;
    if (!fecha || !kiosko || !porKioskoFecha[key]) return;
    porKioskoFecha[key].crc -= (+r[4] || 0);
  });

  const cubiertas = {};
  depositosRaw.forEach(function (r) {
    if (!r[0]) return;
    const kiosko = r[3] || '';
    var fechas = [];
    try { fechas = JSON.parse(r[7] || '[]'); } catch (e) { fechas = []; }
    if (!Array.isArray(fechas)) fechas = [];
    if (!cubiertas[kiosko]) cubiertas[kiosko] = {};
    fechas.forEach(function (f) { cubiertas[kiosko][f] = true; });
  });

  const efectivoPendiente = Object.keys(porKioskoFecha)
    .map(function (k) { return porKioskoFecha[k]; })
    .filter(function (x) { return !(cubiertas[x.kiosko] && cubiertas[x.kiosko][x.fecha]); })
    .sort(function (a, b) { return b.fecha.localeCompare(a.fecha); });

  return { tipsPendientes: tipsPendientes, efectivoPendiente: efectivoPendiente };
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

function agregarEncabezadosSalidasFondo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('SalidasFondoCaja');
  if (!sheet) sheet = ss.insertSheet('SalidasFondoCaja');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS_SALIDAS_FONDO);
  } else {
    sheet.getRange(1, 1, 1, HEADERS_SALIDAS_FONDO.length).setValues([HEADERS_SALIDAS_FONDO]);
  }
  sheet.getRange(1, 1, 1, HEADERS_SALIDAS_FONDO.length).setFontWeight('bold');
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

  invalidarCache(['depositos_v1', 'pendientes_v1']);
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

  invalidarCache(['tipspagos_v1', 'pendientes_v1']);
  return jsonOut({ result: 'ok' });
}

// ── SALIDAS DE FONDO DE CAJA (pagos a proveedores con Medio de pago =
// "Fondo de caja", registrados desde cuentas-por-pagar.html) ─────────
// data: { id, fecha (fecha del efectivo/cierre elegida a mano), kiosko,
//         monto, proveedor, factura, referencia, notas }
function guardarSalidaFondo(ss, data) {
  let sheet = ss.getSheetByName('SalidasFondoCaja');
  if (!sheet) sheet = ss.insertSheet('SalidasFondoCaja');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS_SALIDAS_FONDO);
    sheet.getRange(1, 1, 1, HEADERS_SALIDAS_FONDO.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([
    data.id || Date.now(),
    hoyCR(),
    data.fecha || '',
    data.kiosko || '',
    data.monto || 0,
    data.proveedor || '',
    data.factura || '',
    data.referencia || '',
    data.notas || '',
    data.origen || 'Cuentas por pagar'
  ]);

  invalidarCache(['salidasfondo_v1', 'pendientes_v1']);
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
  // "Cualquiera con el link" en modo solo lectura — sin esto el link que se
  // manda por WhatsApp (ver reporte cierres.html) no abre para quien no
  // tenga acceso directo a la carpeta de Drive.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
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
