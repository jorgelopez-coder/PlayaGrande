/**
 * Backend Apps Script para el Sheet nuevo "Caja Chica - Kioskos".
 * Usado por caja-chica.html (Ecosistema-Kioskos).
 *
 * Es el equivalente, para varios kioskos, de las acciones de Caja Chica y
 * Fondo de Caja de Code-compras-backend.gs (ecosistema-lorito) — ese archivo
 * maneja un solo restaurante, así que "un período abierto a la vez" era una
 * regla global. Acá, como cada kiosko tiene su propia caja física, esa regla
 * pasa a ser "un período abierto a la vez POR KIOSKO": todas las acciones
 * reciben "kiosko" (ver requerirKiosko() más abajo) y tanto la búsqueda de
 * período abierto como la de última fecha de cierre se filtran por kiosko.
 * Además, cada acción que muta un período existente por ID verifica que ese
 * período realmente pertenezca al kiosko indicado (verificarPeriodoDeKiosko),
 * para blindar contra una escritura en vuelo que aterrice en el kiosko
 * equivocado si alguien cambia el selector de kiosko mientras la petición
 * sigue en camino.
 *
 * OJO — este backend NO incluye registrar_reembolso(). Los reembolsos
 * (columnas "Fecha de reembolso"/"Referencia reembolso") se escriben sobre la
 * hoja "Registro Facturas", que pertenece al Sheet "Cuentas por Pagar -
 * Kioskos" — esa acción vive en Code-cuentas-por-pagar-kioskos-backend.gs,
 * que ya está atado a ese Sheet y ya tiene filaFacturaPorOrdinal()/
 * columnaPorNombre(). caja-chica.html le pega directo a ese otro backend para
 * esa única acción (ver APPS_SCRIPT_AP / postCompras() ahí).
 *
 * Cómo desplegarlo:
 * 1. Creá un Google Sheet nuevo en blanco, llamalo "Caja Chica - Kioskos".
 * 2. Extensiones > Apps Script > pegá este código (reemplazando el contenido
 *    del archivo por defecto).
 * 3. Corré UNA VEZ, a mano desde este editor (o desde el menú "Caja Chica"
 *    que aparece en el Sheet), la función configurarHojas() para crear las 4
 *    pestañas (CajaChica_Periodos, CajaChica_Arqueos, FondoCaja_Periodos,
 *    FondoCaja_Arqueos) con sus encabezados.
 * 4. Implementar > Nueva implementación > Aplicación web
 *    (Ejecutar como: Yo · Acceso: Cualquiera). Copiá la URL /exec.
 * 5. En caja-chica.html, poné el ID de este Sheet en SHEET_ID_CAJA y esta URL
 *    /exec en APPS_SCRIPT_CAJA.
 *
 * v1 (2026-08-06): versión inicial — port de Caja Chica + Fondo de Caja desde
 * ecosistema-lorito, adaptado a multi-kiosko. Se agrega en paralelo al Fondo
 * de Caja liviano que ya existía en Kioskos (una etiqueta de medio de pago +
 * la bitácora SalidasFondoCaja de Code-cierres-kioskos-backend.gs, que sigue
 * intacta) — ese otro mecanismo neteo el efectivo pendiente de depositar del
 * día; este backend lleva el ciclo de apertura/arqueo/cierre del fondo físico
 * en sí, algo que Kioskos no tenía todavía.
 */

// ── HOJAS Y COLUMNAS ────────────────────────────────────────────────
// Kiosko va como columna 2 (justo después de ID) en las 4 pestañas: son hojas
// nuevas sin filas legacy, así que es una columna núcleo desde el arranque,
// no una columna dinámica creada con columnaPorNombre() como en Registro
// Facturas de Cuentas por Pagar.

const HOJA_CAJA_PERIODOS = 'CajaChica_Periodos';
const HOJA_CAJA_ARQUEOS  = 'CajaChica_Arqueos';
const CORREO_CIERRE_CAJA = 'jorge.lopez@casaaguizotes.com';

const CAJA_PER_COL = {
  ID: 1, KIOSKO: 2, FECHA_INICIO: 3, MONTO_INICIAL: 4, FECHA_CIERRE: 5,
  MONTO_CONTADO: 6, DIFERENCIA: 7, ESTADO: 8, DENOMINACIONES: 9, FECHA_REGISTRO_CIERRE: 10
};
const CAJA_PER_ENCABEZADOS = [
  'ID', 'Kiosko', 'Fecha inicio', 'Monto inicial', 'Fecha cierre', 'Monto contado cierre',
  'Diferencia cierre', 'Estado', 'Denominaciones cierre', 'Fecha registro cierre'
];

