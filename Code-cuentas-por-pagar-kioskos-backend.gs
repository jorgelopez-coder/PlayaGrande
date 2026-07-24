/**
 * Backend Apps Script para el Sheet nuevo "Cuentas por Pagar - Kioskos".
 * Usado por cuentas-por-pagar.html (Ecosistema-Kioskos).
 *
 * Es el equivalente, para varios kioskos, de las acciones de cuentas por pagar
 * de Code-compras-backend.gs (ecosistema-lorito). La diferencia central: como
 * varios kioskos escriben en el mismo Sheet, el número de factura ya NO es
 * único global — solo es único dentro de un mismo kiosko. Por eso todas las
 * acciones reciben también "kiosko" y lo usan junto con el número de factura
 * para ubicar la fila correcta (ver filaFacturaPorOrdinal más abajo).
 *
 * Cómo desplegarlo:
 * 1. Creá un Google Sheet nuevo en blanco, llamalo "Cuentas por Pagar - Kioskos".
 * 2. Extensiones > Apps Script > pegá este código (reemplazando el contenido
 *    del archivo por defecto).
 * 3. Corré UNA VEZ, a mano desde este editor, la función configurarHojas()
 *    para crear las 4 pestañas (Registro Facturas, Desglose_IA, Abonos,
 *    proveedores) con sus encabezados.
 * 4. Implementar > Nueva implementación > Aplicación web
 *    (Ejecutar como: Yo · Acceso: Cualquiera). Copiá la URL /exec.
 * 5. En el facturas-extractor de cada kiosko, apuntá DEST_SPREADSHEET_ID al
 *    ID de este Sheet y APPS_SCRIPT_AP_COMPRAS a esta URL /exec (ver sección B
 *    del plan de migración para el detalle exacto por kiosko).
 * 6. En cuentas-por-pagar.html, poné el ID de este Sheet en COMPRAS_SHEET_ID
 *    y esta URL /exec en APPS_SCRIPT_AP.
 */

const HOJA_FACTURAS    = 'Registro Facturas';
const HOJA_DESGLOSE    = 'Desglose_IA';
const HOJA_ABONOS      = 'Abonos';
const HOJA_PROVEEDORES = 'proveedores';

// Columnas de "Registro Facturas". 1-6 las llena el sync de cada
// facturas-extractor (Fecha, Factura, Proveedor, Moneda, TOTAL, Kiosko) en un
// solo bloque contiguo; el resto se crea dinámicamente con columnaPorNombre()
// (Fecha proyectada de pago, Tipo de cambio, Notas, Total abonado,
// Reembolsado a, Nota de crédito asociada, Duplicado aceptado), igual que en
// Code-compras-backend.gs.
const COL = {
  FECHA: 1, FACTURA: 2, PROVEEDOR: 3, MONEDA: 4, TOTAL: 5, KIOSKO: 6,
  CONDICION: 7, FECHA_PAGO: 8, MEDIO_PAGO: 9, REFERENCIA: 10
};
const FACTURAS_ENCABEZADOS = [
  'Fecha', 'Factura', 'Proveedor', 'Moneda', 'TOTAL', 'Kiosko',
  'Condicion', 'Fecha de pago', 'Medio de pago', 'Referencia'
];

const ABONOS_ENCABEZADOS = [
  'Factura', 'Fecha de abono', 'Monto abonado', 'Medio de pago', 'Referencia',
  'Reembolsado a', 'Nota de crédito asociada', 'Fecha de registro', 'Kiosko'
];

// Mismas 18 columnas que DESGLOSE_COL de Code-compras-backend.gs, más Kiosko
// al final (columna 19) para que el sync 1:1 de cada facturas-extractor solo
// necesite tener esa columna ya presente en su propia hoja "Facturas".
const DESGLOSE_COL = {
  TIPO_DOCUMENTO: 1, MONEDA: 2, NUMERO_FACTURA: 3, FECHA_FACTURA: 4, CLIENTE: 5,
  PROVEEDOR: 6, CATEGORIA: 7, PRODUCTO: 8, NOMBRE_NORMALIZADO: 9, UNIDAD_MEDIDA: 10,
  CANTIDAD: 11, PRECIO_UNITARIO: 12, DESCUENTO: 13, IMPUESTO: 14, TOTAL_LINEA: 15,
  TOTAL_FACTURA: 16, ARCHIVO: 17, FECHA_CARGA: 18, KIOSKO: 19
};
const DESGLOSE_ENCABEZADOS = [
  'Tipo de documento', 'Moneda', 'Número de factura', 'Fecha de factura', 'Cliente',
  'Proveedor', 'Categoría', 'Producto', 'Nombre normalizado', 'Unidad de medida',
  'Cantidad', 'Precio unitario', 'Descuento', 'Impuesto', 'Total línea',
  'Total factura', 'Archivo', 'Fecha de carga', 'Kiosko'
];

