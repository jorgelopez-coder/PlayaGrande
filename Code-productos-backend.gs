/**
 * Backend Apps Script para el Sheet "Base de Productos - Kioskos" —
 * módulo INDEPENDIENTE de catálogo de productos, separado del Sheet e
 * implementación de Inventario v2 (Code-inventario-v2-backend.gs, que tiene
 * su propia pestaña "Productos" para stock/mínimos/recetas).
 *
 * Adaptado de la lógica de "Maestro_Productos" de Ecosistema Lorito
 * (maestro-productos.html / Code-compras-backend.gs), pero simplificado a
 * catálogo básico: sin Alias_Productos ni Costo_Promedio (eso vive del
 * lado de facturas/compras en Lorito y acá no aplica todavía) — solo
 * ID, Nombre, Categoría, Unidad, Nota y Activo.
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
 * Si se agregan columnas nuevas: siempre al FINAL de ENCABEZADOS_PRODUCTOS,
 * nueva versión del deployment y configurarHoja() de nuevo.
 */

// ── CONFIG ─────────────────────────────────────────────────────────
const HOJA_PRODUCTOS = 'Productos';
const ENCABEZADOS_PRODUCTOS = ['ID', 'Nombre', 'Categoría', 'Unidad', 'Nota', 'Activo', 'Actualizado'];

// Catálogo sugerido de categorías (editable libremente desde el formulario —
// esto solo precarga el selector, no restringe lo que ya haya guardado).
const CATEGORIAS_SUGERIDAS = [
  'Cerveza', 'Licores y Destilados', 'Insumos de Coctelería',
  'Bebidas No Alcohólicas', 'Hielo', 'Vasos y Desechables',
  'Snacks', 'Limpieza e Higiene', 'Equipo y Utensilios', 'Otros'
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
        categoriasSugeridas: CATEGORIAS_SUGERIDAS
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
      case 'producto_guardar':   return jsonOut(guardarProducto(payload));
      case 'producto_eliminar':  return jsonOut(eliminarProducto(payload));
      default: throw new Error('Acción no reconocida: ' + payload.accion);
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// ── PRODUCTOS ────────────────────────────────────────────────────────
function guardarProducto(p) {
  if (!p.nombre) throw new Error('Falta el nombre del producto.');
  const hoja = prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS);
  const filaExistente = p.id ? filaPorValor(hoja, 'ID', p.id, ENCABEZADOS_PRODUCTOS) : -1;
  const id = p.id || Date.now();
  const fila = filaExistente > 0 ? filaExistente : hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PRODUCTOS, {
    'ID': id,
    'Nombre': p.nombre,
    'Categoría': p.categoria || '',
    'Unidad': p.unidad || '',
    'Nota': p.nota || '',
    'Activo': p.activo === false ? false : true,
    'Actualizado': new Date().toISOString()
  });
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