const CAJA_ARQ_COL = {
  ID: 1, KIOSKO: 2, PERIODO_ID: 3, FECHA: 4, BALANCE_TEORICO: 5, MONTO_CONTADO: 6,
  DIFERENCIA: 7, DENOMINACIONES: 8, NOTAS: 9
};
const CAJA_ARQ_ENCABEZADOS = [
  'ID', 'Kiosko', 'Periodo ID', 'Fecha', 'Balance teórico', 'Monto contado',
  'Diferencia', 'Denominaciones', 'Notas'
];

// Fondo bimoneda (CRC + USD), separado de "Caja chica" (gastos menores) —
// mismo criterio que ecosistema-lorito.
const HOJA_FONDO_PERIODOS = 'FondoCaja_Periodos';
const HOJA_FONDO_ARQUEOS  = 'FondoCaja_Arqueos';
const CORREO_CIERRE_FONDO = 'jorge.lopez@casaaguizotes.com';

const FONDO_PER_COL = {
  ID: 1, KIOSKO: 2, FECHA_INICIO: 3, MONTO_INICIAL_CRC: 4, MONTO_INICIAL_USD: 5, FECHA_CIERRE: 6,
  MONTO_CONTADO_CRC: 7, MONTO_CONTADO_USD: 8, DIFERENCIA_CRC: 9, DIFERENCIA_USD: 10,
  ESTADO: 11, DENOMINACIONES: 12, FECHA_REGISTRO_CIERRE: 13
};
const FONDO_PER_ENCABEZADOS = [
  'ID', 'Kiosko', 'Fecha inicio', 'Monto inicial CRC', 'Monto inicial USD', 'Fecha cierre',
  'Monto contado cierre CRC', 'Monto contado cierre USD', 'Diferencia cierre CRC', 'Diferencia cierre USD',
  'Estado', 'Denominaciones cierre', 'Fecha registro cierre'
];

const FONDO_ARQ_COL = {
  ID: 1, KIOSKO: 2, PERIODO_ID: 3, FECHA: 4,
  BALANCE_TEORICO_CRC: 5, MONTO_CONTADO_CRC: 6, DIFERENCIA_CRC: 7,
  BALANCE_TEORICO_USD: 8, MONTO_CONTADO_USD: 9, DIFERENCIA_USD: 10,
  DENOMINACIONES: 11, NOTAS: 12
};
const FONDO_ARQ_ENCABEZADOS = [
  'ID', 'Kiosko', 'Periodo ID', 'Fecha', 'Balance teórico CRC', 'Monto contado CRC', 'Diferencia CRC',
  'Balance teórico USD', 'Monto contado USD', 'Diferencia USD', 'Denominaciones', 'Notas'
];

// ── SETUP ────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Caja Chica')
    .addItem('Configurar hojas (correr una vez)', 'configurarHojas')
    .addToUi();
}

function configurarHojas() {
  getHojaCajaPeriodos();
  getHojaCajaArqueos();
  getHojaFondoPeriodos();
  getHojaFondoArqueos();
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

function getHojaCajaPeriodos()  { return prepararHoja(HOJA_CAJA_PERIODOS, CAJA_PER_ENCABEZADOS); }
function getHojaCajaArqueos()   { return prepararHoja(HOJA_CAJA_ARQUEOS, CAJA_ARQ_ENCABEZADOS); }
function getHojaFondoPeriodos() { return prepararHoja(HOJA_FONDO_PERIODOS, FONDO_PER_ENCABEZADOS); }
function getHojaFondoArqueos()  { return prepararHoja(HOJA_FONDO_ARQUEOS, FONDO_ARQ_ENCABEZADOS); }

function requerirKiosko(p) {
  if (!p.kiosko) throw new Error('Falta indicar el kiosko.');
}

// Verifica que la fila de un período realmente pertenezca al kiosko indicado
// antes de mutarla — protege contra una escritura en vuelo que aterrice en el
// kiosko equivocado si el usuario cambió el selector de kiosko mientras tanto.
function verificarPeriodoDeKiosko(hoja, fila, colKiosko, kiosko) {
  const kioskoFila = hoja.getRange(fila, colKiosko).getValue();
  if (String(kioskoFila) !== String(kiosko)) {
    throw new Error('Ese período no pertenece al kiosko indicado.');
  }
}

// ── CAJA CHICA (gastos menores, colones) ──────────────────────────
// Devuelve { fila, datos } del período con Estado "Abierto" PARA ESE KIOSKO,
// o null si no hay ninguno — cada kiosko tiene su propio ciclo de apertura/
// cierre en paralelo, a diferencia de Lorito (un solo restaurante).
function obtenerPeriodoAbierto(hoja, kiosko) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return null;
  const datos = hoja.getRange(2, 1, nFilas, CAJA_PER_ENCABEZADOS.length).getValues();
  for (let i = 0; i < datos.length; i++) {
    if (datos[i][CAJA_PER_COL.ESTADO - 1] === 'Abierto' &&
        String(datos[i][CAJA_PER_COL.KIOSKO - 1]) === String(kiosko)) {
      return { fila: i + 2, datos: datos[i] };
    }
  }
  return null;
}

