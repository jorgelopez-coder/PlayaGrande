/**
 * SQUARE → GOOGLE SHEETS: BASE DE DATOS PARA CONTROLES AUTOMATIZADOS
 * --------------------------------------------------------------------
 * Genera tres fuentes de datos diarias:
 *   1. Ventas_Por_Producto   → detalle línea por línea de cada venta (para
 *      menu engineering, costeo de recetas, control de mermas, etc.)
 *   2. Resumen_Pagos_Diario  → totales por día y local, desglosados por
 *      medio de pago (efectivo, tarjeta, otro) — para conciliar contra el
 *      cierre de caja y los depósitos bancarios.
 *   3. Descuentos            → detalle de cada descuento aplicado (fecha,
 *      hora, producto, porcentaje o monto, motivo) — para auditoría de
 *      cortesías, happy hour, descuentos de empleado, etc.
 *
 * CONFIGURACIÓN INICIAL (una sola vez):
 *   1. Extensiones > Apps Script > pegar este código completo
 *   2. Configuración del proyecto (⚙️) > Propiedades del script >
 *      agregar SQUARE_ACCESS_TOKEN con tu access token de producción
 *   3. Ajustar LOCATION_IDS abajo
 *   4. Ejecutar configurar() una vez
 *   5. Ejecutar crearTrigger() una vez (sync automático cada hora)
 *
 * USO DIARIO / HISTÓRICO:
 *   - actualizarHoy()              → trae lo del día en curso
 *   - actualizarFecha('2026-06-15') → trae un día específico
 *   - actualizarDesde('2026-06-01') → backfill desde esa fecha hasta hoy,
 *     día por día, se reanuda sola si Apps Script corta por tiempo
 *
 * Todas las funciones son seguras de repetir: no duplican pedidos ni pagos
 * ya procesados.
 */
// ==================== CONFIGURACIÓN ====================
const ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('SQUARE_ACCESS_TOKEN');
const LOCATION_IDS = ['LDJGGGQMD5ZXN']; // agrega más IDs si tienes varios locales
const SQUARE_VERSION = '2024-06-04';
const TZ = Session.getScriptTimeZone();

// location_id de Square → nombre de kiosko (tal como aparece en cierres.html).
// Agregá una entrada por cada kiosko que tenga su propio location_id de Square.
const LOCATION_KIOSKO_MAP = {
  'LDJGGGQMD5ZXN': 'Playa Grande'
};

const SHEET_PRODUCTO = 'Ventas_Por_Producto';
const SHEET_CONTROL_ORDENES = 'Control_Ordenes';
const SHEET_PAGOS_DIARIO = 'Resumen_Pagos_Diario';
const SHEET_CONTROL_PAGOS = 'Control_Pagos';
const SHEET_RESUMEN_CIERRE = 'Resumen_Cierre_Diario';
// =========================================================

// ==================== SETUP ====================
function configurar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  crearHojaSiNoExiste(ss, SHEET_PRODUCTO,
    ['Fecha', 'Hora', 'Location ID', 'Order ID', 'Producto', 'Categoría', 'Cantidad', 'Precio Unitario', 'Descuento',
      'Total Línea']);
  crearHojaSiNoExiste(ss, SHEET_CONTROL_ORDENES,
    ['Order ID', 'Fecha Sync']);
  crearHojaSiNoExiste(ss, SHEET_PAGOS_DIARIO,
    ['Fecha', 'Location ID', 'Efectivo', 'Tarjeta', 'Otro', 'Total']);
  crearHojaSiNoExiste(ss, SHEET_CONTROL_PAGOS,
    ['Payment ID']);
  crearHojaSiNoExiste(ss, SHEET_RESUMEN_CIERRE,
    ['Fecha', 'Location ID', 'Ventas Brutas', 'Descuentos y Cortesías', 'Ventas Netas']);
  // ▼▼▼ NUEVO: hoja de Descuentos ▼▼▼
  crearHojaSiNoExiste(ss, 'Descuentos',
    ['Fecha', 'Hora', 'Location ID', 'Order ID', 'Producto', 'Porcentaje o Monto', 'Motivo']);
  crearHojaSiNoExiste(ss, 'Control_Descuentos', ['Order ID']);
  // ▲▲▲ FIN NUEVO ▲▲▲

  // Formatear columna Fecha como fecha real (no texto) en las hojas que la usan
  ss.getSheetByName(SHEET_PRODUCTO).getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  ss.getSheetByName(SHEET_PAGOS_DIARIO).getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  ss.getSheetByName(SHEET_RESUMEN_CIERRE).getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  ss.getSheetByName('Descuentos').getRange('A2:A').setNumberFormat('yyyy-mm-dd'); // ← NUEVO

  Logger.log('Hojas listas. Verifica que SQUARE_ACCESS_TOKEN esté configurado en Propiedades del Script.');
}

