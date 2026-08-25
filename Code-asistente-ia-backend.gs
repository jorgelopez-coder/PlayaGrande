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
 * SQUARE_KIOSKOS (mismo patrón que index.html) — la lista completa de
 * kioskos (con o sin Square) se lee sola desde la pestaña Configuracion,
 * ver obtenerKioskosTodos() más abajo, así que un kiosko nuevo aparece acá
 * sin tocar código (mismo criterio que las 26 páginas HTML del sistema).
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
// La lista completa de kioskos activos (hoy son 8, y va a seguir creciendo)
// se lee de RRHH_URL?modulo=kioskos — la pestaña Configuracion, MISMA fuente
// que usan cierres.html/rrhh*.html/horarios.html — en vez de una lista fija
// acá, para no repetir el problema que ya se corrigió en las 26 páginas HTML
// (ver notas de esa migración). Se cachea 5 minutos (CacheService, propio de
// este proyecto de Apps Script) para no golpear RRHH en cada pregunta del
// chat. Ver obtenerKioskosTodos() más abajo.

// Web App de Cierres de Caja (Code-cierres-kioskos-backend.gs) — ?action=read
// devuelve { records: [ [ID,Fecha,Hora,Kiosko,...,'Total Ventas ₡' (índice 10), ...], ... ] }
const SHEETS_URL_CIERRES = 'https://script.google.com/macros/s/AKfycbzegddEwvSBsQ-z5RbmL8vevqjZmcgIEltb3BKAvpcwGTYNWTuwNxweN-LYKOcMKLq2Dg/exec';

// Sheet "Cuentas por Pagar - Kioskos" — hojas Desglose_IA (compras línea por
// línea) y Maestro_Productos (Nombre Estándar homologado por Clave).
const COMPRAS_SHEET_ID = '1Qf3JgKR8ZKhWAxUscKnA5xwqKMm6qvDjgtq8-3P0G4E';

// Sheet "Inventario - Kioskos" — hoja HISTORIAL_inventario (una fila por
// producto por toma de inventario guardada).
const INVENTARIO_SHEET_ID = '1Ghdop5T0VoDomANJcdtqZclsu6Z4220eYxltJgnvDuA';

// Web App de Mantenimiento/Mermas (Code-mantenimiento-backend.gs) — sirve
// TANTO mermas (?modulo=mermas) COMO incidencias de mantenimiento
// (?modulo=reportes) desde el mismo Web App, hoja "Operaciones - Kioskos".
// { ok:true, registros: [ {...columnas por nombre...} ] } en ambos casos.
const MERMAS_URL = 'https://script.google.com/macros/s/AKfycbwLkispLszMirRKOEauRZHv99JUkNYNbPtoVBeYw7la0BXneKoUTlPuLPNmK8_RliP_1g/exec';
const MANTENIMIENTO_URL = MERMAS_URL; // mismo Web App, otro ?modulo=

// Web App de RRHH (Code-rrhh-kioskos-backend.gs) — script ATADO a su propio
// Sheet (no tiene ID de Sheet conocido, solo se puede consultar vía HTTP).
// Cubre personal, vacaciones, amonestaciones, terminaciones, cambios de
// salario, liquidaciones, aguinaldo, horarios, horas extra, planilla y
// servicio 10% — todos como ?modulo=xxx, siempre
// { ok:true, registros: [ {...columnas por nombre exacto...} ] }.
const RRHH_URL = 'https://script.google.com/macros/s/AKfycby_qocfx6f1d0qDgz6KS1B9DpACtVXtvGtWFSIPJzx1jkPdcNn144kGGBa0ndSsCWBzzg/exec';

// Sheet "Caja Chica - Kioskos" — fondo de caja y gastos menores por kiosko.
// Ese backend NO tiene doGet (solo escribe), así que se lee directo del Sheet.
const CAJA_CHICA_SHEET_ID = '1FVlGF4-GP1L11SD3QfmvfG_XFfuSH-UI3NbkojJ_shU';

// Sheet "Recetas" — costeo de platos/cocteles del menú (independiente de
// Cuentas por Pagar, aunque lee de ahí el costo de cada ingrediente).
const RECETAS_SHEET_ID = '1U9nITZdHgdOmoPpHfXHC_6Cfb8tjQXH36s6QJLVJ90w';

// Web App de Activos Menores (Code-activos-backend.gs) — script atado, sin
// ID de Sheet conocido, se consulta vía HTTP igual que RRHH.
const ACTIVOS_URL = 'https://script.google.com/macros/s/AKfycbxAnLXbtJkrp4oCc1uhqogVd4OctqhaZjMkLC3AVxZYN0bAgMp0qWPfA9IkoPZuz5Jw/exec';

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
  const kioskosTodos = obtenerKioskosTodos();
  const systemPrompt =
    'Sos el asistente de datos del "Ecosistema Kioskos" de Casa Aguizotes, kioskos de cerveza y ' +
    'cocteles en Costa Rica (' + kioskosTodos.join(', ') + '). ' +
    'Hoy es ' + hoyCR + ' (zona horaria Costa Rica). Tenés herramientas para consultar TODOS los ' +
    'módulos del sistema: ventas, compras, cuentas por pagar a proveedores, inventario, mermas, personal, vacaciones, amonestaciones, ' +
    'horas extra, liquidaciones/terminaciones, aguinaldo, planilla, servicio 10%, horarios, caja ' +
    'chica, mantenimiento, activos, proveedores, recetas/costeo de menú, pedido sugerido de compra, ' +
    'efectivo pendiente de depositar y COGS de inventario. Respondé SIEMPRE en español, de forma ' +
    'breve y directa (no más de un par de párrafos cortos o una lista breve), con montos en colones ' +
    '(₡) salvo que se pida en dólares. Usá las herramientas disponibles para obtener los números ' +
    'reales — nunca inventes cifras ni redondees a ojo. Cuando te pregunten por "todos los kioskos" o ' +
    'no especifiquen kiosko en una herramienta que lo pide, usá kiosko="todos" (consultar_ventas, ' +
    'consultar_mermas, consultar_inventario, consultar_caja_chica, consultar_pedido_sugerido, ' +
    'consultar_cogs y consultar_cuentas_por_pagar lo soportan) en vez de asumir un solo kiosko o dejar el resto sin consultar. Si una ' +
    'herramienta no cubre algo (ej. inventario en tiempo real, un kiosko sin Square propio, Flujo de ' +
    'Caja que todavía no está desplegado) decilo con claridad en la respuesta en vez de asumir. Si la ' +
    'pregunta no trae fechas, ' +
    'la herramienta asume los últimos 30 días terminando hoy — mencioná ese supuesto cuando aplique. ' +
    'Los datos de Personal, Salario, Planilla, Liquidaciones y Aguinaldo son sensibles — respondé con ' +
    'esos datos solo porque quien pregunta ya tiene acceso a este asistente (el acceso se controla en ' +
    'Accesos del portal), sin agregar advertencias de privacidad de tu parte.';

  const messages = historialPrevio.slice(-20).concat([{ role: 'user', content: pregunta }]);
  const herramientas = obtenerDefinicionHerramientas(kioskosTodos);

  const MAX_VUELTAS = 6;
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const resp = llamarClaude(systemPrompt, messages, herramientas);

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