// El ID ya es único global (timestamp), así que la búsqueda por ID no separa
// por kiosko — la pertenencia se verifica aparte con verificarPeriodoDeKiosko().
function filaPeriodoPorId(hoja, id) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const ids = hoja.getRange(2, CAJA_PER_COL.ID, nFilas, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

// Última fecha de cierre registrada entre los períodos cerrados DE ESE KIOSKO.
function ultimaFechaCierre(hoja, kiosko) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return null;
  const datos = hoja.getRange(2, 1, nFilas, CAJA_PER_ENCABEZADOS.length).getValues();
  let ultima = null;
  datos.forEach(function(fila) {
    if (String(fila[CAJA_PER_COL.KIOSKO - 1]) !== String(kiosko)) return;
    const fc = fila[CAJA_PER_COL.FECHA_CIERRE - 1];
    if (fc instanceof Date && (!ultima || fc > ultima)) ultima = fc;
  });
  return ultima;
}

function abrirPeriodoCaja(p) {
  requerirKiosko(p);
  if (!p.fecha_inicio) throw new Error('Falta la fecha de inicio.');
  if (p.monto_inicial == null || p.monto_inicial === '') throw new Error('Falta el monto inicial.');

  const hoja = getHojaCajaPeriodos();
  if (obtenerPeriodoAbierto(hoja, p.kiosko)) {
    throw new Error('Ya hay un período de caja chica abierto en ' + p.kiosko + '. Cerralo antes de abrir uno nuevo.');
  }

  const fechaInicio = new Date(p.fecha_inicio + 'T00:00:00');
  const ultimaCierre = ultimaFechaCierre(hoja, p.kiosko);
  if (ultimaCierre && fechaInicio <= ultimaCierre) {
    throw new Error('La fecha de inicio debe ser posterior al último cierre de ' + p.kiosko + ' (' +
      Utilities.formatDate(ultimaCierre, 'America/Costa_Rica', 'dd/MM/yyyy') + ').');
  }

  const id = 'CAJA-' + Date.now();
  const fila = hoja.getLastRow() + 1;
  hoja.getRange(fila, CAJA_PER_COL.ID).setValue(id);
  hoja.getRange(fila, CAJA_PER_COL.KIOSKO).setValue(p.kiosko);
  hoja.getRange(fila, CAJA_PER_COL.FECHA_INICIO).setValue(fechaInicio);
  hoja.getRange(fila, CAJA_PER_COL.MONTO_INICIAL).setValue(Number(p.monto_inicial));
  hoja.getRange(fila, CAJA_PER_COL.ESTADO).setValue('Abierto');

  return { id: id, fila: fila };
}

function guardarArqueoCaja(p) {
  requerirKiosko(p);
  if (!p.periodo_id) throw new Error('Falta el período de caja chica.');
  const hojaPer = getHojaCajaPeriodos();
  const filaPer = filaPeriodoPorId(hojaPer, p.periodo_id);
  if (filaPer === -1) throw new Error('No se encontró el período indicado.');
  verificarPeriodoDeKiosko(hojaPer, filaPer, CAJA_PER_COL.KIOSKO, p.kiosko);

  const hoja = getHojaCajaArqueos();
  const id = 'ARQ-' + Date.now();
  const fila = hoja.getLastRow() + 1;
  hoja.getRange(fila, CAJA_ARQ_COL.ID).setValue(id);
  hoja.getRange(fila, CAJA_ARQ_COL.KIOSKO).setValue(p.kiosko);
  hoja.getRange(fila, CAJA_ARQ_COL.PERIODO_ID).setValue(p.periodo_id);
  hoja.getRange(fila, CAJA_ARQ_COL.FECHA).setValue(new Date());
  hoja.getRange(fila, CAJA_ARQ_COL.BALANCE_TEORICO).setValue(Number(p.balance_teorico) || 0);
  hoja.getRange(fila, CAJA_ARQ_COL.MONTO_CONTADO).setValue(Number(p.monto_contado) || 0);
  hoja.getRange(fila, CAJA_ARQ_COL.DIFERENCIA).setValue(Number(p.diferencia) || 0);
  hoja.getRange(fila, CAJA_ARQ_COL.DENOMINACIONES).setValue(JSON.stringify(p.denominaciones || {}));
  hoja.getRange(fila, CAJA_ARQ_COL.NOTAS).setValue(p.notas || '');

  return { id: id, fila: fila };
}

