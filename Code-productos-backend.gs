/**
 * DESCONTINUADO (2026-07-25): este módulo nunca se desplegó y se fusionó
 * dentro de Maestro de Productos — ver Code-cuentas-por-pagar-kioskos-backend.gs
 * (hoja "Maestro_Productos", acción `maestro_guardar_ficha` y los campos
 * agregados a MAESTRO_ENCABEZADOS). Se deja este archivo como referencia del
 * diseño de campos (Área de negocio, Presentación, Tamaño, etc.), no hace
 * falta desplegar este Sheet aparte.
 *
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
 * v3 (2026-07-24, mismo día): se copia la pestaña "⚙ Configuración" de
 * costos-productos.html — Categoría, Área de negocio, Unidad, Presentación
 * del proveedor, Familia/Subfamilia y Tipo de cambio (₡ por US$) pasan de
 * ser listas sugeridas hardcodeadas (o campos de texto libre) a catálogos
 * editables desde una pestaña nueva del Sheet, "Configuracion" (agregar/
 * quitar valores desde productos.html, sin tocar el código). Se agregan las
 * columnas "Familia" y "Subfamilia" a ENCABEZADOS_PRODUCTOS (clasificación
 * opcional del producto, igual que en Lorito). El tipo de cambio USD solo
 * sirve como ayuda de conversión en el formulario — igual que en Lorito, el
 * precio siempre se guarda ya convertido a colones, no se persiste la
 * moneda original. Fuera de alcance (igual que en v1/v2): conversión
 * automática unidad de compra → unidad de receta, "peso de botella vacía" e
 * historial de compras — esas viven del lado de facturas/compras o, en el
 * caso del peso de botella, ya tienen su propio flujo con tara en
 * mermas.html.
 *
 * v4 (2026-07-24, mismo día): se copia la sección "Información para
 * recetas" de costos-productos.html (Lorito) al formulario de "Nuevo
 * producto" — toggle "Aplica para recetas" (para excluir del futuro módulo
 * de recetas cosas como limpieza/empaques/servicios) y checkbox "Usar este
 * precio manual en las recetas" (para que, más adelante, un módulo de
 * recetas pueda usar el "Costo real por unidad" de acá en vez de recalcular
 * solo). Se agregan las columnas "Aplica receta" y "Usar precio manual" a
 * ENCABEZADOS_PRODUCTOS. Todavía no existe un módulo de recetas propio en
 * Kioskos — estos dos campos solo quedan guardados en el catálogo,
 * preparados para cuando se construya ese módulo (ver Inventario v2 /
 * Base de Productos en las notas del proyecto).
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
 * v5 (2026-07-24, mismo día): se saca la columna "Stock mínimo" de
 * ENCABEZADOS_PRODUCTOS (era un solo número global por producto) y se
 * reemplaza por una pestaña nueva, "Minimos" — un mínimo esperado POR
 * PRODUCTO × POR KIOSKO (mismo concepto que ya usa la pestaña "Minimos" de
 * Inventario v2 — ver Code-inventario-v2-backend.gs — pero acá vive en el
 * Sheet de Base de Productos, no se tocan esos dos módulos entre sí). Se
 * gestiona desde una sección aparte de productos.html ("📏 Mínimos por
 * kiosko"), no desde el formulario de "Nuevo producto". Como el Sheet de
 * este módulo todavía no se había desplegado (ver notas del proyecto), no
 * hace falta migración: si alguien ya había desplegado la v2/v3/v4 con la
 * columna "Stock mínimo" y tiene datos ahí, esos valores quedan huérfanos —
 * hay que migrarlos a mano a la pestaña "Minimos" (Producto ID, Kiosko,
 * Mínimo) antes de borrar la columna vieja del Sheet real.
 *
 * Pestañas: "Productos" y "Minimos".
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
  'Costo por unidad', 'Rendimiento (%)', 'Proveedor',
  'Kioskos', 'Nota', 'Activo', 'Actualizado',
  'Familia', 'Subfamilia', // v3
  'Aplica receta', 'Usar precio manual' // v4 — siempre al FINAL, ver nota de migración arriba
  // "Stock mínimo" (global) sacada en v5 — ver pestaña "Minimos" más abajo.
];

// ── MINIMOS (pestaña "Minimos", v5) ───────────────────────────────────
// Mínimo esperado por PRODUCTO × KIOSKO. Una fila por combinación que
// Jorge haya definido explícitamente desde la sección "📏 Mínimos por
// kiosko" de productos.html — si un producto/kiosko no tiene fila acá,
// significa que no se le definió mínimo todavía (no es lo mismo que 0).
const HOJA_MINIMOS = 'Minimos';
const ENCABEZADOS_MINIMOS = ['Producto ID', 'Kiosko', 'Mínimo', 'Actualizado'];

// ── CONFIGURACIÓN (catálogos editables, pestaña "Configuracion") ──────
// Reemplaza a los antiguos CATEGORIAS_SUGERIDAS/AREAS_SUGERIDAS hardcodeados:
// ahora viven en una pestaña del Sheet y se administran desde la pestaña
// "⚙ Configurar" de productos.html (igual que la pestaña "Configuración" de
// costos-productos.html en Lorito). Estas listas de acá solo se usan UNA
// VEZ, para sembrar la hoja "Configuracion" la primera vez que se crea —
// después de eso el Sheet manda, esto no se vuelve a leer.
const HOJA_CONFIG = 'Configuracion';
const ENCABEZADOS_CONFIG = ['Tipo', 'Valor', 'Extra'];

// Tipo puede ser: 'Categoria' | 'Area' | 'Unidad' | 'Presentacion' | 'Familia'
// | 'Subfamilia' (Extra = familia a la que pertenece) | 'TipoCambioUSD'
// (fila única, Valor = número, sin Extra).
const CONFIG_DEFAULTS = {
  Categoria: [
    'Cerveza', 'Licores y Destilados', 'Insumos de Coctelería',
    'Bebidas No Alcohólicas', 'Hielo', 'Vasos y Desechables',
    'Snacks', 'Limpieza e Higiene', 'Equipo y Utensilios', 'Otros'
  ],
  Area: [
    'Barra / Coctelería', 'Bodega', 'Cocina / Snacks',
    'Limpieza e Higiene', 'Administración', 'Mantenimiento y Equipo'
  ],
  Unidad: ['Unidad', 'Litro', 'Mililitro', 'Onza', 'Kilo', 'Gramo'],
  Presentacion: [
    'Botella', 'Lata', 'Six pack', 'Caja', 'Bolsa', 'Paquete',
    'Barril', 'Galón', 'Unidad'
  ],
  Familia: ['Cerveza', 'Licores', 'Cocteles', 'No alcohólicos']
};

function configurarHoja() {
  prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS);
  prepararHoja(HOJA_MINIMOS, ENCABEZADOS_MINIMOS);
  sembrarConfigPorDefecto(prepararHoja(HOJA_CONFIG, ENCABEZADOS_CONFIG));
}

// Si "Configuracion" está recién creada (sin filas todavía), la llena con
// los catálogos por defecto de arriba. Si ya tiene datos no la toca —
// aunque Jorge borre todos los valores de un tipo desde la pantalla, no se
// vuelve a sembrar sola.
function sembrarConfigPorDefecto(hojaConfig) {
  if (hojaConfig.getLastRow() > 1) return;
  const filas = [];
  Object.keys(CONFIG_DEFAULTS).forEach(function(tipo) {
    CONFIG_DEFAULTS[tipo].forEach(function(valor) { filas.push([tipo, valor, '']); });
  });
  if (filas.length) hojaConfig.getRange(2, 1, filas.length, ENCABEZADOS_CONFIG.length).setValues(filas);
}

// Lee toda la pestaña "Configuracion" y la separa en las listas que
// consume el frontend. Se llama en cada doGet ?modulo=productos (misma
// llamada que ya hacía productos.html, sin agregar otro round-trip).
function leerConfigListas() {
  const hoja = prepararHoja(HOJA_CONFIG, ENCABEZADOS_CONFIG);
  sembrarConfigPorDefecto(hoja);
  const filas = filasComoObjetos(hoja);
  const listas = { Categoria: [], Area: [], Unidad: [], Presentacion: [], Familia: [] };
  const subfamilias = [];
  let tipoCambioUsd = null;
  filas.forEach(function(f) {
    const tipo = f['Tipo'];
    if (tipo === 'Subfamilia') { subfamilias.push({ familia: f['Extra'] || '', subfamilia: f['Valor'] }); return; }
    if (tipo === 'TipoCambioUSD') { tipoCambioUsd = Number(f['Valor']) || null; return; }
    if (listas[tipo]) listas[tipo].push(f['Valor']);
  });
  return {
    categorias: listas.Categoria,
    areas: listas.Area,
    unidades: listas.Unidad,
    presentaciones: listas.Presentacion,
    familias: listas.Familia,
    subfamilias: subfamilias,
    tipoCambioUsd: tipoCambioUsd
  };
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
      const cfg = leerConfigListas();
      return jsonOut({
        ok: true,
        registros: filasComoObjetos(prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS)),
        minimos: filasComoObjetos(prepararHoja(HOJA_MINIMOS, ENCABEZADOS_MINIMOS)),
        categoriasSugeridas: cfg.categorias,
        areasSugeridas: cfg.areas,
        unidadesSugeridas: cfg.unidades,
        presentacionesSugeridas: cfg.presentaciones,
        familiasSugeridas: cfg.familias,
        subfamilias: cfg.subfamilias,
        tipoCambioUsd: cfg.tipoCambioUsd
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
      case 'minimo_guardar':         return jsonOut(guardarMinimo(payload));
      case 'config_agregar':             return jsonOut(configAgregar(payload));
      case 'config_eliminar':            return jsonOut(configEliminar(payload));
      case 'config_subfamilia_agregar':  return jsonOut(configSubfamiliaAgregar(payload));
      case 'config_subfamilia_eliminar': return jsonOut(configSubfamiliaEliminar(payload));
      case 'config_tipo_cambio_guardar': return jsonOut(configTipoCambioGuardar(payload));
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
    'Kioskos': p.kioskos || 'Todos',
    'Nota': p.nota || '',
    'Activo': p.activo === false || p.activo === 'false' ? false : true,
    'Actualizado': new Date().toISOString(),
    'Familia': p.familia || '',
    'Subfamilia': p.subfamilia || '',
    'Aplica receta': p.aplica_receta === false || p.aplica_receta === 'false' ? false : true,
    'Usar precio manual': p.usar_precio_manual === true || p.usar_precio_manual === 'true' ? true : false
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

// ── MINIMOS (mínimo esperado por producto × kiosko, v5) ───────────────
// Upsert de una sola celda de la grilla "📏 Mínimos por kiosko": busca la
// fila (Producto ID, Kiosko) y la actualiza, o la crea si es la primera vez
// que se define un mínimo para esa combinación. Si el valor llega en 0 (o
// vacío), se borra la fila en vez de guardar un 0 — así la grilla vuelve a
// mostrar la celda como "sin definir" en lugar de un mínimo real de cero.
function guardarMinimo(p) {
  if (!p.productoId) throw new Error('Falta el producto.');
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  const hoja = prepararHoja(HOJA_MINIMOS, ENCABEZADOS_MINIMOS);
  const nFilas = hoja.getLastRow() - 1;
  let filaEncontrada = -1;
  if (nFilas > 0) {
    const datos = hoja.getRange(2, 1, nFilas, 2).getValues();
    for (let i = 0; i < datos.length; i++) {
      if (String(datos[i][0]) === String(p.productoId) && String(datos[i][1]) === String(p.kiosko)) {
        filaEncontrada = i + 2;
        break;
      }
    }
  }
  const valor = Number(p.valor) || 0;
  if (valor <= 0) {
    if (filaEncontrada > -1) hoja.deleteRow(filaEncontrada);
    return { ok: true, borrado: true };
  }
  const fila = [p.productoId, p.kiosko, valor, new Date().toISOString()];
  if (filaEncontrada > -1) hoja.getRange(filaEncontrada, 1, 1, ENCABEZADOS_MINIMOS.length).setValues([fila]);
  else hoja.appendRow(fila);
  return { ok: true, valor: valor };
}

// ── CONFIGURACIÓN (catálogos editables) ───────────────────────────────
// Tipos simples: una fila por valor, sin relación con nada más.
const TIPOS_CONFIG_SIMPLE = ['Categoria', 'Area', 'Unidad', 'Presentacion', 'Familia'];

function configAgregar(p) {
  if (TIPOS_CONFIG_SIMPLE.indexOf(p.tipo) === -1) throw new Error('Tipo de configuración no reconocido: ' + p.tipo);
  const valor = (p.valor || '').toString().trim();
  if (!valor) throw new Error('Falta el valor a agregar.');
  const hoja = prepararHoja(HOJA_CONFIG, ENCABEZADOS_CONFIG);
  const filas = filasComoObjetos(hoja);
  const yaExiste = filas.some(function(f) {
    return f['Tipo'] === p.tipo && String(f['Valor']).toLowerCase() === valor.toLowerCase();
  });
  if (yaExiste) throw new Error('Ese valor ya existe en la lista.');
  hoja.appendRow([p.tipo, valor, '']);
  return { ok: true };
}

function configEliminar(p) {
  if (TIPOS_CONFIG_SIMPLE.indexOf(p.tipo) === -1) throw new Error('Tipo de configuración no reconocido: ' + p.tipo);
  const hoja = prepararHoja(HOJA_CONFIG, ENCABEZADOS_CONFIG);
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) throw new Error('No se encontró ese valor.');
  const datos = hoja.getRange(2, 1, nFilas, ENCABEZADOS_CONFIG.length).getValues();
  let filaEncontrada = -1;
  for (let i = 0; i < datos.length; i++) {
    if (datos[i][0] === p.tipo && String(datos[i][1]) === String(p.valor)) { filaEncontrada = i + 2; break; }
  }
  if (filaEncontrada === -1) throw new Error('No se encontró ese valor.');
  hoja.deleteRow(filaEncontrada);

  // Si se elimina una Familia, se eliminan también sus subfamilias huérfanas
  // (de abajo hacia arriba para que no se corran los índices al borrar).
  if (p.tipo === 'Familia') {
    const nFilas2 = hoja.getLastRow() - 1;
    if (nFilas2 > 0) {
      const datos2 = hoja.getRange(2, 1, nFilas2, ENCABEZADOS_CONFIG.length).getValues();
      for (let i = datos2.length - 1; i >= 0; i--) {
        if (datos2[i][0] === 'Subfamilia' && datos2[i][2] === p.valor) hoja.deleteRow(i + 2);
      }
    }
  }
  return { ok: true };
}

function configSubfamiliaAgregar(p) {
  const familia = (p.familia || '').toString().trim();
  const subfamilia = (p.valor || '').toString().trim();
  if (!familia) throw new Error('Falta la familia.');
  if (!subfamilia) throw new Error('Falta la subfamilia.');
  const hoja = prepararHoja(HOJA_CONFIG, ENCABEZADOS_CONFIG);
  const filas = filasComoObjetos(hoja);
  const yaExiste = filas.some(function(f) {
    return f['Tipo'] === 'Subfamilia' && f['Extra'] === familia && String(f['Valor']).toLowerCase() === subfamilia.toLowerCase();
  });
  if (yaExiste) throw new Error('Esa subfamilia ya existe para esa familia.');
  hoja.appendRow(['Subfamilia', subfamilia, familia]);
  return { ok: true };
}

function configSubfamiliaEliminar(p) {
  const hoja = prepararHoja(HOJA_CONFIG, ENCABEZADOS_CONFIG);
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas > 0) {
    const datos = hoja.getRange(2, 1, nFilas, ENCABEZADOS_CONFIG.length).getValues();
    for (let i = datos.length - 1; i >= 0; i--) {
      if (datos[i][0] === 'Subfamilia' && datos[i][2] === p.familia && datos[i][1] === p.valor) {
        hoja.deleteRow(i + 2);
        return { ok: true };
      }
    }
  }
  throw new Error('No se encontró esa subfamilia.');
}

// "TipoCambioUSD" es una fila única (no una lista) — se busca por Tipo y se
// actualiza el Valor si ya existe, o se crea si es la primera vez.
function configTipoCambioGuardar(p) {
  const valor = Number(p.valor);
  if (!valor || valor <= 0) throw new Error('Ingresá un tipo de cambio válido.');
  const hoja = prepararHoja(HOJA_CONFIG, ENCABEZADOS_CONFIG);
  const nFilas = hoja.getLastRow() - 1;
  let filaExistente = -1;
  if (nFilas > 0) {
    const tipos = hoja.getRange(2, 1, nFilas, 1).getValues();
    for (let i = 0; i < tipos.length; i++) {
      if (tipos[i][0] === 'TipoCambioUSD') { filaExistente = i + 2; break; }
    }
  }
  if (filaExistente === -1) hoja.appendRow(['TipoCambioUSD', valor, '']);
  else hoja.getRange(filaExistente, 2).setValue(valor);
  return { ok: true, tipoCambioUsd: valor };
}