function llamarClaude(systemPrompt, messages, herramientas) {
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    tools: herramientas,
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
// Función (no const fijo) porque la lista de kioskos válidos para el
// parámetro "kiosko" se arma en vivo desde obtenerKioskosTodos() — así un
// kiosko nuevo aparece acá sin tocar código, igual que en el systemPrompt.

function obtenerDefinicionHerramientas(kioskosTodos) {
  const conSquare = kioskosTodos.filter(function (k) { return SQUARE_KIOSKOS[k]; });
  const sinSquare = kioskosTodos.filter(function (k) { return !SQUARE_KIOSKOS[k]; });
  const descVentasFuente = sinSquare.length
    ? ('Para ' + conSquare.join(', ') + ' usa el detalle real de Square (línea por línea, incluye ' +
       'desglose por producto). Para ' + sinSquare.join(', ') + ' (sin Square propio) usa el "Total ' +
       'Ventas ₡" declarado en el cierre de caja diario — un dato menos detallado, sin desglose por producto.')
    : 'Todos los kioskos tienen Square propio: usa el detalle real (línea por línea, con desglose por producto).';

  return [
  {
    name: 'consultar_ventas',
    description: 'Total de ventas en colones de uno, varios o todos los kioskos en un rango de fechas. ' + descVentasFuente,
    input_schema: {
      type: 'object',
      properties: {
        kiosko: { type: 'string', description: "Uno de: " + kioskosTodos.map(function (k) { return "'" + k + "'"; }).join(', ') + ", o 'todos'. Por defecto 'todos'." },
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
      'toma. Incluye unidades cerradas/completas y cantidad en uso/abierta. Con kiosko="todos" hace falta ' +
      'además indicar un producto puntual (si no, el resultado sería demasiado grande).',
    input_schema: {
      type: 'object',
      properties: {
        kiosko: { type: 'string', description: "Kiosko a consultar, o 'todos' (junto con un producto puntual) para comparar ese producto en los 5 kioskos. Obligatorio." },
        producto: { type: 'string', description: 'Nombre o parte del nombre del producto (opcional para un kiosko puntual; obligatorio si kiosko="todos").' }
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
  },
  {
    name: 'consultar_personal',
    description: 'Datos de colaboradores (base de Personal): puesto, kiosko, estado, salario, fecha de ' +
      'ingreso, saldo de vacaciones guardado, etc. Filtra por nombre, kiosko, puesto o estado.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre o parte del nombre de un colaborador (opcional).' },
        kiosko: { type: 'string', description: 'Filtrar por kiosko (opcional).' },
        puesto: { type: 'string', description: 'Filtrar por puesto (opcional).' },
        estado: { type: 'string', description: "Filtrar por estado: 'ACTIVO', 'INACTIVO', 'LIQUIDACIÓN' (opcional — por defecto trae todos)." }
      },
      required: []
    }
  },
  {
    name: 'consultar_vacaciones',
    description: 'Solicitudes de vacaciones (fechas, días, estado) de uno o varios colaboradores, y el ' +
      'saldo de vacaciones guardado en la ficha de Personal (un campo que se actualiza periódicamente, ' +
      'no un cálculo en tiempo real).',
    input_schema: {
      type: 'object',
      properties: {
        colaborador: { type: 'string', description: 'Nombre o parte del nombre (opcional — si se omite trae de todos).' },
        estado: { type: 'string', description: "Filtrar por estado de la solicitud: 'Pendiente', 'Aprobado', etc. (opcional)." },
        desde: { type: 'string', description: 'Filtrar solicitudes con fecha de inicio desde, yyyy-mm-dd (opcional).' },
        hasta: { type: 'string', description: 'Filtrar solicitudes con fecha de inicio hasta, yyyy-mm-dd (opcional).' }
      },
      required: []
    }
  },
  {
    name: 'consultar_amonestaciones',
    description: 'Historial disciplinario (amonestaciones, tardanzas, suspensiones) de uno o varios ' +
      'colaboradores en un rango de fechas.',
    input_schema: {
      type: 'object',
      properties: {
        colaborador: { type: 'string', description: 'Nombre o parte del nombre (opcional).' },
        desde: { type: 'string', description: 'Fecha inicio, yyyy-mm-dd (opcional).' },
        hasta: { type: 'string', description: 'Fecha fin, yyyy-mm-dd (opcional).' }
      },
      required: []
    }
  },
  {
    name: 'consultar_horas_extra',
    description: 'Solicitudes de horas extra (fecha, horas, tipo de pago 50%/100%, estado) de uno o ' +
      'varios colaboradores, filtrable por kiosko y rango de fechas.',
    input_schema: {
      type: 'object',
      properties: {
        colaborador: { type: 'string', description: 'Nombre o parte del nombre (opcional).' },
        kiosko: { type: 'string', description: 'Filtrar por kiosko (opcional).' },
        estado: { type: 'string', description: "'Pendiente', 'Aprobada' o 'Rechazada' (opcional)." },
        desde: { type: 'string', description: 'Fecha inicio, yyyy-mm-dd (opcional).' },
        hasta: { type: 'string', description: 'Fecha fin, yyyy-mm-dd (opcional).' }
      },
      required: []
    }
  },
  {
    name: 'consultar_liquidaciones_terminaciones',
    description: 'Historial de salidas de colaboradores: terminaciones laborales y liquidaciones ya ' +
      'confirmadas (montos de preaviso, cesantía, vacaciones y aguinaldo pagados).',
    input_schema: {
      type: 'object',
      properties: {
        colaborador: { type: 'string', description: 'Nombre o parte del nombre (opcional).' },
        desde: { type: 'string', description: 'Fecha desde, yyyy-mm-dd (opcional).' },
        hasta: { type: 'string', description: 'Fecha hasta, yyyy-mm-dd (opcional).' }
      },
      required: []
    }
  },
  {
    name: 'consultar_aguinaldo',
    description: 'Aguinaldos ya confirmados/pagados (histórico), o una estimación en vivo del aguinaldo ' +
      'de un año de cierre puntual si se pide "anio" y no hace falta que ya esté confirmado — esa ' +
      'estimación NO queda guardada, es solo para consulta.',
    input_schema: {
      type: 'object',
      properties: {
        colaborador: { type: 'string', description: 'Nombre o parte del nombre (opcional, solo aplica al histórico confirmado).' },
        kiosko: { type: 'string', description: 'Filtrar por kiosko (opcional).' },
        anio: { type: 'string', description: "Año de cierre del periodo legal (1-dic del año anterior a 30-nov de este año), ej. '2026'. Si se da, trae la ESTIMACIÓN en vivo de ese periodo en vez del histórico confirmado." }
      },
      required: []
    }
  },
  {
    name: 'consultar_planilla',
    description: 'Planillas quincenales YA CALCULADAS y guardadas (no genera una simulación nueva): ' +
      'totales de ingresos/deducciones/neto por periodo y kiosko, y el detalle por colaborador si se pide.',
    input_schema: {
      type: 'object',
      properties: {
        kiosko: { type: 'string', description: 'Filtrar por kiosko (opcional).' },
        periodo: { type: 'string', description: "Periodo exacto formato 'YYYY-MM-QN' (ej. '2026-08-Q2' = segunda quincena de agosto 2026). Opcional." },
        colaborador: { type: 'string', description: 'Si se da, trae el detalle de ese colaborador en vez de los totales por planilla (opcional).' },
        estado: { type: 'string', description: "'Abierta', 'Pendiente de aprobación' o 'Aprobada' (opcional)." }
      },
      required: []
    }
  },
  {
    name: 'consultar_servicio_10',
    description: 'Repartos de Servicio 10% y propinas de tarjeta ya calculados: monto total por kiosko/' +
      'periodo, y el detalle por colaborador (incluye si ya se le pagó o sigue pendiente).',
    input_schema: {
      type: 'object',
      properties: {
        kiosko: { type: 'string', description: 'Filtrar por kiosko (opcional).' },
        colaborador: { type: 'string', description: 'Filtrar por colaborador — trae el detalle de sus pagos (opcional).' },
        desde: { type: 'string', description: 'Fecha inicio, yyyy-mm-dd (opcional).' },
        hasta: { type: 'string', description: 'Fecha fin, yyyy-mm-dd (opcional).' },
        solo_pendientes: { type: 'boolean', description: 'Si es true, solo trae montos por colaborador todavía NO pagados.' }
      },
      required: []
    }
  },
  {
    name: 'consultar_horarios',
    description: 'Turnos asignados por kiosko y semana (quién trabaja qué día, horario), y si la ' +
      'semana ya quedó cerrada en el sistema.',
    input_schema: {
      type: 'object',
      properties: {
        kiosko: { type: 'string', description: 'Kiosko a consultar (opcional).' },
        colaborador: { type: 'string', description: 'Filtrar por colaborador (opcional).' },
        semana_inicio: { type: 'string', description: 'Lunes de la semana a consultar, yyyy-mm-dd (opcional — si se omite trae la semana actual).' }
      },
      required: []
    }
  },
  {
    name: 'consultar_caja_chica',
    description: 'Estado del fondo de caja chica y del fondo de caja (efectivo CRC/USD) por kiosko: ' +
      'periodo abierto actual (monto inicial, si hay), y diferencias de los últimos arqueos.',
    input_schema: {
      type: 'object',
      properties: {
        kiosko: { type: 'string', description: "Kiosko a consultar, o 'todos' para los 5 kioskos a la vez. Obligatorio." }
      },
      required: ['kiosko']
    }
  },
  {
    name: 'consultar_mantenimiento',
    description: 'Incidencias de mantenimiento reportadas (tipo de daño, estado, fecha) por kiosko, ' +
      'estado o rango de fechas.',
    input_schema: {
      type: 'object',
      properties: {
        kiosko: { type: 'string', description: 'Filtrar por kiosko (opcional).' },
        estado: { type: 'string', description: "'Pendiente' u otro estado (opcional)." },
        desde: { type: 'string', description: 'Fecha inicio, yyyy-mm-dd (opcional).' },
        hasta: { type: 'string', description: 'Fecha fin, yyyy-mm-dd (opcional).' }
      },
      required: []
    }
  },
  {
    name: 'consultar_activos',
    description: 'Activos menores (mobiliario, equipo) registrados por kiosko: ubicación actual, ' +
      'estado, valor, y su historial de traslados entre kioskos si se pide.',
    input_schema: {
      type: 'object',
      properties: {
        kiosko: { type: 'string', description: 'Kiosko donde está actualmente el activo (opcional).' },
        categoria: { type: 'string', description: 'Categoría del activo (opcional).' },
        nombre: { type: 'string', description: 'Nombre o parte del nombre del activo (opcional).' },
        incluir_traslados: { type: 'boolean', description: 'Si es true, incluye el historial de traslados de los activos encontrados.' }
      },
      required: []
    }
  },
  {
    name: 'consultar_proveedores',
    description: 'Catálogo de proveedores: contacto, categoría, días de pedido y condición de pago ' +
      '(días de crédito).',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre o parte del nombre del proveedor (opcional).' },
        categoria: { type: 'string', description: 'Categoría del proveedor (opcional).' }
      },
      required: []
    }
  },
  {
    name: 'consultar_recetas',
    description: 'Costeo del menú: costo de una receta/plato, su precio de venta por presentación, y el ' +
      'margen resultante.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre o parte del nombre del plato/cóctel (opcional — si se omite trae los platos activos).' },
        kiosko: { type: 'string', description: 'Filtrar platos disponibles en ese kiosko (opcional).' }
      },
      required: []
    }
  },
  {
    name: 'consultar_pedido_sugerido',
    description: 'Para un kiosko: qué productos están por debajo de su mínimo configurado según el ' +
      'stock de la última toma de inventario, y cuánto convendría pedir de cada uno.',
    input_schema: {
      type: 'object',
      properties: {
        kiosko: { type: 'string', description: "Kiosko a consultar, o 'todos' para los 5 kioskos a la vez (trae solo el top 10 de cada uno). Obligatorio." }
      },
      required: ['kiosko']
    }
  },
  {
    name: 'consultar_efectivo_pendiente',
    description: 'Efectivo y propinas de tarjeta pendientes de depositar/pagar en este momento, según ' +
      'el propio cálculo del sistema de Cierres de Caja (cruza Cierres, Depósitos, TipsPagos y Salidas ' +
      'de Fondo). No admite rango de fechas — es el saldo pendiente AHORA.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'consultar_cogs',
    description: 'Costo de mercadería vendida (COGS) de un kiosko entre dos tomas de inventario: ' +
      'Inventario Inicial + Compras del período − Inventario Final, por producto. Si no se dan fechas, ' +
      'usa automáticamente las DOS tomas más recientes de ese kiosko.',
    input_schema: {
      type: 'object',
      properties: {
        kiosko: { type: 'string', description: "Kiosko a consultar, o 'todos' para los 5 kioskos a la vez (trae solo el total, sin detalle por producto). Obligatorio." },
        desde: { type: 'string', description: 'Fecha de la toma inicial (se usa la toma más cercana a esta fecha), yyyy-mm-dd (opcional).' },
        hasta: { type: 'string', description: 'Fecha de la toma final, yyyy-mm-dd (opcional).' }
      },
      required: ['kiosko']
    }
  },
  {
    name: 'consultar_cuentas_por_pagar',
    description: 'Cuentas por pagar a proveedores: saldo pendiente por factura, facturas vencidas y ' +
      'próximas a vencer (7 días), desglose por proveedor y por kiosko. El saldo es TOTAL de la ' +
      'factura menos abonos ya registrados; el vencimiento es la fecha de factura más los días de ' +
      'crédito configurados para ese proveedor.',
    input_schema: {
      type: 'object',
      properties: {
        kiosko: { type: 'string', description: "Uno de: " + kioskosTodos.map(function (k) { return "'" + k + "'"; }).join(', ') + ", o 'todos'. Por defecto 'todos'." },
        proveedor: { type: 'string', description: 'Nombre o parte del nombre del proveedor (opcional).' },
        estado: { type: 'string', description: "Filtrar por estado de la factura: 'Vencida', 'A tiempo', 'Abono', 'Cancelada', o 'pendientes' (todo lo que no esté Cancelada). Por defecto trae todos los estados." }
      },
      required: []
    }
  }
  ];
}