function crearHojaSiNoExiste(ss, nombre, encabezados) {
  if (!ss.getSheetByName(nombre)) {
    const sh = ss.insertSheet(nombre);
    sh.appendRow(encabezados);
    sh.setFrozenRows(1);
  }
}

function crearTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'actualizarHoy') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('actualizarHoy')
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log('Trigger creado: actualizarHoy() correrá cada hora.');
}

// ==================== FUNCIONES DE USO DIARIO ====================
function actualizarHoy() {
  const ahora = new Date();
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  actualizarRango(inicioHoy, ahora);
  Logger.log('Actualización de hoy completa.');
}

function actualizarFecha(fechaStr) {
  // fechaStr formato 'yyyy-MM-dd'
  const desde = new Date(fechaStr + 'T00:00:00');
  const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);
  actualizarRango(desde, hasta);
  Logger.log(`Actualización del ${fechaStr} completa.`);
}

function corregirEncabezadoProducto() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PRODUCTO);
  sheet.getRange(1, 1, 1, 10).setValues([
    ['Fecha', 'Hora', 'Location ID', 'Order ID', 'Producto', 'Categoría', 'Cantidad', 'Precio Unitario', 'Descuento',
      'Total Línea']
  ]);
  Logger.log('Encabezado de Ventas_Por_Producto corregido.');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Controles Square')
    .addItem('Actualizar resumen de cierre (brutas/descuentos/netas)', 'generarResumenCierreDiario')
    .addItem('Actualizar ventas y pagos de hoy', 'actualizarHoy')
    .addToUi();
}

function generarResumenCierreDiario() {
  const filas = generarResumenCierreDiarioCore();
  if (filas === 0) {
    SpreadsheetApp.getUi().alert('No hay datos en Ventas_Por_Producto todavía.');
  }
}

// Misma lógica que generarResumenCierreDiario(), pero sin llamar SpreadsheetApp.getUi()
// para que también pueda correr desde el Web App (doGet), donde no hay UI disponible.
function generarResumenCierreDiarioCore() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetProducto = ss.getSheetByName(SHEET_PRODUCTO);
  const sheetResumen = ss.getSheetByName(SHEET_RESUMEN_CIERRE);
  const filas = sheetProducto.getLastRow() - 1;
  if (filas <= 0) {
    Logger.log('No hay datos en Ventas_Por_Producto todavía.');
    return 0;
  }

  // Columnas: Fecha, Hora, Location ID, Order ID, Producto, Categoría, Cantidad, Precio Unitario, Descuento, Total Línea
  const datos = sheetProducto.getRange(2, 1, filas, 10).getValues();

  const porDia = {}; // 'fechaStr|locationId' -> { fechaReal, bruto, descuento, neto }
  datos.forEach(fila => {
    const [fecha, , locationId, , , , cantidad, precioUnit, descuento, totalLinea] = fila;
    const fechaReal = fecha instanceof Date ? fecha : new Date(fecha);
    const fechaStr = Utilities.formatDate(fechaReal, TZ, 'yyyy-MM-dd');
    const key = fechaStr + '|' + locationId;
    if (!porDia[key]) porDia[key] = { fechaReal: fechaReal, bruto: 0, descuento: 0, neto: 0 };
    porDia[key].bruto += (Number(cantidad) || 0) * (Number(precioUnit) || 0);
    porDia[key].descuento += Number(descuento) || 0;
    porDia[key].neto += Number(totalLinea) || 0;
  });

  // Recalcula la hoja completa desde cero (siempre exacta, sin duplicados)
  if (sheetResumen.getLastRow() > 1) {
    sheetResumen.getRange(2, 1, sheetResumen.getLastRow() - 1, sheetResumen.getLastColumn()).clearContent();
  }
  const filasSalida = Object.keys(porDia).sort().map(key => {
    const [, locationId] = key.split('|');
    const { fechaReal, bruto, descuento, neto } = porDia[key];
    return [fechaReal, locationId, bruto, descuento, neto];
  });
  if (filasSalida.length) {
    sheetResumen.getRange(2, 1, filasSalida.length, 5).setValues(filasSalida);
  }
  Logger.log(`Resumen de cierre actualizado: ${filasSalida.length} fila(s) (fecha × local).`);
  return filasSalida.length;
}

