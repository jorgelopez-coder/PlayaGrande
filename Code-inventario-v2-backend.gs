/**
 * Backend Apps Script para el Sheet "Inventario Kioskos v2" — rediseño
 * completo del módulo de inventario (ver Diseno-Inventario-v2.md):
 *
 *  - Productos con DOS tipos de control: 'unitario' (conteo de unidades:
 *    cerveza en botella, gaseosas…) y 'peso' (báscula: sifón y destilados,
 *    con tara del envase y densidad para convertir gramos → ml).
 *  - Mínimos y nivel objetivo POR KIOSKO (hoja Minimos), no globales.
 *  - Compras: manuales o automáticas leyendo los XML de factura electrónica
 *    (Hacienda v4.4) que llegan a Gmail; las líneas se mapean a productos
 *    vía MapeoFacturas (se aprende una vez por proveedor+texto).
 *  - Toma de inventario: conteo para unitarios; para peso, envases cerrados
 *    + peso del abierto con FOTO de la báscula como evidencia (Drive) y
 *    extracción del número por IA (Web App de Code-mermas-extractor.gs).
 *  - Resultados: diferencia contado vs teórico en unidad base y en colones.
 *  - Órdenes de compra sugeridas por mínimos, agrupadas por proveedor.
 *  - Recetas + sync de ventas Square (mismo mecanismo probado del v1).
 *
 * ── Catálogo = Maestro de Productos (decidido 2026-07-27) ────────────
 * Este backend YA NO tiene su propio ID de producto ni su propia hoja de
 * Categorías. La clave de cada producto es su **"Producto"** (= el "Nombre
 * Estándar" ya homologado en `maestro-productos.html` / hoja
 * "Maestro_Productos" del Sheet "Cuentas por Pagar - Kioskos"). El alta de
 * un producto en Inventario (hoja Productos de este Sheet) solo agrega los
 * atributos que el Maestro no tiene: Tipo de Control, Unidad Base,
 * Contenido de envase, Tara, Densidad, Costo por unidad base, Proveedor
 * habitual, Nombre de venta directa. Área de negocio y Categoría YA NO se
 * guardan acá — el frontend (inventario.html) las trae en vivo del Maestro
 * (lectura pública `gviz` del Sheet, mismo mecanismo de
 * `maestro-productos.html`) y las usa para agrupar. Este backend nunca
 * necesita leer el Sheet del Maestro: solo recibe el nombre ya elegido por
 * el usuario (un string) y lo trata como clave opaca.
 *
 * IMPORTANTE — limitación conocida de este diseño: si más adelante se
 * corrige/renombra un "Nombre Estándar" en el Maestro (pestaña
 * Homologación de `maestro-productos.html`), las filas ya guardadas acá
 * (Productos, Stock, Mínimos, Movimientos, Tomas, Compras, Mapeos, Órdenes
 * de Compra) que usaban el nombre viejo NO se actualizan solas y quedan
 * huérfanas del nuevo nombre. Si eso pasa, hay que dar de alta el producto
 * de nuevo acá con el nombre corregido (y trasladar mínimos/stock a mano).
 *
 * Cómo desplegarlo:
 * 1. Creá un Google Sheet nuevo "Inventario Kioskos v2" > Extensiones >
 *    Apps Script y pegá este código completo.
 * 2. Corré UNA VEZ configurarHoja() (crea las 15 pestañas). Autorizá los
 *    permisos (Sheets, Drive, Gmail, UrlFetch).
 * 3. Propiedades del script: ADMIN_PIN (para "Cerrar toma"; default 'admin').
 * 4. Completá SQUARE_URLS abajo (una URL por kiosko con Square propio).
 * 5. Implementar > Nueva implementación > Aplicación web > Ejecutar como Yo,
 *    Acceso: Cualquiera. Pegá la URL /exec en inventario.html, compras.html
 *    y recetas.html (constante INVENTARIO_V2_URL).
 * 6. (Opcional) crearTriggers() UNA VEZ: sync de ventas y lector de facturas
 *    Gmail cada hora.
 *
 * Si se agregan columnas nuevas: siempre al FINAL del ENCABEZADOS_*, nueva
 * versión del deployment y configurarHoja() de nuevo.
 */

// ── CONFIG ─────────────────────────────────────────────────────────
// Web Apps de Codigo-Square-completo-con-Descuentos.gs por kiosko (cada
// kiosko con Square propio tiene su propio Sheet + Web App). Los kioskos que
// no estén acá simplemente no descuentan por venta.
const SQUARE_URLS = {
  // 'Playa Grande': 'https://script.google.com/macros/s/XXXXX/exec',
  // 'Liberia': 'https://script.google.com/macros/s/XXXXX/exec',
};

// Búsqueda de Gmail para el lector de facturas electrónicas. Ajustá la
// etiqueta/remitentes a cómo reciben las facturas.
const GMAIL_QUERY = 'has:attachment filename:xml newer_than:7d';
const GMAIL_MAX_HILOS = 25;

// ── HOJAS ──────────────────────────────────────────────────────────
// 'Producto' = Nombre Estándar homologado en el Maestro de Productos.
const HOJA_PRODUCTOS = 'Productos';
const ENCABEZADOS_PRODUCTOS = [
  'Producto', 'Tipo Control', 'Unidad Base',
  'Contenido Envase (ml)', 'Tara (g)', 'Densidad (g/ml)',
  'Costo Unidad Base', 'Proveedor', 'Nombre Venta', 'Activo', 'Actualizado'
];

// Mínimo y nivel objetivo por producto×kiosko (upsert).
const HOJA_MINIMOS = 'Minimos';
const ENCABEZADOS_MINIMOS = ['Producto', 'Kiosko', 'Mínimo', 'Nivel Objetivo', 'Actualizado'];

const HOJA_STOCK = 'Stock';
const ENCABEZADOS_STOCK = ['Producto', 'Kiosko', 'Cantidad Actual', 'Actualizado'];

const HOJA_MOVIMIENTOS = 'StockMovimientos';
const ENCABEZADOS_MOVIMIENTOS = [
  'ID', 'Fecha', 'Kiosko', 'Producto', 'Tipo',
  'Cantidad', 'Referencia', 'Registrado por', 'Registrado'
];

const HOJA_PROVEEDORES = 'Proveedores';
const ENCABEZADOS_PROVEEDORES = [
  'ID', 'Nombre', 'Cédula', 'Correo Pedidos', 'Teléfono', 'Activo', 'Actualizado'
];

const HOJA_COMPRAS = 'Compras';
const ENCABEZADOS_COMPRAS = [
  'ID', 'Fecha', 'Kiosko', 'Proveedor', 'Proveedor Cédula', 'Nº Factura',
  'Clave Hacienda', 'Origen', 'Total', 'Estado', 'Registrado por', 'Registrado'
];

const HOJA_COMPRAS_DETALLE = 'ComprasDetalle';
const ENCABEZADOS_COMPRAS_DETALLE = [
  'Compra ID', 'Línea Nº', 'Línea Original', 'Cantidad Factura',
  'Producto', 'Cantidad Base', 'Costo Línea'
];

// Mapeo aprendido: texto de línea de factura de un proveedor → producto +
// factor (cuántas unidades base entran por 1 unidad de factura, ej. caja
// de 24 botellas → factor 24; caja de 12 botellas de ron 750ml → factor
// 12×750=9000 ml si el producto es de tipo peso).
const HOJA_MAPEOS = 'MapeoFacturas';
const ENCABEZADOS_MAPEOS = ['Proveedor Cédula', 'Texto Línea', 'Producto', 'Factor', 'Actualizado'];

