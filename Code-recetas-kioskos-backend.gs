/**
 * Backend de Menú y Recetas (recetas.html, Ecosistema Kioskos) — platos con
 * categorías Nivel1/Nivel2, recetas y subrecetas con costeo, presentaciones
 * de venta enlazadas a Maestro_Productos.
 *
 * A diferencia del resto de backends de Ecosistema Kioskos, este módulo
 * vive en su PROPIO Sheet separado (no en "Cuentas por Pagar - Kioskos") —
 * mismo patrón que ya usan Inventario o RRHH, cada uno con su Sheet y su
 * propia implementación. Solo el Maestro de Productos (para costear
 * ingredientes) se sigue leyendo del Sheet de Cuentas por Pagar, en vivo,
 * vía Sheets API cruzada (ver MAESTRO_SHEET_ID/getHojaMaestroExterna_ más
 * abajo) — este backend nunca escribe ahí, solo lee.
 *
 * Cómo desplegarlo (primera vez):
 * 1. Abrí el Sheet https://docs.google.com/spreadsheets/d/1U9nITZdHgdOmoPpHfXHC_6Cfb8tjQXH36s6QJLVJ90w/
 *    (o el que uses como Sheet de Menú y Recetas).
 * 2. Compartilo como "Cualquiera con el enlace — Lector" (Configuración para
 *    compartir), igual que ya está el Sheet de Cuentas por Pagar — sin esto,
 *    recetas.html no puede leer Configuracion/Menu_Platos/Menu_Recetas vía
 *    gviz (son lecturas públicas sin login).
 * 3. Extensiones > Apps Script (esto crea un proyecto NUEVO, atado a ESTE
 *    Sheet — no es el mismo proyecto que Cuentas por Pagar). Pegá el
 *    contenido completo de este archivo.
 * 4. Corré UNA VEZ, a mano desde este editor, la función configurarHojas()
 *    para crear las pestañas "Configuracion" (con Alimentos/Bebidas y las
 *    categorías Nivel2 por defecto ya sembradas), "Menu_Platos" y
 *    "Menu_Recetas".
 * 5. Implementar > Nueva implementación > Aplicación web (Ejecutar como: Yo
 *    · Acceso: Cualquiera). La primera vez Google va a pedir autorizar el
 *    acceso — este script necesita permiso también para LEER el Sheet de
 *    Cuentas por Pagar (Maestro_Productos), no solo el propio.
 * 6. Copiá la URL /exec que te da y pegala en recetas.html, constante
 *    APPS_SCRIPT_RECETAS (reemplazá el placeholder que empieza con "TODO_").
 *
 * Para actualizar código más adelante: pegá el archivo completo de nuevo acá
 * y Implementar > Gestionar implementaciones > Editar > Nueva versión (la
 * URL /exec no cambia, no hace falta tocar recetas.html de nuevo).
 */

// ── MAESTRO DE PRODUCTOS (lectura cruzada, Sheet "Cuentas por Pagar - Kioskos") ──
const MAESTRO_SHEET_ID = '1Qf3JgKR8ZKhWAxUscKnA5xwqKMm6qvDjgtq8-3P0G4E';
const HOJA_MAESTRO_EXTERNA = 'Maestro_Productos';

function getHojaMaestroExterna_() {
  const ss = SpreadsheetApp.openById(MAESTRO_SHEET_ID);
  const hoja = ss.getSheetByName(HOJA_MAESTRO_EXTERNA);
  if (!hoja) throw new Error('No se encontró la hoja "' + HOJA_MAESTRO_EXTERNA + '" en el Sheet de Cuentas por Pagar.');
  return hoja;
}

