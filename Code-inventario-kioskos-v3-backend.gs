/**
 * Backend Apps Script para el Sheet "Inventario - Kioskos".
 * Usado por inventario.html, ordenes-compra.html y proveedores.html.
 *
 * Reemplaza a Code-inventario-kioskos-backend.gs (v1) y a
 * Code-inventario-v2-backend.gs (v2, nunca se desplegó) — ver README.md.
 * Es un puerto de la lógica de "Inventarios" de Ecosistema Lorito
 * (Code-inventario-backend.gs + la parte de proveedores de
 * Code-compras-backend.gs), angosto a propósito: el catálogo de
 * productos NO vive acá, se toma del Maestro de Productos
 * (Sheet "Cuentas por Pagar - Kioskos", hoja "Maestro_Productos",
 * leído por gviz directo desde el frontend). Este backend solo guarda
 * el historial de tomas, los mínimos por kiosko y los proveedores.
 *
 * Cómo desplegarlo:
 * 1. Creá un Google Sheet nuevo en blanco, ej. "Inventario - Kioskos".
 * 2. Extensiones > Apps Script, pegá este código (reemplazando el
 *    contenido del archivo por defecto).
 * 3. Corré UNA VEZ la función configurarHojas() desde el editor (▶ con
 *    configurarHojas seleccionado) para crear las pestañas
 *    HISTORIAL_inventario, Minimos y Proveedores con sus encabezados.
 * 4. Implementar > Nueva implementación > Tipo: Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquiera
 * 5. Copiá la URL del Web App resultante y reemplazá
 *    TODO_APPS_SCRIPT_INVENTARIO_KIOSKOS en inventario.html,
 *    ordenes-compra.html y proveedores.html.
 * 6. Compartí el Sheet como "Cualquiera con el enlace puede ver"
 *    (Lector), para que esas páginas puedan leer HISTORIAL_inventario,
 *    Minimos y Proveedores vía la API pública de gviz sin necesitar
 *    autenticación.
 */

const HOJA_HISTORIAL   = 'HISTORIAL_inventario';
const HOJA_MINIMOS     = 'Minimos';
const HOJA_PROVEEDORES = 'Proveedores';

const ENCABEZADOS_HISTORIAL = [
  'Toma ID', 'Kiosko', 'Fecha toma', 'Fecha inicio', 'Fecha fin',
  'Producto', 'Categoría', 'Área', 'Presentación', 'Unidad',
  'Precio sin IVA', 'Cant. completos', 'Cant. en uso',
  'Valor cerrado', 'Valor abierto', 'Valor total línea',
  'Registrado'
];

// 2026-07-27 — control por peso (botellas de licor, cerveza en sifón): ver
// project_control_peso_tara_inventario en la memoria. Un producto tipo
// "peso" puede tener varias botellas/barriles abiertos a la vez en la misma
// toma (ej. dos rones distintos abiertos); cada uno se pesa por separado
// porque la tara (peso del envase vacío) cambia según la marca de la
// botella. 'Cant. en uso' en HISTORIAL_inventario sigue siendo el TOTAL en
// ml (suma de los netos de todos los pesajes de esa línea) para no romper
// a los lectores existentes (ordenes-compra.html); el detalle por envase
// queda acá como evidencia/auditoría de cómo se llegó a ese total.
const HOJA_PESAJES = 'HISTORIAL_pesajes';
const ENCABEZADOS_PESAJES = [
  'Toma ID', 'Kiosko', 'Fecha toma', 'Producto',
  'Marca/Envase', 'Peso Bruto (g)', 'Tara (g)', 'Neto (ml)', 'Registrado'
];

// Catálogo aprendido de taras por marca: la primera vez que se pesa una
// botella de una marca nueva de un producto, se guarda acá (upsert por
// Producto+Marca) para que la próxima toma la sugiera sola en vez de pedir
// pesar el envase vacío otra vez. No es una tabla maestra estricta — el
// usuario puede editar la tara de un pesaje puntual sin que eso cambie el
// catálogo si no lo confirma.
const HOJA_MARCAS_ENVASE = 'MarcasEnvase';
const ENCABEZADOS_MARCAS_ENVASE = ['Producto', 'Marca/Envase', 'Tara (g)', 'Actualizado'];