const HOJA_RECETAS = 'Recetas';
const ENCABEZADOS_RECETAS = ['ID', 'Nombre de Venta', 'Kiosko', 'Activo', 'Actualizado'];

// NOTA: RecetasDetalle todavía referencia 'Producto ID'/'Producto Nombre'
// tal como venían del catálogo de ingredientes que usa hoy recetas.html
// (Base de Productos, módulo descontinuado — ver
// project_recetas_ingredientes_base_productos en la memoria). Homologar
// esto al mismo esquema "Producto" (Nombre Estándar) de acá es un cambio
// aparte, pendiente de decidir con Jorge (no tocado hoy).
const HOJA_RECETAS_DETALLE = 'RecetasDetalle';
const ENCABEZADOS_RECETAS_DETALLE = [
  'Receta ID', 'Producto ID', 'Producto Nombre', 'Cantidad por Unidad Vendida'
];

const HOJA_VENTAS_PROCESADAS = 'VentasProcesadas';
const ENCABEZADOS_VENTAS_PROCESADAS = [
  'Clave', 'Fecha', 'Kiosko', 'Producto Vendido', 'Cantidad', 'Procesado En'
];

const HOJA_TOMA = 'TomaInventario';
const ENCABEZADOS_TOMA = [
  'ID', 'Kiosko', 'Fecha', 'Estado', 'Abierta por', 'Abierta en', 'Cerrada por', 'Cerrada en'
];

// Nota: ya no se cachea Categoría/Área acá — inventario.html las agrupa en
// vivo contra el Maestro usando el campo 'Producto' (Nombre Estándar).
const HOJA_TOMA_DETALLE = 'TomaDetalle';
const ENCABEZADOS_TOMA_DETALLE = [
  'Toma ID', 'Producto', 'Tipo Control',
  'Stock Teórico', 'Envases Cerrados', 'Peso Bruto (g)', 'Neto (ml)',
  'Total Contado', 'Mínimo', 'Diferencia', 'Diferencia Colones', 'Foto URL', 'Notas'
];

const HOJA_OC = 'OrdenesCompra';
const ENCABEZADOS_OC = [
  'ID', 'Fecha', 'Kiosko', 'Proveedor', 'Estado', 'Generada por', 'Registrado'
];

const HOJA_OC_DETALLE = 'OrdenesCompraDetalle';
const ENCABEZADOS_OC_DETALLE = [
  'OC ID', 'Producto', 'Stock al Generar', 'Mínimo',
  'Sugerido', 'Cantidad Final', 'Compra ID Recepción'
];

function configurarHoja() {
  [[HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS],
   [HOJA_MINIMOS, ENCABEZADOS_MINIMOS], [HOJA_STOCK, ENCABEZADOS_STOCK],
   [HOJA_MOVIMIENTOS, ENCABEZADOS_MOVIMIENTOS], [HOJA_PROVEEDORES, ENCABEZADOS_PROVEEDORES],
   [HOJA_COMPRAS, ENCABEZADOS_COMPRAS], [HOJA_COMPRAS_DETALLE, ENCABEZADOS_COMPRAS_DETALLE],
   [HOJA_MAPEOS, ENCABEZADOS_MAPEOS], [HOJA_RECETAS, ENCABEZADOS_RECETAS],
   [HOJA_RECETAS_DETALLE, ENCABEZADOS_RECETAS_DETALLE], [HOJA_VENTAS_PROCESADAS, ENCABEZADOS_VENTAS_PROCESADAS],
   [HOJA_TOMA, ENCABEZADOS_TOMA], [HOJA_TOMA_DETALLE, ENCABEZADOS_TOMA_DETALLE],
   [HOJA_OC, ENCABEZADOS_OC], [HOJA_OC_DETALLE, ENCABEZADOS_OC_DETALLE]
  ].forEach(function(par) { prepararHoja(par[0], par[1]); });
}

// Triggers horarios: sync de ventas Square + lector de facturas Gmail.
function crearTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (['sincronizarVentasAutomatico', 'procesarFacturasAutomatico'].indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('sincronizarVentasAutomatico').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('procesarFacturasAutomatico').timeBased().everyHours(1).create();
}

// ── UTILIDADES (mismo patrón del ecosistema) ───────────────────────
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

function escribirFilaPorEncabezado(hoja, fila, encabezados, valores) {
  const datos = encabezados.map(function(h) { return (h in valores) ? valores[h] : ''; });
  hoja.getRange(fila, 1, 1, encabezados.length).setValues([datos]);
}

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

function normalizarTexto(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Clave de producto: se compara con trim (no case-insensitive) porque debe
// coincidir EXACTO con el "Nombre Estándar" tal cual está en el Maestro.
function productoPorNombre(nombre) {
  const buscado = String(nombre || '').trim();
  if (!buscado) return null;
  return filasComoObjetos(prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS))
    .find(function(p) { return String(p['Producto']).trim() === buscado; }) || null;
}