function cerrarPeriodoCaja(p) {
  requerirKiosko(p);
  if (!p.periodo_id) throw new Error('Falta el período de caja chica.');
  if (!p.fecha_cierre) throw new Error('Falta la fecha de cierre.');

  const hoja = getHojaCajaPeriodos();
  const fila = filaPeriodoPorId(hoja, p.periodo_id);
  if (fila === -1) throw new Error('No se encontró el período indicado.');
  verificarPeriodoDeKiosko(hoja, fila, CAJA_PER_COL.KIOSKO, p.kiosko);

  const datosFila = hoja.getRange(fila, 1, 1, CAJA_PER_ENCABEZADOS.length).getValues()[0];
  if (datosFila[CAJA_PER_COL.ESTADO - 1] !== 'Abierto') {
    throw new Error('Este período ya está cerrado.');
  }
  const fechaInicio    = datosFila[CAJA_PER_COL.FECHA_INICIO - 1];
  const montoInicial   = datosFila[CAJA_PER_COL.MONTO_INICIAL - 1];
  const fechaCierre    = new Date(p.fecha_cierre + 'T00:00:00');
  const montoContado   = Number(p.monto_contado) || 0;
  const diferencia     = Number(p.diferencia) || 0;
  const balanceTeorico = Number(p.balance_teorico) || 0;

  hoja.getRange(fila, CAJA_PER_COL.FECHA_CIERRE).setValue(fechaCierre);
  hoja.getRange(fila, CAJA_PER_COL.MONTO_CONTADO).setValue(montoContado);
  hoja.getRange(fila, CAJA_PER_COL.DIFERENCIA).setValue(diferencia);
  hoja.getRange(fila, CAJA_PER_COL.ESTADO).setValue('Cerrado');
  hoja.getRange(fila, CAJA_PER_COL.DENOMINACIONES).setValue(JSON.stringify(p.denominaciones || {}));
  hoja.getRange(fila, CAJA_PER_COL.FECHA_REGISTRO_CIERRE).setValue(new Date());

  enviarCorreoCierreCaja({
    kiosko: p.kiosko,
    periodoId: p.periodo_id,
    fechaInicio: fechaInicio,
    fechaCierre: fechaCierre,
    montoInicial: montoInicial,
    balanceTeorico: balanceTeorico,
    montoContado: montoContado,
    diferencia: diferencia,
    denominaciones: p.denominaciones || {},
    gastos: p.gastos || []
  });

  return { id: p.periodo_id, fila: fila };
}

// Solo permite borrar un período mientras sigue "Abierto" (p.ej. si se abrió
// con datos equivocados). Los períodos cerrados quedan como registro
// histórico permanente.
function eliminarPeriodoCaja(p) {
  requerirKiosko(p);
  if (!p.periodo_id) throw new Error('Falta el período a eliminar.');
  const hoja = getHojaCajaPeriodos();
  const fila = filaPeriodoPorId(hoja, p.periodo_id);
  if (fila === -1) throw new Error('No se encontró el período indicado.');
  verificarPeriodoDeKiosko(hoja, fila, CAJA_PER_COL.KIOSKO, p.kiosko);

  const estado = hoja.getRange(fila, CAJA_PER_COL.ESTADO).getValue();
  if (estado !== 'Abierto') throw new Error('Solo se puede eliminar un período que sigue abierto.');
  hoja.deleteRow(fila);

  // Borrar también los arqueos asociados a ese período.
  const hojaArq = getHojaCajaArqueos();
  const nFilas = hojaArq.getLastRow() - 1;
  if (nFilas > 0) {
    const ids = hojaArq.getRange(2, CAJA_ARQ_COL.PERIODO_ID, nFilas, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(p.periodo_id)) hojaArq.deleteRow(i + 2);
    }
  }

  return { eliminado: p.periodo_id };
}

