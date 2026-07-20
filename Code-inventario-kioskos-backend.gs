/**
 * Backend Apps Script para el Sheet "Inventario - Kioskos": catálogo de
 * productos, stock en vivo por kiosko, toma de inventario física (con cierre
 * bloqueado por PIN de administrador) y recetas para descontar el stock
 * automáticamente según las ventas de Square.
 *
 * Sheet de datos: "Inventario - Kioskos" (crear nuevo, ver README).
 *
 * Cómo desplegarlo:
 * 1. Sheet "Inventario - Kioskos" > Extensiones > Apps Script.
 * 2. Pegá este código completo.
 * 3. Corré UNA VEZ configurarHoja() desde el editor para crear las 9
 *    pestañas (Productos, Categorias, Stock, StockMovimientos,
 *    TomaInventario, TomaInventarioDetalle, Recetas, RecetasDetalle,
 *    VentasProcesadas) con sus encabezados.
 * 4. ⚙️ Configuración del proyecto > Propiedades del script > agregá
 *    ADMIN_PIN con el código que va a pedir "Cerrar toma" (si no se
 *    configura, el default es 'admin').
 * 5. Completá SQUARE_URL abajo con la URL /exec del Web App de
 *    Codigo-Square-completo-con-Descuentos.gs (necesita tener desplegada la
 *    acción ?action=ventasPorProducto — ver ese archivo) para que
 *    "Sincronizar ventas ahora" y el trigger automático funcionen. Sin esto,
 *    todo el resto del módulo (productos, stock manual, toma de inventario,
 *    recetas) funciona igual — solo el descuento automático por venta queda
 *    inactivo.
 * 6. Implementar > Nueva implementación > Tipo: Aplicación web, Ejecutar
 *    como Yo, Acceso: Cualquiera. Copiá la URL /exec en inventario.html y
 *    recetas.html (constante INVENTARIO_URL).
 * 7. (Opcional) Corré UNA VEZ crearTriggerSincronizacion() desde el editor
 *    para que sincronizarVentasAutomatico() corra sola cada hora. Sin esto,
 *    el consumo por venta solo se aplica cuando alguien aprieta "Sincronizar
 *    ventas ahora" en recetas.html.
 *
 * Si se agregan columnas nuevas: actualizar el ENCABEZADOS_* que corresponda
 * al FINAL del array (nunca insertar en el medio), volver a pegar el código,
 * Implementar > Gestionar implementaciones > Editar > Nueva versión (la URL
 * /exec no cambia), y correr configurarHoja() de nuevo.
 */

// URL /exec del Web App de Codigo-Square-completo-con-Descuentos.gs, con la
// acción ventasPorProducto ya agregada. Mientras esté vacía, sincronizarVentas
// avisa el error en vez de fallar en silencio.
const SQUARE_URL = '';

const HOJA_PRODUCTOS = 'Productos';
const ENCABEZADOS_PRODUCTOS = [
  'ID', 'Nombre Interno', 'Nombre Facturación', 'Nombre Compra', 'Nombre Venta',
  'Categoría', 'Unidad', 'Mínimo Recomendado', 'Activo', 'Actualizado'
];

const HOJA_CATEGORIAS = 'Categorias';
const ENCABEZADOS_CATEGORIAS = ['Nombre', 'Orden', 'Activo'];

// Una fila por combinación Producto+Kiosko con la cantidad actual (upsert,
// no historial — el historial de cambios vive en StockMovimientos).
const HOJA_STOCK = 'Stock';
const ENCABEZADOS_STOCK = ['Producto ID', 'Kiosko', 'Cantidad Actual', 'Actualizado'];

// Log de auditoría append-only: cada alta/ajuste/consumo/conteo que cambia
// Stock escribe una fila acá con la cantidad +/- aplicada.
const HOJA_MOVIMIENTOS = 'StockMovimientos';
const ENCABEZADOS_MOVIMIENTOS = [
  'ID', 'Fecha', 'Kiosko', 'Producto ID', 'Producto Nombre', 'Tipo',
  'Cantidad', 'Referencia', 'Registrado por', 'Registrado'
];