// ── doGet ──────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const modulo = (e && e.parameter && e.parameter.modulo) || 'productos';
    const kiosko = e && e.parameter && e.parameter.kiosko;

    if (modulo === 'productos')   return jsonOut({ ok: true, registros: filasComoObjetos(prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS)) });
    if (modulo === 'proveedores') return jsonOut({ ok: true, registros: filasComoObjetos(prepararHoja(HOJA_PROVEEDORES, ENCABEZADOS_PROVEEDORES)) });
    if (modulo === 'minimos')     return jsonOut({ ok: true, registros: filasComoObjetos(prepararHoja(HOJA_MINIMOS, ENCABEZADOS_MINIMOS)).filter(function(m) { return !kiosko || String(m['Kiosko']) === String(kiosko); }) });
    if (modulo === 'mapeos')      return jsonOut({ ok: true, registros: filasComoObjetos(prepararHoja(HOJA_MAPEOS, ENCABEZADOS_MAPEOS)) });
    if (modulo === 'recetas')     return jsonOut({ ok: true, registros: obtenerRecetasConDetalle() });

    if (modulo === 'stock') {
      if (!kiosko) throw new Error('Falta el parámetro kiosko.');
      return jsonOut({ ok: true, registros: obtenerStockKiosko(kiosko) });
    }
    if (modulo === 'movimientos') {
      const producto = e.parameter.producto;
      const registros = filasComoObjetos(prepararHoja(HOJA_MOVIMIENTOS, ENCABEZADOS_MOVIMIENTOS))
        .filter(function(m) {
          return (!kiosko || String(m['Kiosko']) === String(kiosko)) &&
                 (!producto || String(m['Producto']) === String(producto));
        })
        .sort(function(a, b) { return String(b['Registrado']).localeCompare(String(a['Registrado'])); });
      return jsonOut({ ok: true, registros: registros });
    }
    if (modulo === 'toma_activa') {
      if (!kiosko) throw new Error('Falta el parámetro kiosko.');
      return jsonOut(Object.assign({ ok: true }, obtenerTomaActiva(kiosko)));
    }
    if (modulo === 'toma_historial') {
      return jsonOut({ ok: true, registros: obtenerHistorialTomas(kiosko) });
    }
    if (modulo === 'compras') {
      const estado = e.parameter.estado;
      return jsonOut({ ok: true, registros: obtenerComprasConDetalle(estado) });
    }
    if (modulo === 'ordenes') {
      return jsonOut({ ok: true, registros: obtenerOCConDetalle(kiosko) });
    }
    if (modulo === 'oc_sugerido') {
      if (!kiosko) throw new Error('Falta el parámetro kiosko.');
      return jsonOut({ ok: true, registros: sugerirOrdenCompra(kiosko) });
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
    if (!payload && e.parameter && e.parameter.data) payload = JSON.parse(e.parameter.data);
    if (!payload) throw new Error('No se recibieron datos.');

    switch (payload.accion) {
      case 'producto_guardar':      return jsonOut(guardarProducto(payload));
      case 'proveedor_guardar':     return jsonOut(guardarProveedor(payload));
      case 'minimo_guardar':        return jsonOut(guardarMinimo(payload));
      case 'stock_ajustar':         return jsonOut(ajustarStock(payload));
      case 'compra_manual':         return jsonOut(registrarCompraManual(payload));
      case 'compra_mapear_linea':   return jsonOut(mapearLineaCompra(payload));
      case 'compra_aplicar':        return jsonOut(aplicarCompra(payload));
      case 'compra_procesar_gmail': return jsonOut(procesarFacturasGmail());
      case 'mapeo_eliminar':        return jsonOut(eliminarMapeo(payload));
      case 'toma_iniciar':          return jsonOut(iniciarToma(payload));
      case 'toma_guardar_conteo':   return jsonOut(guardarConteo(payload));
      case 'toma_cerrar':           return jsonOut(cerrarToma(payload));
      case 'receta_guardar':        return jsonOut(guardarReceta(payload));
      case 'receta_eliminar':       return jsonOut(eliminarReceta(payload));
      case 'sincronizar_ventas':    return jsonOut(sincronizarVentas(payload));
      case 'oc_guardar':            return jsonOut(guardarOC(payload));
      case 'oc_estado':             return jsonOut(cambiarEstadoOC(payload));
      default: throw new Error('Acción no reconocida: ' + payload.accion);
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// ── PRODUCTOS / PROVEEDORES / MÍNIMOS ──────────────────────────────
// Upsert por 'Producto' (Nombre Estándar exacto, elegido en inventario.html
// de la lista de productos ya confirmados en el Maestro).
function guardarProducto(p) {
  const producto = String(p.producto || '').trim();
  if (!producto) throw new Error('Falta el producto (elegilo de la lista del Maestro).');
  const tipo = p.tipoControl === 'peso' ? 'peso' : 'unitario';
  if (tipo === 'peso') {
    if (!Number(p.contenidoMl)) throw new Error('Un producto por peso necesita el contenido del envase en ml.');
    if (!Number(p.taraG) && Number(p.taraG) !== 0) throw new Error('Un producto por peso necesita la tara (peso del envase vacío en gramos). Pesá un envase vacío.');
    if (!Number(p.densidad)) throw new Error('Un producto por peso necesita la densidad en g/ml (cerveza ≈ 1.005, destilados 40° ≈ 0.94).');
  }
  const hoja = prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS);
  const filaExistente = filaPorValor(hoja, 'Producto', producto, ENCABEZADOS_PRODUCTOS);
  const fila = filaExistente > 0 ? filaExistente : hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PRODUCTOS, {
    'Producto': producto,
    'Tipo Control': tipo,
    'Unidad Base': tipo === 'peso' ? 'ml' : 'unidad',
    'Contenido Envase (ml)': Number(p.contenidoMl) || '',
    'Tara (g)': (p.taraG === '' || p.taraG === undefined) ? '' : Number(p.taraG),
    'Densidad (g/ml)': Number(p.densidad) || '',
    'Costo Unidad Base': Number(p.costo) || 0,
    'Proveedor': p.proveedor || '',
    'Nombre Venta': p.nombreVenta || '',
    'Activo': p.activo === false ? false : true,
    'Actualizado': new Date().toISOString()
  });
  return { ok: true, producto: producto };
}

function guardarProveedor(p) {
  if (!p.nombre) throw new Error('Falta el nombre del proveedor.');
  const hoja = prepararHoja(HOJA_PROVEEDORES, ENCABEZADOS_PROVEEDORES);
  const filaExistente = p.id ? filaPorValor(hoja, 'ID', p.id, ENCABEZADOS_PROVEEDORES) : -1;
  const id = p.id || Date.now();
  const fila = filaExistente > 0 ? filaExistente : hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PROVEEDORES, {
    'ID': id,
    'Nombre': p.nombre,
    'Cédula': p.cedula || '',
    'Correo Pedidos': p.correo || '',
    'Teléfono': p.telefono || '',
    'Activo': p.activo === false ? false : true,
    'Actualizado': new Date().toISOString()
  });
  return { ok: true, id: id };
}

// Upsert por producto×kiosko.
function guardarMinimo(p) {
  const producto = String(p.producto || '').trim();
  if (!producto || !p.kiosko) throw new Error('Falta el producto o el kiosko.');
  const hoja = prepararHoja(HOJA_MINIMOS, ENCABEZADOS_MINIMOS);
  const nFilas = hoja.getLastRow() - 1;
  let fila = -1;
  if (nFilas > 0) {
    const datos = hoja.getRange(2, 1, nFilas, 2).getValues();
    for (let i = 0; i < datos.length; i++) {
      if (String(datos[i][0]).trim() === producto && String(datos[i][1]) === String(p.kiosko)) { fila = i + 2; break; }
    }
  }
  escribirFilaPorEncabezado(hoja, fila > 0 ? fila : hoja.getLastRow() + 1, ENCABEZADOS_MINIMOS, {
    'Producto': producto,
    'Kiosko': p.kiosko,
    'Mínimo': Number(p.minimo) || 0,
    'Nivel Objetivo': Number(p.nivelObjetivo) || '',
    'Actualizado': new Date().toISOString()
  });
  return { ok: true };
}

function minimosDeKiosko(kiosko) {
  const mapa = {};
  filasComoObjetos(prepararHoja(HOJA_MINIMOS, ENCABEZADOS_MINIMOS))
    .filter(function(m) { return String(m['Kiosko']) === String(kiosko); })
    .forEach(function(m) { mapa[String(m['Producto']).trim()] = m; });
  return mapa;
}

// ── STOCK ──────────────────────────────────────────────────────────
function filaStock(hoja, producto, kiosko) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const datos = hoja.getRange(2, 1, nFilas, 2).getValues();
  const buscado = String(producto).trim();
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][0]).trim() === buscado && String(datos[i][1]) === String(kiosko)) return i + 2;
  }
  return -1;
}

function obtenerStock(producto, kiosko) {
  const hoja = prepararHoja(HOJA_STOCK, ENCABEZADOS_STOCK);
  const fila = filaStock(hoja, producto, kiosko);
  if (fila === -1) return 0;
  return Number(hoja.getRange(fila, ENCABEZADOS_STOCK.indexOf('Cantidad Actual') + 1).getValue()) || 0;
}

function fijarStock(producto, kiosko, nuevaCantidad) {
  const hoja = prepararHoja(HOJA_STOCK, ENCABEZADOS_STOCK);
  const fila = filaStock(hoja, producto, kiosko);
  escribirFilaPorEncabezado(hoja, fila > 0 ? fila : hoja.getLastRow() + 1, ENCABEZADOS_STOCK, {
    'Producto': producto,
    'Kiosko': kiosko,
    'Cantidad Actual': nuevaCantidad,
    'Actualizado': new Date().toISOString()
  });
}

