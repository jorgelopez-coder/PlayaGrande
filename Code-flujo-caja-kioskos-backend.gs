/**
 * Backend de Flujo de Caja (flujo-caja.html, Ecosistema Kioskos) — guarda las
 * piezas de este módulo que no existen ya en otro Sheet: el estimado de
 * planilla por kiosko/fecha, los otros desembolsos manuales, los montos
 * manuales de Servicio 10% (ajustes/estimados que no están todavía en
 * ServicioRepartoDetalle real, p.ej. un pago futuro que ya se sabe que viene),
 * y las compras de proveedores estimadas (pedidos hechos o por hacer que
 * todavía no llegaron a ser factura real en Cuentas por Pagar).
 *
 * Todo lo demás que muestra flujo-caja.html (Cuentas por Pagar programadas,
 * Servicio 10% pendiente, Planillas reales para sugerir el estimado) se lee
 * en vivo desde los Sheets/backends que YA existen (Compras y RRHH) — este
 * proyecto nunca escribe ahí, solo lee vía gviz/doGet igual que cualquier
 * otra pantalla del portal.
 *
 * Mismo patrón que Menú y Recetas (Code-recetas-kioskos-backend.gs): vive en
 * su PROPIO Sheet separado, con su propio proyecto de Apps Script.
 *
 * Cómo desplegarlo (primera vez):
 * 1. Creá un Google Sheet nuevo, p.ej. "Flujo de Caja - Kioskos" (no hace
 *    falta compartirlo públicamente: a diferencia de Compras/Recetas, acá
 *    flujo-caja.html nunca lee este Sheet por gviz, siempre pasa por este
 *    Apps Script — mismo patrón de lectura que servicio_detalle/planillas
 *    en Code-rrhh-kioskos-backend.gs).
 * 2. Extensiones > Apps Script (proyecto nuevo, atado a ESTE Sheet). Pegá el
 *    contenido completo de este archivo.
 * 3. Corré UNA VEZ, a mano desde este editor, la función configurarHojas()
 *    para crear las pestañas "PlanillaEstimada", "OtrosDesembolsos",
 *    "ServicioManual" y "ComprasProveedores".
 * 4. Implementar > Nueva implementación > Aplicación web (Ejecutar como: Yo
 *    · Acceso: Cualquiera).
 * 5. Copiá la URL /exec y pegala en flujo-caja.html, constante
 *    APPS_SCRIPT_FLUJO (reemplazá el placeholder que empieza con "TODO_").
 *
 * Para actualizar código más adelante (p.ej. esta versión, que agregó
 * ComprasProveedores): pegá el archivo completo de nuevo acá, corré
 * configurarHojas() otra vez (crea solo la pestaña que falte, no toca las
 * existentes) e Implementar > Gestionar implementaciones > Editar > Nueva
 * versión (la URL /exec no cambia).
 */

// ── PLANILLA ESTIMADA ──────────────────────────────────────────────
// Una fila = un desembolso de planilla estimado para un kiosko en una fecha
// (normalmente las quincenas, día 15 y último día de mes, pero libre). El
// monto es editable a mano; flujo-caja.html sugiere un valor de partida
// tomado de la última Planilla REAL de ese kiosko (Sheet de RRHH), pero acá
// solo se guarda el estimado, nunca el dato real.
const HOJA_PLANILLA_ESTIMADA = 'PlanillaEstimada';
const ENCABEZADOS_PLANILLA_ESTIMADA = [
  'ID', 'Kiosko', 'Fecha', 'Monto', 'Nota', 'Fecha registro', 'Registrado por'
];

// ── OTROS DESEMBOLSOS ──────────────────────────────────────────────
// Espacio abierto para cualquier salida de efectivo estimada que no encaje
// en Cuentas por Pagar, Servicio 10% o Planilla (p.ej. impuestos, alquiler,
// un desembolso puntual). 'Categoria' es texto libre, no un catálogo — no
// hay suficientes casos todavía para justificar mantener una lista aparte.
const HOJA_OTROS_DESEMBOLSOS = 'OtrosDesembolsos';
const ENCABEZADOS_OTROS_DESEMBOLSOS = [
  'ID', 'Kiosko', 'Descripcion', 'Fecha', 'Monto', 'Categoria', 'Nota', 'Fecha registro', 'Registrado por'
];