function enviarCorreoCierreCaja(d) {
  const fmtFecha = function(f) { return Utilities.formatDate(f, 'America/Costa_Rica', 'dd/MM/yyyy'); };
  const fmtMonto = function(n) { return '₡' + Number(n||0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  const totalGastos = d.gastos.reduce(function(a, g) { return a + (Number(g.monto)||0); }, 0);

  const filasGastos = d.gastos.map(function(g) {
    return '<tr><td>' + (g.fecha||'') + '</td><td>' + (g.factura||'') + '</td><td>' + (g.proveedor||'') +
           '</td><td style="text-align:right;">' + fmtMonto(g.monto) + '</td></tr>';
  }).join('');

  const filasDenom = Object.keys(d.denominaciones)
    .filter(function(k) { return Number(d.denominaciones[k]) > 0; })
    .sort(function(a,b) { return Number(b) - Number(a); })
    .map(function(k) {
      const cant = Number(d.denominaciones[k]);
      return '<tr><td>' + fmtMonto(k) + '</td><td style="text-align:right;">' + cant +
             '</td><td style="text-align:right;">' + fmtMonto(cant * Number(k)) + '</td></tr>';
    }).join('');

  const colorDif = Math.abs(d.diferencia) < 1 ? '#1a7a4a' : '#c84a20';

  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c3a28;">' +
    '<h2>Cierre de Caja Chica · ' + d.kiosko + '</h2>' +
    '<p><strong>Período:</strong> ' + fmtFecha(d.fechaInicio) + ' – ' + fmtFecha(d.fechaCierre) + '</p>' +
    '<table cellpadding="6" style="border-collapse:collapse;margin-bottom:16px;">' +
    '<tr><td>Monto inicial</td><td style="text-align:right;">' + fmtMonto(d.montoInicial) + '</td></tr>' +
    '<tr><td>Total de gastos del período</td><td style="text-align:right;">' + fmtMonto(totalGastos) + '</td></tr>' +
    '<tr><td><strong>Balance teórico</strong></td><td style="text-align:right;"><strong>' + fmtMonto(d.balanceTeorico) + '</strong></td></tr>' +
    '<tr><td>Monto contado (arqueo de cierre)</td><td style="text-align:right;">' + fmtMonto(d.montoContado) + '</td></tr>' +
    '<tr><td><strong>Diferencia</strong></td><td style="text-align:right;color:' + colorDif + ';"><strong>' + fmtMonto(d.diferencia) + '</strong></td></tr>' +
    '</table>' +
    '<h3>Denominaciones contadas</h3>' +
    '<table cellpadding="5" style="border-collapse:collapse;border:1px solid #ccc;margin-bottom:16px;">' +
    '<tr style="background:#f2ede2;"><th>Denominación</th><th>Cantidad</th><th>Subtotal</th></tr>' +
    filasDenom +
    '</table>' +
    '<h3>Gastos del período (' + d.gastos.length + ')</h3>' +
    '<table cellpadding="5" style="border-collapse:collapse;border:1px solid #ccc;">' +
    '<tr style="background:#f2ede2;"><th>Fecha</th><th>Factura</th><th>Proveedor</th><th>Monto</th></tr>' +
    (filasGastos || '<tr><td colspan="4">Sin gastos registrados en el período.</td></tr>') +
    '</table>' +
    '</div>';

  MailApp.sendEmail({
    to: CORREO_CIERRE_CAJA,
    subject: 'Cierre de Caja Chica · ' + d.kiosko + ' · ' + fmtFecha(d.fechaInicio) + ' – ' + fmtFecha(d.fechaCierre),
    htmlBody: html
  });
}

// ── FONDO DE CAJA (fondo bimoneda CRC + USD) ──────────────────────
function obtenerPeriodoFondoAbierto(hoja, kiosko) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return null;
  const datos = hoja.getRange(2, 1, nFilas, FONDO_PER_ENCABEZADOS.length).getValues();
  for (let i = 0; i < datos.length; i++) {
    if (datos[i][FONDO_PER_COL.ESTADO - 1] === 'Abierto' &&
        String(datos[i][FONDO_PER_COL.KIOSKO - 1]) === String(kiosko)) {
      return { fila: i + 2, datos: datos[i] };
    }
  }
  return null;
}

function filaPeriodoFondoPorId(hoja, id) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const ids = hoja.getRange(2, FONDO_PER_COL.ID, nFilas, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function ultimaFechaCierreFondo(hoja, kiosko) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return null;
  const datos = hoja.getRange(2, 1, nFilas, FONDO_PER_ENCABEZADOS.length).getValues();
  let ultima = null;
  datos.forEach(function(fila) {
    if (String(fila[FONDO_PER_COL.KIOSKO - 1]) !== String(kiosko)) return;
    const fc = fila[FONDO_PER_COL.FECHA_CIERRE - 1];
    if (fc && (!ultima || fc > ultima)) ultima = fc;
  });
  return ultima;
}

function abrirPeriodoFondo(p) {
  requerirKiosko(p);
  if (!p.fecha_inicio) throw new Error('Falta la fecha de inicio.');
  const montoCRC = Number(p.monto_inicial_crc) || 0;
  const montoUSD = Number(p.monto_inicial_usd) || 0;
  if (montoCRC <= 0 && montoUSD <= 0) throw new Error('Falta el monto inicial (en colones o dólares).');

  const hoja = getHojaFondoPeriodos();
  if (obtenerPeriodoFondoAbierto(hoja, p.kiosko)) {
    throw new Error('Ya hay un período de fondo de caja abierto en ' + p.kiosko + '. Cerralo antes de abrir uno nuevo.');
  }

  const fechaInicio = new Date(p.fecha_inicio + 'T00:00:00');
  const ultimaCierre = ultimaFechaCierreFondo(hoja, p.kiosko);
  if (ultimaCierre && fechaInicio <= ultimaCierre) {
    throw new Error('La fecha de inicio debe ser posterior al último cierre de ' + p.kiosko + ' (' +
      Utilities.formatDate(ultimaCierre, 'America/Costa_Rica', 'dd/MM/yyyy') + ').');
  }

  const id = 'FONDO-' + Date.now();
  const fila = hoja.getLastRow() + 1;
  hoja.getRange(fila, FONDO_PER_COL.ID).setValue(id);
  hoja.getRange(fila, FONDO_PER_COL.KIOSKO).setValue(p.kiosko);
  hoja.getRange(fila, FONDO_PER_COL.FECHA_INICIO).setValue(fechaInicio);
  hoja.getRange(fila, FONDO_PER_COL.MONTO_INICIAL_CRC).setValue(montoCRC);
  hoja.getRange(fila, FONDO_PER_COL.MONTO_INICIAL_USD).setValue(montoUSD);
  hoja.getRange(fila, FONDO_PER_COL.ESTADO).setValue('Abierto');

  return { id: id, fila: fila };
}

function guardarArqueoFondo(p) {
  requerirKiosko(p);
  if (!p.periodo_id) throw new Error('Falta el período de fondo de caja.');
  const hojaPer = getHojaFondoPeriodos();
  const filaPer = filaPeriodoFondoPorId(hojaPer, p.periodo_id);
  if (filaPer === -1) throw new Error('No se encontró el período indicado.');
  verificarPeriodoDeKiosko(hojaPer, filaPer, FONDO_PER_COL.KIOSKO, p.kiosko);

  const hoja = getHojaFondoArqueos();
  const id = 'ARQF-' + Date.now();
  const fila = hoja.getLastRow() + 1;
  hoja.getRange(fila, FONDO_ARQ_COL.ID).setValue(id);
  hoja.getRange(fila, FONDO_ARQ_COL.KIOSKO).setValue(p.kiosko);
  hoja.getRange(fila, FONDO_ARQ_COL.PERIODO_ID).setValue(p.periodo_id);
  hoja.getRange(fila, FONDO_ARQ_COL.FECHA).setValue(new Date());
  hoja.getRange(fila, FONDO_ARQ_COL.BALANCE_TEORICO_CRC).setValue(Number(p.balance_teorico_crc) || 0);
  hoja.getRange(fila, FONDO_ARQ_COL.MONTO_CONTADO_CRC).setValue(Number(p.monto_contado_crc) || 0);
  hoja.getRange(fila, FONDO_ARQ_COL.DIFERENCIA_CRC).setValue(Number(p.diferencia_crc) || 0);
  hoja.getRange(fila, FONDO_ARQ_COL.BALANCE_TEORICO_USD).setValue(Number(p.balance_teorico_usd) || 0);
  hoja.getRange(fila, FONDO_ARQ_COL.MONTO_CONTADO_USD).setValue(Number(p.monto_contado_usd) || 0);
  hoja.getRange(fila, FONDO_ARQ_COL.DIFERENCIA_USD).setValue(Number(p.diferencia_usd) || 0);
  hoja.getRange(fila, FONDO_ARQ_COL.DENOMINACIONES).setValue(JSON.stringify(p.denominaciones || {}));
  hoja.getRange(fila, FONDO_ARQ_COL.NOTAS).setValue(p.notas || '');

  return { id: id, fila: fila };
}

function cerrarPeriodoFondo(p) {
  requerirKiosko(p);
  if (!p.periodo_id) throw new Error('Falta el período de fondo de caja.');
  if (!p.fecha_cierre) throw new Error('Falta la fecha de cierre.');

  const hoja = getHojaFondoPeriodos();
  const fila = filaPeriodoFondoPorId(hoja, p.periodo_id);
  if (fila === -1) throw new Error('No se encontró el período indicado.');
  verificarPeriodoDeKiosko(hoja, fila, FONDO_PER_COL.KIOSKO, p.kiosko);

  const datosFila = hoja.getRange(fila, 1, 1, FONDO_PER_ENCABEZADOS.length).getValues()[0];
  if (datosFila[FONDO_PER_COL.ESTADO - 1] !== 'Abierto') {
    throw new Error('Este período ya está cerrado.');
  }
  const fechaInicio      = datosFila[FONDO_PER_COL.FECHA_INICIO - 1];
  const montoInicialCRC  = datosFila[FONDO_PER_COL.MONTO_INICIAL_CRC - 1];
  const montoInicialUSD  = datosFila[FONDO_PER_COL.MONTO_INICIAL_USD - 1];
  const fechaCierre      = new Date(p.fecha_cierre + 'T00:00:00');
  const montoContadoCRC  = Number(p.monto_contado_crc) || 0;
  const montoContadoUSD  = Number(p.monto_contado_usd) || 0;
  const diferenciaCRC    = Number(p.diferencia_crc) || 0;
  const diferenciaUSD    = Number(p.diferencia_usd) || 0;
  const balanceTeoricoCRC = Number(p.balance_teorico_crc) || 0;
  const balanceTeoricoUSD = Number(p.balance_teorico_usd) || 0;

  hoja.getRange(fila, FONDO_PER_COL.FECHA_CIERRE).setValue(fechaCierre);
  hoja.getRange(fila, FONDO_PER_COL.MONTO_CONTADO_CRC).setValue(montoContadoCRC);
  hoja.getRange(fila, FONDO_PER_COL.MONTO_CONTADO_USD).setValue(montoContadoUSD);
  hoja.getRange(fila, FONDO_PER_COL.DIFERENCIA_CRC).setValue(diferenciaCRC);
  hoja.getRange(fila, FONDO_PER_COL.DIFERENCIA_USD).setValue(diferenciaUSD);
  hoja.getRange(fila, FONDO_PER_COL.ESTADO).setValue('Cerrado');
  hoja.getRange(fila, FONDO_PER_COL.DENOMINACIONES).setValue(JSON.stringify(p.denominaciones || {}));
  hoja.getRange(fila, FONDO_PER_COL.FECHA_REGISTRO_CIERRE).setValue(new Date());

  enviarCorreoCierreFondo({
    kiosko: p.kiosko,
    periodoId: p.periodo_id,
    fechaInicio: fechaInicio,
    fechaCierre: fechaCierre,
    montoInicialCRC: montoInicialCRC,
    montoInicialUSD: montoInicialUSD,
    balanceTeoricoCRC: balanceTeoricoCRC,
    balanceTeoricoUSD: balanceTeoricoUSD,
    montoContadoCRC: montoContadoCRC,
    montoContadoUSD: montoContadoUSD,
    diferenciaCRC: diferenciaCRC,
    diferenciaUSD: diferenciaUSD,
    denominaciones: p.denominaciones || {},
    pagos: p.pagos || []
  });

  return { id: p.periodo_id, fila: fila };
}

function eliminarPeriodoFondo(p) {
  requerirKiosko(p);
  if (!p.periodo_id) throw new Error('Falta el período a eliminar.');
  const hoja = getHojaFondoPeriodos();
  const fila = filaPeriodoFondoPorId(hoja, p.periodo_id);
  if (fila === -1) throw new Error('No se encontró el período indicado.');
  verificarPeriodoDeKiosko(hoja, fila, FONDO_PER_COL.KIOSKO, p.kiosko);

  const estado = hoja.getRange(fila, FONDO_PER_COL.ESTADO).getValue();
  if (estado !== 'Abierto') throw new Error('Solo se puede eliminar un período que sigue abierto.');
  hoja.deleteRow(fila);

  const hojaArq = getHojaFondoArqueos();
  const nFilas = hojaArq.getLastRow() - 1;
  if (nFilas > 0) {
    const ids = hojaArq.getRange(2, FONDO_ARQ_COL.PERIODO_ID, nFilas, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(p.periodo_id)) hojaArq.deleteRow(i + 2);
    }
  }

  return { eliminado: p.periodo_id };
}