function registrarMovimiento(kiosko, producto, tipo, cantidadDelta, referencia, registradoPor) {
  const nuevo = obtenerStock(producto, kiosko) + Number(cantidadDelta);
  fijarStock(producto, kiosko, nuevo);
  const hojaMov = prepararHoja(HOJA_MOVIMIENTOS, ENCABEZADOS_MOVIMIENTOS);
  escribirFilaPorEncabezado(hojaMov, hojaMov.getLastRow() + 1, ENCABEZADOS_MOVIMIENTOS, {
    'ID': Date.now() + '_' + Math.floor(Math.random() * 1000),
    'Fecha': hoyCR(),
    'Kiosko': kiosko,
    'Producto': producto,
    'Tipo': tipo,
    'Cantidad': cantidadDelta,
    'Referencia': referencia || '',
    'Registrado por': registradoPor || '',
    'Registrado': new Date().toISOString()
  });
  return nuevo;
}

// Ajuste manual con tipo: 'Ajuste Manual' (default), 'Merma' o 'Traslado'.
function ajustarStock(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  const producto = String(p.producto || '').trim();
  if (!producto) throw new Error('Falta el producto.');
  if (p.cantidad === undefined || p.cantidad === null || p.cantidad === '') throw new Error('Falta la cantidad del ajuste.');
  const tiposValidos = ['Ajuste Manual', 'Merma', 'Traslado'];
  const tipo = tiposValidos.indexOf(p.tipo) >= 0 ? p.tipo : 'Ajuste Manual';
  const nuevo = registrarMovimiento(p.kiosko, producto, tipo, Number(p.cantidad), p.nota || '', p.registrado_por || '');
  return { ok: true, stockActual: nuevo };
}

// Stock de todos los productos activos de un kiosko con mínimos por kiosko.
// (Ya no devuelve Categoría — inventario.html agrupa en vivo contra el
// Maestro usando el campo "producto".)
function obtenerStockKiosko(kiosko) {
  const minimos = minimosDeKiosko(kiosko);
  const productos = filasComoObjetos(prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS))
    .filter(function(p) { return p['Activo'] !== false; });
  return productos.map(function(prod) {
    const cantidad = obtenerStock(prod['Producto'], kiosko);
    const min = minimos[String(prod['Producto']).trim()] || {};
    const minimo = Number(min['Mínimo']) || 0;
    return {
      producto: prod['Producto'],
      tipoControl: prod['Tipo Control'],
      unidadBase: prod['Unidad Base'],
      contenidoMl: Number(prod['Contenido Envase (ml)']) || 0,
      costo: Number(prod['Costo Unidad Base']) || 0,
      minimo: minimo,
      nivelObjetivo: Number(min['Nivel Objetivo']) || 0,
      cantidadActual: cantidad,
      bajoMinimo: minimo > 0 && cantidad < minimo
    };
  });
}

// ── COMPRAS ────────────────────────────────────────────────────────
function obtenerComprasConDetalle(estado) {
  const compras = filasComoObjetos(prepararHoja(HOJA_COMPRAS, ENCABEZADOS_COMPRAS))
    .filter(function(c) { return !estado || String(c['Estado']) === String(estado); });
  const detalleTodo = filasComoObjetos(prepararHoja(HOJA_COMPRAS_DETALLE, ENCABEZADOS_COMPRAS_DETALLE));
  return compras.map(function(c) {
    return Object.assign({}, c, {
      detalle: detalleTodo.filter(function(d) { return String(d['Compra ID']) === String(c['ID']); })
    });
  }).sort(function(a, b) { return String(b['Registrado']).localeCompare(String(a['Registrado'])); });
}

// Compra manual: se registra y se aplica al stock en el mismo paso.
function registrarCompraManual(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.lineas || !p.lineas.length) throw new Error('La compra necesita al menos una línea.');
  const hoja = prepararHoja(HOJA_COMPRAS, ENCABEZADOS_COMPRAS);
  const id = Date.now();
  let total = 0;
  p.lineas.forEach(function(l) { total += Number(l.costo) || 0; });
  escribirFilaPorEncabezado(hoja, hoja.getLastRow() + 1, ENCABEZADOS_COMPRAS, {
    'ID': id,
    'Fecha': p.fecha || hoyCR(),
    'Kiosko': p.kiosko,
    'Proveedor': p.proveedor || '',
    'Proveedor Cédula': p.proveedorCedula || '',
    'Nº Factura': p.facturaNumero || '',
    'Clave Hacienda': '',
    'Origen': 'manual',
    'Total': total,
    'Estado': 'aplicada',
    'Registrado por': p.usuario || '',
    'Registrado': new Date().toISOString()
  });
  const hojaDet = prepararHoja(HOJA_COMPRAS_DETALLE, ENCABEZADOS_COMPRAS_DETALLE);
  let filaDet = hojaDet.getLastRow() + 1;
  p.lineas.forEach(function(l, i) {
    const producto = String(l.producto || '').trim();
    const prod = productoPorNombre(producto);
    if (!prod) throw new Error('Producto no encontrado en el catálogo de Inventario: ' + producto);
    escribirFilaPorEncabezado(hojaDet, filaDet, ENCABEZADOS_COMPRAS_DETALLE, {
      'Compra ID': id,
      'Línea Nº': i + 1,
      'Línea Original': l.descripcion || '',
      'Cantidad Factura': Number(l.cantidad) || 0,
      'Producto': prod['Producto'],
      'Cantidad Base': Number(l.cantidadBase) || Number(l.cantidad) || 0,
      'Costo Línea': Number(l.costo) || 0
    });
    filaDet++;
    registrarMovimiento(p.kiosko, prod['Producto'], 'Compra',
      Math.abs(Number(l.cantidadBase) || Number(l.cantidad) || 0), 'Compra ' + id, p.usuario || '');
  });
  return { ok: true, id: id };
}

// Mapea una línea de una compra pendiente a un producto (y aprende el mapeo
// para las próximas facturas del mismo proveedor).
function mapearLineaCompra(p) {
  const producto = String(p.producto || '').trim();
  if (!p.compraId || !p.lineaNumero || !producto) throw new Error('Faltan datos del mapeo.');
  const factor = Number(p.factor) || 1;
  const prod = productoPorNombre(producto);
  if (!prod) throw new Error('Producto no encontrado en el catálogo de Inventario: ' + producto);

  const hojaDet = prepararHoja(HOJA_COMPRAS_DETALLE, ENCABEZADOS_COMPRAS_DETALLE);
  const nFilas = hojaDet.getLastRow() - 1;
  if (nFilas <= 0) throw new Error('No hay líneas de compra.');
  const datos = hojaDet.getRange(2, 1, nFilas, 2).getValues();
  let fila = -1;
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][0]) === String(p.compraId) && String(datos[i][1]) === String(p.lineaNumero)) { fila = i + 2; break; }
  }
  if (fila === -1) throw new Error('No se encontró la línea ' + p.lineaNumero + ' de la compra ' + p.compraId);

  const cantFactura = Number(hojaDet.getRange(fila, ENCABEZADOS_COMPRAS_DETALLE.indexOf('Cantidad Factura') + 1).getValue()) || 0;
  hojaDet.getRange(fila, ENCABEZADOS_COMPRAS_DETALLE.indexOf('Producto') + 1).setValue(prod['Producto']);
  hojaDet.getRange(fila, ENCABEZADOS_COMPRAS_DETALLE.indexOf('Cantidad Base') + 1).setValue(cantFactura * factor);

  if (p.guardarMapeo !== false) {
    const textoLinea = hojaDet.getRange(fila, ENCABEZADOS_COMPRAS_DETALLE.indexOf('Línea Original') + 1).getValue();
    const hojaCompras = prepararHoja(HOJA_COMPRAS, ENCABEZADOS_COMPRAS);
    const filaCompra = filaPorValor(hojaCompras, 'ID', p.compraId, ENCABEZADOS_COMPRAS);
    const cedula = filaCompra > 0 ? hojaCompras.getRange(filaCompra, ENCABEZADOS_COMPRAS.indexOf('Proveedor Cédula') + 1).getValue() : '';
    guardarMapeo(cedula, textoLinea, prod['Producto'], factor);
  }
  return { ok: true };
}

