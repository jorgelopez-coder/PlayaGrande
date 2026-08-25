/**
 * Asistente de IA — Ecosistema Kioskos
 * ------------------------------------
 * Recibe una pregunta en español ("¿cuánto vendimos en Liberia en agosto?",
 * "¿cuánto hemos comprado de Cerveza Imperial este mes?") y le pide a Claude
 * (API de Anthropic, con tool use) que la responda usando los datos REALES
 * del sistema — nunca inventados. Claude decide qué herramienta necesita
 * (ventas, compras, inventario o mermas), este script ejecuta esa consulta
 * contra los Sheets/Web Apps que ya usa el resto del Ecosistema Kioskos, y
 * el resultado se le devuelve a Claude para que redacte la respuesta final.
 *
 * Es un proyecto de Apps Script INDEPENDIENTE (standalone) — no necesita
 * Sheet propio, mismo patrón que Code-mermas-extractor.gs.
 *
 * Cómo desplegarlo:
 * 1. https://script.google.com/ → Proyecto nuevo.
 * 2. Pegá este código completo (reemplazando el contenido del archivo).
 * 3. ⚙️ Configuración del proyecto (panel izquierdo) → Propiedades del
 *    script → Agregar propiedad:
 *      Propiedad: ANTHROPIC_API_KEY
 *      Valor: tu API key de Anthropic (console.anthropic.com/settings/keys)
 *    — es una propiedad NUEVA en este proyecto nuevo, aunque ya la hayas
 *    configurado en otros scripts (Cierres, Mermas): cada proyecto de Apps
 *    Script tiene sus propias Propiedades, no se comparten entre sí.
 * 4. Implementar → Nueva implementación → Tipo: Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquiera
 * 5. Copiá la URL /exec resultante y pegala en asistente.html, constante
 *    ASISTENTE_URL (arriba del todo en el <script>).
 * 6. La primera vez que se ejecute te va a pedir autorizar permisos — este
 *    script necesita poder ABRIR (SpreadsheetApp.openById) los Sheets de
 *    Square por kiosko, Cuentas por Pagar e Inventario, así que tiene que
 *    ejecutarse con la MISMA cuenta de Google que ya tiene acceso a esos
 *    Sheets (la tuya, Jorge).
 *
 * Costo: cada pregunta hecha en asistente.html es 1 o más llamadas a la API
 * de Anthropic (se cobra por uso, ver anthropic.com/pricing) — no hay
 * llamadas automáticas de fondo, solo cuando alguien pregunta algo.
 *
 * Si se agrega un nuevo kiosko con Square propio: agregarlo también acá en
 * SQUARE_KIOSKOS (mismo patrón que index.html) y en KIOSKOS_TODOS, para que
 * el asistente sepa de dónde sacar sus ventas.
 */

const ANTHROPIC_API_KEY = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
// Mismo modelo que ya usan Code-mermas-extractor.gs y el extractor de
// facturas (Code_Facturas_PlayaGrande.gs) — ya probado y funcionando con
// esta cuenta. Se puede cambiar por otro modelo de tu cuenta de Anthropic
// (console.anthropic.com) si querés más calidad de redacción a cambio de
// mayor costo por pregunta.
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

// === Fuentes de datos — mismos Sheets/Web Apps que ya usa el resto del
// Ecosistema Kioskos (ver index.html, analisis-compras.html, inventario.html,
// mermas.html, Code-cierres-kioskos-backend.gs) ===============================

// Square por kiosko (ventas línea por línea) — copiado de SQUARE_KIOSKOS en
// index.html. Solo los kioskos listados acá tienen Square propio; el resto
// (hoy: Playa Hermosa) usa el respaldo de Cierres, ver consultarVentas().
const SQUARE_KIOSKOS = {
  'Playa Grande': '1a5CTWWVNfGbh_h0pS0OdbKBZ0l6rf_IVKhSb-6RhyUA',
  'Tamarindo':    '1jS6-2LP8UKxiwRQ1cYLrxOEXOHic4a3XP4HgJE1DMjQ',
  'Liberia':      '1XGZe3U3Z3LaBPPhmDEM7RE3cbaumrKJun7bPzzqiMok',
  'Nosara':       '1n6GRkOFd-6cZJP9HOZFr8hR0HjVMVuHW_pMrY4i0aRc'
};
const KIOSKOS_TODOS = ['Playa Grande', 'Tamarindo', 'Liberia', 'Nosara', 'Playa Hermosa'];