const HOJA_TOMA = 'TomaInventario';
const ENCABEZADOS_TOMA = [
  'ID', 'Kiosko', 'Fecha', 'Estado', 'Abierta por', 'Abierta en', 'Cerrada por', 'Cerrada en'
];

const HOJA_TOMA_DETALLE = 'TomaInventarioDetalle';
const ENCABEZADOS_TOMA_DETALLE = [
  'Toma ID', 'Producto ID', 'Producto Nombre', 'Categoría', 'Stock Esperado',
  'Cantidad Contada', 'Mínimo Recomendado', 'Diferencia', 'Notas'
];

const HOJA_RECETAS = 'Recetas';
const ENCABEZADOS_RECETAS = ['ID', 'Nombre de Venta', 'Kiosko', 'Activo', 'Actualizado'];

const HOJA_RECETAS_DETALLE = 'RecetasDetalle';
const ENCABEZADOS_RECETAS_DETALLE = [
  'Receta ID', 'Producto ID', 'Producto Nombre', 'Cantidad por Unidad Vendida', 'Unidad'
];

// Idempotencia del sync de ventas: una fila por línea de venta ya aplicada,
// para no descontar dos veces la misma venta si se corre el sync de nuevo
// sobre el mismo rango de fechas (mismo patrón que Control_Ordenes en
// Codigo-Square-completo-con-Descuentos.gs).
const HOJA_VENTAS_PROCESADAS = 'VentasProcesadas';
const ENCABEZADOS_VENTAS_PROCESADAS = [
  'Clave', 'Fecha', 'Kiosko', 'Producto Vendido', 'Cantidad', 'Procesado En'
];

function configurarHoja() {
  prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS);
  prepararHoja(HOJA_CATEGORIAS, ENCABEZADOS_CATEGORIAS);
  prepararHoja(HOJA_STOCK, ENCABEZADOS_STOCK);
  prepararHoja(HOJA_MOVIMIENTOS, ENCABEZADOS_MOVIMIENTOS);
  prepararHoja(HOJA_TOMA, ENCABEZADOS_TOMA);
  prepararHoja(HOJA_TOMA_DETALLE, ENCABEZADOS_TOMA_DETALLE);
  prepararHoja(HOJA_RECETAS, ENCABEZADOS_RECETAS);
  prepararHoja(HOJA_RECETAS_DETALLE, ENCABEZADOS_RECETAS_DETALLE);
  prepararHoja(HOJA_VENTAS_PROCESADAS, ENCABEZADOS_VENTAS_PROCESADAS);
}

// Corré esto UNA VEZ para que sincronizarVentasAutomatico() corra sola cada
// hora (borra cualquier trigger anterior de la misma función antes de crear
// el nuevo, para no duplicar).
function crearTriggerSincronizacion() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sincronizarVentasAutomatico') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sincronizarVentasAutomatico').timeBased().everyHours(1).create();
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

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hoyCR() {
  return Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd');
}

// Mapea las filas de una hoja a objetos usando la fila 1 como claves de encabezado.
function filasComoObjetos(hoja) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return [];
  const nCols = hoja.getLastColumn();
  const encabezados = hoja.getRange(1, 1, 1, nCols).getValues()[0];
  const datos = hoja.getRange(2, 1, nFilas, nCols).getValues();
  return datos.map(function(fila) {
    const obj = {};
    encabezados.forEach(function(h, i) {
      if (!h) return;
      let v = fila[i];
      if (v instanceof Date) v = Utilities.formatDate(v, 'America/Costa_Rica', 'yyyy-MM-dd');
      obj[h] = v;
    });
    return obj;
  });
}

// Escribe un objeto {NombreDeEncabezado: valor} en una fila, respetando el orden real de columnas.
function escribirFilaPorEncabezado(hoja, fila, encabezados, valores) {
  const datos = encabezados.map(function(h) { return (h in valores) ? valores[h] : ''; });
  hoja.getRange(fila, 1, 1, encabezados.length).setValues([datos]);
}

// Busca la fila (1-indexada) donde una columna tiene cierto valor. Devuelve -1 si no existe.
function filaPorValor(hoja, colNombre, valor, encabezados) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const col = encabezados.indexOf(colNombre) + 1;
  const valores = hoja.getRange(2, col, nFilas, 1).getValues();
  const buscado = String(valor);
  for (let i = 0; i < valores.length; i++) {
    if (String(valores[i][0]) === buscado) return i + 2;
  }
  return -1;
}