function guardarMapeo(cedula, textoLinea, producto, factor) {
  const hoja = prepararHoja(HOJA_MAPEOS, ENCABEZADOS_MAPEOS);
  const clave = normalizarTexto(cedula) + '|' + normalizarTexto(textoLinea);
  const filas = filasComoObjetos(hoja);
  let fila = -1;
  for (let i = 0; i < filas.length; i++) {
    if (normalizarTexto(filas[i]['Proveedor Cédula']) + '|' + normalizarTexto(filas[i]['Texto Línea']) === clave) { fila = i + 2; break; }
  }
  escribirFilaPorEncabezado(hoja, fila > 0 ? fila : hoja.getLastRow() + 1, ENCABEZADOS_MAPEOS, {
    'Proveedor Cédula': cedula || '',
    'Texto Línea': textoLinea,
    'Producto': producto,
    'Factor': factor,
    'Actualizado': new Date().toISOString()
  });
}

function eliminarMapeo(p) {
  const hoja = prepararHoja(HOJA_MAPEOS, ENCABEZADOS_MAPEOS);
  const filas = filasComoObjetos(hoja);
  for (let i = 0; i < filas.length; i++) {
    if (normalizarTexto(filas[i]['Proveedor Cédula']) === normalizarTexto(p.cedula) &&
        normalizarTexto(filas[i]['Texto Línea']) === normalizarTexto(p.textoLinea)) {
      hoja.deleteRow(i + 2);
      return { ok: true };
    }
  }
  throw new Error('No se encontró el mapeo.');
}

// Aplica una compra pendiente (de Gmail) al stock de un kiosko. Exige que
// todas las líneas estén mapeadas, salvo que se pida omitir las sueltas.
function aplicarCompra(p) {
  if (!p.compraId) throw new Error('Falta el ID de la compra.');
  if (!p.kiosko) throw new Error('Falta el kiosko destino.');
  const hoja = prepararHoja(HOJA_COMPRAS, ENCABEZADOS_COMPRAS);
  const fila = filaPorValor(hoja, 'ID', p.compraId, ENCABEZADOS_COMPRAS);
  if (fila === -1) throw new Error('No se encontró la compra ' + p.compraId);
  if (hoja.getRange(fila, ENCABEZADOS_COMPRAS.indexOf('Estado') + 1).getValue() !== 'pendiente') {
    throw new Error('Esta compra ya fue aplicada.');
  }
  const detalle = filasComoObjetos(prepararHoja(HOJA_COMPRAS_DETALLE, ENCABEZADOS_COMPRAS_DETALLE))
    .filter(function(d) { return String(d['Compra ID']) === String(p.compraId); });
  const sinMapear = detalle.filter(function(d) { return !d['Producto']; });
  if (sinMapear.length && !p.omitirSinMapear) {
    throw new Error('Hay ' + sinMapear.length + ' línea(s) sin mapear a un producto. Mapealas primero o marcá "omitir líneas sin mapear".');
  }
  detalle.forEach(function(d) {
    if (!d['Producto']) return;
    registrarMovimiento(p.kiosko, d['Producto'], 'Compra',
      Math.abs(Number(d['Cantidad Base']) || 0), 'Compra ' + p.compraId, p.usuario || '');
  });
  hoja.getRange(fila, ENCABEZADOS_COMPRAS.indexOf('Kiosko') + 1).setValue(p.kiosko);
  hoja.getRange(fila, ENCABEZADOS_COMPRAS.indexOf('Estado') + 1).setValue('aplicada');
  return { ok: true, lineasAplicadas: detalle.length - sinMapear.length, lineasOmitidas: sinMapear.length };
}

// ── LECTOR DE FACTURAS ELECTRÓNICAS (Gmail → Compras pendientes) ───
function procesarFacturasAutomatico() {
  try { procesarFacturasGmail(); } catch (err) { Logger.log('procesarFacturas: ' + err.message); }
}

function procesarFacturasGmail() {
  const hojaCompras = prepararHoja(HOJA_COMPRAS, ENCABEZADOS_COMPRAS);
  const clavesExistentes = leerColumnaComoSet(hojaCompras, ENCABEZADOS_COMPRAS.indexOf('Clave Hacienda') + 1);
  const mapeos = filasComoObjetos(prepararHoja(HOJA_MAPEOS, ENCABEZADOS_MAPEOS));
  const hilos = GmailApp.search(GMAIL_QUERY, 0, GMAIL_MAX_HILOS);
  let nuevas = 0, lineasSinMapear = 0;

  hilos.forEach(function(hilo) {
    hilo.getMessages().forEach(function(msg) {
      msg.getAttachments().forEach(function(adj) {
        if (!/\.xml$/i.test(adj.getName())) return;
        let factura;
        try { factura = parseFacturaXml(adj.getDataAsString('UTF-8')); }
        catch (err) { return; } // XML que no es factura (ej. MensajeHacienda) — se ignora
        if (!factura || !factura.clave || clavesExistentes.has(String(factura.clave))) return;

        const id = Date.now() + Math.floor(Math.random() * 1000);
        escribirFilaPorEncabezado(hojaCompras, hojaCompras.getLastRow() + 1, ENCABEZADOS_COMPRAS, {
          'ID': id,
          'Fecha': factura.fecha || hoyCR(),
          'Kiosko': '',
          'Proveedor': factura.proveedor,
          'Proveedor Cédula': factura.cedula,
          'Nº Factura': factura.consecutivo || '',
          'Clave Hacienda': factura.clave,
          'Origen': 'gmail-xml',
          'Total': factura.total,
          'Estado': 'pendiente',
          'Registrado por': 'Lector Gmail',
          'Registrado': new Date().toISOString()
        });
        clavesExistentes.add(String(factura.clave));

        const hojaDet = prepararHoja(HOJA_COMPRAS_DETALLE, ENCABEZADOS_COMPRAS_DETALLE);
        let filaDet = hojaDet.getLastRow() + 1;
        factura.lineas.forEach(function(l, i) {
          const mapeo = mapeos.find(function(m) {
            return normalizarTexto(m['Proveedor Cédula']) === normalizarTexto(factura.cedula) &&
                   normalizarTexto(m['Texto Línea']) === normalizarTexto(l.detalle);
          });
          const prod = mapeo ? productoPorNombre(mapeo['Producto']) : null;
          if (!prod) lineasSinMapear++;
          escribirFilaPorEncabezado(hojaDet, filaDet, ENCABEZADOS_COMPRAS_DETALLE, {
            'Compra ID': id,
            'Línea Nº': i + 1,
            'Línea Original': l.detalle,
            'Cantidad Factura': l.cantidad,
            'Producto': prod ? prod['Producto'] : '',
            'Cantidad Base': prod ? l.cantidad * (Number(mapeo['Factor']) || 1) : '',
            'Costo Línea': l.monto
          });
          filaDet++;
        });
        nuevas++;
      });
    });
  });
  return { ok: true, facturasNuevas: nuevas, lineasSinMapear: lineasSinMapear };
}

