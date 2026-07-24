/**
 * Backend Apps Script para el Sheet "Base de Productos - Kioskos" —
 * módulo INDEPENDIENTE de catálogo de productos, separado del Sheet e
 * implementación de Inventario v2 (Code-inventario-v2-backend.gs, que tiene
 * su propia pestaña "Productos" para stock/mínimos/recetas).
 *
 * v2 (2026-07-24): estructura ampliada, adaptada de "Base de Productos ·
 * Costos" de Ecosistema Lorito (costos-productos.html /
 * Code-costos-backend.gs) — se agregan Área de negocio, Presentación,
 * Tamaño, Precio sin IVA, IVA (%), Cantidad presentación, Costo por unidad,
 * Rendimiento (%), Proveedor y Stock mínimo. Se deja fuera lo que en Lorito
 * vive atado al pipeline de facturas/compras (Alias_Productos,
 * Costo_Promedio calculado automáticamente desde facturas, panel
 * "Pendientes de mapear") — acá el precio/costo se ingresa a mano o por
 * carga masiva, no hay lectura automática de facturas ni Sheet de compras
 * externo.
 *
 * Agregado propio de Kioskos (no existe en Lorito, que es un solo local):
 * columna "Kioskos" — en qué kioskos se vende/usa cada producto. Valor
 * "Todos" (default) significa que aplica a todos los kioskos actuales Y a
 * los que abran después, sin tener que editar el producto cada vez; si no,
 * es una lista de nombres de kiosko separados por coma. Esos nombres tienen
 * que coincidir exacto con los de la pestaña "Configuracion" del Sheet de
 * RRHH (administrada desde configuracion.html) — productos.html lee esa
 * misma lista en vivo, no la tiene hardcodeada.
 *
 * Pestaña: "Productos".
 *
 * Cómo desplegarlo:
 * 1. Creá un Google Sheet nuevo, ej. "Base de Productos - Kioskos".
 * 2. Extensiones > Apps Script, pegá este código completo.
 * 3. Corré UNA VEZ configurarHoja() desde el editor (crea la pestaña
 *    "Productos" con encabezados).
 * 4. Implementar > Nueva implementación > Aplicación web > Ejecutar como Yo,
 *    Acceso: Cualquiera. Pegá la URL /exec en productos.html, constante
 *    PRODUCTOS_URL.
 *
 * ⚠️ MIGRACIÓN si ya tenías la versión vieja desplegada (7 columnas: ID,
 * Nombre, Categoría, Unidad, Nota, Activo, Actualizado) y la pestaña
 * "Productos" ya tiene filas: configurarHoja() NO reescribe encabezados de
 * una hoja que ya tiene datos. Reemplazá vos mismo la fila 1 completa por
 * ENCABEZADOS_PRODUCTOS (la lista de abajo, en ese orden exacto) antes de
 * usar el formulario o la carga masiva — si no, las columnas nuevas se
 * escriben corridas respecto a los encabezados viejos. Si la pestaña todavía
 * está vacía no hay que hacer nada especial, configurarHoja() la arma bien.
 *
 * Si se agregan columnas nuevas en el futuro: siempre al FINAL de
 * ENCABEZADOS_PRODUCTOS, nueva versión del deployment y configurarHoja() de
 * nuevo (o reemplazo manual de encabezados si ya hay datos).
 */

// ── CONFIG ─────────────────────────────────────────────────────────
const HOJA_PRODUCTOS = 'Productos';
const ENCABEZADOS_PRODUCTOS = [
  'ID', 'Nombre', 'Categoría', 'Área de negocio', 'Unidad', 'Presentación',
  'Tamaño', 'Precio sin IVA', 'IVA (%)', 'Cantidad presentación',
  'Costo por unidad', 'Rendimiento (%)', 'Proveedor', 'Stock mínimo',
  'Kioskos', 'Nota', 'Activo', 'Actualizado'
];

// Catálogo sugerido de categorías (editable libremente desde el formulario —
// esto solo precarga el selector, no restringe lo que ya haya guardado).
const CATEGORIAS_SUGERIDAS = [
  'Cerveza', 'Licores y Destilados', 'Insumos de Coctelería',
  'Bebidas No Alcohólicas', 'Hielo', 'Vasos y Desechables',
  'Snacks', 'Limpieza e Higiene', 'Equipo y Utensilios', 'Otros'
];

// Áreas de negocio sugeridas — mismo criterio que categorías (libre,
// editable, esto solo precarga el selector). Adaptado de "Área de negocio"
// de Lorito a la operación de un kiosko de cerveza y cocteles.
const AREAS_SUGERIDAS = [
  'Barra / Coctelería', 'Bodega', 'Cocina / Snacks',
  'Limpieza e Higiene', 'Administración', 'Mantenimiento y Equipo'
];