function leerColumnaComoSet(hoja, col) {
  const filas = hoja.getLastRow() - 1;
  if (filas <= 0) return new Set();
  return new Set(hoja.getRange(2, col, filas, 1).getValues().flat().map(String));
}

// ── doGet ──────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const modulo = (e && e.parameter && e.parameter.modulo) || 'productos';
    const kiosko = e && e.parameter && e.parameter.kiosko;

    if (modulo === 'productos') {
      return jsonOut({ ok: true, registros: filasComoObjetos(prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS)) });
    }
    if (modulo === 'categorias') {
      return jsonOut({ ok: true, registros: filasComoObjetos(prepararHoja(HOJA_CATEGORIAS, ENCABEZADOS_CATEGORIAS)) });
    }
    if (modulo === 'stock') {
      if (!kiosko) throw new Error('Falta el parámetro kiosko.');
      return jsonOut({ ok: true, registros: obtenerStockKiosko(kiosko) });
    }
    if (modulo === 'toma_activa') {
      if (!kiosko) throw new Error('Falta el parámetro kiosko.');
      return jsonOut(Object.assign({ ok: true }, obtenerTomaActiva(kiosko)));
    }
    if (modulo === 'toma_historial') {
      return jsonOut({ ok: true, registros: obtenerHistorialTomas(kiosko) });
    }
    if (modulo === 'recetas') {
      return jsonOut({ ok: true, registros: obtenerRecetasConDetalle() });
    }
    if (modulo === 'movimientos') {
      const producto = e.parameter.producto;
      const registros = filasComoObjetos(prepararHoja(HOJA_MOVIMIENTOS, ENCABEZADOS_MOVIMIENTOS))
        .filter(function(m) {
          return (!kiosko || String(m['Kiosko']) === String(kiosko)) &&
                 (!producto || String(m['Producto ID']) === String(producto));
        })
        .sort(function(a, b) { return String(b['Registrado']).localeCompare(String(a['Registrado'])); });
      return jsonOut({ ok: true, registros: registros });
    }
    return jsonOut({ ok: false, error: 'Módulo no reconocido: ' + modulo });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// ── doPost ─────────────────────────────────────────────────────────
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
      case 'producto_guardar':    return jsonOut(guardarProducto(payload));
      case 'categoria_guardar':   return jsonOut(guardarCategoria(payload));
      case 'stock_ajustar':       return jsonOut(ajustarStock(payload));
      case 'toma_iniciar':        return jsonOut(iniciarToma(payload));
      case 'toma_guardar_conteo': return jsonOut(guardarConteo(payload));
      case 'toma_cerrar':         return jsonOut(cerrarToma(payload));
      case 'receta_guardar':      return jsonOut(guardarReceta(payload));
      case 'receta_eliminar':     return jsonOut(eliminarReceta(payload));
      case 'sincronizar_ventas':  return jsonOut(sincronizarVentas(payload));
      default: throw new Error('Acción no reconocida: ' + payload.accion);
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// ── PRODUCTOS ──────────────────────────────────────────────────────
function guardarProducto(p) {
  if (!p.nombreInterno) throw new Error('Falta el nombre interno del producto.');
  const hoja = prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS);
  const filaExistente = p.id ? filaPorValor(hoja, 'ID', p.id, ENCABEZADOS_PRODUCTOS) : -1;
  const id = p.id || Date.now();
  const fila = filaExistente > 0 ? filaExistente : hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PRODUCTOS, {
    'ID': id,
    'Nombre Interno': p.nombreInterno,
    'Nombre Facturación': p.nombreFacturacion || '',
    'Nombre Compra': p.nombreCompra || '',
    'Nombre Venta': p.nombreVenta || '',
    'Categoría': p.categoria || '',
    'Unidad': p.unidad || 'unidad',
    'Mínimo Recomendado': Number(p.minimoRecomendado) || 0,
    'Activo': p.activo === false ? false : true,
    'Actualizado': new Date().toISOString()
  });
  return { ok: true, id: id, fila: fila };
}