// Web App de Cierres de Caja (Code-cierres-kioskos-backend.gs) — ?action=read
// devuelve { records: [ [ID,Fecha,Hora,Kiosko,...,'Total Ventas ₡' (índice 10), ...], ... ] }
const SHEETS_URL_CIERRES = 'https://script.google.com/macros/s/AKfycbzegddEwvSBsQ-z5RbmL8vevqjZmcgIEltb3BKAvpcwGTYNWTuwNxweN-LYKOcMKLq2Dg/exec';

// Sheet "Cuentas por Pagar - Kioskos" — hojas Desglose_IA (compras línea por
// línea) y Maestro_Productos (Nombre Estándar homologado por Clave).
const COMPRAS_SHEET_ID = '1Qf3JgKR8ZKhWAxUscKnA5xwqKMm6qvDjgtq8-3P0G4E';

// Sheet "Inventario - Kioskos" — hoja HISTORIAL_inventario (una fila por
// producto por toma de inventario guardada).
const INVENTARIO_SHEET_ID = '1Ghdop5T0VoDomANJcdtqZclsu6Z4220eYxltJgnvDuA';

// Web App de Mantenimiento/Mermas (Code-mantenimiento-backend.gs) —
// ?modulo=mermas devuelve { ok:true, registros: [ {ID,Fecha,Kiosko,
// 'Peso Bruto (g)','Peso Contenedor (g)','Peso Neto Merma (g)', ...}, ... ] }
const MERMAS_URL = 'https://script.google.com/macros/s/AKfycbwLkispLszMirRKOEauRZHv99JUkNYNbPtoVBeYw7la0BXneKoUTlPuLPNmK8_RliP_1g/exec';

// Mismos criterios ya usados en el resto del sistema (ver analisis-compras.html
// e index.html) — no hay tipo de cambio histórico, se aplica siempre el mismo.
const TIPO_CAMBIO_USD_DEFAULT = 520;
const DENSIDAD_CERVEZA_G_ML = 1.005;
const ML_POR_ONZA = 29.5735;

// ============ ENTRADA HTTP ============

function doGet(e) {
  return jsonOut({ ok: true, mensaje: 'Asistente IA — Ecosistema Kioskos. Hacé POST con {"pregunta": "..."}.' });
}

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) throw new Error('No se recibió ninguna pregunta.');
    const payload = JSON.parse(e.postData.contents);
    const pregunta = String(payload.pregunta || '').trim();
    if (!pregunta) throw new Error('Pregunta vacía.');
    const historialPrevio = Array.isArray(payload.historial) ? payload.historial : [];
    const resultado = responderPregunta(pregunta, historialPrevio);
    return jsonOut({ ok: true, respuesta: resultado.respuesta, historial: resultado.historial });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============ ORQUESTACIÓN CON CLAUDE (tool use) ============