// ── SERVICIO 10% MANUAL ─────────────────────────────────────────────
// El saldo pendiente "real" de Servicio 10% se sigue leyendo tal cual de
// ServicioRepartoDetalle (Sheet de RRHH, solo lectura, ver servicio_detalle
// en Code-rrhh-kioskos-backend.gs). Esto es aparte: un monto manual que el
// usuario agrega a mano desde la pestaña "Servicio 10%" de flujo-caja.html
// cuando sabe que va a necesitar cubrir un monto que todavía no está
// reflejado ahí (p.ej. un ajuste, o un pago futuro ya previsto). A
// diferencia del saldo real (que ignora el periodo elegido), esto SÍ tiene
// fecha propia y participa del periodo/línea de tiempo, igual que
// PlanillaEstimada.
const HOJA_SERVICIO_MANUAL = 'ServicioManual';
const ENCABEZADOS_SERVICIO_MANUAL = [
  'ID', 'Kiosko', 'Fecha', 'Monto', 'Nota', 'Fecha registro', 'Registrado por'
];

// ── COMPRAS DE PROVEEDORES (ESTIMADAS) ──────────────────────────────
// Pedidos a proveedores que ya se saben (hechos o por hacer) pero que
// todavía no entraron como factura real a Cuentas por Pagar — por eso viven
// acá y no en el Sheet de Compras. 'Proveedor' es texto libre por ahora.
// Pensado para eventualmente completarse solo desde Órdenes de Compra
// (ordenes-compra.html) en vez de cargarse a mano; mientras esa conexión no
// exista, es una fila manual más, mismo patrón que PlanillaEstimada.
const HOJA_COMPRAS_PROVEEDORES = 'ComprasProveedores';
const ENCABEZADOS_COMPRAS_PROVEEDORES = [
  'ID', 'Kiosko', 'Proveedor', 'Fecha', 'Monto', 'Nota', 'Fecha registro', 'Registrado por'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Flujo de Caja')
    .addItem('Configurar hojas (correr una vez)', 'configurarHojas')
    .addToUi();
}

function configurarHojas() {
  prepararHoja(HOJA_PLANILLA_ESTIMADA, ENCABEZADOS_PLANILLA_ESTIMADA);
  prepararHoja(HOJA_OTROS_DESEMBOLSOS, ENCABEZADOS_OTROS_DESEMBOLSOS);
  prepararHoja(HOJA_SERVICIO_MANUAL, ENCABEZADOS_SERVICIO_MANUAL);
  prepararHoja(HOJA_COMPRAS_PROVEEDORES, ENCABEZADOS_COMPRAS_PROVEEDORES);
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
// encabezados, esto las agrega sin tocar las que ya existen — así correr
// configurarHojas() de nuevo después de pegar una versión nueva de este
// archivo no requiere recrear la hoja a mano.
function asegurarEncabezados_(hoja, encabezados) {
  const colActuales = hoja.getLastColumn();
  if (colActuales >= encabezados.length) return;
  const faltantes = encabezados.slice(colActuales);
  const rango = hoja.getRange(1, colActuales + 1, 1, faltantes.length);
  rango.setValues([faltantes]);
  rango.setFontWeight('bold');
}

function colPorEncabezado(hoja, nombreCol) {
  const nCols = Math.max(hoja.getLastColumn(), 1);
  const encabezados = hoja.getRange(1, 1, 1, nCols).getValues()[0];
  return encabezados.indexOf(nombreCol) + 1;
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
      if (v instanceof Date) {
        v = Utilities.formatDate(v, 'America/Costa_Rica', 'yyyy-MM-dd');
      }
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

// Busca la fila (1-indexada) de un registro por su columna 'ID'. -1 si no existe.
function filaPorId_(hoja, id) {
  if (!id) return -1;
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const colId = colPorEncabezado(hoja, 'ID');
  const ids = hoja.getRange(2, colId, nFilas, 1).getValues();
  const buscado = String(id).trim();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === buscado) return i + 2;
  }
  return -1;
}

function eliminarFilaPorId_(hoja, id) {
  const fila = filaPorId_(hoja, id);
  if (fila === -1) throw new Error('No se encontró el registro (ID ' + id + ').');
  hoja.deleteRow(fila);
}

function generarId_(prefijo) {
  const marca = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Costa_Rica', 'yyyyMMdd-HHmmss');
  const azar = Math.floor(100 + Math.random() * 900);
  return prefijo + '-' + marca + '-' + azar;
}