// Catálogo de proveedores propio de este módulo (no el de Inventario Kioskos v2,
// que no tiene condición de pago ni cuenta bancaria).
const PROV_COL = {
  ID: 1, NOMBRE_JURIDICO: 2, NOMBRE_COMERCIAL: 3, CATEGORIA: 4, CONTACTO: 5,
  TELEFONO: 6, CORREO: 7, DIAS_PEDIDO: 8, NOTAS_CONTACTO: 9, CUENTA: 10,
  CONDICION_PAGO: 11, NOTAS_PAGO: 12, ACTUALIZADO: 13
};
const PROV_ENCABEZADOS = [
  'ID', 'Nombre jurídico', 'Nombre comercial', 'Categoría', 'Contacto',
  'Teléfono', 'Correo', 'Días de pedido', 'Notas de contacto', 'Cuenta',
  'Condición de pago', 'Notas de pago', 'Actualizado'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Cuentas por pagar')
    .addItem('Configurar hojas (correr una vez)', 'configurarHojas')
    .addToUi();
}

// Crea las 4 pestañas con sus encabezados si no existen todavía. No toca
// hojas que ya tengan datos.
function configurarHojas() {
  prepararHoja(HOJA_FACTURAS, FACTURAS_ENCABEZADOS);
  prepararHoja(HOJA_DESGLOSE, DESGLOSE_ENCABEZADOS);
  prepararHoja(HOJA_ABONOS, ABONOS_ENCABEZADOS);
  prepararHoja(HOJA_PROVEEDORES, PROV_ENCABEZADOS);
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

function doPost(e) {
  try {
    const payload = JSON.parse(e.parameter.data);
    let result;
    switch (payload.modulo) {
      case 'guardar_proyeccion':
        result = guardarProyeccion(payload);
        break;
      case 'guardar_tc':
        result = guardarTC(payload);
        break;
      case 'guardar_nota':
        result = guardarNota(payload);
        break;
      case 'registrar_pago':
        result = registrarPago(payload);
        break;
      case 'registrar_abono':
        result = registrarAbono(payload);
        break;
      case 'eliminar_factura':
        result = eliminarFactura(payload);
        break;
      case 'aceptar_duplicado':
        result = aceptarDuplicado(payload);
        break;
      case 'guardar_proveedor':
        result = guardarProveedor(payload);
        break;
      case 'eliminar_proveedor':
        result = eliminarProveedor(payload);
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

function getHoja() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_FACTURAS);
  if (!hoja) throw new Error('No se encontró la hoja "' + HOJA_FACTURAS + '"');
  return hoja;
}

function getHojaDesglose() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_DESGLOSE);
  if (!hoja) throw new Error('No se encontró la hoja "' + HOJA_DESGLOSE + '"');
  return hoja;
}

function getHojaAbonos() {
  return prepararHoja(HOJA_ABONOS, ABONOS_ENCABEZADOS);
}

function getHojaProveedores() {
  return prepararHoja(HOJA_PROVEEDORES, PROV_ENCABEZADOS);
}

// Busca una columna por nombre de encabezado; si no existe, la crea al final.
function columnaPorNombre(hoja, nombre) {
  const ultimaCol = Math.max(hoja.getLastColumn(), Object.keys(COL).length);
  const encabezados = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0];
  let idx = encabezados.indexOf(nombre) + 1;
  if (idx === 0) {
    idx = ultimaCol + 1;
    hoja.getRange(1, idx).setValue(nombre);
  }
  return idx;
}

// ── ACCIONES DE CUENTAS POR PAGAR (Registro Facturas) ─────────────
// Como puede haber números de factura repetidos DENTRO de un mismo kiosko
// (duplicados) Y el mismo número puede coincidir entre kioskos distintos por
// casualidad, cada acción recibe "kiosko" + "ordinal": el ordinal es la
// posición (1ra, 2da...) en que esa factura de ESE kiosko aparece recorriendo
// la hoja de arriba hacia abajo. El cliente (cuentas-por-pagar.html) calcula
// ese ordinal en el mismo orden en que lee los datos por gviz, ya filtrado
// por kiosko cuando corresponde — así el backend edita/borra la copia correcta.
function filaFacturaPorOrdinal(hoja, numeroFactura, ordinal, kiosko) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const datos = hoja.getRange(2, 1, nFilas, COL.KIOSKO).getValues();
  let contador = 0;
  for (let i = 0; i < datos.length; i++) {
    const fila = datos[i];
    if (String(fila[COL.FACTURA - 1]) === String(numeroFactura) &&
        String(fila[COL.KIOSKO - 1]) === String(kiosko)) {
      contador++;
      if (contador === Number(ordinal)) return i + 2;
    }
  }
  return -1;
}