function responderPregunta(pregunta, historialPrevio) {
  if (!ANTHROPIC_API_KEY) throw new Error('Falta configurar ANTHROPIC_API_KEY en Propiedades del script (ver encabezado de este archivo).');

  const hoyCR = Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd');
  const systemPrompt =
    'Sos el asistente de datos del "Ecosistema Kioskos" de Casa Aguizotes, kioskos de cerveza y ' +
    'cocteles en Costa Rica (Playa Grande, Tamarindo, Liberia, Nosara y Playa Hermosa). ' +
    'Hoy es ' + hoyCR + ' (zona horaria Costa Rica). Respondé SIEMPRE en español, de forma breve y ' +
    'directa (no más de un par de párrafos cortos o una lista breve), con montos en colones (₡) salvo ' +
    'que se pida en dólares. Usá las herramientas disponibles para obtener los números reales — nunca ' +
    'inventes cifras ni redondees a ojo. Si una herramienta no cubre algo (ej. inventario en tiempo ' +
    'real, un kiosko sin Square propio) decilo con claridad en la respuesta en vez de asumir. Si la ' +
    'pregunta no trae fechas, la herramienta asume los últimos 30 días terminando hoy — mencioná ese ' +
    'supuesto en la respuesta cuando aplique.';

  const messages = historialPrevio.slice(-20).concat([{ role: 'user', content: pregunta }]);

  const MAX_VUELTAS = 6;
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const resp = llamarClaude(systemPrompt, messages);

    if (resp.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: resp.content });
      const toolResults = [];
      resp.content.forEach(function (bloque) {
        if (bloque.type !== 'tool_use') return;
        let resultado;
        try {
          resultado = ejecutarHerramienta(bloque.name, bloque.input || {});
        } catch (errHerr) {
          resultado = { error: errHerr.message };
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: bloque.id,
          content: JSON.stringify(resultado)
        });
      });
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    const texto = (resp.content || [])
      .filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; })
      .join('\n')
      .trim();
    messages.push({ role: 'assistant', content: resp.content });
    return { respuesta: texto || '(el asistente no devolvió texto)', historial: messages };
  }
  throw new Error('El asistente no pudo resolver la pregunta en el número de pasos permitido — probá reformularla o hacé una pregunta más simple.');
}

function llamarClaude(systemPrompt, messages) {
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    tools: DEFINICION_HERRAMIENTAS,
    messages: messages
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
  const data = JSON.parse(resp.getContentText());
  if (data.error) throw new Error(data.error.message || 'Error de la API de Anthropic.');
  return data;
}

// ============ DEFINICIÓN DE HERRAMIENTAS ============

const DEFINICION_HERRAMIENTAS = [
  {
    name: 'consultar_ventas',
    description: 'Total de ventas en colones de uno, varios o todos los kioskos en un rango de fechas. ' +
      'Para Playa Grande, Tamarindo, Liberia y Nosara usa el detalle real de Square (línea por línea, ' +
      'incluye desglose por producto). Para Playa Hermosa (sin Square propio) usa el "Total Ventas ₡" ' +
      'declarado en el cierre de caja diario — un dato menos detallado, sin desglose por producto.',
    input_schema: {
      type: 'object',
      properties: {
        kiosko: { type: 'string', description: "Uno de: 'Playa Grande', 'Tamarindo', 'Liberia', 'Nosara', 'Playa Hermosa', 'todos'. Por defecto 'todos'." },
        desde: { type: 'string', description: 'Fecha inicio, yyyy-mm-dd.' },
        hasta: { type: 'string', description: 'Fecha fin (inclusive), yyyy-mm-dd.' },
        producto: { type: 'string', description: 'Opcional: nombre o parte del nombre de un producto para filtrar. Solo aplica a kioskos con Square propio.' }
      },
      required: ['desde', 'hasta']
    }
  },
  {
    name: 'consultar_compras',
    description: 'Total comprado (colones) y cantidad, según las facturas de proveedor ya procesadas ' +
      '(hoja Desglose_IA de Cuentas por Pagar), homologando el nombre del producto contra el Maestro de ' +
      'Productos. Permite filtrar por producto, proveedor, kiosko y rango de fechas de factura. Si no se ' +
      'da un producto puntual, devuelve un desglose de los productos con mayor gasto.',
    input_schema: {
      type: 'object',
      properties: {
        producto: { type: 'string', description: 'Nombre o parte del nombre del producto comprado (opcional).' },
        proveedor: { type: 'string', description: 'Nombre o parte del nombre del proveedor (opcional).' },
        kiosko: { type: 'string', description: 'Filtrar por kiosko (opcional).' },
        desde: { type: 'string', description: 'Fecha de factura, inicio, yyyy-mm-dd (opcional — si se omite junto con "hasta", se usa todo el histórico).' },
        hasta: { type: 'string', description: 'Fecha de factura, fin, yyyy-mm-dd (opcional).' }
      },
      required: []
    }
  },
  {
    name: 'consultar_inventario',
    description: 'Cantidad registrada de un producto (o de todos) en la ÚLTIMA toma de inventario ' +
      'guardada para un kiosko — NO es un conteo en tiempo real, refleja el momento en que se hizo esa ' +
      'toma. Incluye unidades cerradas/completas y cantidad en uso/abierta.',
    input_schema: {
      type: 'object',
      properties: {
        kiosko: { type: 'string', description: 'Kiosko a consultar — obligatorio, cada kiosko lleva su propia toma de inventario.' },
        producto: { type: 'string', description: 'Nombre o parte del nombre del producto (opcional — si se omite, devuelve toda la última toma).' }
      },
      required: ['kiosko']
    }
  },
  {
    name: 'consultar_mermas',
    description: 'Total de merma de cerveza de barril (en gramos y onzas estimadas) registrada en un ' +
      'rango de fechas, por kiosko o para todos los kioskos.',
    input_schema: {
      type: 'object',
      properties: {
        kiosko: { type: 'string', description: "Kiosko o 'todos'. Por defecto 'todos'." },
        desde: { type: 'string', description: 'Fecha inicio, yyyy-mm-dd.' },
        hasta: { type: 'string', description: 'Fecha fin (inclusive), yyyy-mm-dd.' }
      },
      required: ['desde', 'hasta']
    }
  }
];