// ── CATEGORÍAS ─────────────────────────────────────────────────────
function guardarCategoria(p) {
  if (!p.nombre) throw new Error('Falta el nombre de la categoría.');
  const hoja = prepararHoja(HOJA_CATEGORIAS, ENCABEZADOS_CATEGORIAS);
  const filaExistente = filaPorValor(hoja, 'Nombre', p.nombre, ENCABEZADOS_CATEGORIAS);
  const fila = filaExistente > 0 ? filaExistente : hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_CATEGORIAS, {
    'Nombre': p.nombre,
    'Orden': p.orden !== undefined && p.orden !== '' ? Number(p.orden) : fila,
    'Activo': p.activo === false ? false : true
  });
  return { ok: true, fila: fila };
}

// ── STOCK ──────────────────────────────────────────────────────────
// Busca la fila (1-indexada) de Stock para una combinación Producto+Kiosko.
function filaStock(hoja, productoId, kiosko) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const datos = hoja.getRange(2, 1, nFilas, 2).getValues();
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][0]) === String(productoId) && String(datos[i][1]) === String(kiosko)) return i + 2;
  }
  return -1;
}

function obtenerStock(productoId, kiosko) {
  const hoja = prepararHoja(HOJA_STOCK, ENCABEZADOS_STOCK);
  const fila = filaStock(hoja, productoId, kiosko);
  if (fila === -1) return 0;
  const colCant = ENCABEZADOS_STOCK.indexOf('Cantidad Actual') + 1;
  return Number(hoja.getRange(fila, colCant).getValue()) || 0;
}

function fijarStock(productoId, kiosko, nuevaCantidad) {
  const hoja = prepararHoja(HOJA_STOCK, ENCABEZADOS_STOCK);
  const fila = filaStock(hoja, productoId, kiosko);
  const filaDestino = fila > 0 ? fila : hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, filaDestino, ENCABEZADOS_STOCK, {
    'Producto ID': productoId,
    'Kiosko': kiosko,
    'Cantidad Actual': nuevaCantidad,
    'Actualizado': new Date().toISOString()
  });
}

// Aplica un delta (+/-) al stock actual y deja el rastro en StockMovimientos.
// Devuelve la cantidad resultante.
function registrarMovimiento(kiosko, productoId, productoNombre, tipo, cantidadDelta, referencia, registradoPor) {
  const nuevo = obtenerStock(productoId, kiosko) + Number(cantidadDelta);
  fijarStock(productoId, kiosko, nuevo);
  const hojaMov = prepararHoja(HOJA_MOVIMIENTOS, ENCABEZADOS_MOVIMIENTOS);
  const fila = hojaMov.getLastRow() + 1;
  escribirFilaPorEncabezado(hojaMov, fila, ENCABEZADOS_MOVIMIENTOS, {
    'ID': Date.now() + '_' + Math.floor(Math.random() * 1000),
    'Fecha': hoyCR(),
    'Kiosko': kiosko,
    'Producto ID': productoId,
    'Producto Nombre': productoNombre || '',
    'Tipo': tipo,
    'Cantidad': cantidadDelta,
    'Referencia': referencia || '',
    'Registrado por': registradoPor || '',
    'Registrado': new Date().toISOString()
  });
  return nuevo;
}

function ajustarStock(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.productoId) throw new Error('Falta el producto.');
  if (p.cantidad === undefined || p.cantidad === null || p.cantidad === '') {
    throw new Error('Falta la cantidad del ajuste.');
  }
  const nuevo = registrarMovimiento(
    p.kiosko, p.productoId, p.productoNombre || '', 'Ajuste Manual',
    Number(p.cantidad), p.nota || '', p.registrado_por || ''
  );
  return { ok: true, stockActual: nuevo };
}

// Stock actual de todos los productos activos para un kiosko, con el mínimo
// recomendado y la bandera de bajo-mínimo — alimenta la pestaña Historial/
// Stock de inventario.html.
function obtenerStockKiosko(kiosko) {
  const productos = filasComoObjetos(prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS))
    .filter(function(p) { return p['Activo'] !== false; });
  return productos.map(function(prod) {
    const cantidad = obtenerStock(prod['ID'], kiosko);
    const minimo = Number(prod['Mínimo Recomendado']) || 0;
    return {
      productoId: prod['ID'],
      nombre: prod['Nombre Interno'],
      categoria: prod['Categoría'],
      unidad: prod['Unidad'],
      minimoRecomendado: minimo,
      cantidadActual: cantidad,
      bajoMinimo: cantidad < minimo
    };
  });
}