// ── CONFIGURACIÓN (propia de este Sheet — Nivel1/Nivel2 del menú) ─────
// Mismo esquema Tipo/Valor/Extra que usa maestro-productos.html para sus
// catálogos (Área/Categoría/Familia/Subfamilia), pero acá es una pestaña
// propia y exclusiva de este módulo — no comparte hoja con nada más, así
// que no hace falta la abstracción genérica por "Tipo": directamente Nivel1
// (lista simple) y Nivel2 (depende de un Nivel1 padre vía la columna Extra).
const HOJA_CONFIGURACION = 'Configuracion';
const CONFIGURACION_ENCABEZADOS = ['Tipo', 'Valor', 'Extra'];
const NIVEL1_DEFAULTS = ['Alimentos', 'Bebidas'];
const NIVEL2_DEFAULTS = {
  Alimentos: ['Entradas', 'Plato fuerte', 'Postre'],
  Bebidas: [
    'Cerveza industrial', 'Cerveza artesanal draft', 'Cerveza artesanal botella',
    'Gaseosas', 'Licores', 'Naturales'
  ]
};

// ── MENÚ Y RECETAS — hojas propias ─────────────────────────────────
const HOJA_MENU_PLATOS = 'Menu_Platos';
const MENU_PLATOS_ENCABEZADOS = [
  'ID', 'Nombre', 'Nivel1', 'Nivel2', 'Kioskos',
  // JSON de [{id,nombre,cantidad,precioVenta,nombreVentaSquare,activo}] —
  // una fila por presentación de venta del plato (ej. Vaso 16oz/10oz/4oz en
  // cerveza draft, Botella/Cuarta/Trago en licores; un plato de comida
  // simple normalmente tiene una sola presentación "Regular"). "cantidad"
  // está en la UnidadRendimiento de la receta enlazada (ver Menu_Recetas).
  // No editar a mano en el Sheet — se genera y se lee siempre desde
  // recetas.html (ver nota en configurarHojas()).
  'Presentaciones',
  'Activo', 'Creado', 'Actualizado'
];

const HOJA_MENU_RECETAS = 'Menu_Recetas';
const MENU_RECETAS_ENCABEZADOS = [
  'ID',
  'Tipo',      // 'receta' (1:1 con un plato) o 'subreceta' (reutilizable)
  'Nombre',    // subrecetas: nombre propio. Recetas: se copia el nombre del
               // plato SOLO como referencia visual en el Sheet — la app
               // nunca lo lee de vuelta para mostrarlo, siempre resuelve el
               // nombre en vivo desde Menu_Platos vía PlatoId.
  'PlatoId',   // solo tipo 'receta' — ÚNICA relación Plato↔Receta (a
               // propósito no hay un "RecetaId" en Menu_Platos: una FK en
               // los dos sentidos podría desincronizarse en un backend sin
               // transacciones; con una sola dirección, borrar una receta
               // nunca puede dejar un plato "huérfano" apuntando a nada).
  'Rendimiento', 'UnidadRendimiento',
  // JSON de [{tipoFuente:'producto'|'subreceta', ref, nombre, cantidad,
  // unidad}]. Para 'producto', ref = claveAgrupacionGS_(nombreEstandar) de
  // Maestro_Productos (mismo criterio de agrupación que claveAgrupacion_ en
  // maestro-productos.html — ver nota junto a esa función más abajo). Para
  // 'subreceta', ref = el ID de otra fila de esta misma pestaña. No editar
  // a mano en el Sheet.
  'Ingredientes',
  // Costo cacheado AL GUARDAR esta fila (nunca se recalcula en vivo al
  // leer) — así, cuando esta receta se usa como ingrediente de OTRA receta,
  // se usa este costo ya guardado en vez de recursar, lo que evita de raíz
  // cualquier ciclo subreceta-de-subreceta (mismo patrón ya probado en
  // Operaciones/costos-recetas.html). Si cambia el costo de un ingrediente
  // de esta receta, hay que volver a guardarla para que su propio costo se
  // actualice — no se propaga solo.
  'CostoTotal', 'CostoPorUnidadRendimiento',
  'Actualizado'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Menú y Recetas')
    .addItem('Configurar hojas (correr una vez)', 'configurarHojas')
    .addToUi();
}