// ── PLANILLA ESTIMADA: guardar/eliminar ────────────────────────────
// p.id presente = actualiza esa fila; ausente = crea una nueva.
function planillaEstimadaGuardar(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.fecha) throw new Error('Falta la fecha.');
  if (p.monto == null || isNaN(Number(p.monto))) throw new Error('Falta el monto o no es un número.');
  const hoja = prepararHoja(HOJA_PLANILLA_ESTIMADA, ENCABEZADOS_PLANILLA_ESTIMADA);
  const ahora = Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd HH:mm');
  const valores = {
    'Kiosko': p.kiosko,
    'Fecha': p.fecha,
    'Monto': Number(p.monto),
    'Nota': p.nota || '',
    'Fecha registro': ahora,
    'Registrado por': p.registrado_por || ''
  };
  const filaExistente = p.id ? filaPorId_(hoja, p.id) : -1;
  if (filaExistente !== -1) {
    escribirFilaPorEncabezado(hoja, filaExistente, ENCABEZADOS_PLANILLA_ESTIMADA, Object.assign({ 'ID': p.id }, valores));
    return { ok: true, id: p.id };
  }
  const id = generarId_('PE');
  hoja.appendRow(ENCABEZADOS_PLANILLA_ESTIMADA.map(function (h) {
    return h === 'ID' ? id : (valores[h] != null ? valores[h] : '');
  }));
  return { ok: true, id: id };
}

function planillaEstimadaEliminar(p) {
  if (!p.id) throw new Error('Falta el ID a eliminar.');
  const hoja = prepararHoja(HOJA_PLANILLA_ESTIMADA, ENCABEZADOS_PLANILLA_ESTIMADA);
  eliminarFilaPorId_(hoja, p.id);
  return { ok: true };
}

// ── OTROS DESEMBOLSOS: guardar/eliminar ────────────────────────────
function otroDesembolsoGuardar(p) {
  if (!p.descripcion) throw new Error('Falta la descripción.');
  if (!p.fecha) throw new Error('Falta la fecha.');
  if (p.monto == null || isNaN(Number(p.monto))) throw new Error('Falta el monto o no es un número.');
  const hoja = prepararHoja(HOJA_OTROS_DESEMBOLSOS, ENCABEZADOS_OTROS_DESEMBOLSOS);
  const ahora = Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd HH:mm');
  const valores = {
    'Kiosko': p.kiosko || 'Todos',
    'Descripcion': p.descripcion,
    'Fecha': p.fecha,
    'Monto': Number(p.monto),
    'Categoria': p.categoria || '',
    'Nota': p.nota || '',
    'Fecha registro': ahora,
    'Registrado por': p.registrado_por || ''
  };
  const filaExistente = p.id ? filaPorId_(hoja, p.id) : -1;
  if (filaExistente !== -1) {
    escribirFilaPorEncabezado(hoja, filaExistente, ENCABEZADOS_OTROS_DESEMBOLSOS, Object.assign({ 'ID': p.id }, valores));
    return { ok: true, id: p.id };
  }
  const id = generarId_('OD');
  hoja.appendRow(ENCABEZADOS_OTROS_DESEMBOLSOS.map(function (h) {
    return h === 'ID' ? id : (valores[h] != null ? valores[h] : '');
  }));
  return { ok: true, id: id };
}

function otroDesembolsoEliminar(p) {
  if (!p.id) throw new Error('Falta el ID a eliminar.');
  const hoja = prepararHoja(HOJA_OTROS_DESEMBOLSOS, ENCABEZADOS_OTROS_DESEMBOLSOS);
  eliminarFilaPorId_(hoja, p.id);
  return { ok: true };
}

// ── SERVICIO 10% MANUAL: guardar/eliminar ──────────────────────────
// Mismo patrón que planillaEstimadaGuardar: p.id presente = actualiza esa
// fila; ausente = crea una nueva.
function servicioManualGuardar(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.fecha) throw new Error('Falta la fecha.');
  if (p.monto == null || isNaN(Number(p.monto))) throw new Error('Falta el monto o no es un número.');
  const hoja = prepararHoja(HOJA_SERVICIO_MANUAL, ENCABEZADOS_SERVICIO_MANUAL);
  const ahora = Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd HH:mm');
  const valores = {
    'Kiosko': p.kiosko,
    'Fecha': p.fecha,
    'Monto': Number(p.monto),
    'Nota': p.nota || '',
    'Fecha registro': ahora,
    'Registrado por': p.registrado_por || ''
  };
  const filaExistente = p.id ? filaPorId_(hoja, p.id) : -1;
  if (filaExistente !== -1) {
    escribirFilaPorEncabezado(hoja, filaExistente, ENCABEZADOS_SERVICIO_MANUAL, Object.assign({ 'ID': p.id }, valores));
    return { ok: true, id: p.id };
  }
  const id = generarId_('SM');
  hoja.appendRow(ENCABEZADOS_SERVICIO_MANUAL.map(function (h) {
    return h === 'ID' ? id : (valores[h] != null ? valores[h] : '');
  }));
  return { ok: true, id: id };
}