function reDescargarProductoCompleto() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PRODUCTO);
  const control = ss.getSheetByName(SHEET_CONTROL_ORDENES);
  // Borra todo el contenido (deja el encabezado)
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  if (control.getLastRow() > 1) {
    control.getRange(2, 1, control.getLastRow() - 1, control.getLastColumn()).clearContent();
  }
  Logger.log('Ventas_Por_Producto y Control_Ordenes vaciados. Descargando de nuevo con categorías...');
  // Limpia también el progreso de un backfill anterior, para que arranque desde cero
  PropertiesService.getScriptProperties().deleteProperty('BACKFILL_DESDE_20260601');
  actualizarDesde('2026-06-01');
}

function cargarHistoricoJunio2026() {
  actualizarDesde('2026-06-01');
}

function actualizarDesde(fechaInicioStr) {
  // Backfill día por día desde fechaInicioStr ('yyyy-MM-dd') hasta hoy.
  // Se reanuda sola si Apps Script corta la ejecución por tiempo.
  const props = PropertiesService.getScriptProperties();
  const key = 'BACKFILL_DESDE_' + fechaInicioStr.replace(/-/g, '');
  let dia = props.getProperty(key)
    ? new Date(props.getProperty(key))
    : new Date(fechaInicioStr + 'T00:00:00');
  const hoy = new Date();
  const tiempoLimite = Date.now() + 5 * 60 * 1000;

  while (dia < hoy) {
    if (Date.now() > tiempoLimite) {
      props.setProperty(key, dia.toISOString());
      Logger.log(`Tiempo límite alcanzado en ${Utilities.formatDate(dia, TZ, 'yyyy-MM-dd')}. Vuelve a correr
actualizarDesde('${fechaInicioStr}') para continuar.`);
      ScriptApp.newTrigger('backfillDesde2025').timeBased().after(60 * 1000).create();
      Logger.log('Trigger de continuacion programado (~1 min).');
      return;
    }

    const hasta = new Date(dia.getTime() + 24 * 60 * 60 * 1000);
    Logger.log(`Actualizando ${Utilities.formatDate(dia, TZ, 'yyyy-MM-dd')}...`);
    actualizarRango(dia, hasta);

    dia = hasta;
    props.setProperty(key, dia.toISOString());
  }

  Logger.log(`Backfill completo desde ${fechaInicioStr}.`);
  props.deleteProperty(key);
}

function actualizarRango(desde, hasta) {
  _sincronizarVentasPorProducto(desde, hasta);
  _sincronizarPagosDiarios(desde, hasta);
  _sincronizarDescuentos(desde, hasta); // ← NUEVO
}

function _obtenerMapaCategoriasPorVariacion() {
  // Devuelve { catalogObjectId (de la variación) -> nombre de categoría }
  const options = {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + ACCESS_TOKEN,
      'Square-Version': SQUARE_VERSION
    },
    muteHttpExceptions: true
  };

  // 1. Nombres de categorías
  const nombresCategoria = {}; // categoryId -> nombre
  let cursorCat = null;
  do {
    let url = 'https://connect.squareup.com/v2/catalog/list?types=CATEGORY';
    if (cursorCat) url += '&cursor=' + encodeURIComponent(cursorCat);
    const resp = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(resp.getContentText());
    if (data.errors) {
      Logger.log('Error de Square API (categorías): ' + JSON.stringify(data.errors));
      return {};
    }
    (data.objects || []).forEach(obj => {
      nombresCategoria[obj.id] = obj.category_data?.name || '';
    });
    cursorCat = data.cursor;
  } while (cursorCat);

  // 2. Items → variaciones, para mapear variación → categoría
  const mapaVariacion = {}; // variationId -> nombre de categoría
  let cursorItem = null;
  do {
    let url = 'https://connect.squareup.com/v2/catalog/list?types=ITEM';
    if (cursorItem) url += '&cursor=' + encodeURIComponent(cursorItem);
    const resp = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(resp.getContentText());
    if (data.errors) {
      Logger.log('Error de Square API (items): ' + JSON.stringify(data.errors));
      return mapaVariacion;
    }
    (data.objects || []).forEach(item => {
      const itemData = item.item_data || {};
      const categoriaId = itemData.category_id || (itemData.categories && itemData.categories[0]?.id) || '';
      const nombreCategoria = nombresCategoria[categoriaId] || '';
      (itemData.variations || []).forEach(variacion => {
        mapaVariacion[variacion.id] = nombreCategoria;
      });
    });
    cursorItem = data.cursor;
  } while (cursorItem);

  return mapaVariacion;
}