function configurarHoja() {
  prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS);
}

// ── UTILIDADES (mismo patrón del ecosistema — ver Code-inventario-v2-backend.gs) ──
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

// ── doGet ──────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const modulo = (e && e.parameter && e.parameter.modulo) || 'productos';
    if (modulo === 'productos') {
      return jsonOut({
        ok: true,
        registros: filasComoObjetos(prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS)),
        categoriasSugeridas: CATEGORIAS_SUGERIDAS,
        areasSugeridas: AREAS_SUGERIDAS
      });
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
      case 'producto_guardar':       return jsonOut(guardarProducto(payload));
      case 'producto_eliminar':      return jsonOut(eliminarProducto(payload));
      case 'productos_carga_masiva': return jsonOut(cargaMasivaProductos(payload));
      default: throw new Error('Acción no reconocida: ' + payload.accion);
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// ── PRODUCTOS ────────────────────────────────────────────────────────

// Arma el objeto {NombreColumna: valor} para una fila, a partir del payload
// que manda el formulario (o cada item de una carga masiva). "Costo por
// unidad" se calcula acá mismo (Precio sin IVA / Cantidad presentación) para
// que quede consistente sin importar si vino del modal o de un Excel.
function valoresProducto(p, id) {
  const precio = Number(p.precio_sin_iva) || 0;
  const cantidad = Number(p.cantidad_presentacion) || 0;
  const costo = cantidad > 0 ? precio / cantidad : 0;
  const rendimiento = (p.rendimiento !== undefined && p.rendimiento !== '' && p.rendimiento !== null)
    ? Number(p.rendimiento) : 100;

  return {
    'ID': id,
    'Nombre': p.nombre,
    'Categoría': p.categoria || '',
    'Área de negocio': p.area || '',
    'Unidad': p.unidad || '',
    'Presentación': p.presentacion || '',
    'Tamaño': p.tamano || '',
    'Precio sin IVA': precio,
    'IVA (%)': Number(p.iva) || 0,
    'Cantidad presentación': cantidad,
    'Costo por unidad': Number(costo.toFixed(4)),
    'Rendimiento (%)': rendimiento,
    'Proveedor': p.proveedor || '',
    'Stock mínimo': Number(p.stock_minimo) || 0,
    'Kioskos': p.kioskos || 'Todos',
    'Nota': p.nota || '',
    'Activo': p.activo === false || p.activo === 'false' ? false : true,
    'Actualizado': new Date().toISOString()
  };
}

function guardarProducto(p) {
  if (!p.nombre) throw new Error('Falta el nombre del producto.');
  const hoja = prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS);
  const filaExistente = p.id ? filaPorValor(hoja, 'ID', p.id, ENCABEZADOS_PRODUCTOS) : -1;
  const id = p.id || Date.now();
  const fila = filaExistente > 0 ? filaExistente : hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PRODUCTOS, valoresProducto(p, id));
  return { ok: true, id: id };
}

function eliminarProducto(p) {
  if (!p.id) throw new Error('Falta el id del producto a eliminar.');
  const hoja = prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS);
  const fila = filaPorValor(hoja, 'ID', p.id, ENCABEZADOS_PRODUCTOS);
  if (fila === -1) throw new Error('No existe ese producto: ' + p.id);
  hoja.deleteRow(fila);
  return { ok: true, eliminado: p.id };
}

// Carga masiva: crea varios productos de una sola vez (siempre altas nuevas
// — para editar uno que ya existe se usa el formulario, no la carga
// masiva). Si alguna fila del Excel/CSV viene sin nombre u otro dato
// inválido, esa fila se salta y sigue con el resto — devuelve el detalle de
// qué se creó y qué falló para mostrarlo en pantalla.
function cargaMasivaProductos(p) {
  const lista = Array.isArray(p.productos) ? p.productos : [];
  if (!lista.length) throw new Error('No se recibieron productos para cargar.');

  const hoja = prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS);
  let filaLibre = hoja.getLastRow() + 1;
  const creados = [];
  const errores = [];

  lista.forEach(function(item, idx) {
    try {
      if (!item.nombre) throw new Error('Falta el nombre.');
      const id = 'PRD-' + Date.now() + '-' + idx;
      escribirFilaPorEncabezado(hoja, filaLibre, ENCABEZADOS_PRODUCTOS, valoresProducto(item, id));
      creados.push({ fila: idx + 1, nombre: item.nombre, id: id });
      filaLibre++;
    } catch (err) {
      errores.push({ fila: idx + 1, nombre: item.nombre || '(sin nombre)', error: err.message });
    }
  });

  return { ok: true, creados: creados.length, errores: errores };
}