// Parsea un XML de comprobante electrónico de Hacienda (v4.3/v4.4).
// Devuelve null si el XML no es una factura/tiquete.
function parseFacturaXml(xmlTexto) {
  const doc = XmlService.parse(xmlTexto);
  const root = doc.getRootElement();
  const nombre = root.getName();
  if (['FacturaElectronica', 'TiqueteElectronico', 'FacturaElectronicaCompra'].indexOf(nombre) === -1) return null;
  const ns = root.getNamespace();
  const texto = function(el, tag) {
    if (!el) return '';
    const hijo = el.getChild(tag, ns);
    return hijo ? hijo.getText() : '';
  };
  const emisor = root.getChild('Emisor', ns);
  const ident = emisor ? emisor.getChild('Identificacion', ns) : null;
  const resumen = root.getChild('ResumenFactura', ns);
  const detalleServicio = root.getChild('DetalleServicio', ns);
  const lineas = [];
  if (detalleServicio) {
    detalleServicio.getChildren('LineaDetalle', ns).forEach(function(ld) {
      lineas.push({
        detalle: texto(ld, 'Detalle'),
        cantidad: Number(texto(ld, 'Cantidad')) || 0,
        monto: Number(texto(ld, 'MontoTotalLinea')) || 0
      });
    });
  }
  return {
    clave: texto(root, 'Clave'),
    consecutivo: texto(root, 'NumeroConsecutivo'),
    fecha: (texto(root, 'FechaEmision') || '').slice(0, 10),
    proveedor: texto(emisor, 'Nombre'),
    cedula: texto(ident, 'Numero'),
    total: Number(texto(resumen, 'TotalComprobante')) || 0,
    lineas: lineas
  };
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
    throw new Error('Ya hay una toma abierta para ' + p.kiosko + '. Cerrala antes de iniciar una nueva.');
  }
  const hoja = prepararHoja(HOJA_TOMA, ENCABEZADOS_TOMA);
  const id = Date.now();
  escribirFilaPorEncabezado(hoja, hoja.getLastRow() + 1, ENCABEZADOS_TOMA, {
    'ID': id, 'Kiosko': p.kiosko, 'Fecha': p.fecha || hoyCR(), 'Estado': 'Abierta',
    'Abierta por': p.usuario || '', 'Abierta en': new Date().toISOString(),
    'Cerrada por': '', 'Cerrada en': ''
  });
  const minimos = minimosDeKiosko(p.kiosko);
  const productos = filasComoObjetos(prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS))
    .filter(function(prod) { return prod['Activo'] !== false; });
  const hojaDet = prepararHoja(HOJA_TOMA_DETALLE, ENCABEZADOS_TOMA_DETALLE);
  let filaDet = hojaDet.getLastRow() + 1;
  productos.forEach(function(prod) {
    const min = minimos[String(prod['Producto']).trim()] || {};
    escribirFilaPorEncabezado(hojaDet, filaDet, ENCABEZADOS_TOMA_DETALLE, {
      'Toma ID': id,
      'Producto': prod['Producto'],
      'Tipo Control': prod['Tipo Control'],
      'Stock Teórico': obtenerStock(prod['Producto'], p.kiosko),
      'Envases Cerrados': '', 'Peso Bruto (g)': '', 'Neto (ml)': '',
      'Total Contado': '', 'Mínimo': Number(min['Mínimo']) || 0,
      'Diferencia': '', 'Diferencia Colones': '', 'Foto URL': '', 'Notas': ''
    });
    filaDet++;
  });
  return { ok: true, id: id };
}

// Guarda el conteo de una línea. Para tipo 'peso' el TOTAL se calcula acá
// (no en la UI) a partir de envases cerrados + peso bruto, usando la tara,
// densidad y contenido del producto — y guarda la foto de la báscula en
// Drive como evidencia.
function guardarConteo(p) {
  if (!p.tomaId) throw new Error('Falta el ID de la toma.');
  if (!p.lineas || !p.lineas.length) throw new Error('No se recibieron líneas de conteo.');

  const hojaToma = prepararHoja(HOJA_TOMA, ENCABEZADOS_TOMA);
  const filaToma = filaPorValor(hojaToma, 'ID', p.tomaId, ENCABEZADOS_TOMA);
  if (filaToma === -1) throw new Error('No se encontró la toma ' + p.tomaId);
  if (hojaToma.getRange(filaToma, ENCABEZADOS_TOMA.indexOf('Estado') + 1).getValue() !== 'Abierta') {
    throw new Error('Esta toma ya está cerrada, no se pueden guardar más conteos.');
  }
  const kiosko = hojaToma.getRange(filaToma, ENCABEZADOS_TOMA.indexOf('Kiosko') + 1).getValue();

  const hojaDet = prepararHoja(HOJA_TOMA_DETALLE, ENCABEZADOS_TOMA_DETALLE);
  const nFilas = hojaDet.getLastRow() - 1;
  const tomaIds = nFilas > 0 ? hojaDet.getRange(2, 1, nFilas, 2).getValues() : [];
  const resultados = [];

  p.lineas.forEach(function(linea) {
    const producto = String(linea.producto || '').trim();
    let filaDet = -1;
    for (let i = 0; i < tomaIds.length; i++) {
      if (String(tomaIds[i][0]) === String(p.tomaId) && String(tomaIds[i][1]).trim() === producto) { filaDet = i + 2; break; }
    }
    if (filaDet === -1) return;
    const prod = productoPorNombre(producto);
    if (!prod) return;

    let total = '';
    let neto = '';
    const cerrados = (linea.envasesCerrados === '' || linea.envasesCerrados === undefined) ? '' : Number(linea.envasesCerrados) || 0;

    if (prod['Tipo Control'] === 'peso') {
      const bruto = (linea.pesoBrutoG === '' || linea.pesoBrutoG === undefined) ? '' : Number(linea.pesoBrutoG) || 0;
      const tara = Number(prod['Tara (g)']) || 0;
      const densidad = Number(prod['Densidad (g/ml)']) || 1;
      const contenido = Number(prod['Contenido Envase (ml)']) || 0;
      if (bruto !== '') neto = Math.max(0, Math.round((bruto - tara) / densidad));
      if (cerrados !== '' || bruto !== '') {
        total = (cerrados === '' ? 0 : cerrados) * contenido + (neto === '' ? 0 : neto);
      }
      hojaDet.getRange(filaDet, ENCABEZADOS_TOMA_DETALLE.indexOf('Peso Bruto (g)') + 1).setValue(bruto);
      hojaDet.getRange(filaDet, ENCABEZADOS_TOMA_DETALLE.indexOf('Neto (ml)') + 1).setValue(neto);
      if (linea.foto) {
        const url = guardarFotoTomaEnDrive(linea.foto, kiosko, p.tomaId, producto);
        if (url) hojaDet.getRange(filaDet, ENCABEZADOS_TOMA_DETALLE.indexOf('Foto URL') + 1).setValue(url);
      }
    } else {
      total = (linea.cantidadContada === '' || linea.cantidadContada === undefined) ? '' : Number(linea.cantidadContada);
    }

    const teorico = Number(hojaDet.getRange(filaDet, ENCABEZADOS_TOMA_DETALLE.indexOf('Stock Teórico') + 1).getValue()) || 0;
    const costo = Number(prod['Costo Unidad Base']) || 0;
    const dif = total === '' ? '' : total - teorico;
    hojaDet.getRange(filaDet, ENCABEZADOS_TOMA_DETALLE.indexOf('Envases Cerrados') + 1).setValue(cerrados);
    hojaDet.getRange(filaDet, ENCABEZADOS_TOMA_DETALLE.indexOf('Total Contado') + 1).setValue(total);
    hojaDet.getRange(filaDet, ENCABEZADOS_TOMA_DETALLE.indexOf('Diferencia') + 1).setValue(dif);
    hojaDet.getRange(filaDet, ENCABEZADOS_TOMA_DETALLE.indexOf('Diferencia Colones') + 1).setValue(dif === '' ? '' : Math.round(dif * costo));
    if (linea.notas !== undefined) hojaDet.getRange(filaDet, ENCABEZADOS_TOMA_DETALLE.indexOf('Notas') + 1).setValue(linea.notas);
    resultados.push({ producto: producto, neto: neto, total: total, diferencia: dif });
  });
  return { ok: true, resultados: resultados };
}