// ==================== VENTAS POR PRODUCTO ====================
function _sincronizarVentasPorProducto(desde, hasta) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PRODUCTO);
  const control = ss.getSheetByName(SHEET_CONTROL_ORDENES);
  if (!sheet || !control) {
    throw new Error('Corre configurar() primero.');
  }

  const mapaCategorias = _obtenerMapaCategoriasPorVariacion();
  const idsExistentes = leerColumnaComoSet(control, 1);
  const filasNuevas = [];
  const ordenesNuevas = [];

  LOCATION_IDS.forEach(locationId => {
    let cursor = null;
    do {
      const body = {
        location_ids: [locationId],
        query: {
          filter: {
            date_time_filter: {
              closed_at: { start_at: desde.toISOString(), end_at: hasta.toISOString() }
            },
            state_filter: { states: ['COMPLETED'] }
          },
          sort: { sort_field: 'CLOSED_AT', sort_order: 'ASC' }
        },
        limit: 100
      };
      if (cursor) body.cursor = cursor;
      const options = {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'Authorization': 'Bearer ' + ACCESS_TOKEN,
          'Square-Version': SQUARE_VERSION
        },
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      };
      const resp = UrlFetchApp.fetch('https://connect.squareup.com/v2/orders/search', options);
      const data = JSON.parse(resp.getContentText());
      if (data.errors) {
        Logger.log('Error de Square API (orders): ' + JSON.stringify(data.errors));
        return;
      }
      const orders = data.orders || [];
      orders.forEach(order => {
        if (idsExistentes.has(order.id)) return;
        const cerrada = new Date(order.closed_at);
        const fechaReal = new Date(cerrada.getFullYear(), cerrada.getMonth(), cerrada.getDate());
        const hora = Utilities.formatDate(cerrada, TZ, 'HH:mm:ss');
        (order.line_items || []).forEach(li => {
          const categoria = mapaCategorias[li.catalog_object_id] || '';
          filasNuevas.push([
            fechaReal,
            hora,
            locationId,
            order.id,
            li.name || '',
            categoria,
            Number(li.quantity) || 0,
            (li.base_price_money?.amount || 0) / 100,
            (li.total_discount_money?.amount || 0) / 100,
            (li.total_money?.amount || 0) / 100
          ]);
        });
        idsExistentes.add(order.id);
        ordenesNuevas.push([order.id, new Date()]);
      });
      cursor = data.cursor;
    } while (cursor);
  });

  if (filasNuevas.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, filasNuevas.length, 10).setValues(filasNuevas);
  }
  if (ordenesNuevas.length) {
    control.getRange(control.getLastRow() + 1, 1, ordenesNuevas.length, 2).setValues(ordenesNuevas);
  }
  Logger.log(`Ventas por producto: ${ordenesNuevas.length} orden(es) nueva(s), ${filasNuevas.length} línea(s) agregada(s).`);
}