function servicioManualEliminar(p) {
  if (!p.id) throw new Error('Falta el ID a eliminar.');
  const hoja = prepararHoja(HOJA_SERVICIO_MANUAL, ENCABEZADOS_SERVICIO_MANUAL);
  eliminarFilaPorId_(hoja, p.id);
  return { ok: true };
}

// ── COMPRAS DE PROVEEDORES: guardar/eliminar ───────────────────────
// Mismo patrón que planillaEstimadaGuardar: p.id presente = actualiza esa
// fila; ausente = crea una nueva.
function compraProveedorGuardar(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.fecha) throw new Error('Falta la fecha.');
  if (p.monto == null || isNaN(Number(p.monto))) throw new Error('Falta el monto o no es un número.');
  const hoja = prepararHoja(HOJA_COMPRAS_PROVEEDORES, ENCABEZADOS_COMPRAS_PROVEEDORES);
  const ahora = Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd HH:mm');
  const valores = {
    'Kiosko': p.kiosko,
    'Proveedor': p.proveedor || '',
    'Fecha': p.fecha,
    'Monto': Number(p.monto),
    'Nota': p.nota || '',
    'Fecha registro': ahora,
    'Registrado por': p.registrado_por || ''
  };
  const filaExistente = p.id ? filaPorId_(hoja, p.id) : -1;
  if (filaExistente !== -1) {
    escribirFilaPorEncabezado(hoja, filaExistente, ENCABEZADOS_COMPRAS_PROVEEDORES, Object.assign({ 'ID': p.id }, valores));
    return { ok: true, id: p.id };
  }
  const id = generarId_('CP');
  hoja.appendRow(ENCABEZADOS_COMPRAS_PROVEEDORES.map(function (h) {
    return h === 'ID' ? id : (valores[h] != null ? valores[h] : '');
  }));
  return { ok: true, id: id };
}

function compraProveedorEliminar(p) {
  if (!p.id) throw new Error('Falta el ID a eliminar.');
  const hoja = prepararHoja(HOJA_COMPRAS_PROVEEDORES, ENCABEZADOS_COMPRAS_PROVEEDORES);
  eliminarFilaPorId_(hoja, p.id);
  return { ok: true };
}

// ── doGet / doPost ───────────────────────────────────────────────────
function doGet(e) {
  try {
    const modulo = e.parameter.modulo;
    let hoja;
    switch (modulo) {
      case 'planilla_estimada':  hoja = prepararHoja(HOJA_PLANILLA_ESTIMADA, ENCABEZADOS_PLANILLA_ESTIMADA); break;
      case 'otros_desembolsos':  hoja = prepararHoja(HOJA_OTROS_DESEMBOLSOS, ENCABEZADOS_OTROS_DESEMBOLSOS); break;
      case 'servicio_manual':    hoja = prepararHoja(HOJA_SERVICIO_MANUAL, ENCABEZADOS_SERVICIO_MANUAL); break;
      case 'compras_proveedores': hoja = prepararHoja(HOJA_COMPRAS_PROVEEDORES, ENCABEZADOS_COMPRAS_PROVEEDORES); break;
      default:
        return jsonOut({ ok: false, error: 'Módulo no reconocido: ' + modulo });
    }
    return jsonOut({ ok: true, registros: filasComoObjetos(hoja) });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.parameter.data);
    let result;
    switch (payload.modulo) {
      case 'planilla_estimada_guardar':
        result = planillaEstimadaGuardar(payload);
        break;
      case 'planilla_estimada_eliminar':
        result = planillaEstimadaEliminar(payload);
        break;
      case 'otro_desembolso_guardar':
        result = otroDesembolsoGuardar(payload);
        break;
      case 'otro_desembolso_eliminar':
        result = otroDesembolsoEliminar(payload);
        break;
      case 'servicio_manual_guardar':
        result = servicioManualGuardar(payload);
        break;
      case 'servicio_manual_eliminar':
        result = servicioManualEliminar(payload);
        break;
      case 'compra_proveedor_guardar':
        result = compraProveedorGuardar(payload);
        break;
      case 'compra_proveedor_eliminar':
        result = compraProveedorEliminar(payload);
        break;
      default:
        throw new Error('Módulo no reconocido: ' + payload.modulo);
    }
    return jsonOut(result);
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