const ENCABEZADOS_MINIMOS = ['Producto', 'Kiosko', 'Mínimo', 'Actualizado'];

const PROV_ENCABEZADOS = [
  'ID', 'Nombre jurídico', 'Nombre comercial', 'Categoría', 'Contacto',
  'Teléfono', 'Correo', 'Días de pedido', 'Notas de contacto', 'Cuenta',
  'Condición de pago', 'Notas de pago', 'Actualizado'
];
const PROV_COL = {
  ID: 1, NOMBRE_JURIDICO: 2, NOMBRE_COMERCIAL: 3, CATEGORIA: 4, CONTACTO: 5,
  TELEFONO: 6, CORREO: 7, DIAS_PEDIDO: 8, NOTAS_CONTACTO: 9, CUENTA: 10,
  CONDICION_PAGO: 11, NOTAS_PAGO: 12, ACTUALIZADO: 13
};

// Corré esta función UNA VEZ desde el editor de Apps Script para preparar el Sheet.
function configurarHojas() {
  prepararHoja(HOJA_HISTORIAL, ENCABEZADOS_HISTORIAL);
  prepararHoja(HOJA_MINIMOS, ENCABEZADOS_MINIMOS);
  prepararHoja(HOJA_PROVEEDORES, PROV_ENCABEZADOS);
  prepararHoja(HOJA_PESAJES, ENCABEZADOS_PESAJES);
  prepararHoja(HOJA_MARCAS_ENVASE, ENCABEZADOS_MARCAS_ENVASE);
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

    let result;
    switch (payload.modulo) {
      case 'inventario':          result = guardarInventario(payload); break;
      case 'minimo_guardar':      result = guardarMinimo(payload); break;
      case 'guardar_proveedor':   result = guardarProveedor(payload); break;
      case 'eliminar_proveedor':  result = eliminarProveedor(payload); break;
      case 'marca_envase_guardar':result = guardarMarcaEnvase(payload); break;
      default:
        throw new Error('Módulo no reconocido: ' + payload.modulo);
    }
    return jsonOut({ ok: true, result: result });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// ── TOMA DE INVENTARIO ────────────────────────────────────────────
// Cada línea puede traer "pesajes": [{marca, bruto_g, tara_g, neto_ml}, ...]
// para productos de control por peso (uno por botella/barril abierto). Acá
// solo se guarda la evidencia en HISTORIAL_pesajes — la suma ya viene
// calculada en l.abierto desde inventario.html (ver sumaPesajes() ahí), no
// se recalcula en el backend para no duplicar la lógica de densidad/tara.
function guardarInventario(p) {
  const lineas = p.lineas || [];
  if (!lineas.length) throw new Error('La toma no tiene líneas contadas.');
  if (!p.kiosko) throw new Error('Falta el kiosko de la toma.');

  const hoja = prepararHoja(HOJA_HISTORIAL, ENCABEZADOS_HISTORIAL);
  const registrado = new Date().toISOString();

  const filas = lineas.map(function(l) {
    return [
      p.id || '',
      p.kiosko || '',
      p.fecha_toma || '',
      p.fecha_inicio || '',
      p.fecha_fin || '',
      l.nombre || '',
      l.categoria || '',
      l.area || '',
      l.presentacion || '',
      l.unidad || '',
      Number(l.precio_sin_iva) || 0,
      Number(l.cerrado) || 0,
      Number(l.abierto) || 0,
      Number(l.val_cerrado) || 0,
      Number(l.val_abierto) || 0,
      Number(l.valor) || 0,
      registrado
    ];
  });

  const filaInicio = hoja.getLastRow() + 1;
  hoja.getRange(filaInicio, 1, filas.length, ENCABEZADOS_HISTORIAL.length).setValues(filas);

  const filasPesajes = [];
  lineas.forEach(function(l) {
    (l.pesajes || []).forEach(function(pj) {
      if (!pj || (pj.bruto_g === '' && pj.bruto_g !== 0)) return;
      filasPesajes.push([
        p.id || '', p.kiosko || '', p.fecha_toma || '', l.nombre || '',
        pj.marca || '', Number(pj.bruto_g) || 0, Number(pj.tara_g) || 0,
        Number(pj.neto_ml) || 0, registrado
      ]);
    });
  });
  if (filasPesajes.length) {
    const hojaPesajes = prepararHoja(HOJA_PESAJES, ENCABEZADOS_PESAJES);
    hojaPesajes.getRange(hojaPesajes.getLastRow() + 1, 1, filasPesajes.length, ENCABEZADOS_PESAJES.length).setValues(filasPesajes);
  }

  return { filas_escritas: filas.length, fila_inicio: filaInicio, pesajes_escritos: filasPesajes.length };
}

// ── MARCAS DE ENVASE (tara aprendida por marca, para autocompletar) ─────
function filaMarcaEnvase_(hoja, producto, marca) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const datos = hoja.getRange(2, 1, nFilas, 2).getValues();
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][0]) === String(producto) && String(datos[i][1]).trim().toLowerCase() === String(marca).trim().toLowerCase()) return i + 2;
  }
  return -1;
}