// Evidencia fotográfica de cada pesaje: Drive, carpeta "Inventario v2 -
// Fotos" (creada junto al Sheet), subcarpeta por kiosko — mismo patrón que
// Mermas.
function guardarFotoTomaEnDrive(dataUrl, kiosko, tomaId, producto) {
  const datos = extraerBase64(dataUrl);
  if (!datos) return '';
  const archivoSheet = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  const padres = archivoSheet.getParents();
  const padre = padres.hasNext() ? padres.next() : DriveApp.getRootFolder();
  let raiz;
  const existentes = padre.getFoldersByName('Inventario v2 - Fotos');
  raiz = existentes.hasNext() ? existentes.next() : padre.createFolder('Inventario v2 - Fotos');
  const subNombre = (kiosko || 'Sin kiosko').toString();
  const subs = raiz.getFoldersByName(subNombre);
  const carpeta = subs.hasNext() ? subs.next() : raiz.createFolder(subNombre);
  const nombreArchivo = hoyCR() + '_toma' + tomaId + '_' + normalizarTexto(producto).replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '.jpg';
  const blob = Utilities.newBlob(Utilities.base64Decode(datos.base64), datos.mime, nombreArchivo);
  return carpeta.createFile(blob).getUrl();
}

function extraerBase64(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

function cerrarToma(p) {
  if (!p.tomaId) throw new Error('Falta el ID de la toma.');
  const pinEsperado = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || 'admin';
  if (String(p.pin) !== String(pinEsperado)) throw new Error('Código de administrador incorrecto.');

  const hojaToma = prepararHoja(HOJA_TOMA, ENCABEZADOS_TOMA);
  const filaToma = filaPorValor(hojaToma, 'ID', p.tomaId, ENCABEZADOS_TOMA);
  if (filaToma === -1) throw new Error('No se encontró la toma ' + p.tomaId);
  const colEstado = ENCABEZADOS_TOMA.indexOf('Estado') + 1;
  if (hojaToma.getRange(filaToma, colEstado).getValue() !== 'Abierta') throw new Error('Esta toma ya está cerrada.');
  const kiosko = hojaToma.getRange(filaToma, ENCABEZADOS_TOMA.indexOf('Kiosko') + 1).getValue();

  const detalle = filasComoObjetos(prepararHoja(HOJA_TOMA_DETALLE, ENCABEZADOS_TOMA_DETALLE))
    .filter(function(d) { return String(d['Toma ID']) === String(p.tomaId); });
  detalle.forEach(function(linea) {
    if (linea['Total Contado'] === '' || linea['Total Contado'] === null || linea['Total Contado'] === undefined) return;
    const dif = Number(linea['Total Contado']) - (Number(linea['Stock Teórico']) || 0);
    if (dif !== 0) {
      registrarMovimiento(kiosko, linea['Producto'], 'Conteo', dif, 'Toma ' + p.tomaId, p.usuario || '');
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
    const detalle = detalleTodo.filter(function(d) { return String(d['Toma ID']) === String(t['ID']); });
    let difColones = 0;
    detalle.forEach(function(d) { difColones += Number(d['Diferencia Colones']) || 0; });
    return Object.assign({}, t, { detalle: detalle, diferenciaColonesTotal: difColones });
  }).sort(function(a, b) { return String(b['Fecha']).localeCompare(String(a['Fecha'])); });
}

// ── RECETAS ────────────────────────────────────────────────────────
// NOTA: sigue con el esquema 'Producto ID'/'Producto Nombre' — ver
// comentario junto a ENCABEZADOS_RECETAS_DETALLE arriba (fuera de alcance
// del cambio de hoy).
function guardarReceta(p) {
  if (!p.nombreVenta) throw new Error('Falta el nombre de venta de la receta.');
  if (!p.ingredientes || !p.ingredientes.length) throw new Error('La receta necesita al menos un ingrediente.');
  const hoja = prepararHoja(HOJA_RECETAS, ENCABEZADOS_RECETAS);
  const filaExistente = p.id ? filaPorValor(hoja, 'ID', p.id, ENCABEZADOS_RECETAS) : -1;
  const id = p.id || Date.now();
  escribirFilaPorEncabezado(hoja, filaExistente > 0 ? filaExistente : hoja.getLastRow() + 1, ENCABEZADOS_RECETAS, {
    'ID': id, 'Nombre de Venta': p.nombreVenta, 'Kiosko': p.kiosko || '',
    'Activo': p.activo === false ? false : true, 'Actualizado': new Date().toISOString()
  });
  const hojaDet = prepararHoja(HOJA_RECETAS_DETALLE, ENCABEZADOS_RECETAS_DETALLE);
  if (filaExistente > 0) borrarLineasReceta(hojaDet, id);
  let filaDet = hojaDet.getLastRow() + 1;
  p.ingredientes.forEach(function(ing) {
    escribirFilaPorEncabezado(hojaDet, filaDet, ENCABEZADOS_RECETAS_DETALLE, {
      'Receta ID': id,
      'Producto ID': ing.productoId,
      'Producto Nombre': ing.productoNombre || '',
      'Cantidad por Unidad Vendida': Number(ing.cantidad) || 0
    });
    filaDet++;
  });
  return { ok: true, id: id };
}

function borrarLineasReceta(hojaDet, recetaId) {
  const nFilas = hojaDet.getLastRow() - 1;
  if (nFilas <= 0) return;
  const ids = hojaDet.getRange(2, 1, nFilas, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(recetaId)) {
      hojaDet.getRange(i + 2, 1, 1, ENCABEZADOS_RECETAS_DETALLE.length).clearContent();
    }
  }
}

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

// ── SYNC DE VENTAS (Square → consumo por receta) ───────────────────
// Recorre todos los kioskos configurados en SQUARE_URLS (o solo p.kiosko).
function sincronizarVentas(p) {
  const kioskos = (p && p.kiosko) ? [p.kiosko] : Object.keys(SQUARE_URLS);
  if (!kioskos.length) throw new Error('No hay kioskos configurados en SQUARE_URLS (ver encabezado del código).');

  const hasta = hoyCR();
  const desde = (p && p.desde) || Utilities.formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'America/Costa_Rica', 'yyyy-MM-dd');
  const hojaProc = prepararHoja(HOJA_VENTAS_PROCESADAS, ENCABEZADOS_VENTAS_PROCESADAS);
  const procesadas = leerColumnaComoSet(hojaProc, ENCABEZADOS_VENTAS_PROCESADAS.indexOf('Clave') + 1);
  const recetas = obtenerRecetasConDetalle().filter(function(r) { return r['Activo'] !== false; });
  const productos = filasComoObjetos(prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS));

  let procesadasNuevas = 0;
  const sinMapear = [];
  let filaProc = hojaProc.getLastRow() + 1;

  kioskos.forEach(function(kiosko) {
    const base = SQUARE_URLS[kiosko];
    if (!base) return;
    const url = base + '?action=ventasPorProducto&desde=' + encodeURIComponent(desde) + '&hasta=' + encodeURIComponent(hasta) + '&kiosko=' + encodeURIComponent(kiosko);
    let datos;
    try {
      datos = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
    } catch (err) { return; }
    if (!datos.ok) return;

    (datos.ventas || []).forEach(function(linea) {
      const clave = [linea.orderId, linea.producto, linea.fecha, linea.hora || ''].join('|');
      if (procesadas.has(clave)) return;
      const nombreVendido = String(linea.producto || '').trim();
      const cantidadVendida = Number(linea.cantidad) || 0;
      const receta = recetas.find(function(r) {
        return String(r['Nombre de Venta']).trim() === nombreVendido && (!r['Kiosko'] || r['Kiosko'] === kiosko);
      });
      if (receta) {
        // NOTA: ing['Producto ID'] viene del catálogo de ingredientes de
        // recetas.html (Base de Productos), no necesariamente coincide con
        // el 'Producto' (Nombre Estándar) de este Sheet — ver nota junto a
        // ENCABEZADOS_RECETAS_DETALLE. Se usa tal cual, best-effort.
        receta.ingredientes.forEach(function(ing) {
          registrarMovimiento(kiosko, ing['Producto ID'], 'Consumo Venta',
            -Math.abs(Number(ing['Cantidad por Unidad Vendida']) || 0) * cantidadVendida,
            'Venta ' + linea.orderId, 'Sync Square');
        });
      } else {
        const directo = productos.find(function(prod) { return String(prod['Nombre Venta']).trim() === nombreVendido && prod['Nombre Venta']; });
        if (directo) {
          registrarMovimiento(kiosko, directo['Producto'], 'Consumo Venta',
            -Math.abs(cantidadVendida) * (directo['Tipo Control'] === 'peso' ? (Number(directo['Contenido Envase (ml)']) || 1) : 1),
            'Venta ' + linea.orderId, 'Sync Square');
        } else {
          sinMapear.push(nombreVendido);
        }
      }
      escribirFilaPorEncabezado(hojaProc, filaProc, ENCABEZADOS_VENTAS_PROCESADAS, {
        'Clave': clave, 'Fecha': linea.fecha, 'Kiosko': kiosko,
        'Producto Vendido': nombreVendido, 'Cantidad': cantidadVendida,
        'Procesado En': new Date().toISOString()
      });
      procesadas.add(clave);
      filaProc++;
      procesadasNuevas++;
    });
  });

  return { ok: true, lineasProcesadas: procesadasNuevas, sinMapear: Array.from(new Set(sinMapear)) };
}