// ==================== RESUMEN DE PAGOS DIARIO ====================
function _sincronizarPagosDiarios(desde, hasta) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PAGOS_DIARIO);
  const control = ss.getSheetByName(SHEET_CONTROL_PAGOS);
  if (!sheet || !control) {
    throw new Error('Corre configurar() primero.');
  }

  const idsExistentes = leerColumnaComoSet(control, 1);

  // Cargar filas existentes del resumen en memoria (para actualizar sin duplicar fecha+local)
  const filasActuales = sheet.getLastRow() - 1;
  const mapa = {}; // 'fechaStr|locationId' -> { filaIndex, fechaReal, cash, tarjeta, otro }
  if (filasActuales > 0) {
    const datos = sheet.getRange(2, 1, filasActuales, 5).getValues(); // Fecha, Location ID, Efectivo, Tarjeta, Otro
    datos.forEach((fila, i) => {
      const fechaReal = fila[0] instanceof Date ? fila[0] : new Date(fila[0]);
      const fechaStr = Utilities.formatDate(fechaReal, TZ, 'yyyy-MM-dd');
      mapa[fechaStr + '|' + fila[1]] = {
        filaIndex: i + 2,
        fechaReal: fechaReal,
        cash: Number(fila[2]) || 0,
        tarjeta: Number(fila[3]) || 0,
        otro: Number(fila[4]) || 0
      };
    });
  }

  const nuevosIds = [];
  LOCATION_IDS.forEach(locationId => {
    let cursor = null;
    do {
      let url = 'https://connect.squareup.com/v2/payments'
        + '?location_id=' + locationId
        + '&begin_time=' + encodeURIComponent(desde.toISOString())
        + '&end_time=' + encodeURIComponent(hasta.toISOString())
        + '&sort_order=ASC';
      if (cursor) url += '&cursor=' + encodeURIComponent(cursor);
      const options = {
        method: 'get',
        headers: {
          'Authorization': 'Bearer ' + ACCESS_TOKEN,
          'Square-Version': SQUARE_VERSION
        },
        muteHttpExceptions: true
      };
      const resp = UrlFetchApp.fetch(url, options);
      const data = JSON.parse(resp.getContentText());
      if (data.errors) {
        Logger.log('Error de Square API (payments): ' + JSON.stringify(data.errors));
        return;
      }

      const pagos = data.payments || [];

      pagos.forEach(pago => {
        if (idsExistentes.has(pago.id)) return;
        if (pago.status !== 'COMPLETED') return;

        const creado = new Date(pago.created_at);
        const fechaReal = new Date(creado.getFullYear(), creado.getMonth(), creado.getDate());
        const fecha = Utilities.formatDate(creado, TZ, 'yyyy-MM-dd');
        const monto = (pago.total_money?.amount || 0) / 100;
        const tipo = pago.source_type === 'CASH' ? 'cash'
          : (pago.source_type === 'CARD' ? 'tarjeta' : 'otro');

        const key = fecha + '|' + locationId;
        if (!mapa[key]) mapa[key] = { filaIndex: null, fechaReal: fechaReal, cash: 0, tarjeta: 0, otro: 0 };
        mapa[key][tipo] += monto;

        idsExistentes.add(pago.id);
        nuevosIds.push(pago.id);
      });

      cursor = data.cursor;
    } while (cursor);
  });

  // Escribir de vuelta: actualiza filas existentes, agrega las nuevas
  Object.keys(mapa).forEach(key => {
    const [, locationId] = key.split('|');
    const { filaIndex, fechaReal, cash, tarjeta, otro } = mapa[key];
    const total = cash + tarjeta + otro;

    if (filaIndex) {
      sheet.getRange(filaIndex, 1, 1, 6).setValues([[fechaReal, locationId, cash, tarjeta, otro, total]]);
    } else {
      sheet.appendRow([fechaReal, locationId, cash, tarjeta, otro, total]);
    }
  });

  if (nuevosIds.length) {
    control.getRange(control.getLastRow() + 1, 1, nuevosIds.length, 1).setValues(nuevosIds.map(id => [id]));
  }

  Logger.log(`Resumen de pagos: ${nuevosIds.length} pago(s) nuevo(s) procesado(s).`);
}