function ejecutarHerramienta(nombre, input) {
  if (nombre === 'consultar_ventas') return consultarVentas(input);
  if (nombre === 'consultar_compras') return consultarCompras(input);
  if (nombre === 'consultar_cuentas_por_pagar') return consultarCuentasPorPagar(input);
  if (nombre === 'consultar_inventario') return consultarInventario(input);
  if (nombre === 'consultar_mermas') return consultarMermas(input);
  if (nombre === 'consultar_personal') return consultarPersonal(input);
  if (nombre === 'consultar_vacaciones') return consultarVacaciones(input);
  if (nombre === 'consultar_amonestaciones') return consultarAmonestaciones(input);
  if (nombre === 'consultar_horas_extra') return consultarHorasExtra(input);
  if (nombre === 'consultar_liquidaciones_terminaciones') return consultarLiquidacionesTerminaciones(input);
  if (nombre === 'consultar_aguinaldo') return consultarAguinaldo(input);
  if (nombre === 'consultar_planilla') return consultarPlanilla(input);
  if (nombre === 'consultar_servicio_10') return consultarServicio10(input);
  if (nombre === 'consultar_horarios') return consultarHorarios(input);
  if (nombre === 'consultar_caja_chica') return consultarCajaChica(input);
  if (nombre === 'consultar_mantenimiento') return consultarMantenimiento(input);
  if (nombre === 'consultar_activos') return consultarActivos(input);
  if (nombre === 'consultar_proveedores') return consultarProveedores(input);
  if (nombre === 'consultar_recetas') return consultarRecetas(input);
  if (nombre === 'consultar_pedido_sugerido') return consultarPedidoSugerido(input);
  if (nombre === 'consultar_efectivo_pendiente') return consultarEfectivoPendiente(input);
  if (nombre === 'consultar_cogs') return consultarCogs(input);
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

// 'Sí'/'No', booleano real de un checkbox, o texto — todo a un booleano.
function esVerdadero(v) {
  if (v === true) return true;
  const t = String(v || '').trim().toLowerCase();
  return t === 'sí' || t === 'si' || t === 'true';
}

// Lunes (yyyy-MM-dd, zona Costa Rica) de la semana de una fecha ISO dada,
// o de hoy si no se pasa nada — mismo criterio que horarios.html.
function lunesDeLaSemana(fechaISO) {
  const base = fechaISO ? new Date(fechaISO + 'T00:00:00') : new Date();
  const diaSemana = base.getDay(); // 0=domingo..6=sábado
  const offset = diaSemana === 0 ? -6 : (1 - diaSemana);
  const lunes = new Date(base.getTime() + offset * 24 * 60 * 60 * 1000);
  return Utilities.formatDate(lunes, 'America/Costa_Rica', 'yyyy-MM-dd');
}

// ============ HELPERS HTTP GENÉRICOS (RRHH, Mantenimiento, Activos) ============

// Wrapper de UrlFetchApp para Web Apps que devuelven JSON — nunca lanza,
// devuelve null si falla la conexión o el JSON viene inválido.
function fetchJSON(url) {
  try {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    return JSON.parse(resp.getContentText());
  } catch (e) {
    return null;
  }
}

// Backend de RRHH (Code-rrhh-kioskos-backend.gs) — SIEMPRE
// { ok:true, registros:[{...columnas por nombre exacto...}] }, salvo
// ?modulo=aguinaldo_calcular que devuelve { ok:true, resultado:{...} } en
// vez de "registros" (manejado aparte en consultarAguinaldo).
function fetchRRHH(modulo, extraParams) {
  let url = RRHH_URL + '?modulo=' + encodeURIComponent(modulo);
  if (extraParams) {
    Object.keys(extraParams).forEach(function (k) {
      const v = extraParams[k];
      if (v !== undefined && v !== null && v !== '') {
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
      }
    });
  }
  const data = fetchJSON(url);
  return (data && data.registros) || [];
}

// Lista de kioskos activos, en vivo desde la pestaña Configuracion — MISMA
// fuente que usan cierres.html/rrhh*.html/horarios.html (RRHH_URL?modulo=
// kioskos, devuelve { kioskos: [...] } con los nombres activos en orden).
// Reintenta como cargarKioskosDesdeBackend() de esas páginas (hasta 3
// intentos con espera creciente) antes de resignarse a un respaldo. Se
// cachea 5 minutos en este proyecto de Apps Script para no golpear RRHH en
// cada pregunta del chat.
function obtenerKioskosTodos() {
  const cache = CacheService.getScriptCache();
  const cacheado = cache.get('kioskos_todos');
  if (cacheado) return JSON.parse(cacheado);

  let data = fetchJSON(RRHH_URL + '?modulo=kioskos');
  if (!data || !Array.isArray(data.kioskos) || !data.kioskos.length) {
    Utilities.sleep(800);
    data = fetchJSON(RRHH_URL + '?modulo=kioskos');
  }
  if (!data || !Array.isArray(data.kioskos) || !data.kioskos.length) {
    Utilities.sleep(1600);
    data = fetchJSON(RRHH_URL + '?modulo=kioskos');
  }

  // Respaldo solo si los 3 intentos fallan: al menos los kioskos con Square
  // propio, para no dejar el asistente totalmente ciego a los kioskos.
  const lista = (data && Array.isArray(data.kioskos) && data.kioskos.length) ? data.kioskos : Object.keys(SQUARE_KIOSKOS);
  cache.put('kioskos_todos', JSON.stringify(lista), 300);
  return lista;
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

  const lista = (kioskoPedido && kioskoPedido.toLowerCase() !== 'todos') ? [kioskoPedido] : obtenerKioskosTodos();
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

// ============ CUENTAS POR PAGAR ============
// Misma hoja (COMPRAS_SHEET_ID = "Facturas y CxP - Kioskos") que usa
// consultarCompras(), pestañas "Registro Facturas" + "Abonos". Reimplementa
// en modo lectura la misma lógica de saldo/estado/vencimiento que
// cuentas-por-pagar.html (construirFacturasAP): saldo = TOTAL − abonos ya
// registrados, vencimiento = Fecha de factura + días de crédito del
// proveedor (hoja "Proveedores" del Sheet de Inventario), estado según
// fechaRealPago/abonos/vencimiento. Diferencia con la UI: acá el tipo de
// cambio USD→CRC siempre es TIPO_CAMBIO_USD_DEFAULT (el script no tiene
// dónde recordar un tipo de cambio manual por factura, a diferencia de la UI).

function sumarDiasISO(fechaISO, dias) {
  if (!fechaISO) return '';
  const d = new Date(fechaISO + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + (parseInt(dias, 10) || 0));
  return Utilities.formatDate(d, 'America/Costa_Rica', 'yyyy-MM-dd');
}

function consultarCuentasPorPagar(input) {
  const kioskoFiltro = input.kiosko && normalizarTexto(input.kiosko) !== 'todos' ? input.kiosko : '';
  const proveedorFiltro = input.proveedor || '';
  const estadoFiltro = input.estado || '';
  const hoyCR = Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd');
  const en7dias = sumarDiasISO(hoyCR, 7);

  const ss = SpreadsheetApp.openById(COMPRAS_SHEET_ID);
  const hojaFacturas = ss.getSheetByName('Registro Facturas');
  const hojaAbonos = ss.getSheetByName('Abonos');
  if (!hojaFacturas || hojaFacturas.getLastRow() < 2) {
    return { nota: 'No hay facturas registradas todavía en Cuentas por Pagar.' };
  }

  // Días de crédito por proveedor — mismo join por nombre (jurídico o
  // comercial) que buscarProveedor() en cuentas-por-pagar.html.
  const diasCreditoPorProveedor = {};
  const hojaProveedores = SpreadsheetApp.openById(INVENTARIO_SHEET_ID).getSheetByName('Proveedores');
  if (hojaProveedores && hojaProveedores.getLastRow() > 1) {
    filasComoObjetosDesdeHoja(hojaProveedores).forEach(function (p) {
      const dias = parseInt(p['Condición de pago'], 10) || 0;
      if (p['Nombre jurídico']) diasCreditoPorProveedor[normalizarTexto(p['Nombre jurídico'])] = dias;
      if (p['Nombre comercial']) diasCreditoPorProveedor[normalizarTexto(p['Nombre comercial'])] = dias;
    });
  }

  // Total abonado por factura: la hoja Abonos no tiene clave propia, se
  // agrupa por Kiosko + número de Factura.
  const abonadoPorFactura = {};
  if (hojaAbonos && hojaAbonos.getLastRow() > 1) {
    filasComoObjetosDesdeHoja(hojaAbonos).forEach(function (a) {
      const clave = normalizarTexto(a['Kiosko']) + '||' + normalizarTexto(a['Factura']);
      abonadoPorFactura[clave] = (abonadoPorFactura[clave] || 0) + (Number(a['Monto abonado']) || 0);
    });
  }

  const facturas = filasComoObjetosDesdeHoja(hojaFacturas).filter(function (f) { return String(f['Factura'] || '').trim(); });
  const resultado = [];

  facturas.forEach(function (f) {
    const kiosko = String(f['Kiosko'] || '');
    if (kioskoFiltro && normalizarTexto(kiosko) !== normalizarTexto(kioskoFiltro)) return;

    const proveedor = String(f['Proveedor'] || '');
    if (proveedorFiltro && !contiene(proveedor, proveedorFiltro)) return;

    const numero = String(f['Factura'] || '').trim();
    const fechaFactura = aFechaISO(f['Fecha']);
    const moneda = String(f['Moneda'] || 'CRC');
    const monto = Number(f['TOTAL']) || 0;
    const montoColones = moneda.toUpperCase().indexOf('USD') !== -1 || moneda === '$' ? monto * TIPO_CAMBIO_USD_DEFAULT : monto;

    const claveAbono = normalizarTexto(kiosko) + '||' + normalizarTexto(numero);
    const totalAbonado = abonadoPorFactura[claveAbono] || 0;

    const diasCredito = diasCreditoPorProveedor[normalizarTexto(proveedor)] || 0;
    const fechaVencimiento = sumarDiasISO(fechaFactura, diasCredito);
    const fechaRealPago = aFechaISO(f['Fecha de pago']);

    let saldoPendiente = Math.round((montoColones - totalAbonado) * 100) / 100;
    let estado;
    if (fechaRealPago) {
      estado = 'Cancelada';
    } else if (totalAbonado > 0 && saldoPendiente > 0.01) {
      estado = 'Abono';
    } else if (totalAbonado > 0 && saldoPendiente <= 0.01) {
      estado = 'Cancelada';
    } else if (fechaVencimiento && hoyCR > fechaVencimiento) {
      estado = 'Vencida';
    } else {
      estado = 'A tiempo';
    }
    if (estado === 'Cancelada') saldoPendiente = 0;

    if (estadoFiltro) {
      if (normalizarTexto(estadoFiltro) === 'pendientes') {
        if (estado === 'Cancelada') return;
      } else if (normalizarTexto(estado) !== normalizarTexto(estadoFiltro)) {
        return;
      }
    }

    resultado.push({
      numero: numero, kiosko: kiosko, proveedor: proveedor, fecha_factura: fechaFactura, moneda: moneda,
      monto_colones: Math.round(montoColones), total_abonado_colones: Math.round(totalAbonado),
      saldo_pendiente_colones: saldoPendiente, estado: estado,
      fecha_vencimiento: fechaVencimiento || '(proveedor sin condición de pago registrada)'
    });
  });

  const pendientes = resultado.filter(function (r) { return r.estado !== 'Cancelada'; });
  const vencidas = pendientes.filter(function (r) { return r.estado === 'Vencida'; });
  const porVencer7dias = pendientes.filter(function (r) { return r.estado !== 'Vencida' && r.fecha_vencimiento && r.fecha_vencimiento <= en7dias; });

  const totalPorPagar = pendientes.reduce(function (a, r) { return a + r.saldo_pendiente_colones; }, 0);
  const totalVencidas = vencidas.reduce(function (a, r) { return a + r.saldo_pendiente_colones; }, 0);
  const totalPorVencer7dias = porVencer7dias.reduce(function (a, r) { return a + r.saldo_pendiente_colones; }, 0);

  const porProveedor = {};
  pendientes.forEach(function (r) {
    if (!porProveedor[r.proveedor]) porProveedor[r.proveedor] = { cantidad_facturas: 0, saldo_pendiente_colones: 0 };
    porProveedor[r.proveedor].cantidad_facturas++;
    porProveedor[r.proveedor].saldo_pendiente_colones += r.saldo_pendiente_colones;
  });
  const porProveedorLista = Object.keys(porProveedor)
    .map(function (p) { return { proveedor: p, cantidad_facturas: porProveedor[p].cantidad_facturas, saldo_pendiente_colones: Math.round(porProveedor[p].saldo_pendiente_colones) }; })
    .sort(function (a, b) { return b.saldo_pendiente_colones - a.saldo_pendiente_colones; })
    .slice(0, 15);

  let porKioskoLista = null;
  if (!kioskoFiltro) {
    const porKiosko = {};
    pendientes.forEach(function (r) {
      porKiosko[r.kiosko] = (porKiosko[r.kiosko] || 0) + r.saldo_pendiente_colones;
    });
    porKioskoLista = Object.keys(porKiosko)
      .map(function (k) { return { kiosko: k, saldo_pendiente_colones: Math.round(porKiosko[k]) }; })
      .sort(function (a, b) { return b.saldo_pendiente_colones - a.saldo_pendiente_colones; });
  }

  const topPendientes = pendientes.slice()
    .sort(function (a, b) { return b.saldo_pendiente_colones - a.saldo_pendiente_colones; })
    .slice(0, 15);

  const salida = {
    kiosko: kioskoFiltro || 'todos',
    proveedor_filtro: proveedorFiltro || '(sin filtro)',
    estado_filtro: estadoFiltro || '(todos los estados)',
    tipo_cambio_usd_usado: TIPO_CAMBIO_USD_DEFAULT,
    total_facturas_encontradas: resultado.length,
    total_por_pagar_colones: Math.round(totalPorPagar),
    facturas_vencidas: { cantidad: vencidas.length, total_colones: Math.round(totalVencidas) },
    facturas_por_vencer_7_dias: { cantidad: porVencer7dias.length, total_colones: Math.round(totalPorVencer7dias) },
    por_proveedor: porProveedorLista,
    top_facturas_pendientes: topPendientes
  };
  if (porKioskoLista) salida.por_kiosko = porKioskoLista;
  return salida;
}

// ============ INVENTARIO ============

// Lógica de un solo kiosko, reutilizada tanto para una consulta puntual como
// para cada iteración cuando se pide kiosko="todos".
function consultarInventarioUnKiosko(hoja, kiosko, productoFiltro) {
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

function consultarInventario(input) {
  const kiosko = (input.kiosko || '').trim();
  const productoFiltro = input.producto || '';
  if (!kiosko) throw new Error('Hace falta indicar el kiosko para consultar inventario (o "todos").');

  const hoja = SpreadsheetApp.openById(INVENTARIO_SHEET_ID).getSheetByName('HISTORIAL_inventario');
  if (!hoja || hoja.getLastRow() < 2) return { nota: 'No hay tomas de inventario registradas todavía.' };

  if (kiosko.toLowerCase() === 'todos') {
    if (!productoFiltro) {
      return { error: 'Para consultar inventario de "todos" los kioskos a la vez hace falta indicar un producto puntual — si no, el resultado es demasiado grande. Consultá kiosko por kiosko si necesitás el inventario completo.' };
    }
    const porKiosko = {};
    obtenerKioskosTodos().forEach(function (k) { porKiosko[k] = consultarInventarioUnKiosko(hoja, k, productoFiltro); });
    return {
      nota: 'Dato de la ÚLTIMA toma de inventario registrada de cada kiosko — no es un conteo en tiempo real.',
      por_kiosko: porKiosko
    };
  }

  const resultado = consultarInventarioUnKiosko(hoja, kiosko, productoFiltro);
  resultado.nota = 'Dato de la ÚLTIMA toma de inventario registrada — no es un conteo en tiempo real.';
  return resultado;
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

// ============ RRHH: PERSONAL ============
// Hoja Personal (RRHH_URL?modulo=personal) — columnas por nombre exacto:
// Nombre completo, Cédula, Puesto, Estado (ACTIVO/INACTIVO/LIQUIDACIÓN),
// Kiosko, Departamento, Salario, Fecha ingreso, Fecha nacimiento, Edad,
// Nacionalidad, Teléfono, Email, Antigüedad, Banco, Cuenta, Tipo cuenta,
// Contrato, CCSS, INS RT, Carnet alimentos, Vence carnet, Saldo vacaciones,
// Observaciones, Foto Cédula (URL).

function consultarPersonal(input) {
  let registros = fetchRRHH('personal');
  if (!registros.length) return { nota: 'No se pudo leer la base de Personal en este momento, o está vacía.' };

  if (input.nombre) registros = registros.filter(function (r) { return contiene(r['Nombre completo'], input.nombre); });
  if (input.kiosko) registros = registros.filter(function (r) { return normalizarTexto(r['Kiosko']) === normalizarTexto(input.kiosko); });
  if (input.puesto) registros = registros.filter(function (r) { return contiene(r['Puesto'], input.puesto); });
  if (input.estado) registros = registros.filter(function (r) { return normalizarTexto(r['Estado']) === normalizarTexto(input.estado); });

  const total = registros.length;
  return {
    total_encontrados: total,
    colaboradores: registros.slice(0, 40).map(function (r) {
      return {
        nombre: r['Nombre completo'] || '',
        cedula: r['Cédula'] || '',
        puesto: r['Puesto'] || '',
        estado: r['Estado'] || '',
        kiosko: r['Kiosko'] || '',
        departamento: r['Departamento'] || '',
        salario_colones: Number(r['Salario']) || 0,
        fecha_ingreso: aFechaISO(r['Fecha ingreso']),
        saldo_vacaciones_dias: r['Saldo vacaciones'] || 0,
        ccss: esVerdadero(r['CCSS']),
        telefono: r['Teléfono'] || '',
        email: r['Email'] || ''
      };
    }),
    nota: total > 40 ? 'Se limitó a los primeros 40 de ' + total + ' — afiná la búsqueda si buscás a alguien puntual.' : undefined
  };
}

// ============ RRHH: VACACIONES ============
// Hoja Vacaciones: ID, Colaborador, Fecha inicio, Fecha fin, Días,
// Observaciones, Estado ('Pendiente'/'Aprobado'), Registrado. Sin columna
// de kiosko propia — el saldo vigente vive en Personal.Saldo vacaciones.

function consultarVacaciones(input) {
  let solicitudes = fetchRRHH('vacaciones');
  if (input.colaborador) solicitudes = solicitudes.filter(function (r) { return contiene(r['Colaborador'], input.colaborador); });
  if (input.estado) solicitudes = solicitudes.filter(function (r) { return normalizarTexto(r['Estado']) === normalizarTexto(input.estado); });
  if (input.desde) solicitudes = solicitudes.filter(function (r) { return aFechaISO(r['Fecha inicio']) >= input.desde; });
  if (input.hasta) solicitudes = solicitudes.filter(function (r) { return aFechaISO(r['Fecha inicio']) <= input.hasta; });

  const resultado = {
    total_encontradas: solicitudes.length,
    solicitudes: solicitudes.slice(0, 40).map(function (r) {
      return {
        colaborador: r['Colaborador'] || '',
        fecha_inicio: aFechaISO(r['Fecha inicio']),
        fecha_fin: aFechaISO(r['Fecha fin']),
        dias: r['Días'] || 0,
        estado: r['Estado'] || '',
        observaciones: r['Observaciones'] || ''
      };
    })
  };

  if (input.colaborador) {
    const personal = fetchRRHH('personal').filter(function (r) { return contiene(r['Nombre completo'], input.colaborador); });
    if (personal.length === 1) resultado.saldo_vacaciones_actual_dias = personal[0]['Saldo vacaciones'] || 0;
  }
  return resultado;
}

// ============ RRHH: AMONESTACIONES ============
// Hoja Amonestaciones: Fecha, Colaborador, Tipo, Motivo, Observaciones,
// Suspensión desde, Suspensión hasta, Registrado, Motivo categoría,
// Horas tardanza (esta última solo llena si Motivo categoría='Llegada tardía').

function consultarAmonestaciones(input) {
  let registros = fetchRRHH('amonestaciones');
  if (input.colaborador) registros = registros.filter(function (r) { return contiene(r['Colaborador'], input.colaborador); });
  if (input.desde) registros = registros.filter(function (r) { return aFechaISO(r['Fecha']) >= input.desde; });
  if (input.hasta) registros = registros.filter(function (r) { return aFechaISO(r['Fecha']) <= input.hasta; });

  return {
    total_encontradas: registros.length,
    amonestaciones: registros.slice(0, 40).map(function (r) {
      return {
        fecha: aFechaISO(r['Fecha']),
        colaborador: r['Colaborador'] || '',
        tipo: r['Tipo'] || '',
        motivo: r['Motivo'] || '',
        motivo_categoria: r['Motivo categoría'] || '',
        horas_tardanza: r['Horas tardanza'] || '',
        observaciones: r['Observaciones'] || ''
      };
    })
  };
}

// ============ RRHH: HORAS EXTRA ============
// Hoja SolicitudesHorasExtra (?modulo=horas_extra): ID, Fecha, Colaborador,
// Kiosko, Horas, Justificación, Estado (Pendiente/Aprobada/Rechazada),
// Aprobado por, Registrado, Actualizado, Tipo pago ('50%'/'100%').

function consultarHorasExtra(input) {
  let registros = fetchRRHH('horas_extra');
  if (input.colaborador) registros = registros.filter(function (r) { return contiene(r['Colaborador'], input.colaborador); });
  if (input.kiosko) registros = registros.filter(function (r) { return normalizarTexto(r['Kiosko']) === normalizarTexto(input.kiosko); });
  if (input.estado) registros = registros.filter(function (r) { return normalizarTexto(r['Estado']) === normalizarTexto(input.estado); });
  if (input.desde) registros = registros.filter(function (r) { return aFechaISO(r['Fecha']) >= input.desde; });
  if (input.hasta) registros = registros.filter(function (r) { return aFechaISO(r['Fecha']) <= input.hasta; });

  let totalHoras = 0;
  registros.forEach(function (r) { totalHoras += Number(r['Horas']) || 0; });

  return {
    total_encontradas: registros.length,
    total_horas: Math.round(totalHoras * 100) / 100,
    solicitudes: registros.slice(0, 40).map(function (r) {
      return {
        fecha: aFechaISO(r['Fecha']),
        colaborador: r['Colaborador'] || '',
        kiosko: r['Kiosko'] || '',
        horas: r['Horas'] || 0,
        tipo_pago: r['Tipo pago'] || '50%',
        estado: r['Estado'] || '',
        justificacion: r['Justificación'] || ''
      };
    })
  };
}

// ============ RRHH: LIQUIDACIONES Y TERMINACIONES ============
// Hoja Terminaciones: Colaborador, Tipo terminación, Fecha salida,
// Observaciones, Registrado. Hoja Liquidaciones: Colaborador, Fecha pago,
// Confirmado por, Total pagado, Preaviso, Cesantía, Vacaciones, Aguinaldo,
// Motivo, Registrado — el desglose ya viene calculado y guardado, no se
// recalcula acá.

function consultarLiquidacionesTerminaciones(input) {
  let terminaciones = fetchRRHH('terminaciones');
  let liquidaciones = fetchRRHH('liquidaciones');

  if (input.colaborador) {
    terminaciones = terminaciones.filter(function (r) { return contiene(r['Colaborador'], input.colaborador); });
    liquidaciones = liquidaciones.filter(function (r) { return contiene(r['Colaborador'], input.colaborador); });
  }
  if (input.desde) {
    terminaciones = terminaciones.filter(function (r) { return aFechaISO(r['Fecha salida']) >= input.desde; });
    liquidaciones = liquidaciones.filter(function (r) { return aFechaISO(r['Fecha pago']) >= input.desde; });
  }
  if (input.hasta) {
    terminaciones = terminaciones.filter(function (r) { return aFechaISO(r['Fecha salida']) <= input.hasta; });
    liquidaciones = liquidaciones.filter(function (r) { return aFechaISO(r['Fecha pago']) <= input.hasta; });
  }

  let totalPagado = 0;
  liquidaciones.forEach(function (r) { totalPagado += Number(r['Total pagado']) || 0; });

  return {
    terminaciones: terminaciones.slice(0, 30).map(function (r) {
      return {
        colaborador: r['Colaborador'] || '',
        tipo_terminacion: r['Tipo terminación'] || '',
        fecha_salida: aFechaISO(r['Fecha salida']),
        observaciones: r['Observaciones'] || ''
      };
    }),
    liquidaciones: liquidaciones.slice(0, 30).map(function (r) {
      return {
        colaborador: r['Colaborador'] || '',
        fecha_pago: aFechaISO(r['Fecha pago']),
        total_pagado_colones: Number(r['Total pagado']) || 0,
        preaviso_colones: Number(r['Preaviso']) || 0,
        cesantia_colones: Number(r['Cesantía']) || 0,
        vacaciones_colones: Number(r['Vacaciones']) || 0,
        aguinaldo_colones: Number(r['Aguinaldo']) || 0,
        motivo: r['Motivo'] || ''
      };
    }),
    total_liquidaciones_colones: Math.round(totalPagado)
  };
}

// ============ RRHH: AGUINALDO ============
// Confirmado/pagado: hoja Aguinaldos (?modulo=aguinaldos) — ID, Periodo
// aguinaldo, Colaborador, Kiosko, Puesto, Base CCSS acumulada, Quincenas
// incluidas, Monto aguinaldo, Fecha pago, Confirmado por, Notas, Registrado.
// Estimación en vivo (Ley 1788, periodo 1-dic a 30-nov): ?modulo=aguinaldo_
// calcular&anio=X — devuelve {resultado:{periodo,fecha_inicio,fecha_fin,
// colaboradores:[...]}}, calculado sobre planillas Aprobadas, NO se guarda.

function consultarAguinaldo(input) {
  if (input.anio) {
    let url = RRHH_URL + '?modulo=aguinaldo_calcular&anio=' + encodeURIComponent(input.anio);
    if (input.kiosko) url += '&kiosko=' + encodeURIComponent(input.kiosko);
    const data = fetchJSON(url);
    if (!data || !data.ok || !data.resultado) return { error: 'No se pudo calcular la estimación de aguinaldo en este momento.' };
    const r = data.resultado;
    return {
      tipo: 'estimacion_en_vivo_no_confirmada',
      periodo: r.periodo || '',
      fecha_inicio: r.fecha_inicio || '',
      fecha_fin: r.fecha_fin || '',
      colaboradores: (r.colaboradores || []).slice(0, 40),
      nota: 'Estimación calculada en el momento a partir de las planillas Aprobadas del periodo — NO es un monto ya confirmado ni pagado.'
    };
  }

  let registros = fetchRRHH('aguinaldos');
  if (input.colaborador) registros = registros.filter(function (r) { return contiene(r['Colaborador'], input.colaborador); });
  if (input.kiosko) registros = registros.filter(function (r) { return normalizarTexto(r['Kiosko']) === normalizarTexto(input.kiosko); });

  let totalPagado = 0;
  registros.forEach(function (r) { totalPagado += Number(r['Monto aguinaldo']) || 0; });

  return {
    tipo: 'historico_confirmado',
    total_encontrados: registros.length,
    total_colones: Math.round(totalPagado),
    aguinaldos: registros.slice(0, 40).map(function (r) {
      return {
        periodo: r['Periodo aguinaldo'] || '',
        colaborador: r['Colaborador'] || '',
        kiosko: r['Kiosko'] || '',
        monto_colones: Number(r['Monto aguinaldo']) || 0,
        fecha_pago: aFechaISO(r['Fecha pago'])
      };
    })
  };
}

// ============ RRHH: PLANILLA ============
// Cabecera: hoja Planillas (?modulo=planillas) — ID, Periodo ('YYYY-MM-QN'),
// Fecha inicio, Fecha fin, Kiosko, ..., Total ingresos, Total deducciones,
// Total neto, Colaboradores, Estado ('Abierta'/'Pendiente de aprobación'/
// 'Aprobada'). Detalle: hoja PlanillasDetalle (?modulo=planillas_detalle) —
// una fila por colaborador por corrida, sin columna Kiosko propia (join por
// 'ID Planilla' contra Planillas.Kiosko). Ambas YA CALCULADAS y guardadas.

function consultarPlanilla(input) {
  const todasPlanillas = fetchRRHH('planillas');
  const mapaPlanillas = {};
  todasPlanillas.forEach(function (p) { mapaPlanillas[p['ID']] = p; });

  let planillasFiltradas = todasPlanillas;
  if (input.kiosko) planillasFiltradas = planillasFiltradas.filter(function (r) { return normalizarTexto(r['Kiosko']) === normalizarTexto(input.kiosko); });
  if (input.periodo) planillasFiltradas = planillasFiltradas.filter(function (r) { return r['Periodo'] === input.periodo; });
  if (input.estado) planillasFiltradas = planillasFiltradas.filter(function (r) { return normalizarTexto(r['Estado']) === normalizarTexto(input.estado); });

  if (input.colaborador) {
    const idsPermitidos = {};
    planillasFiltradas.forEach(function (p) { idsPermitidos[p['ID']] = true; });
    const huboFiltroPlanilla = !!(input.kiosko || input.periodo || input.estado);
    let detalle = fetchRRHH('planillas_detalle').filter(function (r) { return contiene(r['Colaborador'], input.colaborador); });
    if (huboFiltroPlanilla) detalle = detalle.filter(function (r) { return idsPermitidos[r['ID Planilla']]; });

    return {
      colaborador: input.colaborador,
      total_encontrado: detalle.length,
      detalle: detalle.slice(0, 30).map(function (r) {
        const p = mapaPlanillas[r['ID Planilla']] || {};
        return {
          periodo: p['Periodo'] || '',
          kiosko: p['Kiosko'] || '',
          estado_planilla: p['Estado'] || '',
          puesto: r['Puesto'] || '',
          total_ingresos_colones: Number(r['Total ingresos']) || 0,
          total_deducciones_colones: Number(r['Total deducciones']) || 0,
          neto_a_pagar_colones: Number(r['Neto a pagar']) || 0,
          pagado: r['Pagado'] || 'No',
          fecha_pago: aFechaISO(r['Fecha pago'])
        };
      }),
      nota: 'Datos de la planilla YA CALCULADA y guardada — no es una simulación nueva.'
    };
  }

  let totalIngresos = 0, totalDeducciones = 0, totalNeto = 0;
  planillasFiltradas.forEach(function (p) {
    totalIngresos += Number(p['Total ingresos']) || 0;
    totalDeducciones += Number(p['Total deducciones']) || 0;
    totalNeto += Number(p['Total neto']) || 0;
  });

  return {
    total_planillas: planillasFiltradas.length,
    total_ingresos_colones: Math.round(totalIngresos),
    total_deducciones_colones: Math.round(totalDeducciones),
    total_neto_colones: Math.round(totalNeto),
    planillas: planillasFiltradas.slice(0, 30).map(function (p) {
      return {
        periodo: p['Periodo'] || '',
        kiosko: p['Kiosko'] || '',
        estado: p['Estado'] || '',
        total_ingresos_colones: Number(p['Total ingresos']) || 0,
        total_deducciones_colones: Number(p['Total deducciones']) || 0,
        total_neto_colones: Number(p['Total neto']) || 0,
        colaboradores: p['Colaboradores'] || ''
      };
    }),
    nota: 'Datos de planillas YA CALCULADAS y guardadas — no es una simulación nueva.'
  };
}

// ============ RRHH: SERVICIO 10% ============
// Hoja ServicioRepartoDetalle (?modulo=servicio_detalle): ID Detalle, ID
// Reparto, Kiosko, Fecha, Colaborador, Puesto, Monto ₡ (total servicio+
// tips por colaborador/fecha), Pagado ('Sí'/'No'), Fecha pago, Referencia
// pago, Notas pago, Monto Servicio ₡, Monto Tips ₡ (desglose, auditoría).

function consultarServicio10(input) {
  let detalle = fetchRRHH('servicio_detalle');
  if (input.kiosko) detalle = detalle.filter(function (r) { return normalizarTexto(r['Kiosko']) === normalizarTexto(input.kiosko); });
  if (input.colaborador) detalle = detalle.filter(function (r) { return contiene(r['Colaborador'], input.colaborador); });
  if (input.desde) detalle = detalle.filter(function (r) { return aFechaISO(r['Fecha']) >= input.desde; });
  if (input.hasta) detalle = detalle.filter(function (r) { return aFechaISO(r['Fecha']) <= input.hasta; });
  if (input.solo_pendientes) detalle = detalle.filter(function (r) { return !esVerdadero(r['Pagado']); });

  let totalMonto = 0, totalPendiente = 0;
  detalle.forEach(function (r) {
    const monto = Number(r['Monto ₡']) || 0;
    totalMonto += monto;
    if (!esVerdadero(r['Pagado'])) totalPendiente += monto;
  });

  return {
    total_encontrados: detalle.length,
    total_colones: Math.round(totalMonto),
    total_pendiente_colones: Math.round(totalPendiente),
    detalle: detalle.slice(0, 40).map(function (r) {
      return {
        fecha: aFechaISO(r['Fecha']),
        kiosko: r['Kiosko'] || '',
        colaborador: r['Colaborador'] || '',
        monto_colones: Number(r['Monto ₡']) || 0,
        pagado: r['Pagado'] || 'No'
      };
    })
  };
}

// ============ RRHH: HORARIOS ============
// Hoja Horarios (?modulo=horarios): Semana inicio (lunes, yyyy-MM-dd),
// Fecha, Colaborador, Departamento, Kiosko, Puesto, Estado, Hora entrada,
// Hora salida, Horas, Nota, Detalle, Hora entrada 2, Hora salida 2. Hoja
// HorariosEstado (?modulo=horarios_estado): Semana inicio, Kiosko, Cerrado
// ('Sí'/'No', por semana+kiosko), Actualizado, PDF URL.

function consultarHorarios(input) {
  const semanaInicio = input.semana_inicio || lunesDeLaSemana();
  let filas = fetchRRHH('horarios').filter(function (r) { return aFechaISO(r['Semana inicio']) === semanaInicio; });
  if (input.kiosko) filas = filas.filter(function (r) { return normalizarTexto(r['Kiosko']) === normalizarTexto(input.kiosko); });
  if (input.colaborador) filas = filas.filter(function (r) { return contiene(r['Colaborador'], input.colaborador); });

  const estados = fetchRRHH('horarios_estado').filter(function (r) { return aFechaISO(r['Semana inicio']) === semanaInicio; });

  return {
    semana_inicio: semanaInicio,
    total_turnos: filas.length,
    turnos: filas.slice(0, 60).map(function (r) {
      return {
        fecha: aFechaISO(r['Fecha']),
        colaborador: r['Colaborador'] || '',
        kiosko: r['Kiosko'] || '',
        puesto: r['Puesto'] || '',
        hora_entrada: r['Hora entrada'] || '',
        hora_salida: r['Hora salida'] || '',
        horas: r['Horas'] || 0,
        estado: r['Estado'] || ''
      };
    }),
    semanas_cerradas_por_kiosko: estados.map(function (r) { return { kiosko: r['Kiosko'] || '', cerrado: esVerdadero(r['Cerrado']) }; })
  };
}

// ============ CAJA CHICA / FONDO DE CAJA ============
// Sheet propio "Caja Chica - Kioskos" (CAJA_CHICA_SHEET_ID) — ese backend NO
// tiene doGet, así que se lee directo con SpreadsheetApp. 4 pestañas:
// CajaChica_Periodos (ID, Kiosko, Fecha inicio, Monto inicial, Fecha cierre,
// Monto contado cierre, Diferencia cierre, Estado 'Abierto'/'Cerrado', ...),
// CajaChica_Arqueos (ID, Kiosko, Periodo ID, Fecha, Balance teórico, Monto
// contado, Diferencia, ...), FondoCaja_Periodos/FondoCaja_Arqueos — mismo
// patrón pero bimoneda CRC+USD. Regla: un período Abierto a la vez por kiosko.

// Lógica de un solo kiosko sobre los 4 sheets ya abiertos — reutilizada tanto
// para una consulta puntual como para cada iteración cuando se pide "todos".
function consultarCajaChicaUnKiosko(hojaCajaPeriodos, hojaCajaArqueos, hojaFondoPeriodos, hojaFondoArqueos, kiosko) {
  function ultimosArqueos(hoja, esFondo) {
    if (!hoja || hoja.getLastRow() < 2) return [];
    const filas = filasComoObjetosDesdeHoja(hoja).filter(function (r) { return normalizarTexto(r['Kiosko']) === normalizarTexto(kiosko); });
    filas.sort(function (a, b) { return aFechaISO(b['Fecha']).localeCompare(aFechaISO(a['Fecha'])); });
    return filas.slice(0, 3).map(function (r) {
      return esFondo ? {
        fecha: aFechaISO(r['Fecha']),
        diferencia_crc: Number(r['Diferencia CRC']) || 0,
        diferencia_usd: Number(r['Diferencia USD']) || 0
      } : {
        fecha: aFechaISO(r['Fecha']),
        diferencia_colones: Number(r['Diferencia']) || 0
      };
    });
  }

  function periodoAbierto(hoja, esFondo) {
    if (!hoja || hoja.getLastRow() < 2) return null;
    const filas = filasComoObjetosDesdeHoja(hoja).filter(function (r) {
      return normalizarTexto(r['Kiosko']) === normalizarTexto(kiosko) && String(r['Estado']) === 'Abierto';
    });
    if (!filas.length) return null;
    const r = filas[0];
    return esFondo ? {
      fecha_inicio: aFechaISO(r['Fecha inicio']),
      monto_inicial_crc: Number(r['Monto inicial CRC']) || 0,
      monto_inicial_usd: Number(r['Monto inicial USD']) || 0
    } : {
      fecha_inicio: aFechaISO(r['Fecha inicio']),
      monto_inicial_colones: Number(r['Monto inicial']) || 0
    };
  }

  return {
    kiosko: kiosko,
    caja_chica: {
      periodo_abierto: periodoAbierto(hojaCajaPeriodos, false),
      ultimos_arqueos: ultimosArqueos(hojaCajaArqueos, false)
    },
    fondo_caja: {
      periodo_abierto: periodoAbierto(hojaFondoPeriodos, true),
      ultimos_arqueos: ultimosArqueos(hojaFondoArqueos, true)
    }
  };
}

function consultarCajaChica(input) {
  const kiosko = (input.kiosko || '').trim();
  if (!kiosko) throw new Error('Hace falta indicar el kiosko para consultar caja chica (o "todos").');

  const ss = SpreadsheetApp.openById(CAJA_CHICA_SHEET_ID);
  const hojaCajaPeriodos = ss.getSheetByName('CajaChica_Periodos');
  const hojaCajaArqueos = ss.getSheetByName('CajaChica_Arqueos');
  const hojaFondoPeriodos = ss.getSheetByName('FondoCaja_Periodos');
  const hojaFondoArqueos = ss.getSheetByName('FondoCaja_Arqueos');

  if (kiosko.toLowerCase() === 'todos') {
    const porKiosko = {};
    obtenerKioskosTodos().forEach(function (k) {
      porKiosko[k] = consultarCajaChicaUnKiosko(hojaCajaPeriodos, hojaCajaArqueos, hojaFondoPeriodos, hojaFondoArqueos, k);
    });
    return {
      nota: 'Si "periodo_abierto" sale null, no hay un período abierto actualmente para ese fondo en ese kiosko.',
      por_kiosko: porKiosko
    };
  }

  const resultado = consultarCajaChicaUnKiosko(hojaCajaPeriodos, hojaCajaArqueos, hojaFondoPeriodos, hojaFondoArqueos, kiosko);
  resultado.nota = 'Si "periodo_abierto" sale null, no hay un período abierto actualmente para ese fondo en ese kiosko.';
  return resultado;
}

// ============ MANTENIMIENTO ============
// Mismo Web App que Mermas (MANTENIMIENTO_URL = MERMAS_URL), hoja "Reportes"
// del Sheet "Operaciones - Kioskos" — ?modulo=reportes: ID, Fecha, Hora,
// Kiosko, Encargado, Tipo, Detalle, Estado ('Pendiente' por defecto), Foto
// URL, Fecha Resolución, Notas, Registrado.

function consultarMantenimiento(input) {
  const data = fetchJSON(MANTENIMIENTO_URL + '?modulo=reportes');
  if (!data) return { error: 'No se pudo leer el registro de mantenimiento en este momento.' };
  let registros = data.registros || [];

  if (input.kiosko) registros = registros.filter(function (r) { return normalizarTexto(r['Kiosko']) === normalizarTexto(input.kiosko); });
  if (input.estado) registros = registros.filter(function (r) { return normalizarTexto(r['Estado']) === normalizarTexto(input.estado); });
  if (input.desde) registros = registros.filter(function (r) { return aFechaISO(r['Fecha']) >= input.desde; });
  if (input.hasta) registros = registros.filter(function (r) { return aFechaISO(r['Fecha']) <= input.hasta; });

  return {
    total_encontrados: registros.length,
    incidencias: registros.slice(0, 40).map(function (r) {
      return {
        fecha: aFechaISO(r['Fecha']),
        kiosko: r['Kiosko'] || '',
        tipo: r['Tipo'] || '',
        detalle: r['Detalle'] || '',
        estado: r['Estado'] || '',
        fecha_resolucion: r['Fecha Resolución'] ? aFechaISO(r['Fecha Resolución']) : ''
      };
    })
  };
}

// ============ ACTIVOS MENORES ============
// ACTIVOS_URL, hoja "Activos": ID, Nombre, Categoría, Descripción, medidas,
// Kiosko Actual (dónde está AHORA), Estado, Foto URL, Fecha Registro,
// Cantidad, Valor Estimado, Marca, Modelo. Hoja "Traslados" (historial
// append-only, columnas Activo ID, Fecha, Kiosko Origen, Kiosko Destino,
// Motivo) — se consulta aparte solo si se pide incluir_traslados.

function consultarActivos(input) {
  const data = fetchJSON(ACTIVOS_URL + '?modulo=activos');
  if (!data) return { error: 'No se pudo leer el registro de activos en este momento.' };
  let registros = data.registros || [];

  if (input.kiosko) registros = registros.filter(function (r) { return normalizarTexto(r['Kiosko Actual']) === normalizarTexto(input.kiosko); });
  if (input.categoria) registros = registros.filter(function (r) { return contiene(r['Categoría'], input.categoria); });
  if (input.nombre) registros = registros.filter(function (r) { return contiene(r['Nombre'], input.nombre); });

  const activos = registros.slice(0, 40).map(function (r) {
    return {
      id: r['ID'] || '',
      nombre: r['Nombre'] || '',
      categoria: r['Categoría'] || '',
      kiosko_actual: r['Kiosko Actual'] || '',
      estado: r['Estado'] || '',
      cantidad: r['Cantidad'] || 1,
      valor_estimado_colones: Number(r['Valor Estimado']) || 0,
      marca: r['Marca'] || '',
      modelo: r['Modelo'] || ''
    };
  });

  const resultado = { total_encontrados: registros.length, activos: activos };

  if (input.incluir_traslados) {
    const dataTraslados = fetchJSON(ACTIVOS_URL + '?modulo=traslados');
    let traslados = (dataTraslados && dataTraslados.registros) || [];
    const idsActivos = {};
    activos.forEach(function (a) { idsActivos[a.id] = true; });
    traslados = traslados.filter(function (t) { return idsActivos[t['Activo ID']]; });
    resultado.traslados = traslados.slice(0, 40).map(function (t) {
      return {
        activo_id: t['Activo ID'] || '',
        activo_nombre: t['Activo Nombre'] || '',
        fecha: aFechaISO(t['Fecha']),
        kiosko_origen: t['Kiosko Origen'] || '',
        kiosko_destino: t['Kiosko Destino'] || '',
        motivo: t['Motivo'] || ''
      };
    });
  }

  return resultado;
}

// ============ PROVEEDORES ============
// Hoja "Proveedores" del Sheet "Inventario - Kioskos" (INVENTARIO_SHEET_ID)
// — catálogo GLOBAL, sin columna de kiosko. Columnas: ID, Nombre jurídico,
// Nombre comercial, Categoría, Contacto, Teléfono, Correo, Días de pedido,
// Notas de contacto, Cuenta, Condición de pago (días de crédito, string
// numérica), Notas de pago, Actualizado, Alias (variantes vistas en facturas).

function consultarProveedores(input) {
  const hoja = SpreadsheetApp.openById(INVENTARIO_SHEET_ID).getSheetByName('Proveedores');
  if (!hoja || hoja.getLastRow() < 2) return { nota: 'No hay proveedores registrados todavía.' };

  let filas = filasComoObjetosDesdeHoja(hoja);
  if (input.nombre) {
    filas = filas.filter(function (r) {
      return contiene(r['Nombre jurídico'], input.nombre) || contiene(r['Nombre comercial'], input.nombre) || contiene(String(r['Alias'] || ''), input.nombre);
    });
  }
  if (input.categoria) filas = filas.filter(function (r) { return contiene(r['Categoría'], input.categoria); });

  return {
    total_encontrados: filas.length,
    proveedores: filas.slice(0, 40).map(function (r) {
      return {
        nombre_juridico: r['Nombre jurídico'] || '',
        nombre_comercial: r['Nombre comercial'] || '',
        categoria: r['Categoría'] || '',
        contacto: r['Contacto'] || '',
        telefono: r['Teléfono'] || '',
        correo: r['Correo'] || '',
        dias_de_pedido: r['Días de pedido'] || '',
        condicion_de_pago_dias_credito: r['Condición de pago'] || ''
      };
    })
  };
}

// ============ RECETAS / COSTEO DE MENÚ ============
// Sheet propio RECETAS_SHEET_ID, hojas Menu_Platos (ID, Nombre, Nivel1,
// Nivel2, Kioskos ('Todos' o CSV), Presentaciones (JSON string de
// [{nombre,cantidad,precioVenta,...}]), Activo, ...) y Menu_Recetas (ID,
// Tipo 'receta'|'subreceta', Nombre, PlatoId, Rendimiento, Ingredientes,
// CostoTotal, CostoPorUnidadRendimiento — cacheado al guardar, NO se
// recalcula en lectura).

function consultarRecetas(input) {
  const ss = SpreadsheetApp.openById(RECETAS_SHEET_ID);
  const hojaPlatos = ss.getSheetByName('Menu_Platos');
  const hojaRecetas = ss.getSheetByName('Menu_Recetas');
  if (!hojaPlatos || hojaPlatos.getLastRow() < 2) return { nota: 'No hay platos registrados en el menú todavía.' };

  let platos = filasComoObjetosDesdeHoja(hojaPlatos);
  if (input.nombre) {
    platos = platos.filter(function (p) { return contiene(p['Nombre'], input.nombre); });
  } else {
    platos = platos.filter(function (p) { return esVerdadero(p['Activo']); });
  }
  if (input.kiosko) {
    platos = platos.filter(function (p) {
      const k = String(p['Kioskos'] || '');
      return normalizarTexto(k) === 'todos' || contiene(k, input.kiosko);
    });
  }

  const recetasPorPlato = {};
  if (hojaRecetas && hojaRecetas.getLastRow() > 1) {
    filasComoObjetosDesdeHoja(hojaRecetas).forEach(function (r) {
      if (r['Tipo'] === 'receta' && r['PlatoId']) recetasPorPlato[r['PlatoId']] = r;
    });
  }

  return {
    total_encontrados: platos.length,
    platos: platos.slice(0, 30).map(function (p) {
      const receta = recetasPorPlato[p['ID']];
      const costoUnitario = receta ? Number(receta['CostoPorUnidadRendimiento']) || 0 : null;
      let presentaciones = [];
      try { presentaciones = JSON.parse(p['Presentaciones'] || '[]'); } catch (e) { presentaciones = []; }
      return {
        nombre: p['Nombre'] || '',
        categoria: p['Nivel2'] || p['Nivel1'] || '',
        kioskos: p['Kioskos'] || '',
        presentaciones: presentaciones.map(function (pr) {
          const cantidad = Number(pr.cantidad) || 1;
          const precio = Number(pr.precioVenta) || 0;
          const costo = costoUnitario !== null ? Math.round(costoUnitario * cantidad) : null;
          return {
            nombre: pr.nombre || '',
            precio_venta_colones: precio,
            costo_estimado_colones: costo,
            margen_pct: (costo !== null && precio > 0) ? Math.round(((precio - costo) / precio) * 1000) / 10 : null
          };
        })
      };
    }),
    nota: 'Costo tomado del último costeo guardado en Recetas — no se recalcula en vivo con precios actuales de compra.'
  };
}

// ============ PEDIDO SUGERIDO ============
// Compara la hoja "Minimos" (Producto, Kiosko, Mínimo) del Sheet Inventario
// contra la ÚLTIMA toma de HISTORIAL_inventario de ese kiosko. Solo compara
// unidades COMPLETAS contra el mínimo — "Cant. en uso" (abierto) se informa
// aparte porque convertirla a unidades completas depende de la presentación
// de cada producto (no disponible acá sin reimplementar Maestro_Productos).

// Lógica de un solo kiosko — reutilizada tanto para una consulta puntual
// como para cada iteración cuando se pide kiosko="todos".
function consultarPedidoSugeridoUnKiosko(hojaMinimos, hojaInventario, kiosko) {
  const minimos = filasComoObjetosDesdeHoja(hojaMinimos).filter(function (r) { return normalizarTexto(r['Kiosko']) === normalizarTexto(kiosko); });
  if (!minimos.length) return { kiosko: kiosko, nota: 'No hay mínimos configurados para ese kiosko.' };

  const stockPorProducto = {};
  let fechaUltimaToma = '';
  if (hojaInventario && hojaInventario.getLastRow() > 1) {
    const filas = filasComoObjetosDesdeHoja(hojaInventario).filter(function (r) { return normalizarTexto(r['Kiosko']) === normalizarTexto(kiosko); });
    filas.forEach(function (r) { const f = aFechaISO(r['Fecha toma']); if (f > fechaUltimaToma) fechaUltimaToma = f; });
    filas.filter(function (r) { return aFechaISO(r['Fecha toma']) === fechaUltimaToma; }).forEach(function (r) {
      stockPorProducto[normalizarTexto(r['Producto'])] = {
        cant_completos: Number(r['Cant. completos']) || 0,
        cant_en_uso: Number(r['Cant. en uso']) || 0
      };
    });
  }

  const sugeridos = [];
  minimos.forEach(function (m) {
    const producto = String(m['Producto'] || '');
    const minimo = Number(m['Mínimo']) || 0;
    const stock = stockPorProducto[normalizarTexto(producto)] || { cant_completos: 0, cant_en_uso: 0 };
    const faltante = Math.ceil(minimo - stock.cant_completos);
    if (faltante > 0) {
      sugeridos.push({
        producto: producto,
        minimo: minimo,
        stock_completos: stock.cant_completos,
        stock_en_uso_abierto: stock.cant_en_uso,
        sugerido_pedir: faltante
      });
    }
  });
  sugeridos.sort(function (a, b) { return b.sugerido_pedir - a.sugerido_pedir; });

  return {
    kiosko: kiosko,
    fecha_ultima_toma_usada: fechaUltimaToma || '(sin toma de inventario registrada)',
    total_productos_bajo_minimo: sugeridos.length,
    productos_sugeridos: sugeridos
  };
}

function consultarPedidoSugerido(input) {
  const kiosko = (input.kiosko || '').trim();
  if (!kiosko) throw new Error('Hace falta indicar el kiosko para calcular el pedido sugerido (o "todos").');

  const ss = SpreadsheetApp.openById(INVENTARIO_SHEET_ID);
  const hojaMinimos = ss.getSheetByName('Minimos');
  const hojaInventario = ss.getSheetByName('HISTORIAL_inventario');
  if (!hojaMinimos || hojaMinimos.getLastRow() < 2) return { nota: 'No hay mínimos configurados todavía.' };

  if (kiosko.toLowerCase() === 'todos') {
    const porKiosko = {};
    obtenerKioskosTodos().forEach(function (k) {
      const r = consultarPedidoSugeridoUnKiosko(hojaMinimos, hojaInventario, k);
      if (r.productos_sugeridos) r.productos_sugeridos = r.productos_sugeridos.slice(0, 10);
      porKiosko[k] = r;
    });
    return {
      nota: 'Compara solo unidades COMPLETAS contra el mínimo configurado — top 10 por kiosko; pedí un kiosko puntual para ver la lista completa.',
      por_kiosko: porKiosko
    };
  }

  const resultado = consultarPedidoSugeridoUnKiosko(hojaMinimos, hojaInventario, kiosko);
  if (resultado.productos_sugeridos) resultado.productos_sugeridos = resultado.productos_sugeridos.slice(0, 40);
  resultado.nota = 'Compara solo unidades COMPLETAS contra el mínimo configurado; "stock_en_uso_abierto" es de referencia aparte.';
  return resultado;
}

// ============ EFECTIVO PENDIENTE ============
// Proxy directo de SHEETS_URL_CIERRES?action=pendientes — el propio backend
// de Cierres ya cruza Cierres×Depósitos×TipsPagos×Salidas de Fondo y
// devuelve el saldo pendiente calculado; no se reimplementa esa lógica acá.

function consultarEfectivoPendiente(input) {
  const data = fetchJSON(SHEETS_URL_CIERRES + '?action=pendientes');
  if (!data) return { error: 'No se pudo leer el efectivo pendiente en este momento.' };
  return data;
}

// ============ COGS (COSTO DE MERCADERÍA VENDIDA) ============
// COGS = Inventario Inicial + Compras del período − Inventario Final, por
// producto, entre DOS tomas de HISTORIAL_inventario de un kiosko (las dos
// más recientes si no se dan fechas) + compras de Desglose_IA homologadas
// contra Maestro_Productos en ese rango — misma fórmula y fuentes que usa
// analisis-inventario.html, reimplementada acá en modo lectura.

// Lógica de un solo kiosko sobre los sheets/mapa ya abiertos — reutilizada
// tanto para una consulta puntual como para cada iteración cuando se pide
// kiosko="todos".
function consultarCogsUnKiosko(hojaInventario, hojaDesglose, mapaEstandar, kiosko, inputDesde, inputHasta) {
  const filas = filasComoObjetosDesdeHoja(hojaInventario).filter(function (r) { return normalizarTexto(r['Kiosko']) === normalizarTexto(kiosko); });
  if (!filas.length) return { kiosko: kiosko, nota: 'No hay tomas de inventario registradas para ese kiosko.' };

  const fechasSet = {};
  filas.forEach(function (r) { fechasSet[aFechaISO(r['Fecha toma'])] = true; });
  const fechas = Object.keys(fechasSet).sort();
  if (fechas.length < 2) return { kiosko: kiosko, nota: 'Hace falta al menos DOS tomas de inventario guardadas para ese kiosko para calcular COGS — solo hay ' + fechas.length + '.' };

  function tomaMasCercana(fechaObjetivo) {
    if (!fechaObjetivo) return null;
    let mejor = fechas[0], mejorDif = Infinity;
    fechas.forEach(function (f) {
      const dif = Math.abs(new Date(f).getTime() - new Date(fechaObjetivo).getTime());
      if (dif < mejorDif) { mejorDif = dif; mejor = f; }
    });
    return mejor;
  }

  let fechaInicial, fechaFinal;
  if (inputDesde || inputHasta) {
    fechaInicial = tomaMasCercana(inputDesde) || fechas[fechas.length - 2];
    fechaFinal = tomaMasCercana(inputHasta) || fechas[fechas.length - 1];
    if (fechaInicial === fechaFinal) {
      const idx = fechas.indexOf(fechaFinal);
      fechaInicial = fechas[Math.max(0, idx - 1)];
    }
  } else {
    fechaInicial = fechas[fechas.length - 2];
    fechaFinal = fechas[fechas.length - 1];
  }
  if (fechaInicial > fechaFinal) { const tmp = fechaInicial; fechaInicial = fechaFinal; fechaFinal = tmp; }

  function valorPorProducto(fecha) {
    const mapa = {};
    filas.filter(function (r) { return aFechaISO(r['Fecha toma']) === fecha; }).forEach(function (r) {
      const producto = String(r['Producto'] || '');
      mapa[producto] = (mapa[producto] || 0) + (Number(r['Valor total línea']) || 0);
    });
    return mapa;
  }

  const invInicial = valorPorProducto(fechaInicial);
  const invFinal = valorPorProducto(fechaFinal);

  const compras = {};
  let comprasSinCoincidencia = 0;
  if (hojaDesglose && hojaDesglose.getLastRow() > 1) {
    const datos = hojaDesglose.getDataRange().getValues();
    for (let i = 1; i < datos.length; i++) {
      const f = datos[i];
      const kioskoFila = String(f[18] || '');
      if (normalizarTexto(kioskoFila) !== normalizarTexto(kiosko)) continue;
      const fecha = aFechaISO(f[3]);
      if (fecha <= fechaInicial || fecha > fechaFinal) continue;
      const moneda = String(f[1] || 'CRC');
      const proveedor = String(f[5] || '');
      const productoCrudo = String(f[7] || '');
      const nombreNormalizado = String(f[8] || '');
      const clave = normalizarTexto(proveedor) + '§' + normalizarTexto(productoCrudo);
      const nombreProducto = mapaEstandar[clave] || nombreNormalizado || productoCrudo;
      let totalLinea = Number(f[14]) || 0;
      if (moneda.toUpperCase().indexOf('USD') !== -1 || moneda === '$') totalLinea = totalLinea * TIPO_CAMBIO_USD_DEFAULT;

      if (invInicial[nombreProducto] === undefined && invFinal[nombreProducto] === undefined) {
        comprasSinCoincidencia += totalLinea;
      } else {
        compras[nombreProducto] = (compras[nombreProducto] || 0) + totalLinea;
      }
    }
  }

  const productos = {};
  Object.keys(invInicial).forEach(function (p) { productos[p] = true; });
  Object.keys(invFinal).forEach(function (p) { productos[p] = true; });
  Object.keys(compras).forEach(function (p) { productos[p] = true; });

  let cogsTotal = 0;
  const detalle = Object.keys(productos).map(function (p) {
    const ini = invInicial[p] || 0;
    const fin = invFinal[p] || 0;
    const comp = compras[p] || 0;
    const cogs = ini + comp - fin;
    cogsTotal += cogs;
    return { producto: p, inventario_inicial_colones: Math.round(ini), compras_colones: Math.round(comp), inventario_final_colones: Math.round(fin), cogs_colones: Math.round(cogs) };
  }).sort(function (a, b) { return b.cogs_colones - a.cogs_colones; });

  cogsTotal += comprasSinCoincidencia;

  return {
    kiosko: kiosko,
    toma_inicial: fechaInicial,
    toma_final: fechaFinal,
    cogs_total_colones: Math.round(cogsTotal),
    compras_sin_coincidencia_colones: Math.round(comprasSinCoincidencia),
    detalle_por_producto: detalle.slice(0, 30),
    formula: 'COGS = Inventario inicial + Compras del período − Inventario final'
  };
}

function consultarCogs(input) {
  const kiosko = (input.kiosko || '').trim();
  if (!kiosko) throw new Error('Hace falta indicar el kiosko para calcular el COGS (o "todos").');

  const hojaInventario = SpreadsheetApp.openById(INVENTARIO_SHEET_ID).getSheetByName('HISTORIAL_inventario');
  if (!hojaInventario || hojaInventario.getLastRow() < 2) return { nota: 'No hay tomas de inventario registradas todavía.' };

  const ss = SpreadsheetApp.openById(COMPRAS_SHEET_ID);
  const hojaDesglose = ss.getSheetByName('Desglose_IA');
  const hojaMaestro = ss.getSheetByName('Maestro_Productos');
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

  if (kiosko.toLowerCase() === 'todos') {
    const porKiosko = {};
    obtenerKioskosTodos().forEach(function (k) {
      const r = consultarCogsUnKiosko(hojaInventario, hojaDesglose, mapaEstandar, k, input.desde, input.hasta);
      delete r.detalle_por_producto; // resumen liviano en modo "todos" — pedir el kiosko puntual para el detalle
      porKiosko[k] = r;
    });
    return {
      nota: 'Resumen de COGS por kiosko, sin detalle por producto — pedí un kiosko puntual para verlo. Usa automáticamente las DOS tomas más recientes de cada kiosko cuando no se dan fechas.',
      por_kiosko: porKiosko
    };
  }

  const resultado = consultarCogsUnKiosko(hojaInventario, hojaDesglose, mapaEstandar, kiosko, input.desde, input.hasta);
  resultado.nota = 'Usa automáticamente las DOS tomas de inventario más recientes de ese kiosko cuando no se dan fechas. "compras_sin_coincidencia_colones" son facturas cuyo producto no calzó con ningún nombre del inventario, sumadas aparte al total.';
  return resultado;
}