function sincronizarVentasAutomatico() {
  try { sincronizarVentas({}); } catch (err) { Logger.log('sincronizarVentas: ' + err.message); }
}

// ── ÓRDENES DE COMPRA ──────────────────────────────────────────────
// Sugerido por kiosko: productos con stock < mínimo. Cantidad sugerida =
// (nivel objetivo || 2×mínimo) − stock, redondeada hacia arriba a envases
// enteros para productos por peso.
function sugerirOrdenCompra(kiosko) {
  return obtenerStockKiosko(kiosko)
    .filter(function(s) { return s.minimo > 0 && s.cantidadActual < s.minimo; })
    .map(function(s) {
      const objetivo = s.nivelObjetivo > 0 ? s.nivelObjetivo : s.minimo * 2;
      let sugerido = Math.max(0, objetivo - s.cantidadActual);
      let envases = '';
      if (s.tipoControl === 'peso' && s.contenidoMl > 0) {
        envases = Math.ceil(sugerido / s.contenidoMl);
        sugerido = envases * s.contenidoMl;
      }
      const prod = productoPorNombre(s.producto) || {};
      return Object.assign({}, s, { sugerido: sugerido, envasesSugeridos: envases, proveedor: prod['Proveedor'] || '' });
    });
}

function guardarOC(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.lineas || !p.lineas.length) throw new Error('La orden necesita al menos una línea.');
  const hoja = prepararHoja(HOJA_OC, ENCABEZADOS_OC);
  const id = Date.now();
  escribirFilaPorEncabezado(hoja, hoja.getLastRow() + 1, ENCABEZADOS_OC, {
    'ID': id, 'Fecha': hoyCR(), 'Kiosko': p.kiosko, 'Proveedor': p.proveedor || '',
    'Estado': 'borrador', 'Generada por': p.usuario || '', 'Registrado': new Date().toISOString()
  });
  const hojaDet = prepararHoja(HOJA_OC_DETALLE, ENCABEZADOS_OC_DETALLE);
  let filaDet = hojaDet.getLastRow() + 1;
  p.lineas.forEach(function(l) {
    escribirFilaPorEncabezado(hojaDet, filaDet, ENCABEZADOS_OC_DETALLE, {
      'OC ID': id,
      'Producto': l.producto,
      'Stock al Generar': Number(l.stock) || 0,
      'Mínimo': Number(l.minimo) || 0,
      'Sugerido': Number(l.sugerido) || 0,
      'Cantidad Final': Number(l.cantidadFinal) || Number(l.sugerido) || 0,
      'Compra ID Recepción': ''
    });
    filaDet++;
  });
  return { ok: true, id: id };
}

function cambiarEstadoOC(p) {
  if (!p.ocId) throw new Error('Falta el ID de la orden.');
  const estadosValidos = ['borrador', 'enviada', 'recibida', 'cancelada'];
  if (estadosValidos.indexOf(p.estado) === -1) throw new Error('Estado no válido: ' + p.estado);
  const hoja = prepararHoja(HOJA_OC, ENCABEZADOS_OC);
  const fila = filaPorValor(hoja, 'ID', p.ocId, ENCABEZADOS_OC);
  if (fila === -1) throw new Error('No se encontró la orden ' + p.ocId);
  hoja.getRange(fila, ENCABEZADOS_OC.indexOf('Estado') + 1).setValue(p.estado);
  if (p.estado === 'recibida' && p.compraId) {
    const hojaDet = prepararHoja(HOJA_OC_DETALLE, ENCABEZADOS_OC_DETALLE);
    const nFilas = hojaDet.getLastRow() - 1;
    if (nFilas > 0) {
      const ids = hojaDet.getRange(2, 1, nFilas, 1).getValues();
      const col = ENCABEZADOS_OC_DETALLE.indexOf('Compra ID Recepción') + 1;
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(p.ocId)) hojaDet.getRange(i + 2, col).setValue(p.compraId);
      }
    }
  }
  return { ok: true };
}

function obtenerOCConDetalle(kiosko) {
  const ordenes = filasComoObjetos(prepararHoja(HOJA_OC, ENCABEZADOS_OC))
    .filter(function(o) { return !kiosko || String(o['Kiosko']) === String(kiosko); });
  const detalleTodo = filasComoObjetos(prepararHoja(HOJA_OC_DETALLE, ENCABEZADOS_OC_DETALLE));
  return ordenes.map(function(o) {
    return Object.assign({}, o, {
      detalle: detalleTodo.filter(function(d) { return String(d['OC ID']) === String(o['ID']); })
    });
  }).sort(function(a, b) { return String(b['Registrado']).localeCompare(String(a['Registrado'])); });
}