// Crea las pestañas con sus encabezados si no existen todavía y siembra los
// valores por defecto de Nivel1/Nivel2. No toca hojas que ya tengan datos.
function configurarHojas() {
  prepararHoja(HOJA_CONFIGURACION, CONFIGURACION_ENCABEZADOS);
  sembrarConfiguracionPorDefecto_();
  const hojaMenuPlatos = prepararHoja(HOJA_MENU_PLATOS, MENU_PLATOS_ENCABEZADOS);
  hojaMenuPlatos.getRange(1, 6).setNote('No editar a mano — JSON generado por recetas.html.');
  const hojaMenuRecetas = prepararHoja(HOJA_MENU_RECETAS, MENU_RECETAS_ENCABEZADOS);
  hojaMenuRecetas.getRange(1, 7).setNote('No editar a mano — JSON generado por recetas.html.');
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

function getHojaConfiguracion() {
  return prepararHoja(HOJA_CONFIGURACION, CONFIGURACION_ENCABEZADOS);
}

// Siembra Nivel1/Nivel2 por defecto, pero solo si ese "Tipo" todavía no
// tiene ninguna fila — así correr configurarHojas() de nuevo más adelante
// (por ejemplo al pegar una versión nueva del código) nunca pisa valores
// que Jorge ya haya editado a mano desde la pestaña Configuración.
function sembrarConfiguracionPorDefecto_() {
  const hoja = getHojaConfiguracion();
  const nFilas = hoja.getLastRow() - 1;
  const tiposExistentes = {};
  if (nFilas > 0) {
    hoja.getRange(2, 1, nFilas, 1).getValues().forEach(function(f) { tiposExistentes[f[0]] = true; });
  }
  const filas = [];
  if (!tiposExistentes['Nivel1']) {
    NIVEL1_DEFAULTS.forEach(function(valor) { filas.push(['Nivel1', valor, '']); });
  }
  if (!tiposExistentes['Nivel2']) {
    Object.keys(NIVEL2_DEFAULTS).forEach(function(nivel1) {
      NIVEL2_DEFAULTS[nivel1].forEach(function(valor) { filas.push(['Nivel2', valor, nivel1]); });
    });
  }
  if (filas.length) hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, CONFIGURACION_ENCABEZADOS.length).setValues(filas);
}

// Agrega un valor a Nivel1. Tira error si ya existe (sin importar mayúsculas).
function nivel1Agregar(p) {
  const valor = (p.valor || '').toString().trim();
  if (!valor) throw new Error('Falta el valor a agregar.');
  const hoja = getHojaConfiguracion();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas > 0) {
    const datos = hoja.getRange(2, 1, nFilas, 2).getValues();
    const yaExiste = datos.some(function(f) { return f[0] === 'Nivel1' && String(f[1]).toLowerCase() === valor.toLowerCase(); });
    if (yaExiste) throw new Error('Ese valor ya existe en la lista.');
  }
  hoja.appendRow(['Nivel1', valor, '']);
  return { ok: true };
}

// Quita un valor de Nivel1 y, en cascada, sus Nivel2 huérfanos.
function nivel1Eliminar(p) {
  const hoja = getHojaConfiguracion();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) throw new Error('No se encontró ese valor.');
  const datos = hoja.getRange(2, 1, nFilas, CONFIGURACION_ENCABEZADOS.length).getValues();
  let filaEncontrada = -1;
  for (let i = 0; i < datos.length; i++) {
    if (datos[i][0] === 'Nivel1' && String(datos[i][1]) === String(p.valor)) { filaEncontrada = i + 2; break; }
  }
  if (filaEncontrada === -1) throw new Error('No se encontró ese valor.');
  hoja.deleteRow(filaEncontrada);

  const nFilas2 = hoja.getLastRow() - 1;
  if (nFilas2 > 0) {
    const datos2 = hoja.getRange(2, 1, nFilas2, CONFIGURACION_ENCABEZADOS.length).getValues();
    for (let i = datos2.length - 1; i >= 0; i--) {
      if (datos2[i][0] === 'Nivel2' && datos2[i][2] === p.valor) hoja.deleteRow(i + 2);
    }
  }
  return { ok: true };
}