// Compara solo la parte de fecha (año-mes-día) de dos valores que pueden venir
// como objeto Date o como texto, ignorando hora/zona horaria.
function mismaFechaGS(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return String(a || '') === String(b || '');
  return da.getFullYear() === db.getFullYear() &&
         da.getMonth() === db.getMonth() &&
         da.getDate() === db.getDate();
}

// Normaliza texto para comparar nombres de proveedor sin depender de
// mayúsculas, tildes o espacios extra.
function normalizarTextoGS(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function mismoMontoGS(a, b) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.01;
}

// Dentro de Desglose_IA, cada carga de OCR escribe de forma seguida todas las
// líneas de producto de una factura, así que las líneas de una misma copia
// forman un bloque contiguo de filas. Esta función agrupa esos bloques exigiendo
// que coincidan número de factura + fecha + proveedor + total + kiosko —para no
// arrastrar las líneas de otra factura de otro kiosko/proveedor que coincida en
// número por casualidad— y les asigna una posición (1ra, 2da... contada de
// arriba hacia abajo) para poder borrar las líneas de la copia correcta cuando
// se elimina un duplicado.
// Devuelve { filaInicio, cantidadFilas } del bloque pedido, o null si no existe
// (p.ej. una factura sin líneas de OCR).
function bloqueDesglosePorFirma(hoja, firma, posicion) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return null;
  const datos = hoja.getRange(2, 1, nFilas, DESGLOSE_COL.KIOSKO).getValues();

  const coincide = function(fila) {
    return String(fila[DESGLOSE_COL.NUMERO_FACTURA - 1]) === String(firma.numero) &&
      mismaFechaGS(fila[DESGLOSE_COL.FECHA_FACTURA - 1], firma.fecha) &&
      normalizarTextoGS(fila[DESGLOSE_COL.PROVEEDOR - 1]) === normalizarTextoGS(firma.proveedor) &&
      mismoMontoGS(fila[DESGLOSE_COL.TOTAL_FACTURA - 1], firma.total) &&
      String(fila[DESGLOSE_COL.KIOSKO - 1]) === String(firma.kiosko);
  };

  let posicionActual = 0;
  let i = 0;
  while (i < datos.length) {
    if (coincide(datos[i])) {
      const inicio = i;
      while (i < datos.length && coincide(datos[i])) i++;
      posicionActual++;
      if (posicionActual === posicion) {
        return { filaInicio: inicio + 2, cantidadFilas: i - inicio };
      }
    } else {
      i++;
    }
  }
  return null;
}

function requerirKiosko(p) {
  if (!p.kiosko) throw new Error('Falta indicar el kiosko.');
}

function guardarProyeccion(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal) throw new Error('Falta indicar a cuál copia de la factura aplica.');
  requerirKiosko(p);
  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal, p.kiosko);
  if (fila === -1) throw new Error('No se encontró esa factura.');
  const col = columnaPorNombre(hoja, 'Fecha proyectada de pago');
  hoja.getRange(fila, col).setValue(p.fecha_proyectada || '');
  return { fila: fila };
}

function guardarTC(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal) throw new Error('Falta indicar a cuál copia de la factura aplica.');
  if (!p.tipo_cambio) throw new Error('Falta el tipo de cambio.');
  requerirKiosko(p);
  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal, p.kiosko);
  if (fila === -1) throw new Error('No se encontró esa factura.');
  const col = columnaPorNombre(hoja, 'Tipo de cambio');
  hoja.getRange(fila, col).setValue(Number(p.tipo_cambio));
  return { fila: fila };
}

function guardarNota(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal) throw new Error('Falta indicar a cuál copia de la factura aplica.');
  requerirKiosko(p);
  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal, p.kiosko);
  if (fila === -1) throw new Error('No se encontró esa factura.');
  const col = columnaPorNombre(hoja, 'Notas');
  hoja.getRange(fila, col).setValue(p.nota || '');
  return { fila: fila };
}