// ── TOMA DE INVENTARIO ─────────────────────────────────────────────
function tomaAbierta(kiosko) {
  const filas = filasComoObjetos(prepararHoja(HOJA_TOMA, ENCABEZADOS_TOMA));
  return filas.find(function(t) { return String(t['Kiosko']) === String(kiosko) && t['Estado'] === 'Abierta'; }) || null;
}

function obtenerTomaActiva(kiosko) {
  const toma = tomaAbierta(kiosko);
  if (!toma) return { toma: null, detalle: [] };
  const detalle = filasComoObjetos(prepararHoja(HOJA_TOMA_DETALLE, ENCABEZADOS_TOMA_DETALLE))
    .filter(function(d) { return String(d['Toma ID']) === String(toma['ID']); });
  return { toma: toma, detalle: detalle };
}

function iniciarToma(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (tomaAbierta(p.kiosko)) {
    throw new Error('Ya hay una toma de inventario abierta para ' + p.kiosko + '. Cerrala antes de iniciar una nueva.');
  }
  const hoja = prepararHoja(HOJA_TOMA, ENCABEZADOS_TOMA);
  const id = Date.now();
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_TOMA, {
    'ID': id,
    'Kiosko': p.kiosko,
    'Fecha': p.fecha || hoyCR(),
    'Estado': 'Abierta',
    'Abierta por': p.usuario || '',
    'Abierta en': new Date().toISOString(),
    'Cerrada por': '',
    'Cerrada en': ''
  });

  // Snapshot: una fila de detalle por cada producto activo, con el stock
  // actual como "Stock Esperado" (referencia — el cierre usa lo contado).
  const productos = filasComoObjetos(prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS))
    .filter(function(prod) { return prod['Activo'] !== false; });
  const hojaDet = prepararHoja(HOJA_TOMA_DETALLE, ENCABEZADOS_TOMA_DETALLE);
  let filaDet = hojaDet.getLastRow() + 1;
  productos.forEach(function(prod) {
    escribirFilaPorEncabezado(hojaDet, filaDet, ENCABEZADOS_TOMA_DETALLE, {
      'Toma ID': id,
      'Producto ID': prod['ID'],
      'Producto Nombre': prod['Nombre Interno'],
      'Categoría': prod['Categoría'],
      'Stock Esperado': obtenerStock(prod['ID'], p.kiosko),
      'Cantidad Contada': '',
      'Mínimo Recomendado': Number(prod['Mínimo Recomendado']) || 0,
      'Diferencia': '',
      'Notas': ''
    });
    filaDet++;
  });
  return { ok: true, id: id };
}