function guardarMarcaEnvase(p) {
  const producto = String(p.producto || '').trim();
  const marca = String(p.marca || '').trim();
  if (!producto || !marca) throw new Error('Falta el producto o la marca/envase.');
  if (p.tara_g === undefined || p.tara_g === '' || p.tara_g === null) throw new Error('Falta la tara (g).');

  const hoja = prepararHoja(HOJA_MARCAS_ENVASE, ENCABEZADOS_MARCAS_ENVASE);
  let fila = filaMarcaEnvase_(hoja, producto, marca);
  if (fila === -1) fila = hoja.getLastRow() + 1;

  hoja.getRange(fila, 1, 1, ENCABEZADOS_MARCAS_ENVASE.length).setValues([[
    producto, marca, Number(p.tara_g) || 0, new Date().toISOString()
  ]]);

  return { fila: fila };
}

// ── MÍNIMOS (por Producto × Kiosko) ───────────────────────────────
function filaMinimoPorClave(hoja, producto, kiosko) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const datos = hoja.getRange(2, 1, nFilas, 2).getValues(); // Producto, Kiosko
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][0]) === String(producto) && String(datos[i][1]) === String(kiosko)) return i + 2;
  }
  return -1;
}

function guardarMinimo(p) {
  if (!p.producto) throw new Error('Falta el producto.');
  if (!p.kiosko) throw new Error('Falta el kiosko.');

  const hoja = prepararHoja(HOJA_MINIMOS, ENCABEZADOS_MINIMOS);
  let fila = filaMinimoPorClave(hoja, p.producto, p.kiosko);
  if (fila === -1) fila = hoja.getLastRow() + 1;

  hoja.getRange(fila, 1, 1, ENCABEZADOS_MINIMOS.length).setValues([[
    p.producto, p.kiosko, Number(p.minimo) || 0, new Date().toISOString()
  ]]);

  return { fila: fila };
}

// ── PROVEEDORES ────────────────────────────────────────────────────
function filaProveedorPorId(hoja, id) {
  if (!id) return -1;
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const ids = hoja.getRange(2, PROV_COL.ID, nFilas, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function guardarProveedor(p) {
  if (!p.nombre_juridico) throw new Error('Falta el nombre jurídico del proveedor.');

  const hoja = prepararHoja(HOJA_PROVEEDORES, PROV_ENCABEZADOS);
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
  hoja.getRange(fila, PROV_COL.ACTUALIZADO).setValue(new Date().toISOString());

  return { id: id, fila: fila, nuevo: esNuevo };
}

function eliminarProveedor(p) {
  if (!p.id) throw new Error('Falta el ID del proveedor a eliminar.');
  const hoja = prepararHoja(HOJA_PROVEEDORES, PROV_ENCABEZADOS);
  const fila = filaProveedorPorId(hoja, p.id);
  if (fila === -1) throw new Error('No se encontró el proveedor con ID ' + p.id);
  hoja.deleteRow(fila);
  return { eliminado: p.id };
}