function ejecutarHerramienta(nombre, input) {
  if (nombre === 'consultar_ventas') return consultarVentas(input);
  if (nombre === 'consultar_compras') return consultarCompras(input);
  if (nombre === 'consultar_inventario') return consultarInventario(input);
  if (nombre === 'consultar_mermas') return consultarMermas(input);
  throw new Error('Herramienta desconocida: ' + nombre);
}

// ============ UTILIDADES ============

function normalizarTexto(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

// Coincidencia flexible: sirve tanto si el usuario escribió menos texto del
// que hay guardado ("imperial" ⊂ "cerveza imperial silver") como al revés.
function contiene(hay, buscado) {
  if (!buscado) return true;
  const a = normalizarTexto(hay), b = normalizarTexto(buscado);
  if (!a || !b) return false;
  return a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
}

function aFechaISO(valor) {
  if (valor instanceof Date) return Utilities.formatDate(valor, 'America/Costa_Rica', 'yyyy-MM-dd');
  return String(valor || '').slice(0, 10);
}

function enRango(fechaISO, desde, hasta) {
  if (!fechaISO) return false;
  if (desde && fechaISO < desde) return false;
  if (hasta && fechaISO > hasta) return false;
  return true;
}

// Si falta alguna fecha, asume los últimos 30 días terminando hoy — nunca
// deja pasar una consulta sin rango (evitaría sumar TODO el histórico sin
// querer cuando el usuario solo dijo "¿cómo van las ventas?").
function rangoPorDefecto(desde, hasta) {
  const hoy = new Date();
  const hastaOut = hasta || Utilities.formatDate(hoy, 'America/Costa_Rica', 'yyyy-MM-dd');
  let desdeOut = desde;
  if (!desdeOut) {
    const hace30 = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
    desdeOut = Utilities.formatDate(hace30, 'America/Costa_Rica', 'yyyy-MM-dd');
  }
  return { desde: desdeOut, hasta: hastaOut, asumido: !desde || !hasta };
}

function filasComoObjetosDesdeHoja(hoja) {
  const datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return [];
  const encabezados = datos[0];
  return datos.slice(1).map(function (fila) {
    const obj = {};
    encabezados.forEach(function (h, i) { obj[h] = fila[i]; });
    return obj;
  });
}

// ============ VENTAS ============
// Ventas_Por_Producto (Square, por kiosko) — columnas 0-indexadas:
// 0 Fecha, 1 Hora, 2 Location ID, 3 Order ID, 4 Producto, 5 Categoría,
// 6 Cantidad, 7 Precio Unitario, 8 Descuento, 9 Total Línea.
// Cierres (SHEETS_URL_CIERRES ?action=read) — registros como arrays según
// HEADERS de Code-cierres-kioskos-backend.gs: 1 Fecha, 3 Kiosko, 10 Total Ventas ₡.

function consultarVentas(input) {
  const kioskoPedido = (input.kiosko || 'todos').trim();
  const rango = rangoPorDefecto(input.desde, input.hasta);
  const desde = rango.desde, hasta = rango.hasta, asumido = rango.asumido;
  const productoFiltro = input.producto || '';

  const lista = (kioskoPedido && kioskoPedido.toLowerCase() !== 'todos') ? [kioskoPedido] : KIOSKOS_TODOS;
  const conSquare = lista.filter(function (k) { return SQUARE_KIOSKOS[k]; });
  const sinSquare = lista.filter(function (k) { return !SQUARE_KIOSKOS[k]; });

  const porKiosko = {};
  let totalGeneral = 0;

  conSquare.forEach(function (kiosko) {
    const hoja = SpreadsheetApp.openById(SQUARE_KIOSKOS[kiosko]).getSheetByName('Ventas_Por_Producto');
    if (!hoja || hoja.getLastRow() < 2) {
      porKiosko[kiosko] = { total_colones: 0, lineas_de_venta: 0, fuente: 'Square (sin datos)' };
      return;
    }
    const datos = hoja.getDataRange().getValues();
    let total = 0, lineas = 0;
    const porProducto = {};
    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const fecha = aFechaISO(fila[0]);
      if (!enRango(fecha, desde, hasta)) continue;
      const producto = String(fila[4] || '');
      if (productoFiltro && !contiene(producto, productoFiltro)) continue;
      const totalLinea = Number(fila[9]) || 0;
      total += totalLinea;
      lineas++;
      porProducto[producto] = (porProducto[producto] || 0) + totalLinea;
    }
    const topProductos = Object.keys(porProducto)
      .map(function (p) { return { producto: p, total_colones: Math.round(porProducto[p]) }; })
      .sort(function (a, b) { return b.total_colones - a.total_colones; })
      .slice(0, 10);
    porKiosko[kiosko] = {
      total_colones: Math.round(total),
      lineas_de_venta: lineas,
      fuente: 'Square (detalle real por producto)',
      top_productos: topProductos
    };
    totalGeneral += total;
  });

  if (sinSquare.length) {
    let registros = [];
    try {
      const resp = UrlFetchApp.fetch(
        SHEETS_URL_CIERRES + '?action=read&desde=' + encodeURIComponent(desde) + '&hasta=' + encodeURIComponent(hasta),
        { muteHttpExceptions: true }
      );
      const data = JSON.parse(resp.getContentText());
      registros = data.records || [];
    } catch (e) { /* sigue con lista vacía si falla la conexión */ }

    sinSquare.forEach(function (kiosko) {
      let total = 0, cierresContados = 0;
      registros.forEach(function (r) {
        if (String(r[3]) !== kiosko) return;
        const fecha = aFechaISO(r[1]);
        if (!enRango(fecha, desde, hasta)) return;
        total += Number(r[10]) || 0;
        cierresContados++;
      });
      porKiosko[kiosko] = {
        total_colones: Math.round(total),
        cierres_contados: cierresContados,
        fuente: 'Total Ventas ₡ del cierre de caja (kiosko sin Square propio — sin desglose por producto)'
      };
      totalGeneral += total;
    });
  }

  return {
    desde: desde,
    hasta: hasta,
    rango_asumido_ultimos_30_dias: asumido,
    total_colones_todos_los_kioskos_solicitados: Math.round(totalGeneral),
    por_kiosko: porKiosko
  };
}