function registrarPago(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal)        throw new Error('Falta indicar a cuál copia de la factura aplica.');
  if (!p.fecha_pago)     throw new Error('Falta la fecha de pago.');
  requerirKiosko(p);
  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal, p.kiosko);
  if (fila === -1) throw new Error('No se encontró esa factura.');
  hoja.getRange(fila, COL.FECHA_PAGO).setValue(p.fecha_pago);
  hoja.getRange(fila, COL.MEDIO_PAGO).setValue(p.medio_pago || '');
  hoja.getRange(fila, COL.REFERENCIA).setValue(p.referencia || '');
  if (p.reembolso_a) {
    hoja.getRange(fila, columnaPorNombre(hoja, 'Reembolsado a')).setValue(p.reembolso_a);
  }
  if (p.nota_credito) {
    hoja.getRange(fila, columnaPorNombre(hoja, 'Nota de crédito asociada')).setValue(p.nota_credito);
  }
  return { fila: fila };
}

// ── ABONOS PARCIALES ──────────────────────────────────────────────
// La hoja Registro Facturas solo tiene una "Fecha de pago" única por fila,
// así que los abonos parciales se llevan en una hoja aparte y se refleja
// el acumulado en una columna dinámica "Total abonado" sobre la factura.
// La suma se filtra también por kiosko, ya que el mismo número de factura
// puede repetirse entre kioskos.
function sumAbonosFactura(numeroFactura, kiosko) {
  const hoja = getHojaAbonos();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return 0;
  const datos = hoja.getRange(2, 1, nFilas, 9).getValues();
  let total = 0;
  datos.forEach(function(r) {
    if (String(r[0]) === String(numeroFactura) && String(r[8]) === String(kiosko)) total += Number(r[2]) || 0;
  });
  return Math.round(total * 100) / 100;
}

function registrarAbono(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal)        throw new Error('Falta indicar a cuál copia de la factura aplica.');
  if (!p.fecha_abono)    throw new Error('Falta la fecha del abono.');
  if (!p.monto_abono)    throw new Error('Falta el monto del abono.');
  requerirKiosko(p);

  getHojaAbonos().appendRow([
    p.numero_factura, p.fecha_abono, Number(p.monto_abono), p.medio_pago || '', p.referencia || '',
    p.reembolso_a || '', p.nota_credito || '', new Date(), p.kiosko
  ]);

  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal, p.kiosko);
  if (fila === -1) throw new Error('No se encontró esa factura.');

  const totalAbonado = sumAbonosFactura(p.numero_factura, p.kiosko);
  const col = columnaPorNombre(hoja, 'Total abonado');
  hoja.getRange(fila, col).setValue(totalAbonado);

  return { fila: fila, total_abonado: totalAbonado };
}

function eliminarFactura(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal) throw new Error('Falta indicar cuál copia eliminar.');
  requerirKiosko(p);
  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal, p.kiosko);
  if (fila === -1) throw new Error('No se encontró esa copia (puede que ya se haya eliminado).');

  // Antes de borrar, tomamos la "firma" completa de esta copia (número + fecha +
  // proveedor + total + kiosko) y calculamos su posición entre las filas de
  // Registro Facturas que comparten exactamente esa misma firma. Así, al buscar
  // sus líneas en Desglose_IA, no nos desalineamos ni arrastramos líneas de otra
  // factura de otro kiosko/proveedor que por casualidad tenga el mismo número.
  const nFilasFacturas = hoja.getLastRow() - 1;
  const datosFacturas = hoja.getRange(2, 1, nFilasFacturas, COL.KIOSKO).getValues();
  const filaObjetivo = datosFacturas[fila - 2];
  const firma = {
    numero: filaObjetivo[COL.FACTURA - 1],
    fecha: filaObjetivo[COL.FECHA - 1],
    proveedor: filaObjetivo[COL.PROVEEDOR - 1],
    total: filaObjetivo[COL.TOTAL - 1],
    kiosko: filaObjetivo[COL.KIOSKO - 1]
  };
  let posicion = 0;
  for (let i = 0; i <= fila - 2; i++) {
    const f = datosFacturas[i];
    if (String(f[COL.FACTURA - 1]) === String(firma.numero) &&
        mismaFechaGS(f[COL.FECHA - 1], firma.fecha) &&
        normalizarTextoGS(f[COL.PROVEEDOR - 1]) === normalizarTextoGS(firma.proveedor) &&
        mismoMontoGS(f[COL.TOTAL - 1], firma.total) &&
        String(f[COL.KIOSKO - 1]) === String(firma.kiosko)) {
      posicion++;
    }
  }

  hoja.deleteRow(fila);

  // Borra también, si existen, las líneas de producto de Desglose_IA que
  // corresponden a esta misma copia (mismo bloque por firma, ver
  // bloqueDesglosePorFirma). No bloquea el borrado de la factura si Desglose_IA
  // no tiene un bloque en esa posición o algo falla acá.
  let lineasDesgloseEliminadas = 0;
  try {
    const hojaDesglose = getHojaDesglose();
    const bloque = bloqueDesglosePorFirma(hojaDesglose, firma, posicion);
    if (bloque) {
      hojaDesglose.deleteRows(bloque.filaInicio, bloque.cantidadFilas);
      lineasDesgloseEliminadas = bloque.cantidadFilas;
    }
  } catch (e) {
    // Sin Desglose_IA o con otro error acá, la factura ya se borró igual.
  }

  return { eliminado: true, fila: fila, lineas_desglose_eliminadas: lineasDesgloseEliminadas };
}