// ==================== DESCUENTOS (NUEVO) ====================
function _sincronizarDescuentos(desde, hasta) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Descuentos');
  const control = ss.getSheetByName('Control_Descuentos');
  if (!sheet || !control) {
    throw new Error('Corre configurar() primero.');
  }
  const idsExistentes = leerColumnaComoSet(control, 1);
  const filasNuevas = [];
  const ordenesNuevas = [];

  LOCATION_IDS.forEach(locationId => {
    let cursor = null;
    do {
      const body = {
        location_ids: [locationId],
        query: {
          filter: {
            date_time_filter: {
              closed_at: { start_at: desde.toISOString(), end_at: hasta.toISOString() }
            },
            state_filter: { states: ['COMPLETED'] }
          },
          sort: { sort_field: 'CLOSED_AT', sort_order: 'ASC' }
        },
        limit: 100
      };
      if (cursor) body.cursor = cursor;
      const options = {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'Authorization': 'Bearer ' + ACCESS_TOKEN,
          'Square-Version': SQUARE_VERSION
        },
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      };
      const resp = UrlFetchApp.fetch('https://connect.squareup.com/v2/orders/search', options);
      const data = JSON.parse(resp.getContentText());
      if (data.errors) {
        Logger.log('Error de Square API (descuentos): ' + JSON.stringify(data.errors));
        return;
      }
      const orders = data.orders || [];
      orders.forEach(order => {
        if (idsExistentes.has(order.id)) return;

        if (!order.discounts || !order.discounts.length) {
          idsExistentes.add(order.id);
          ordenesNuevas.push([order.id]);
          return;
        }

        const cerrada = new Date(order.closed_at);
        const fechaReal = new Date(cerrada.getFullYear(), cerrada.getMonth(), cerrada.getDate());
        const hora = Utilities.formatDate(cerrada, TZ, 'HH:mm:ss');

        const idsUsados = new Set();
        (order.line_items || []).forEach(li => {
          (li.applied_discounts || []).forEach(ad => {
            const desc = order.discounts.find(d => d.uid === ad.discount_uid);
            if (!desc) return;
            idsUsados.add(desc.uid);
            const monto = (ad.applied_money?.amount || 0) / 100;
            const esPorcentaje = desc.type === 'FIXED_PERCENTAGE' || desc.type === 'VARIABLE_PERCENTAGE';
            filasNuevas.push([
              fechaReal, hora, locationId, order.id, li.name || '',
              esPorcentaje ? (desc.percentage + '%') : monto,
              desc.name || ''
            ]);
          });
        });

        // Descuentos aplicados a todo el pedido (no a un producto puntual)
        order.discounts.forEach(desc => {
          if (idsUsados.has(desc.uid)) return;
          const monto = (desc.applied_money?.amount || 0) / 100;
          const esPorcentaje = desc.type === 'FIXED_PERCENTAGE' || desc.type === 'VARIABLE_PERCENTAGE';
          filasNuevas.push([
            fechaReal, hora, locationId, order.id, '(Pedido completo)',
            esPorcentaje ? (desc.percentage + '%') : monto,
            desc.name || ''
          ]);
        });

        idsExistentes.add(order.id);
        ordenesNuevas.push([order.id]);
      });
      cursor = data.cursor;
    } while (cursor);
  });

  if (filasNuevas.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, filasNuevas.length, 7).setValues(filasNuevas);
  }
  if (ordenesNuevas.length) {
    control.getRange(control.getLastRow() + 1, 1, ordenesNuevas.length, 1).setValues(ordenesNuevas);
  }
  Logger.log(`Descuentos: ${filasNuevas.length} línea(s) de descuento agregada(s).`);
}

// ==================== UTILIDAD ====================
function leerColumnaComoSet(sheet, col) {
  const filas = sheet.getLastRow() - 1;
  if (filas <= 0) return new Set();
  return new Set(sheet.getRange(2, col, filas, 1).getValues().flat());
}

// ==================== WEB APP (para cierres.html) ====================
// Expone dos acciones vía GET para que el formulario de cierres pueda leer
// el resumen de Square y disparar su recálculo con un botón:
//   ?action=resumenCierre&fecha=yyyy-MM-dd&kiosko=Nombre  → lee una fila de
//     Resumen_Cierre_Diario (Ventas Brutas, Descuentos y Cortesías, Netas)
//   ?action=actualizarResumen                             → recalcula
//     Resumen_Cierre_Diario a partir de Ventas_Por_Producto (sin volver a
//     llamar la API de Square; usa lo último sincronizado)
//   ?action=ventasPorProducto&desde=yyyy-MM-dd&hasta=yyyy-MM-dd&kiosko=Nombre
//     → línea por línea de Ventas_Por_Producto en ese rango (kiosko
//     opcional, ya resuelto vía LOCATION_KIOSKO_MAP), para que
//     Code-inventario-kioskos-backend.gs descuente stock según receta.
//
// Desplegar: Implementar → Nueva implementación → Tipo: Aplicación web,
// Ejecutar como "Yo", Acceso "Cualquiera". Copiá la URL /exec resultante en
// SQUARE_URL dentro de cierres.html y en SQUARE_URL dentro de
// Code-inventario-kioskos-backend.gs.
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  try {
    if (action === 'actualizarResumen') {
      const filas = generarResumenCierreDiarioCore();
      return jsonOutSquare({
        ok: true,
        filas: filas,
        mensaje: filas > 0 ? `Resumen actualizado: ${filas} fila(s).` : 'No hay datos en Ventas_Por_Producto todavía.'
      });
    }
    if (action === 'resumenCierre') {
      return jsonOutSquare({ ok: true, resumen: obtenerResumenCierre(e.parameter.fecha, e.parameter.kiosko) });
    }
    if (action === 'ventasPorProducto') {
      return jsonOutSquare({ ok: true, ventas: obtenerVentasPorProducto(e.parameter.desde, e.parameter.hasta, e.parameter.kiosko) });
    }
    return jsonOutSquare({ ok: false, error: 'Acción no reconocida. Usá ?action=resumenCierre, ?action=actualizarResumen o ?action=ventasPorProducto.' });
  } catch (err) {
    return jsonOutSquare({ ok: false, error: err.toString() });
  }
}