// ============ COMPRAS ============
// Desglose_IA — columnas 0-indexadas (ver DESGLOSE_COL en
// Code-cuentas-por-pagar-kioskos-backend.gs, ahí 1-indexado):
// 1 Moneda, 3 Fecha de factura, 5 Proveedor, 7 Producto, 8 Nombre normalizado,
// 10 Cantidad, 14 Total línea, 18 Kiosko.
// Maestro_Productos — columnas resueltas por NOMBRE de encabezado (su orden
// real varía porque se fueron agregando con el tiempo), nunca por posición.

function consultarCompras(input) {
  const desde = input.desde || '';
  const hasta = input.hasta || '';
  const productoFiltro = input.producto || '';
  const proveedorFiltro = input.proveedor || '';
  const kioskoFiltro = input.kiosko || '';

  const ss = SpreadsheetApp.openById(COMPRAS_SHEET_ID);
  const hojaDesglose = ss.getSheetByName('Desglose_IA');
  const hojaMaestro = ss.getSheetByName('Maestro_Productos');
  if (!hojaDesglose || hojaDesglose.getLastRow() < 2) {
    return { desde: desde, hasta: hasta, total_colones: 0, lineas_de_factura: 0, nota: 'No hay compras registradas todavía.' };
  }

  const mapaEstandar = {};
  if (hojaMaestro && hojaMaestro.getLastRow() > 1) {
    const filasMaestro = hojaMaestro.getDataRange().getValues();
    const encMaestro = filasMaestro[0];
    const colClave = encMaestro.indexOf('Clave');
    const colEstandar = encMaestro.indexOf('Nombre Estándar');
    if (colClave !== -1 && colEstandar !== -1) {
      for (let i = 1; i < filasMaestro.length; i++) {
        const clave = filasMaestro[i][colClave];
        const estandar = filasMaestro[i][colEstandar];
        if (clave && estandar) mapaEstandar[clave] = estandar;
      }
    }
  }

  const datos = hojaDesglose.getDataRange().getValues();
  let totalColones = 0, totalCantidad = 0, lineas = 0;
  const porProducto = {};
  const facturasVistas = {};

  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    const moneda = String(f[1] || 'CRC');
    const fecha = aFechaISO(f[3]);
    if (!enRango(fecha, desde || null, hasta || null)) continue;

    const proveedor = String(f[5] || '');
    if (proveedorFiltro && !contiene(proveedor, proveedorFiltro)) continue;

    const kiosko = String(f[18] || '');
    if (kioskoFiltro && normalizarTexto(kiosko) !== normalizarTexto(kioskoFiltro)) continue;

    const productoCrudo = String(f[7] || '');
    const nombreNormalizado = String(f[8] || '');
    const clave = normalizarTexto(proveedor) + '§' + normalizarTexto(productoCrudo);
    const nombreProducto = mapaEstandar[clave] || nombreNormalizado || productoCrudo;
    if (productoFiltro && !contiene(nombreProducto, productoFiltro) && !contiene(productoCrudo, productoFiltro)) continue;

    const cantidad = Number(f[10]) || 0;
    let totalLinea = Number(f[14]) || 0;
    if (moneda.toUpperCase().indexOf('USD') !== -1 || moneda === '$') totalLinea = totalLinea * TIPO_CAMBIO_USD_DEFAULT;

    totalColones += totalLinea;
    totalCantidad += cantidad;
    lineas++;
    facturasVistas[String(f[2]) + '|' + proveedor] = true;
    if (!porProducto[nombreProducto]) porProducto[nombreProducto] = { cantidad: 0, total_colones: 0 };
    porProducto[nombreProducto].cantidad += cantidad;
    porProducto[nombreProducto].total_colones += totalLinea;
  }

  const desglose = Object.keys(porProducto)
    .map(function (p) {
      return {
        producto: p,
        cantidad: Math.round(porProducto[p].cantidad * 100) / 100,
        total_colones: Math.round(porProducto[p].total_colones)
      };
    })
    .sort(function (a, b) { return b.total_colones - a.total_colones; })
    .slice(0, 15);

  return {
    desde: desde || '(sin filtro, todo el histórico)',
    hasta: hasta || '(sin filtro, todo el histórico)',
    tipo_cambio_usd_usado: TIPO_CAMBIO_USD_DEFAULT,
    total_colones: Math.round(totalColones),
    total_cantidad: Math.round(totalCantidad * 100) / 100,
    lineas_de_factura: lineas,
    facturas_distintas_aprox: Object.keys(facturasVistas).length,
    desglose_por_producto: desglose
  };
}