// Nivel2 depende de un Nivel1 (columna "Extra").
function nivel2Agregar(p) {
  const nivel1 = (p.nivel1 || '').toString().trim();
  const nivel2 = (p.valor || '').toString().trim();
  if (!nivel1) throw new Error('Falta el Nivel1.');
  if (!nivel2) throw new Error('Falta el Nivel2.');
  const hoja = getHojaConfiguracion();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas > 0) {
    const datos = hoja.getRange(2, 1, nFilas, CONFIGURACION_ENCABEZADOS.length).getValues();
    const yaExiste = datos.some(function(f) {
      return f[0] === 'Nivel2' && f[2] === nivel1 && String(f[1]).toLowerCase() === nivel2.toLowerCase();
    });
    if (yaExiste) throw new Error('Ese Nivel2 ya existe para ese Nivel1.');
  }
  hoja.appendRow(['Nivel2', nivel2, nivel1]);
  return { ok: true };
}

function nivel2Eliminar(p) {
  const hoja = getHojaConfiguracion();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas > 0) {
    const datos = hoja.getRange(2, 1, nFilas, CONFIGURACION_ENCABEZADOS.length).getValues();
    for (let i = datos.length - 1; i >= 0; i--) {
      if (datos[i][0] === 'Nivel2' && datos[i][2] === p.nivel1 && datos[i][1] === p.valor) {
        hoja.deleteRow(i + 2);
        return { ok: true };
      }
    }
  }
  throw new Error('No se encontró ese Nivel2.');
}

// Guarda el % de costo meta de un Nivel1 (ej. Alimentos 30%, Bebidas 22%) en
// la columna "Extra" de su propia fila — nivel1Agregar() solo agrega filas
// nuevas, nunca actualiza una fila existente, por eso hace falta esta
// función aparte. Tira error si ese Nivel1 todavía no existe en la lista
// (agregalo primero desde Configuración) en vez de crearlo solo o ignorar
// el pedido en silencio.
function nivel1MetaCostoGuardar(p) {
  const meta = Number(p.metaCostoPct);
  if (!meta || meta <= 0) throw new Error('El % de costo meta debe ser un número mayor a 0.');
  const hoja = getHojaConfiguracion();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas > 0) {
    const datos = hoja.getRange(2, 1, nFilas, CONFIGURACION_ENCABEZADOS.length).getValues();
    for (let i = 0; i < datos.length; i++) {
      if (datos[i][0] === 'Nivel1' && String(datos[i][1]) === String(p.valor)) {
        hoja.getRange(i + 2, 3).setValue(meta);
        return { ok: true };
      }
    }
  }
  throw new Error('No se encontró ese Nivel1 — agregalo primero desde la lista.');
}