function enviarCorreoCierreFondo(d) {
  const fmtFecha = function(f) { return Utilities.formatDate(f, 'America/Costa_Rica', 'dd/MM/yyyy'); };
  const fmtCRC = function(n) { return '₡' + Number(n||0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const fmtUSD = function(n) { return 'US$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  const totalPagosCRC = d.pagos.filter(function(g){ return (g.moneda||'CRC') !== 'USD'; }).reduce(function(a, g) { return a + (Number(g.monto)||0); }, 0);
  const totalPagosUSD = d.pagos.filter(function(g){ return g.moneda === 'USD'; }).reduce(function(a, g) { return a + (Number(g.monto)||0); }, 0);

  const filasPagos = d.pagos.map(function(g) {
    const monto = g.moneda === 'USD' ? fmtUSD(g.monto) : fmtCRC(g.monto);
    return '<tr><td>' + (g.fecha||'') + '</td><td>' + (g.factura||'') + '</td><td>' + (g.proveedor||'') +
           '</td><td style="text-align:right;">' + monto + '</td></tr>';
  }).join('');

  const denomCRC = (d.denominaciones && d.denominaciones.crc) || {};
  const denomUSD = (d.denominaciones && d.denominaciones.usd) || {};
  function filasDenomHtml(denom, fmt) {
    return Object.keys(denom)
      .filter(function(k) { return Number(denom[k]) > 0; })
      .sort(function(a,b) { return Number(b) - Number(a); })
      .map(function(k) {
        const cant = Number(denom[k]);
        return '<tr><td>' + fmt(k) + '</td><td style="text-align:right;">' + cant +
               '</td><td style="text-align:right;">' + fmt(cant * Number(k)) + '</td></tr>';
      }).join('');
  }

  const colorDifCRC = Math.abs(d.diferenciaCRC) < 1 ? '#1a7a4a' : '#c84a20';
  const colorDifUSD = Math.abs(d.diferenciaUSD) < 1 ? '#1a7a4a' : '#c84a20';

  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c3a28;">' +
    '<h2>Cierre de Fondo de Caja · ' + d.kiosko + '</h2>' +
    '<p><strong>Período:</strong> ' + fmtFecha(d.fechaInicio) + ' – ' + fmtFecha(d.fechaCierre) + '</p>' +
    '<table cellpadding="6" style="border-collapse:collapse;margin-bottom:16px;">' +
    '<tr><td>Monto inicial</td><td style="text-align:right;">' + fmtCRC(d.montoInicialCRC) + ' + ' + fmtUSD(d.montoInicialUSD) + '</td></tr>' +
    '<tr><td>Total de pagos del período</td><td style="text-align:right;">' + fmtCRC(totalPagosCRC) + ' + ' + fmtUSD(totalPagosUSD) + '</td></tr>' +
    '<tr><td><strong>Balance teórico</strong></td><td style="text-align:right;"><strong>' + fmtCRC(d.balanceTeoricoCRC) + ' + ' + fmtUSD(d.balanceTeoricoUSD) + '</strong></td></tr>' +
    '<tr><td>Monto contado (arqueo de cierre)</td><td style="text-align:right;">' + fmtCRC(d.montoContadoCRC) + ' + ' + fmtUSD(d.montoContadoUSD) + '</td></tr>' +
    '<tr><td><strong>Diferencia</strong></td><td style="text-align:right;"><strong><span style="color:' + colorDifCRC + ';">' + fmtCRC(d.diferenciaCRC) + '</span> + <span style="color:' + colorDifUSD + ';">' + fmtUSD(d.diferenciaUSD) + '</span></strong></td></tr>' +
    '</table>' +
    '<h3>Denominaciones contadas · Colones</h3>' +
    '<table cellpadding="5" style="border-collapse:collapse;border:1px solid #ccc;margin-bottom:16px;">' +
    '<tr style="background:#f2ede2;"><th>Denominación</th><th>Cantidad</th><th>Subtotal</th></tr>' +
    (filasDenomHtml(denomCRC, fmtCRC) || '<tr><td colspan="3">Sin denominaciones registradas.</td></tr>') +
    '</table>' +
    '<h3>Denominaciones contadas · Dólares</h3>' +
    '<table cellpadding="5" style="border-collapse:collapse;border:1px solid #ccc;margin-bottom:16px;">' +
    '<tr style="background:#f2ede2;"><th>Denominación</th><th>Cantidad</th><th>Subtotal</th></tr>' +
    (filasDenomHtml(denomUSD, fmtUSD) || '<tr><td colspan="3">Sin denominaciones registradas.</td></tr>') +
    '</table>' +
    '<h3>Pagos del período (' + d.pagos.length + ')</h3>' +
    '<table cellpadding="5" style="border-collapse:collapse;border:1px solid #ccc;">' +
    '<tr style="background:#f2ede2;"><th>Fecha</th><th>Factura</th><th>Proveedor</th><th>Monto</th></tr>' +
    (filasPagos || '<tr><td colspan="4">Sin pagos registrados en el período.</td></tr>') +
    '</table>' +
    '</div>';

  MailApp.sendEmail({
    to: CORREO_CIERRE_FONDO,
    subject: 'Cierre de Fondo de Caja · ' + d.kiosko + ' · ' + fmtFecha(d.fechaInicio) + ' – ' + fmtFecha(d.fechaCierre),
    htmlBody: html
  });
}

// ── ROUTER ───────────────────────────────────────────────────────────
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
      case 'abrir_periodo_caja':
        result = abrirPeriodoCaja(payload);
        break;
      case 'guardar_arqueo_caja':
        result = guardarArqueoCaja(payload);
        break;
      case 'cerrar_periodo_caja':
        result = cerrarPeriodoCaja(payload);
        break;
      case 'eliminar_periodo_caja':
        result = eliminarPeriodoCaja(payload);
        break;
      case 'abrir_periodo_fondo':
        result = abrirPeriodoFondo(payload);
        break;
      case 'guardar_arqueo_fondo':
        result = guardarArqueoFondo(payload);
        break;
      case 'cerrar_periodo_fondo':
        result = cerrarPeriodoFondo(payload);
        break;
      case 'eliminar_periodo_fondo':
        result = eliminarPeriodoFondo(payload);
        break;
      default:
        throw new Error('Módulo no reconocido: ' + payload.modulo);
    }
    return jsonOut({ ok: true, result: result });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