// ============ INVENTARIO ============

function consultarInventario(input) {
  const kiosko = input.kiosko || '';
  const productoFiltro = input.producto || '';
  if (!kiosko) throw new Error('Hace falta indicar el kiosko para consultar inventario.');

  const hoja = SpreadsheetApp.openById(INVENTARIO_SHEET_ID).getSheetByName('HISTORIAL_inventario');
  if (!hoja || hoja.getLastRow() < 2) return { kiosko: kiosko, nota: 'No hay tomas de inventario registradas todavía.' };

  const filas = filasComoObjetosDesdeHoja(hoja);
  const delKiosko = filas.filter(function (r) { return normalizarTexto(r['Kiosko']) === normalizarTexto(kiosko); });
  if (!delKiosko.length) return { kiosko: kiosko, nota: 'No hay tomas de inventario registradas para ese kiosko.' };

  let ultimaFecha = '';
  delKiosko.forEach(function (r) {
    const f = aFechaISO(r['Fecha toma']);
    if (f > ultimaFecha) ultimaFecha = f;
  });
  let lineas = delKiosko.filter(function (r) { return aFechaISO(r['Fecha toma']) === ultimaFecha; });
  if (productoFiltro) lineas = lineas.filter(function (r) { return contiene(String(r['Producto'] || ''), productoFiltro); });

  return {
    kiosko: kiosko,
    fecha_ultima_toma: ultimaFecha,
    nota: 'Dato de la ÚLTIMA toma de inventario registrada — no es un conteo en tiempo real.',
    productos: lineas.map(function (r) {
      return {
        producto: r['Producto'] || '',
        area: r['Área'] || r['Area'] || '',
        cant_completos: r['Cant. completos'] || 0,
        cant_en_uso: r['Cant. en uso'] || 0,
        unidad: r['Unidad'] || ''
      };
    })
  };
}