// Espejo EXACTO de claveAgrupacion_() en maestro-productos.html — este
// backend no puede compartir código con el frontend (no hay build step), así
// que las dos copias hay que mantenerlas idénticas a mano. Si una cambia,
// cambiar la otra en el mismo commit/sesión.
function claveAgrupacionGS_(s) {
  return (s || '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

// ID legible con timestamp + 3 dígitos al azar — usado cuando el cliente no
// manda un ID existente, es decir, cuando está creando un plato/receta nuevo.
function generarIdMenu_(prefijo) {
  const marca = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Costa_Rica', 'yyyyMMdd-HHmmss');
  const azar = Math.floor(100 + Math.random() * 900);
  return prefijo + '-' + marca + '-' + azar;
}

// Agrupa Maestro_Productos (leído del OTRO Sheet, ver getHojaMaestroExterna_)
// por producto — mismo criterio que agruparFichas()/claveAgrupacion_ en
// maestro-productos.html: normaliza Nombre Estándar, o Nombre en Factura si
// todavía no tiene uno confirmado. Devuelve, por clave, los datos que hacen
// falta para costear un ingrediente de receta. Si un producto tiene varias
// filas (varios proveedores/nombres de factura homologados al mismo Nombre
// Estándar), se queda con la que tenga "Ficha actualizada" más reciente —
// mismo criterio de "representante del grupo" que ya usa maestro-productos.html.
function mapaProductosPorClave_() {
  const hoja = getHojaMaestroExterna_();
  const nFilas = hoja.getLastRow() - 1;
  const mapa = {};
  if (nFilas <= 0) return mapa;
  const ultimaCol = hoja.getLastColumn();
  const encabezados = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0];
  const idx = function(nombre) { return encabezados.indexOf(nombre); }; // -1 si no existe todavía
  const iNombreFactura = idx('Nombre en Factura');
  const iNombreEstandar = idx('Nombre Estándar');
  const iAplicaReceta = idx('Aplica Receta');
  const iCostoRealReceta = idx('Costo Real Receta');
  const iCostoPorUnidad = idx('Costo por unidad');
  const iFichaActualizada = idx('Ficha actualizada');
  const iEstado = idx('Estado');

  const datos = hoja.getRange(2, 1, nFilas, ultimaCol).getValues();
  datos.forEach(function(fila) {
    const nombre = (iNombreEstandar >= 0 && fila[iNombreEstandar]) ? fila[iNombreEstandar] : (iNombreFactura >= 0 ? fila[iNombreFactura] : '');
    const clave = claveAgrupacionGS_(nombre);
    if (!clave) return;
    const fichaActualizada = iFichaActualizada >= 0 ? fila[iFichaActualizada] : '';
    const candidato = {
      nombre: nombre,
      aplicaReceta: iAplicaReceta >= 0 ? (fila[iAplicaReceta] === 'No' ? 'No' : 'Sí') : 'Sí',
      costoRealReceta: iCostoRealReceta >= 0 ? (Number(fila[iCostoRealReceta]) || 0) : 0,
      costoPorUnidad: iCostoPorUnidad >= 0 ? (Number(fila[iCostoPorUnidad]) || 0) : 0,
      estado: iEstado >= 0 ? fila[iEstado] : '',
      fichaActualizada: fichaActualizada
    };
    const existente = mapa[clave];
    if (!existente) { mapa[clave] = candidato; return; }
    const fechaExistente = existente.fichaActualizada ? new Date(existente.fichaActualizada).getTime() : 0;
    const fechaCandidato = fichaActualizada ? new Date(fichaActualizada).getTime() : 0;
    if (fechaCandidato > fechaExistente) mapa[clave] = candidato;
  });
  return mapa;
}

// Lee todas las filas de Menu_Recetas → {id: {costoPorUnidadRendimiento,
// tipo, nombre, platoId}} — usado para resolver ingredientes de tipo
// 'subreceta' sin recursar (se usa el costo YA CACHEADO de la subreceta, ver
// nota junto a "CostoTotal"/"CostoPorUnidadRendimiento" en
// MENU_RECETAS_ENCABEZADOS).
function mapaRecetasPorId_() {
  const hoja = getHojaMenuRecetas();
  const nFilas = hoja.getLastRow() - 1;
  const mapa = {};
  if (nFilas <= 0) return mapa;
  const datos = hoja.getRange(2, 1, nFilas, MENU_RECETAS_ENCABEZADOS.length).getValues();
  datos.forEach(function(fila) {
    const id = fila[0];
    if (!id) return;
    mapa[id] = { tipo: fila[1], nombre: fila[2], platoId: fila[3], costoPorUnidadRendimiento: Number(fila[8]) || 0 };
  });
  return mapa;
}

// Costo unitario (en la unidad de la línea de receta) de un ingrediente.
// Nunca truena: si la referencia no resuelve (producto no encontrado en
// Maestro_Productos, o subreceta borrada), devuelve 0 — quien llama junta
// cuáles líneas quedaron sin costear para avisar en el resultado, en vez de
// que toda la receta falle en silencio o reviente el guardado entero.
function resolverCostoIngrediente_(item, mapaProductos, mapaRecetas) {
  if (!item || !item.ref) return 0;
  if (item.tipoFuente === 'subreceta') {
    const r = mapaRecetas[item.ref];
    return r ? r.costoPorUnidadRendimiento : 0;
  }
  const p = mapaProductos[claveAgrupacionGS_(item.ref)];
  return p ? (p.costoRealReceta || p.costoPorUnidad || 0) : 0;
}

function getHojaMenuPlatos() { return prepararHoja(HOJA_MENU_PLATOS, MENU_PLATOS_ENCABEZADOS); }
function getHojaMenuRecetas() { return prepararHoja(HOJA_MENU_RECETAS, MENU_RECETAS_ENCABEZADOS); }

// Guarda (alta o edición) una receta o subreceta. Recalcula el costo SIEMPRE
// server-side a partir de los ingredientes recién mandados — nunca confía en
// un total que mande el cliente. Devuelve además cuáles líneas de
// ingrediente no se pudieron costear, para que recetas.html avise sin
// fallar el guardado entero.
function menuRecetaGuardar(p) {
  const tipo = p.tipo === 'subreceta' ? 'subreceta' : 'receta';
  const rendimiento = Number(p.rendimiento);
  if (!rendimiento || rendimiento <= 0) throw new Error('El rendimiento debe ser un número mayor a 0.');
  if (!p.unidadRendimiento) throw new Error('Falta la unidad de rendimiento.');
  if (tipo === 'subreceta' && !(p.nombre || '').toString().trim()) throw new Error('Falta el nombre de la subreceta.');
  if (tipo === 'receta' && !p.platoId) throw new Error('Falta indicar a qué plato pertenece esta receta.');
  const ingredientes = Array.isArray(p.ingredientes) ? p.ingredientes : [];
  if (!ingredientes.length) throw new Error('Agregá al menos un ingrediente.');

  const id = p.id || generarIdMenu_('REC');
  const mapaProductos = mapaProductosPorClave_();
  const mapaRecetas = mapaRecetasPorId_();

  const ingredientesSinCosto = [];
  let costoTotal = 0;
  ingredientes.forEach(function(item) {
    // Ciclo directo (una receta usándose a sí misma) — los ciclos indirectos
    // ya son estructuralmente imposibles porque toda subreceta-ingrediente
    // usa su ÚLTIMO COSTO GUARDADO, nunca una recursión en vivo.
    if (item.tipoFuente === 'subreceta' && item.ref === id) {
      throw new Error('Una receta no puede usarse a sí misma como ingrediente.');
    }
    const costoUnitario = resolverCostoIngrediente_(item, mapaProductos, mapaRecetas);
    const cantidad = Number(item.cantidad) || 0;
    if (!costoUnitario) ingredientesSinCosto.push(item.nombre || item.ref);
    costoTotal += costoUnitario * cantidad;
  });
  costoTotal = Math.round(costoTotal * 100) / 100;
  const costoPorUnidadRendimiento = Math.round((costoTotal / rendimiento) * 10000) / 10000;

  // Nombre a guardar: para subrecetas, el que mandó el cliente; para
  // recetas, se copia el nombre ACTUAL del plato solo como referencia visual
  // en el Sheet — nunca se lee de vuelta para mostrarlo (ver nota junto a
  // "Nombre" en MENU_RECETAS_ENCABEZADOS).
  let nombre = (p.nombre || '').toString().trim();
  if (tipo === 'receta') {
    const hojaPlatos = getHojaMenuPlatos();
    const nFilasPlatos = hojaPlatos.getLastRow() - 1;
    if (nFilasPlatos > 0) {
      const filasPlatos = hojaPlatos.getRange(2, 1, nFilasPlatos, 2).getValues();
      const filaPlato = filasPlatos.find(function(f) { return f[0] === p.platoId; });
      if (filaPlato) nombre = filaPlato[1];
    }
  }

  const hoja = getHojaMenuRecetas();
  const nFilas = hoja.getLastRow() - 1;
  let filaExistente = -1;
  if (p.id && nFilas > 0) {
    const ids = hoja.getRange(2, 1, nFilas, 1).getValues();
    for (let i = 0; i < ids.length; i++) { if (ids[i][0] === p.id) { filaExistente = i + 2; break; } }
  }

  const ahora = new Date();
  const fila = [
    id, tipo, nombre, tipo === 'receta' ? p.platoId : '',
    rendimiento, p.unidadRendimiento, JSON.stringify(ingredientes),
    costoTotal, costoPorUnidadRendimiento, ahora
  ];
  if (filaExistente !== -1) {
    hoja.getRange(filaExistente, 1, 1, fila.length).setValues([fila]);
  } else {
    hoja.appendRow(fila);
  }

  return { id: id, costoTotal: costoTotal, costoPorUnidadRendimiento: costoPorUnidadRendimiento, ingredientesSinCosto: ingredientesSinCosto };
}

// Antes de borrar, revisa que ninguna OTRA receta la use como
// subreceta-ingrediente — si la hay, rechaza y lista cuáles (dependencia
// barata de chequear: todos los ingredientes de cada receta viven en un solo
// JSON por fila, no hace falta un join).
function menuRecetaEliminar(p) {
  if (!p.id) throw new Error('Falta el ID de la receta.');
  const hoja = getHojaMenuRecetas();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) throw new Error('No se encontró esa receta.');
  const datos = hoja.getRange(2, 1, nFilas, MENU_RECETAS_ENCABEZADOS.length).getValues();

  const dependientes = [];
  let filaAEliminar = -1;
  datos.forEach(function(fila, i) {
    if (fila[0] === p.id) { filaAEliminar = i + 2; return; }
    let ingredientes = [];
    try { ingredientes = JSON.parse(fila[6] || '[]'); } catch (e) { ingredientes = []; }
    const usaEstaSubreceta = ingredientes.some(function(ing) { return ing.tipoFuente === 'subreceta' && ing.ref === p.id; });
    if (usaEstaSubreceta) dependientes.push(fila[2] || fila[0]);
  });

  if (filaAEliminar === -1) throw new Error('No se encontró esa receta (puede que ya se haya eliminado).');
  if (dependientes.length) {
    throw new Error('No se puede borrar: la usan como ingrediente ' + dependientes.join(', ') + '. Quitala de esas recetas primero.');
  }
  hoja.deleteRow(filaAEliminar);
  return { ok: true };
}

