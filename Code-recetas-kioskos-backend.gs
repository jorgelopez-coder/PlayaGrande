/**
 * Backend de Menú y Recetas (recetas.html, Ecosistema Kioskos) — platos con
 * categorías Nivel1/Nivel2, recetas y subrecetas con costeo, presentaciones
 * de venta enlazadas a Maestro_Productos.
 *
 * IMPORTANTE — este archivo NO es un proyecto de Apps Script aparte: hay que
 * pegarlo como un archivo MÁS dentro del MISMO proyecto de Apps Script que
 * ya tiene Code-cuentas-por-pagar-kioskos-backend.gs (mismo Sheet "Cuentas
 * por Pagar - Kioskos", mismo Web App ya desplegado — no hace falta crear
 * ningún Sheet ni implementación nueva). Los archivos de un mismo proyecto
 * de Apps Script comparten todas las funciones/constantes entre sí, como si
 * fueran un solo archivo grande — por eso doPost() y la extensión de la
 * pestaña "Configuracion" (Nivel1, TIPOS_CONFIGURACION_SIMPLE,
 * CONFIGURACION_DEFAULTS, configurarHojas(), configEliminar()) siguen
 * viviendo en Code-cuentas-por-pagar-kioskos-backend.gs — ese archivo ya
 * tiene el despachador único y no puede haber dos.
 *
 * Cómo desplegarlo (primera vez o después de cambios en este archivo):
 * 1. En el editor de Apps Script del Sheet "Cuentas por Pagar - Kioskos",
 *    ícono "+" junto a "Archivos" → Script → nombralo "Code-recetas-kioskos-backend"
 *    (si ya existe, simplemente abrilo).
 * 2. Pegá el contenido completo de este archivo ahí (reemplazando lo que
 *    hubiera antes).
 * 3. Asegurate de que Code-cuentas-por-pagar-kioskos-backend.gs también esté
 *    actualizado (trae las líneas de doPost() y la extensión de
 *    Configuracion que este archivo necesita).
 * 4. Corré UNA VEZ, a mano, la función configurarHojas() (vive en el otro
 *    archivo) para crear las pestañas "Menu_Platos"/"Menu_Recetas" y
 *    sembrar Alimentos/Bebidas + las categorías Nivel2 por defecto.
 * 5. Implementar > Gestionar implementaciones > Editar > Nueva versión (la
 *    URL /exec no cambia).
 */

// ── MENÚ Y RECETAS — hojas nuevas ──────────────────────────────────
// Nivel1 (lista simple) y Nivel2 (depende de un Nivel1 padre, igual que
// Subfamilia depende de una Familia) viven en la pestaña "Configuracion" ya
// existente — ver TIPOS_CONFIGURACION_SIMPLE/CONFIGURACION_DEFAULTS en
// Code-cuentas-por-pagar-kioskos-backend.gs. Acá solo las dos pestañas
// nuevas que sí son exclusivas de este módulo.
const HOJA_MENU_PLATOS = 'Menu_Platos';
const MENU_PLATOS_ENCABEZADOS = [
  'ID', 'Nombre', 'Nivel1', 'Nivel2', 'Kioskos',
  // JSON de [{id,nombre,cantidad,precioVenta,nombreVentaSquare,activo}] —
  // una fila por presentación de venta del plato (ej. Vaso 16oz/10oz/4oz en
  // cerveza draft, Botella/Cuarta/Trago en licores; un plato de comida
  // simple normalmente tiene una sola presentación "Regular"). "cantidad"
  // está en la UnidadRendimiento de la receta enlazada (ver Menu_Recetas).
  // No editar a mano en el Sheet — se genera y se lee siempre desde
  // recetas.html (ver nota en configurarHojas(), en el otro archivo).
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
// Nivel2 por defecto, agrupado por su Nivel1 padre (no es una lista simple
// de TIPOS_CONFIGURACION_SIMPLE — ver sembrarNivel2PorDefecto()).
const NIVEL2_DEFAULTS = {
  Alimentos: ['Entradas', 'Plato fuerte', 'Postre'],
  Bebidas: [
    'Cerveza industrial', 'Cerveza artesanal draft', 'Cerveza artesanal botella',
    'Gaseosas', 'Licores', 'Naturales'
  ]
};

// Semilla los Nivel2 por defecto (NIVEL2_DEFAULTS), pero solo si "Nivel2"
// todavía no tiene ninguna fila — mismo criterio "por Tipo individual" que
// sembrarConfiguracionPorDefecto() (en el otro archivo), que acá no se puede
// reutilizar tal cual porque cada valor de Nivel2 depende de un Nivel1
// padre (columna "Extra"), igual que Subfamilia depende de una Familia.
// La llama configurarHojas() (en el otro archivo).
function sembrarNivel2PorDefecto(hoja) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas > 0) {
    const datos = hoja.getRange(2, 1, nFilas, 1).getValues();
    if (datos.some(function(f) { return f[0] === 'Nivel2'; })) return;
  }
  const filas = [];
  Object.keys(NIVEL2_DEFAULTS).forEach(function(nivel1) {
    NIVEL2_DEFAULTS[nivel1].forEach(function(valor) { filas.push(['Nivel2', valor, nivel1]); });
  });
  if (filas.length) hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, CONFIGURACION_ENCABEZADOS.length).setValues(filas);
}

// Nivel2 depende de un Nivel1 (columna "Extra") — mismo mecanismo que
// Subfamilia depende de una Familia (ver configSubfamiliaAgregar en
// Code-cuentas-por-pagar-kioskos-backend.gs).
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
// la columna "Extra" de su propia fila en Configuracion — configAgregar()
// solo agrega filas nuevas, nunca actualiza una fila existente, por eso hace
// falta esta función aparte. Tira error si ese Nivel1 todavía no existe en
// la lista (agregalo primero desde Configuración) en vez de crearlo solo o
// ignorar el pedido en silencio.
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

// ID legible con timestamp + 3 dígitos al azar (mismo patrón que
// generarNumeroFacturaManual_ en el otro archivo) — usado cuando el cliente
// no manda un ID existente, es decir, cuando está creando un plato/receta
// nuevo.
function generarIdMenu_(prefijo) {
  const marca = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Costa_Rica', 'yyyyMMdd-HHmmss');
  const azar = Math.floor(100 + Math.random() * 900);
  return prefijo + '-' + marca + '-' + azar;
}

// Agrupa Maestro_Productos por producto (mismo criterio que
// agruparFichas()/claveAgrupacion_ en maestro-productos.html: normaliza
// Nombre Estándar, o Nombre en Factura si todavía no tiene uno confirmado) y
// devuelve, por clave, los datos que hacen falta para costear un ingrediente
// de receta. Si un producto tiene varias filas (varios proveedores/nombres
// de factura homologados al mismo Nombre Estándar), se queda con la que
// tenga "Ficha actualizada" más reciente — mismo criterio de "representante
// del grupo" que ya usa maestro-productos.html. Usa getHojaMaestro()/
// MAESTRO_COL, que viven en Code-cuentas-por-pagar-kioskos-backend.gs.
function mapaProductosPorClave_() {
  const hoja = getHojaMaestro();
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
// un total que mande el cliente (mismo criterio que guardarFichaMaestro, en
// el otro archivo, recalcula costoRealReceta en vez de aceptarlo tal cual).
// Devuelve además cuáles líneas de ingrediente no se pudieron costear, para
// que recetas.html avise sin fallar el guardado entero.
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