// Marca una o varias copias de una factura (dentro de un mismo kiosko) como
// "duplicado aceptado": queda registrado en la hoja para que el control de
// duplicados deje de marcarlas.
function aceptarDuplicado(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!Array.isArray(p.ordinales) || !p.ordinales.length) throw new Error('Falta indicar cuáles copias aceptar.');
  requerirKiosko(p);
  const hoja = getHoja();
  const col = columnaPorNombre(hoja, 'Duplicado aceptado');
  var marcadas = 0;
  p.ordinales.forEach(function(ordinal) {
    const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, ordinal, p.kiosko);
    if (fila !== -1) {
      hoja.getRange(fila, col).setValue('Sí');
      marcadas++;
    }
  });
  if (!marcadas) throw new Error('No se encontraron copias para marcar.');
  return { marcadas: marcadas };
}

// ── PROVEEDORES (catálogo propio de este módulo) ──────────────────
function filaProveedorPorId(hoja, id) {
  if (!id) return -1;
  const ids = hoja.getRange(2, PROV_COL.ID, Math.max(hoja.getLastRow() - 1, 0), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function guardarProveedor(p) {
  if (!p.nombre_juridico) throw new Error('Falta el nombre jurídico del proveedor.');

  const hoja = getHojaProveedores();
  let fila = filaProveedorPorId(hoja, p.id);
  const esNuevo = fila === -1;
  const id = esNuevo ? ('PROV-' + Date.now()) : p.id;
  if (esNuevo) fila = hoja.getLastRow() + 1;

  const dias = Array.isArray(p.dias_pedido) ? p.dias_pedido.join(', ') : (p.dias_pedido || '');

  hoja.getRange(fila, PROV_COL.ID).setValue(id);
  hoja.getRange(fila, PROV_COL.NOMBRE_JURIDICO).setValue(p.nombre_juridico || '');
  hoja.getRange(fila, PROV_COL.NOMBRE_COMERCIAL).setValue(p.nombre_comercial || '');
  hoja.getRange(fila, PROV_COL.CATEGORIA).setValue(p.categoria || '');
  hoja.getRange(fila, PROV_COL.CONTACTO).setValue(p.contacto || '');
  hoja.getRange(fila, PROV_COL.TELEFONO).setValue(p.telefono || '');
  hoja.getRange(fila, PROV_COL.CORREO).setValue(p.correo || '');
  hoja.getRange(fila, PROV_COL.DIAS_PEDIDO).setValue(dias);
  hoja.getRange(fila, PROV_COL.NOTAS_CONTACTO).setValue(p.notas_contacto || '');
  hoja.getRange(fila, PROV_COL.CUENTA).setValue(p.cuenta || '');
  hoja.getRange(fila, PROV_COL.CONDICION_PAGO).setValue(p.condicion_pago || '0');
  hoja.getRange(fila, PROV_COL.NOTAS_PAGO).setValue(p.notas_pago || '');
  hoja.getRange(fila, PROV_COL.ACTUALIZADO).setValue(new Date());

  return { id: id, fila: fila, nuevo: esNuevo };
}

function eliminarProveedor(p) {
  if (!p.id) throw new Error('Falta el ID del proveedor a eliminar.');
  const hoja = getHojaProveedores();
  const fila = filaProveedorPorId(hoja, p.id);
  if (fila === -1) throw new Error('No se encontró el proveedor con ID ' + p.id);
  hoja.deleteRow(fila);
  return { eliminado: p.id };
}