// Valida y guarda un plato (alta o edición). "Presentaciones" siempre debe
// tener al menos 1 fila (todo plato necesita al menos un precio/costo/nombre
// de Square para ser vendible) y ningún "nombre de venta en Square" puede
// repetirse entre TODAS las presentaciones de TODOS los platos (dos
// presentaciones con el mismo nombre harían ambigua la descarga de
// inventario por ventas más adelante).
function menuPlatoGuardar(p) {
  const nombre = (p.nombre || '').toString().trim();
  if (!nombre) throw new Error('Falta el nombre del plato.');
  if (!p.nivel1) throw new Error('Falta el Nivel1 (Alimentos/Bebidas).');
  if (!p.nivel2) throw new Error('Falta el Nivel2 (categoría).');
  const presentaciones = Array.isArray(p.presentaciones) ? p.presentaciones : [];
  if (!presentaciones.length) throw new Error('Agregá al menos una presentación de venta.');

  const id = p.id || generarIdMenu_('PLT');
  const hoja = getHojaMenuPlatos();
  const nFilas = hoja.getLastRow() - 1;
  const datos = nFilas > 0 ? hoja.getRange(2, 1, nFilas, MENU_PLATOS_ENCABEZADOS.length).getValues() : [];

  const nombresSquareVistos = {};
  datos.forEach(function(fila) {
    if (fila[0] === id) return; // excluye la propia fila (edición)
    let pres = [];
    try { pres = JSON.parse(fila[5] || '[]'); } catch (e) { pres = []; }
    pres.forEach(function(pr) {
      const n = (pr.nombreVentaSquare || '').toString().trim().toLowerCase();
      if (n) nombresSquareVistos[n] = true;
    });
  });
  const nombresEnEstePlato = {};
  presentaciones.forEach(function(pr) {
    const n = (pr.nombreVentaSquare || '').toString().trim().toLowerCase();
    if (!n) return;
    if (nombresEnEstePlato[n]) throw new Error('Dos presentaciones de este mismo plato no pueden compartir el nombre de venta en Square.');
    if (nombresSquareVistos[n]) throw new Error('El nombre de venta en Square "' + pr.nombreVentaSquare + '" ya lo usa otra presentación.');
    nombresEnEstePlato[n] = true;
  });

  let filaExistente = -1;
  for (let i = 0; i < datos.length; i++) { if (datos[i][0] === id) { filaExistente = i + 2; break; } }

  const ahora = new Date();
  const kioskos = p.kioskos || 'Todos';
  if (filaExistente !== -1) {
    hoja.getRange(filaExistente, 2, 1, 6).setValues([[nombre, p.nivel1, p.nivel2, kioskos, JSON.stringify(presentaciones), p.activo === false ? false : true]]);
    hoja.getRange(filaExistente, 9).setValue(ahora);
  } else {
    hoja.appendRow([id, nombre, p.nivel1, p.nivel2, kioskos, JSON.stringify(presentaciones), true, ahora, ahora]);
  }
  return { id: id };
}