// Guarda (o actualiza) el conteo de una o varias líneas de una toma abierta.
// Rechazado por el backend si la toma ya está Cerrada — no solo la UI la
// bloquea.
function guardarConteo(p) {
  if (!p.tomaId) throw new Error('Falta el ID de la toma.');
  if (!p.lineas || !p.lineas.length) throw new Error('No se recibieron líneas de conteo.');

  const hojaToma = prepararHoja(HOJA_TOMA, ENCABEZADOS_TOMA);
  const filaToma = filaPorValor(hojaToma, 'ID', p.tomaId, ENCABEZADOS_TOMA);
  if (filaToma === -1) throw new Error('No se encontró la toma ' + p.tomaId);
  const colEstado = ENCABEZADOS_TOMA.indexOf('Estado') + 1;
  if (hojaToma.getRange(filaToma, colEstado).getValue() !== 'Abierta') {
    throw new Error('Esta toma ya está cerrada, no se pueden guardar más conteos.');
  }

  const hojaDet = prepararHoja(HOJA_TOMA_DETALLE, ENCABEZADOS_TOMA_DETALLE);
  const nFilas = hojaDet.getLastRow() - 1;
  const colTomaId = ENCABEZADOS_TOMA_DETALLE.indexOf('Toma ID') + 1;
  const colProdId = ENCABEZADOS_TOMA_DETALLE.indexOf('Producto ID') + 1;
  const colEsperado = ENCABEZADOS_TOMA_DETALLE.indexOf('Stock Esperado') + 1;
  const colContada = ENCABEZADOS_TOMA_DETALLE.indexOf('Cantidad Contada') + 1;
  const colDiferencia = ENCABEZADOS_TOMA_DETALLE.indexOf('Diferencia') + 1;
  const colNotas = ENCABEZADOS_TOMA_DETALLE.indexOf('Notas') + 1;
  const tomaIds = nFilas > 0 ? hojaDet.getRange(2, colTomaId, nFilas, 1).getValues() : [];
  const prodIds = nFilas > 0 ? hojaDet.getRange(2, colProdId, nFilas, 1).getValues() : [];

  p.lineas.forEach(function(linea) {
    let filaDet = -1;
    for (let i = 0; i < tomaIds.length; i++) {
      if (String(tomaIds[i][0]) === String(p.tomaId) && String(prodIds[i][0]) === String(linea.productoId)) {
        filaDet = i + 2;
        break;
      }
    }
    if (filaDet === -1) return;
    const esperado = Number(hojaDet.getRange(filaDet, colEsperado).getValue()) || 0;
    const contada = Number(linea.cantidadContada);
    hojaDet.getRange(filaDet, colContada).setValue(isNaN(contada) ? '' : contada);
    hojaDet.getRange(filaDet, colDiferencia).setValue(isNaN(contada) ? '' : (contada - esperado));
    if (linea.notas !== undefined) hojaDet.getRange(filaDet, colNotas).setValue(linea.notas);
  });
  return { ok: true };
}

// Cierra una toma de forma permanente: exige el PIN de administrador
// (Script Properties ADMIN_PIN, además del PIN de rol admin que la UI ya
// pide antes de llamar acá), aplica los ajustes de stock por conteo y
// bloquea cualquier cambio posterior — no hay "reabrir".
function cerrarToma(p) {
  if (!p.tomaId) throw new Error('Falta el ID de la toma.');
  const pinEsperado = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || 'admin';
  if (String(p.pin) !== String(pinEsperado)) throw new Error('Código de administrador incorrecto.');

  const hojaToma = prepararHoja(HOJA_TOMA, ENCABEZADOS_TOMA);
  const filaToma = filaPorValor(hojaToma, 'ID', p.tomaId, ENCABEZADOS_TOMA);
  if (filaToma === -1) throw new Error('No se encontró la toma ' + p.tomaId);
  const colEstado = ENCABEZADOS_TOMA.indexOf('Estado') + 1;
  if (hojaToma.getRange(filaToma, colEstado).getValue() !== 'Abierta') {
    throw new Error('Esta toma ya está cerrada.');
  }
  const colKiosko = ENCABEZADOS_TOMA.indexOf('Kiosko') + 1;
  const kiosko = hojaToma.getRange(filaToma, colKiosko).getValue();

  const detalle = filasComoObjetos(prepararHoja(HOJA_TOMA_DETALLE, ENCABEZADOS_TOMA_DETALLE))
    .filter(function(d) { return String(d['Toma ID']) === String(p.tomaId); });
  detalle.forEach(function(linea) {
    if (linea['Cantidad Contada'] === '' || linea['Cantidad Contada'] === null || linea['Cantidad Contada'] === undefined) return;
    const contada = Number(linea['Cantidad Contada']);
    const esperado = Number(linea['Stock Esperado']) || 0;
    const diferencia = contada - esperado;
    if (diferencia !== 0) {
      registrarMovimiento(kiosko, linea['Producto ID'], linea['Producto Nombre'], 'Conteo', diferencia, 'Toma ' + p.tomaId, p.usuario || '');
    }
  });

  hojaToma.getRange(filaToma, colEstado).setValue('Cerrada');
  hojaToma.getRange(filaToma, ENCABEZADOS_TOMA.indexOf('Cerrada por') + 1).setValue(p.usuario || '');
  hojaToma.getRange(filaToma, ENCABEZADOS_TOMA.indexOf('Cerrada en') + 1).setValue(new Date().toISOString());
  return { ok: true };
}