function jsonOutSquare(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Busca en Resumen_Cierre_Diario la fila de una fecha + kiosko puntual.
// kiosko se compara contra LOCATION_KIOSKO_MAP (nombre resuelto del location_id).
function obtenerResumenCierre(fecha, kiosko) {
  if (!fecha) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESUMEN_CIERRE);
  const filas = sheet.getLastRow() - 1;
  if (filas <= 0) return null;

  const datos = sheet.getRange(2, 1, filas, 5).getValues(); // Fecha, Location ID, Ventas Brutas, Descuentos y Cortesías, Ventas Netas
  for (const fila of datos) {
    const [fechaCell, locationId, bruto, descuento, neto] = fila;
    const fechaReal = fechaCell instanceof Date ? fechaCell : new Date(fechaCell);
    const fechaStr = Utilities.formatDate(fechaReal, TZ, 'yyyy-MM-dd');
    const kioskoLocation = LOCATION_KIOSKO_MAP[locationId] || locationId;
    if (fechaStr === fecha && (!kiosko || kioskoLocation === kiosko)) {
      return {
        fecha: fechaStr,
        kiosko: kioskoLocation,
        locationId: locationId,
        ventasBrutas: Number(bruto) || 0,
        descuentosCortesias: Number(descuento) || 0,
        ventasNetas: Number(neto) || 0
      };
    }
  }
  return null;
}

// Línea por línea de Ventas_Por_Producto entre "desde" y "hasta" (inclusive,
// yyyy-MM-dd), con el kiosko ya resuelto vía LOCATION_KIOSKO_MAP. Alimenta
// ?action=ventasPorProducto (consumida por
// Code-inventario-kioskos-backend.gs para descontar stock según receta).
function obtenerVentasPorProducto(desde, hasta, kiosko) {
  if (!desde || !hasta) return [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PRODUCTO);
  const filas = sheet.getLastRow() - 1;
  if (filas <= 0) return [];

  const datos = sheet.getRange(2, 1, filas, 10).getValues();
  // Fecha, Hora, Location ID, Order ID, Producto, Categoría, Cantidad, Precio Unitario, Descuento, Total Línea
  const resultado = [];
  datos.forEach(function(fila) {
    const [fechaCell, hora, locationId, orderId, producto, categoria, cantidad] = fila;
    const fechaReal = fechaCell instanceof Date ? fechaCell : new Date(fechaCell);
    const fechaStr = Utilities.formatDate(fechaReal, TZ, 'yyyy-MM-dd');
    if (fechaStr < desde || fechaStr > hasta) return;
    const kioskoLocation = LOCATION_KIOSKO_MAP[locationId] || locationId;
    if (kiosko && kioskoLocation !== kiosko) return;
    resultado.push({
      fecha: fechaStr,
      hora: hora,
      kiosko: kioskoLocation,
      orderId: orderId,
      producto: producto,
      categoria: categoria,
      cantidad: Number(cantidad) || 0
    });
  });
  return resultado;
}

// Wrapper temporal para poder ejecutar el backfill historico desde el editor
// (Ejecutar > backfillDesde2025). Seguro de repetir, no duplica filas.
function backfillDesde2025() {
  actualizarDesde('2025-01-01');
}