// Activar/desactivar un plato — acción principal de "eliminar" en la UI de
// recetas.html (mismo patrón que configuracion.html usa para kioskos: no se
// borra la fila, se oculta). El borrado duro (menuPlatoEliminar) queda
// disponible aparte, para altas hechas por error.
function menuPlatoEstado(p) {
  if (!p.id) throw new Error('Falta el ID del plato.');
  const hoja = getHojaMenuPlatos();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas > 0) {
    const ids = hoja.getRange(2, 1, nFilas, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === p.id) {
        hoja.getRange(i + 2, 7).setValue(p.activo === false ? false : true);
        hoja.getRange(i + 2, 9).setValue(new Date());
        return { ok: true };
      }
    }
  }
  throw new Error('No se encontró ese plato.');
}

function menuPlatoEliminar(p) {
  if (!p.id) throw new Error('Falta el ID del plato.');
  const hoja = getHojaMenuPlatos();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas > 0) {
    const ids = hoja.getRange(2, 1, nFilas, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === p.id) { hoja.deleteRow(i + 2); return { ok: true }; }
    }
  }
  throw new Error('No se encontró ese plato (puede que ya se haya eliminado).');
}

// ── DESPACHADOR ─────────────────────────────────────────────────────
// Único doPost de este proyecto de Apps Script (es un proyecto propio,
// separado del de Cuentas por Pagar — no hay conflicto con otro doPost).
function doPost(e) {
  try {
    const payload = JSON.parse(e.parameter.data);
    let result;
    switch (payload.modulo) {
      case 'nivel1_agregar':
        result = nivel1Agregar(payload);
        break;
      case 'nivel1_eliminar':
        result = nivel1Eliminar(payload);
        break;
      case 'nivel2_agregar':
        result = nivel2Agregar(payload);
        break;
      case 'nivel2_eliminar':
        result = nivel2Eliminar(payload);
        break;
      case 'nivel1_meta_costo_guardar':
        result = nivel1MetaCostoGuardar(payload);
        break;
      case 'menu_plato_guardar':
        result = menuPlatoGuardar(payload);
        break;
      case 'menu_plato_estado':
        result = menuPlatoEstado(payload);
        break;
      case 'menu_plato_eliminar':
        result = menuPlatoEliminar(payload);
        break;
      case 'menu_receta_guardar':
        result = menuRecetaGuardar(payload);
        break;
      case 'menu_receta_eliminar':
        result = menuRecetaEliminar(payload);
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