function obtenerHistorialTomas(kiosko) {
  const tomas = filasComoObjetos(prepararHoja(HOJA_TOMA, ENCABEZADOS_TOMA)).filter(function(t) {
    return t['Estado'] === 'Cerrada' && (!kiosko || String(t['Kiosko']) === String(kiosko));
  });
  const detalleTodo = filasComoObjetos(prepararHoja(HOJA_TOMA_DETALLE, ENCABEZADOS_TOMA_DETALLE));
  return tomas.map(function(t) {
    return Object.assign({}, t, {
      detalle: detalleTodo.filter(function(d) { return String(d['Toma ID']) === String(t['ID']); })
    });
  }).sort(function(a, b) { return String(b['Fecha']).localeCompare(String(a['Fecha'])); });
}

// ── RECETAS ────────────────────────────────────────────────────────
function guardarReceta(p) {
  if (!p.nombreVenta) throw new Error('Falta el nombre de venta de la receta.');
  if (!p.ingredientes || !p.ingredientes.length) throw new Error('La receta necesita al menos un ingrediente.');

  const hoja = prepararHoja(HOJA_RECETAS, ENCABEZADOS_RECETAS);
  const filaExistente = p.id ? filaPorValor(hoja, 'ID', p.id, ENCABEZADOS_RECETAS) : -1;
  const id = p.id || Date.now();
  const fila = filaExistente > 0 ? filaExistente : hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_RECETAS, {
    'ID': id,
    'Nombre de Venta': p.nombreVenta,
    'Kiosko': p.kiosko || '',
    'Activo': p.activo === false ? false : true,
    'Actualizado': new Date().toISOString()
  });

  const hojaDet = prepararHoja(HOJA_RECETAS_DETALLE, ENCABEZADOS_RECETAS_DETALLE);
  if (filaExistente > 0) borrarLineasReceta(hojaDet, id);
  let filaDet = hojaDet.getLastRow() + 1;
  p.ingredientes.forEach(function(ing) {
    escribirFilaPorEncabezado(hojaDet, filaDet, ENCABEZADOS_RECETAS_DETALLE, {
      'Receta ID': id,
      'Producto ID': ing.productoId,
      'Producto Nombre': ing.productoNombre || '',
      'Cantidad por Unidad Vendida': Number(ing.cantidad) || 0,
      'Unidad': ing.unidad || ''
    });
    filaDet++;
  });
  return { ok: true, id: id };
}

// Vacía (sin compactar) las filas de ingredientes de una receta para que
// guardarReceta las reescriba completas — evita mezclar ingredientes viejos
// con los nuevos al editar.
function borrarLineasReceta(hojaDet, recetaId) {
  const nFilas = hojaDet.getLastRow() - 1;
  if (nFilas <= 0) return;
  const colRecetaId = ENCABEZADOS_RECETAS_DETALLE.indexOf('Receta ID') + 1;
  const ids = hojaDet.getRange(2, colRecetaId, nFilas, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(recetaId)) {
      hojaDet.getRange(i + 2, 1, 1, ENCABEZADOS_RECETAS_DETALLE.length).clearContent();
    }
  }
}

// Baja lógica (Activo = false) — igual que Productos/Categorias, para no
// perder el historial de RecetasDetalle ni de VentasProcesadas.
function eliminarReceta(p) {
  if (!p.id) throw new Error('Falta el ID de la receta.');
  const hoja = prepararHoja(HOJA_RECETAS, ENCABEZADOS_RECETAS);
  const fila = filaPorValor(hoja, 'ID', p.id, ENCABEZADOS_RECETAS);
  if (fila === -1) throw new Error('No se encontró la receta ' + p.id);
  hoja.getRange(fila, ENCABEZADOS_RECETAS.indexOf('Activo') + 1).setValue(false);
  return { ok: true };
}

function obtenerRecetasConDetalle() {
  const recetas = filasComoObjetos(prepararHoja(HOJA_RECETAS, ENCABEZADOS_RECETAS));
  const detalleTodo = filasComoObjetos(prepararHoja(HOJA_RECETAS_DETALLE, ENCABEZADOS_RECETAS_DETALLE))
    .filter(function(d) { return d['Receta ID']; });
  return recetas.map(function(r) {
    return Object.assign({}, r, {
      ingredientes: detalleTodo.filter(function(d) { return String(d['Receta ID']) === String(r['ID']); })
    });
  });
}