// ============ MERMAS ============

function consultarMermas(input) {
  const kioskoPedido = (input.kiosko || 'todos').trim();
  const rango = rangoPorDefecto(input.desde, input.hasta);
  const desde = rango.desde, hasta = rango.hasta, asumido = rango.asumido;

  let registros = [];
  try {
    const resp = UrlFetchApp.fetch(MERMAS_URL + '?modulo=mermas', { muteHttpExceptions: true });
    const data = JSON.parse(resp.getContentText());
    registros = (data && data.registros) || [];
  } catch (e) {
    return { error: 'No se pudo leer el registro de mermas en este momento.' };
  }

  let totalGramos = 0, conteo = 0;
  const porKiosko = {};
  registros.forEach(function (r) {
    const kiosko = String(r['Kiosko'] || '');
    if (kioskoPedido.toLowerCase() !== 'todos' && normalizarTexto(kiosko) !== normalizarTexto(kioskoPedido)) return;
    const fecha = aFechaISO(r['Fecha']);
    if (!enRango(fecha, desde, hasta)) return;
    const gramos = Number(r['Peso Neto Merma (g)']) || 0;
    totalGramos += gramos;
    conteo++;
    porKiosko[kiosko] = (porKiosko[kiosko] || 0) + gramos;
  });

  const porKioskoOut = {};
  Object.keys(porKiosko).forEach(function (k) {
    porKioskoOut[k] = {
      gramos: Math.round(porKiosko[k]),
      onzas_aprox: Math.round((porKiosko[k] / DENSIDAD_CERVEZA_G_ML / ML_POR_ONZA) * 10) / 10
    };
  });

  return {
    desde: desde,
    hasta: hasta,
    rango_asumido_ultimos_30_dias: asumido,
    total_gramos: Math.round(totalGramos),
    total_onzas_aprox: Math.round((totalGramos / DENSIDAD_CERVEZA_G_ML / ML_POR_ONZA) * 10) / 10,
    registros_contados: conteo,
    por_kiosko: porKioskoOut,
    nota: 'Onzas estimadas con densidad de cerveza ' + DENSIDAD_CERVEZA_G_ML + ' g/ml (mismo criterio que index.html).'
  };
}