// ── SINCRONIZACIÓN DE VENTAS (Square → consumo por receta) ────────
// Trae las líneas de venta nuevas desde el Web App de
// Codigo-Square-completo-con-Descuentos.gs (?action=ventasPorProducto), y
// por cada una: si el nombre vendido matchea una Receta activa, descuenta
// cada ingrediente × cantidad vendida; si no, si matchea el "Nombre Venta"
// de un Producto, lo descuenta 1:1 (venta directa, sin receta); si no
// matchea nada, se reporta en "sinMapear" sin fallar. Cada línea aplicada
// queda registrada en VentasProcesadas para no volver a aplicarla si el
// sync se corre otra vez sobre el mismo rango.
function sincronizarVentas(p) {
  if (!SQUARE_URL) throw new Error('Falta configurar SQUARE_URL en el código (URL del Web App de Square con la acción ventasPorProducto).');

  const hasta = hoyCR();
  const desde = (p && p.desde) || Utilities.formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'America/Costa_Rica', 'yyyy-MM-dd');
  let url = SQUARE_URL + '?action=ventasPorProducto&desde=' + encodeURIComponent(desde) + '&hasta=' + encodeURIComponent(hasta);
  if (p && p.kiosko) url += '&kiosko=' + encodeURIComponent(p.kiosko);

  const respuesta = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const datos = JSON.parse(respuesta.getContentText());
  if (!datos.ok) throw new Error('Error consultando Square: ' + (datos.error || 'desconocido'));
  const lineas = datos.ventas || [];

  const hojaProc = prepararHoja(HOJA_VENTAS_PROCESADAS, ENCABEZADOS_VENTAS_PROCESADAS);
  const procesadas = leerColumnaComoSet(hojaProc, ENCABEZADOS_VENTAS_PROCESADAS.indexOf('Clave') + 1);
  const recetas = obtenerRecetasConDetalle().filter(function(r) { return r['Activo'] !== false; });
  const productos = filasComoObjetos(prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS));

  let procesadasNuevas = 0;
  const sinMapear = [];
  let filaProc = hojaProc.getLastRow() + 1;

  lineas.forEach(function(linea) {
    const clave = [linea.orderId, linea.producto, linea.fecha, linea.hora || ''].join('|');
    if (procesadas.has(clave)) return;

    const nombreVendido = String(linea.producto || '').trim();
    const cantidadVendida = Number(linea.cantidad) || 0;
    const receta = recetas.find(function(r) {
      return String(r['Nombre de Venta']).trim() === nombreVendido && (!r['Kiosko'] || r['Kiosko'] === linea.kiosko);
    });

    if (receta) {
      receta.ingredientes.forEach(function(ing) {
        registrarMovimiento(
          linea.kiosko, ing['Producto ID'], ing['Producto Nombre'], 'Consumo Venta',
          -Math.abs(Number(ing['Cantidad por Unidad Vendida']) || 0) * cantidadVendida,
          'Venta ' + linea.orderId, 'Sync Square'
        );
      });
    } else {
      const productoDirecto = productos.find(function(prod) { return String(prod['Nombre Venta']).trim() === nombreVendido; });
      if (productoDirecto) {
        registrarMovimiento(
          linea.kiosko, productoDirecto['ID'], productoDirecto['Nombre Interno'], 'Consumo Venta',
          -Math.abs(cantidadVendida), 'Venta ' + linea.orderId, 'Sync Square'
        );
      } else {
        sinMapear.push(nombreVendido);
      }
    }

    escribirFilaPorEncabezado(hojaProc, filaProc, ENCABEZADOS_VENTAS_PROCESADAS, {
      'Clave': clave,
      'Fecha': linea.fecha,
      'Kiosko': linea.kiosko,
      'Producto Vendido': nombreVendido,
      'Cantidad': cantidadVendida,
      'Procesado En': new Date().toISOString()
    });
    filaProc++;
    procesadasNuevas++;
  });

  return {
    ok: true,
    lineasProcesadas: procesadasNuevas,
    totalLineasRecibidas: lineas.length,
    sinMapear: Array.from(new Set(sinMapear))
  };
}

function sincronizarVentasAutomatico() {
  sincronizarVentas({});
}
