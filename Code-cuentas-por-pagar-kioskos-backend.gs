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
 *    para crear las 3 pestañas (Registro Facturas, Desglose_IA, Abonos) con
 *    sus encabezados. El catálogo de proveedores NO vive acá (ver v4 más
 *    abajo) — sale del Sheet "Inventario - Kioskos".
 * 4. Implementar > Nueva implementación > Aplicación web
 *    (Ejecutar como: Yo · Acceso: Cualquiera). Copiá la URL /exec.
 * 5. En el facturas-extractor de cada kiosko, apuntá DEST_SPREADSHEET_ID al
 *    ID de este Sheet y APPS_SCRIPT_AP_COMPRAS a esta URL /exec (ver sección B
 *    del plan de migración para el detalle exacto por kiosko).
 * 6. En cuentas-por-pagar.html, poné el ID de este Sheet en COMPRAS_SHEET_ID
 *    y esta URL /exec en APPS_SCRIPT_AP.
 *
 * v2 (2026-07-25): se agrega la pestaña "Maestro_Productos" — homologación de
 * nombres de producto tal como vienen en las facturas (columna "Producto" de
 * Desglose_IA) contra un "Nombre Estándar" único por producto para toda la
 * operación. Usado por maestro-productos.html (mismo Sheet/Web App, no hace
 * falta desplegar nada aparte). Si ya tenías este backend desplegado antes de
 * hoy: pegá el código completo de nuevo, corré UNA VEZ configurarHojas() para
 * que se cree la pestaña nueva, y Implementar > Gestionar implementaciones >
 * Editar > Nueva versión (la URL /exec no cambia).
 *
 * v3 (2026-07-25, mismo día): se agrega a Maestro_Productos el campo "Aplica"
 * (Sí/No) — para marcar líneas de factura que son servicios u otros conceptos
 * que no hace falta homologar como producto — y la opción de agregar un
 * producto a mano (sin que venga de una factura ya procesada), pensando en
 * que este listado va a alimentar Recetas/Inventario/Análisis más adelante.
 * La columna "Aplica" se crea SOLA la primera vez que se use (mismo mecanismo
 * de columnaPorNombre() que ya usan las columnas opcionales de Registro
 * Facturas), así que no hace falta editar el Sheet a mano ni corre riesgo de
 * desalinear columnas existentes si Maestro_Productos ya tiene filas. Alcanza
 * con pegar el código completo de nuevo e Implementar > Nueva versión.
 *
 * v4 (2026-07-28): se retira la pestaña "proveedores" y su CRUD propio
 * (guardar_proveedor/eliminar_proveedor) — duplicaban el mismo esquema y la
 * misma lógica que ya vive en Code-inventario-kioskos-v3-backend.gs (Sheet
 * "Inventario - Kioskos", pestaña "Proveedores") sin comunicarse entre sí.
 * cuentas-por-pagar.html ahora lee/escribe proveedores directo contra ese
 * otro Sheet/Web App (ver INVENTARIO_SHEET_ID/APPS_SCRIPT_INVENTARIO ahí). Si
 * este Sheet ya tenía proveedores cargados en su propia pestaña "proveedores",
 * copialos a mano a la pestaña "Proveedores" del Sheet "Inventario - Kioskos"
 * antes de borrar esa pestaña acá — no hace falta correr nada nuevo en este
 * backend, solo pegar el código y Nueva versión.
 *
 * v5 (2026-07-29): botón "Agregar factura manual" en cuentas-por-pagar.html
 * (para facturas/recibos que no pasaron por el facturas-extractor de OCR).
 * Nueva acción guardar_factura_manual(): agrega una fila directo a "Registro
 * Facturas" con Fecha/Kiosko/Proveedor/Monto/Moneda; el número de factura es
 * opcional y si no se indica se genera uno con prefijo "MANUAL-" para que la
 * fila tenga clave propia (igual que cualquier otra, para pagos/abonos/
 * borrado). Incluye también un campo opcional de observación/motivo, que se
 * guarda en la misma columna dinámica "Notas" que ya usa guardarNota(). No
 * hace falta correr configurarHojas() de nuevo — solo pegar el código
 * completo e Implementar > Gestionar implementaciones > Nueva versión.
 *
 * v6 (2026-07-29): cuando Medio de pago = "Fondo de caja" en el modal de
 * pago/abono, ahora también se pide "Fecha del efectivo" (la fecha del
 * cierre de caja del que salió el dinero) — se guarda acá como columna
 * dinámica 'Fecha del efectivo (fondo de caja)' en Registro Facturas y como
 * última columna de Abonos, y ADEMÁS cuentas-por-pagar.html manda ese mismo
 * dato en paralelo al backend de Cierres (Code-cierres-kioskos-backend.gs,
 * pestaña nueva "SalidasFondoCaja") para que depositos.html/indicadores.html/
 * index.html rebajen el pago del "efectivo pendiente de depositar" de esa
 * fecha. No hace falta correr nada nuevo acá — solo pegar el código completo
 * e Implementar > Gestionar implementaciones > Nueva versión.
 *
 * v7 (2026-08-06): nueva acción registrar_reembolso() — usada por el nuevo
 * módulo caja-chica.html (Ecosistema-Kioskos) para registrar cuándo y con qué
 * referencia se le devolvió el dinero a un colaborador que pagó una factura
 * con Medio de pago = "Reembolso" (columnas dinámicas 'Fecha de reembolso'/
 * 'Referencia reembolso' sobre Registro Facturas, creadas la primera vez que
 * se usen, igual que 'Reembolsado a'). No hace falta correr configurarHojas()
 * de nuevo — solo pegar el código completo e Implementar > Gestionar
 * implementaciones > Nueva versión.
 *
 * v8 (2026-08-08): consolidación de nombres de proveedor. El texto de
 * "Proveedor" sale tal cual de la extracción por IA de cada factura, así que
 * el mismo proveedor real puede quedar escrito de formas distintas (con/sin
 * guion, "S.A." vs "SA", etc.) y termina contando como proveedores separados
 * en Análisis de Compras y Cuentas por Pagar. proveedores.html (pestaña
 * "Consolidar nombres") detecta esas variantes y, al confirmar una fusión,
 * llama a la acción nueva `fusionar_proveedor({ variantes, nombreEstandar })`
 * de este backend, que:
 *   1. reescribe la columna "Proveedor" en "Registro Facturas" y
 *      "Desglose_IA" donde el texto coincide (exacto, sin mayúsculas/
 *      espacios de más) con alguna de las variantes confirmadas;
 *   2. hace lo mismo en "Maestro_Productos" y ADEMÁS recalcula "Clave" de
 *      esas filas (Proveedor+Producto normalizados) para que
 *      maestro_sincronizar() las siga reconociendo como la misma fila y no
 *      pierda el "Nombre Estándar"/"Estado" ya confirmados a mano; si dos
 *      filas distintas quedan con la misma Clave nueva (mismo producto
 *      comprado bajo dos variantes del proveedor), se fusionan en una sola
 *      (se prioriza la que ya tenía Nombre Estándar confirmado, sumando
 *      "Veces visto").
 * El alias en sí (qué variantes pertenecen a qué proveedor) se guarda en la
 * ficha del proveedor en el OTRO backend/Sheet (Code-inventario-kioskos-v3-
 * backend.gs, columna "Alias") — proveedores.html llama a los dos backends
 * al confirmar. No hace falta correr configurarHojas() de nuevo acá — solo
 * pegar el código completo e Implementar > Gestionar implementaciones >
 * Nueva versión.
 */

const HOJA_FACTURAS    = 'Registro Facturas';
const HOJA_DESGLOSE    = 'Desglose_IA';
const HOJA_ABONOS      = 'Abonos';

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
  'Reembolsado a', 'Nota de crédito asociada', 'Fecha de registro', 'Kiosko',
  // v6 (2026-07-29) — se agrega AL FINAL (nunca en el medio, para no correr
  // las columnas de filas ya guardadas). Ver nota de registrarPago() más abajo.
  'Fecha del efectivo (fondo de caja)'
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

// Maestro de Productos (v2): una fila por combinación distinta de Proveedor +
// texto de producto visto en Desglose_IA. sincronizarMaestro() arma/actualiza
// esta hoja a partir de Desglose_IA sin pisar nunca "Nombre Estándar" ni
// "Estado" de una fila que el usuario ya haya confirmado a mano — solo
// refresca los datos derivados (veces visto, fechas, categoría/unidad
// heredadas, propuesta automática). "Clave" es Proveedor+Producto
// normalizados (ver normalizarTextoGS) y es lo que identifica la fila para
// guardarMaestro(), no hace falta un ID aparte.
const HOJA_MAESTRO = 'Maestro_Productos';
const MAESTRO_COL = {
  CLAVE: 1, PROVEEDOR: 2, NOMBRE_FACTURA: 3, CATEGORIA: 4, UNIDAD: 5,
  VECES_VISTO: 6, PRIMERA_VEZ: 7, ULTIMA_VEZ: 8, PROPUESTA: 9,
  NOMBRE_ESTANDAR: 10, ESTADO: 11, ACTUALIZADO: 12
};
const MAESTRO_ENCABEZADOS = [
  'Clave', 'Proveedor', 'Nombre en Factura', 'Categoría', 'Unidad',
  'Veces visto', 'Primera vez', 'Última vez', 'Propuesta automática',
  'Nombre Estándar', 'Estado', 'Actualizado', 'Aplica',
  'Costo sugerido (última compra)', 'Moneda sugerida', 'Fecha última compra',
  'Área de negocio', 'Presentación', 'Tamaño', 'Precio sin IVA', 'IVA (%)',
  'Cantidad presentación', 'Costo por unidad', 'Kioskos', 'Activo', 'Ficha actualizada',
  // v2 (2026-07-26) — clasificación y datos para recetas, adaptado de
  // "Base de Productos · Costos" de Ecosistema Lorito (ver nota más abajo
  // en guardarFichaMaestro/configAgregar). Igual que el resto de columnas
  // de "ficha de producto", siempre se resuelven con columnaPorNombre(),
  // nunca un índice fijo, para no romper el Sheet ya desplegado.
  'Familia', 'Subfamilia', 'Aplica Receta', 'Unidad Receta',
  'Rendimiento Receta (%)', 'Costo Real Receta', 'Usar Costo Manual Receta',
  // 2026-07-27 (tarde) — control de inventario por peso (botellas de licor,
  // cerveza en sifón): ver project_control_peso_tara_inventario en la
  // memoria. 'Tipo de Control' es 'unitario' (default, conteo) o 'peso'
  // (báscula). Para 'peso', 'Contenido Envase (ml)' y 'Densidad (g/ml)' son
  // obligatorios (se validan en guardarFichaMaestro) y 'Tara por Defecto (g)'
  // es el valor que se prellena al pesar una botella de una marca nueva en
  // inventario.html — no es la tara final: cada pesaje individual en la toma
  // puede tener su propia tara editable, porque la tara real depende de la
  // marca de la botella (decidido con Jorge 2026-07-27).
  'Tipo de Control', 'Contenido Envase (ml)', 'Densidad (g/ml)', 'Tara por Defecto (g)'
];
// "Aplica" (Sí/No) queda fuera de MAESTRO_COL a propósito: se resuelve con
// columnaPorNombre() en vez de una posición fija, para que se pueda crear
// sola en un Sheet que ya tenga filas (líneas de servicios/conceptos que no
// hace falta homologar como producto se marcan en "No").
//
// Desde acá en adelante ('Costo sugerido…' hasta 'Ficha actualizada') son las
// columnas de la "ficha de producto" — lo que antes iba a ser un módulo
// aparte ("Base de Productos" / productos.html, nunca desplegado) y se
// fusionó directo acá: cada fila del Maestro YA ES el catálogo de producto,
// no hace falta un Sheet ni un ID distinto. Igual que 'Aplica', todas se
// resuelven con columnaPorNombre() (nunca un índice fijo en MAESTRO_COL) para
// no romper el Sheet ya desplegado en producción. 'Costo sugerido (última
// compra)', 'Moneda sugerida' y 'Fecha última compra' las llena solo
// sincronizarMaestro() en cada corrida (dato derivado de Desglose_IA, se
// pisa siempre, el usuario no las edita); el resto las llena el usuario
// desde el modal "Ficha de producto" vía guardarFichaMaestro(). Excepción:
// 'Costo por unidad' (2026-07-27) — mientras la fila no tenga ficha
// completada (sin 'Ficha actualizada'), sincronizarMaestro() también la
// pisa con el último precio de factura en colones (mismo valor que 'Costo
// sugerido'), para que la columna "Costo de compra" de la tabla no quede
// vacía. En cuanto se guarda la ficha una vez, pasa a ser 100% manual
// (Precio sin IVA ÷ Cantidad presentación vía guardarFichaMaestro) y el
// sync deja de tocarla. Mismo criterio (2026-07-27) para 'Precio sin IVA':
// sin ficha completada, sincronizarMaestro() también la pisa con el último
// precio de factura en colones, porque Inventario usa ese campo para
// valorizar las unidades "cerrado/completo" (Costo por unidad valoriza solo
// lo "abierto/en uso") — si quedaba vacía, la valorización de inventario
// solo reflejaba lo abierto.

// Catálogos editables de clasificación (Área de negocio / Categoría /
// Familia / Subfamilia) — pestaña "Configuracion", adaptada de la pestaña
// "⚙ Configuración" de costos-productos.html (Ecosistema Lorito) y del
// mismo diseño que ya estaba armado (sin desplegar) en
// Code-productos-backend.gs. "Familia"/"Categoria"/"Area" son listas
// simples (una fila por valor); "Subfamilia" depende de una Familia
// (columna "Extra" = a qué familia pertenece). Se administra desde la
// pestaña "Configuración" de maestro-productos.html — agregar/quitar
// valores no toca código, solo esta hoja.
const HOJA_CONFIGURACION = 'Configuracion';
const CONFIGURACION_ENCABEZADOS = ['Tipo', 'Valor', 'Extra'];
// 'Presentacion' (2026-08-08) = catálogo de "presentación de compra"
// (Bulto, Caja, Sifón, Galón, Litro…) y 'UnidadReceta' = catálogo de
// "unidad de medida para receta" (Mililitro, Gramo, Kilo, Onza, Pizca…).
// Ambos alimentan los desplegables de la Ficha de producto y, además,
// calcularConversionAuto() en maestro-productos.html los usa para calcular
// solo la conversión entre presentación de compra y unidad de receta
// (ver project_maestro_conversion_compra_receta en la memoria).
const TIPOS_CONFIGURACION_SIMPLE = ['Area', 'Categoria', 'Familia', 'Presentacion', 'UnidadReceta'];
const CONFIGURACION_DEFAULTS = {
  Area: [
    'Barra / Coctelería', 'Bodega', 'Cocina / Snacks',
    'Limpieza e Higiene', 'Administración', 'Mantenimiento y Equipo'
  ],
  Categoria: [
    'Cerveza', 'Licores y Destilados', 'Insumos de Coctelería',
    'Bebidas No Alcohólicas', 'Hielo', 'Vasos y Desechables',
    'Snacks', 'Limpieza e Higiene', 'Equipo y Utensilios', 'Otros'
  ],
  Familia: ['Cerveza', 'Licores', 'Cocteles', 'No alcohólicos'],
  Presentacion: ['Bulto', 'Caja', 'Unidad', 'Sifón', 'Galón', 'Litro'],
  UnidadReceta: ['Mililitro', 'Gramo', 'Unidad', 'Kilo', 'Onza', 'Pizca']
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Cuentas por pagar')
    .addItem('Configurar hojas (correr una vez)', 'configurarHojas')
    .addToUi();
}

// Crea las pestañas con sus encabezados si no existen todavía. No toca
// hojas que ya tengan datos.
function configurarHojas() {
  prepararHoja(HOJA_FACTURAS, FACTURAS_ENCABEZADOS);
  prepararHoja(HOJA_DESGLOSE, DESGLOSE_ENCABEZADOS);
  prepararHoja(HOJA_ABONOS, ABONOS_ENCABEZADOS);
  prepararHoja(HOJA_MAESTRO, MAESTRO_ENCABEZADOS);
  sembrarConfiguracionPorDefecto(prepararHoja(HOJA_CONFIGURACION, CONFIGURACION_ENCABEZADOS));
}

// Siembra los catálogos por defecto, pero por Tipo individual: si "Tipo" ya
// tiene aunque sea una fila en la hoja (el usuario ya lo usó o ya lo vació a
// propósito) no lo vuelve a tocar; si el Tipo todavía no aparece ninguna vez
// (por ejemplo 'Presentacion'/'UnidadReceta' agregados 2026-08-08 a una hoja
// que ya tenía Area/Categoria/Familia con datos) le agrega sus valores por
// defecto. Así un CONFIGURACION_DEFAULTS nuevo se siembra solo la primera vez
// que corre, sin necesidad de que la hoja esté totalmente vacía.
function sembrarConfiguracionPorDefecto(hoja) {
  const nFilas = hoja.getLastRow() - 1;
  const tiposExistentes = {};
  if (nFilas > 0) {
    hoja.getRange(2, 1, nFilas, 1).getValues().forEach(function(f) { tiposExistentes[f[0]] = true; });
  }
  const filas = [];
  Object.keys(CONFIGURACION_DEFAULTS).forEach(function(tipo) {
    if (tiposExistentes[tipo]) return;
    CONFIGURACION_DEFAULTS[tipo].forEach(function(valor) { filas.push([tipo, valor, '']); });
  });
  if (filas.length) hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, CONFIGURACION_ENCABEZADOS.length).setValues(filas);
}

function getHojaConfiguracion() {
  const hoja = prepararHoja(HOJA_CONFIGURACION, CONFIGURACION_ENCABEZADOS);
  sembrarConfiguracionPorDefecto(hoja);
  return hoja;
}

// Agrega un valor nuevo a una lista simple (Área/Categoría/Familia). Tira
// error si el tipo no existe o si el valor ya estaba (sin importar mayúsculas).
function configAgregar(p) {
  if (TIPOS_CONFIGURACION_SIMPLE.indexOf(p.tipo) === -1) throw new Error('Tipo de configuración no reconocido: ' + p.tipo);
  const valor = (p.valor || '').toString().trim();
  if (!valor) throw new Error('Falta el valor a agregar.');
  const hoja = getHojaConfiguracion();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas > 0) {
    const datos = hoja.getRange(2, 1, nFilas, 2).getValues();
    const yaExiste = datos.some(function(f) { return f[0] === p.tipo && String(f[1]).toLowerCase() === valor.toLowerCase(); });
    if (yaExiste) throw new Error('Ese valor ya existe en la lista.');
  }
  hoja.appendRow([p.tipo, valor, '']);
  return { ok: true };
}

// Quita un valor de una lista simple. Si se borra una Familia, se borran
// también sus subfamilias huérfanas (de abajo hacia arriba para no correr
// los índices al eliminar filas).
function configEliminar(p) {
  if (TIPOS_CONFIGURACION_SIMPLE.indexOf(p.tipo) === -1) throw new Error('Tipo de configuración no reconocido: ' + p.tipo);
  const hoja = getHojaConfiguracion();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) throw new Error('No se encontró ese valor.');
  const datos = hoja.getRange(2, 1, nFilas, CONFIGURACION_ENCABEZADOS.length).getValues();
  let filaEncontrada = -1;
  for (let i = 0; i < datos.length; i++) {
    if (datos[i][0] === p.tipo && String(datos[i][1]) === String(p.valor)) { filaEncontrada = i + 2; break; }
  }
  if (filaEncontrada === -1) throw new Error('No se encontró ese valor.');
  hoja.deleteRow(filaEncontrada);

  if (p.tipo === 'Familia') {
    const nFilas2 = hoja.getLastRow() - 1;
    if (nFilas2 > 0) {
      const datos2 = hoja.getRange(2, 1, nFilas2, CONFIGURACION_ENCABEZADOS.length).getValues();
      for (let i = datos2.length - 1; i >= 0; i--) {
        if (datos2[i][0] === 'Subfamilia' && datos2[i][2] === p.valor) hoja.deleteRow(i + 2);
      }
    }
  }
  return { ok: true };
}

// Subfamilia depende de una Familia (columna "Extra"). Puede repetirse el
// mismo texto de subfamilia bajo familias distintas, no se valida global.
function configSubfamiliaAgregar(p) {
  const familia = (p.familia || '').toString().trim();
  const subfamilia = (p.valor || '').toString().trim();
  if (!familia) throw new Error('Falta la familia.');
  if (!subfamilia) throw new Error('Falta la subfamilia.');
  const hoja = getHojaConfiguracion();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas > 0) {
    const datos = hoja.getRange(2, 1, nFilas, CONFIGURACION_ENCABEZADOS.length).getValues();
    const yaExiste = datos.some(function(f) {
      return f[0] === 'Subfamilia' && f[2] === familia && String(f[1]).toLowerCase() === subfamilia.toLowerCase();
    });
    if (yaExiste) throw new Error('Esa subfamilia ya existe para esa familia.');
  }
  hoja.appendRow(['Subfamilia', subfamilia, familia]);
  return { ok: true };
}

function configSubfamiliaEliminar(p) {
  const hoja = getHojaConfiguracion();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas > 0) {
    const datos = hoja.getRange(2, 1, nFilas, CONFIGURACION_ENCABEZADOS.length).getValues();
    for (let i = datos.length - 1; i >= 0; i--) {
      if (datos[i][0] === 'Subfamilia' && datos[i][2] === p.familia && datos[i][1] === p.valor) {
        hoja.deleteRow(i + 2);
        return { ok: true };
      }
    }
  }
  throw new Error('No se encontró esa subfamilia.');
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
      case 'registrar_reembolso':
        result = registrarReembolso(payload);
        break;
      case 'guardar_factura_manual':
        result = guardarFacturaManual(payload);
        break;
      case 'eliminar_factura':
        result = eliminarFactura(payload);
        break;
      case 'aceptar_duplicado':
        result = aceptarDuplicado(payload);
        break;
      case 'maestro_sincronizar':
        result = sincronizarMaestro();
        break;
      case 'maestro_guardar':
        result = guardarMaestro(payload);
        break;
      case 'maestro_guardar_aplica':
        result = guardarAplicaMaestro(payload);
        break;
      case 'maestro_guardar_aplica_lote':
        result = guardarAplicaMaestroLote(payload);
        break;
      case 'maestro_agregar_manual':
        result = agregarManualMaestro(payload);
        break;
      case 'maestro_guardar_ficha':
        result = guardarFichaMaestro(payload);
        break;
      case 'config_agregar':
        result = configAgregar(payload);
        break;
      case 'config_eliminar':
        result = configEliminar(payload);
        break;
      case 'config_subfamilia_agregar':
        result = configSubfamiliaAgregar(payload);
        break;
      case 'config_subfamilia_eliminar':
        result = configSubfamiliaEliminar(payload);
        break;
      case 'fusionar_proveedor':
        result = fusionarProveedor(payload);
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

function getHojaMaestro() {
  return prepararHoja(HOJA_MAESTRO, MAESTRO_ENCABEZADOS);
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

// "Fecha del efectivo (fondo de caja)" (2026-07-29): solo aplica cuando
// medio_pago === 'Fondo de caja' — es la fecha del cierre de caja del que
// físicamente salió el dinero (no la fecha en que se registra el pago acá).
// cuentas-por-pagar.html manda además, en paralelo, este mismo dato al
// backend de Cierres (ver Code-cierres-kioskos-backend.gs, tipo
// 'salidaFondo') para que depositos.html/indicadores.html/index.html rebajen
// el monto del "efectivo pendiente de depositar" de esa fecha — acá solo
// queda guardado como referencia visible sobre la factura/abono.
function registrarPago(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal)        throw new Error('Falta indicar a cuál copia de la factura aplica.');
  if (!p.fecha_pago)     throw new Error('Falta la fecha de pago.');
  requerirKiosko(p);
  if (p.medio_pago === 'Fondo de caja' && !p.fecha_efectivo) {
    throw new Error('Indicá la fecha del efectivo (cierre de caja) del que sale este pago.');
  }
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
  if (p.medio_pago === 'Fondo de caja' && p.fecha_efectivo) {
    hoja.getRange(fila, columnaPorNombre(hoja, 'Fecha del efectivo (fondo de caja)')).setValue(p.fecha_efectivo);
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
  if (p.medio_pago === 'Fondo de caja' && !p.fecha_efectivo) {
    throw new Error('Indicá la fecha del efectivo (cierre de caja) del que sale este abono.');
  }

  const hojaAbonos = getHojaAbonos();
  // Asegura que la columna 10 tenga su encabezado aunque la hoja ya existiera
  // desplegada antes de esta versión (prepararHoja() solo escribe encabezados
  // en una hoja recién creada) — mismo mecanismo que columnaPorNombre() usa
  // para el resto de columnas dinámicas del archivo.
  columnaPorNombre(hojaAbonos, 'Fecha del efectivo (fondo de caja)');
  hojaAbonos.appendRow([
    p.numero_factura, p.fecha_abono, Number(p.monto_abono), p.medio_pago || '', p.referencia || '',
    p.reembolso_a || '', p.nota_credito || '', new Date(), p.kiosko,
    p.medio_pago === 'Fondo de caja' ? (p.fecha_efectivo || '') : ''
  ]);

  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal, p.kiosko);
  if (fila === -1) throw new Error('No se encontró esa factura.');

  const totalAbonado = sumAbonosFactura(p.numero_factura, p.kiosko);
  const col = columnaPorNombre(hoja, 'Total abonado');
  hoja.getRange(fila, col).setValue(totalAbonado);

  return { fila: fila, total_abonado: totalAbonado };
}

// Registra cuándo y con qué referencia la empresa le devolvió el dinero a la
// persona que pagó una factura de su bolsillo (Medio de pago = "Reembolso").
// Son columnas separadas de "Fecha de pago"/"Referencia" (que describen
// cuándo la persona pagó, no cuándo se le reintegró). Usado por el nuevo
// módulo caja-chica.html (pestaña Reembolsos).
function registrarReembolso(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal)        throw new Error('Falta indicar a cuál copia de la factura aplica.');
  if (!p.fecha_reembolso) throw new Error('Falta la fecha de reembolso.');
  requerirKiosko(p);
  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal, p.kiosko);
  if (fila === -1) throw new Error('No se encontró esa factura.');
  hoja.getRange(fila, columnaPorNombre(hoja, 'Fecha de reembolso')).setValue(p.fecha_reembolso);
  hoja.getRange(fila, columnaPorNombre(hoja, 'Referencia reembolso')).setValue(p.referencia_reembolso || '');
  return { fila: fila };
}

// ── FACTURA MANUAL ─────────────────────────────────────────────────
// Alta a mano desde cuentas-por-pagar.html (botón "Agregar factura manual"),
// para facturas/recibos que no pasaron por el facturas-extractor de OCR de
// ningún kiosko. Solo pide lo esencial (fecha, kiosko, proveedor, monto); el
// número de factura es opcional porque muchos recibos en papel no tienen uno
// claro. Si se deja vacío, se genera uno con prefijo "MANUAL-" para que la
// fila tenga igual una clave (número + kiosko) con la que identificarla
// después al registrar un pago/abono o al eliminarla (mismo mecanismo de
// filaFacturaPorOrdinal que usa el resto de las acciones).
function generarNumeroFacturaManual_() {
  const marca = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Costa_Rica', 'yyyyMMdd-HHmmss');
  const azar = Math.floor(100 + Math.random() * 900);
  return 'MANUAL-' + marca + '-' + azar;
}

function guardarFacturaManual(p) {
  if (!p.fecha) throw new Error('Falta la fecha de la factura.');
  requerirKiosko(p);
  if (!p.proveedor) throw new Error('Falta el proveedor.');
  if (!p.monto || Number(p.monto) <= 0) throw new Error('Falta un monto válido.');

  const numero = (p.numero_factura && String(p.numero_factura).trim()) || generarNumeroFacturaManual_();
  const hoja = getHoja();
  hoja.appendRow([
    p.fecha, numero, p.proveedor, p.moneda || 'CRC', Number(p.monto), p.kiosko
  ]);
  const fila = hoja.getLastRow();
  // Observación/motivo (opcional): misma columna dinámica "Notas" que ya usa
  // guardarNota() para el resto de las facturas, así se ve y se edita igual
  // en la tabla sin necesidad de un campo aparte.
  const nota = (p.nota || '').toString().trim();
  if (nota) {
    hoja.getRange(fila, columnaPorNombre(hoja, 'Notas')).setValue(nota);
  }
  return { numero_factura: numero, fila: fila };
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

// ── PROVEEDORES ────────────────────────────────────────────────────
// 2026-07-28: se retira el catálogo propio de este módulo (duplicaba 1:1 el
// esquema y la lógica de proveedores.html/Code-inventario-kioskos-v3-backend.gs
// contra un Sheet distinto). Ahora este módulo es solo LECTOR del Sheet
// "Inventario - Kioskos" (pestaña "Proveedores") vía gviz desde el propio
// cuentas-por-pagar.html — ver INVENTARIO_SHEET_ID/APPS_SCRIPT_INVENTARIO ahí.
// Si esta hoja "proveedores" ya tenía filas cargadas antes de este cambio,
// hay que copiarlas a mano a la pestaña "Proveedores" del otro Sheet antes de
// borrarla — este backend ya no las lee ni las escribe.

// ── CONSOLIDACIÓN DE NOMBRES DE PROVEEDOR (2026-08-08) ─────────────
// El texto de "Proveedor" sale tal cual de la IA que lee cada factura, sin
// pasar por ninguna normalización — por eso el mismo proveedor real puede
// quedar escrito de formas ligeramente distintas entre una factura y otra
// (con/sin guion, "S.A." vs "SA", espacios de más). fusionarProveedor()
// reescribe el texto YA GUARDADO para que todas esas variantes queden con
// el mismo "nombre estándar" en Registro Facturas, Desglose_IA y
// Maestro_Productos (así Análisis de Compras/Cuentas por Pagar los
// consolidan como un solo proveedor). Solo toca filas cuyo texto coincide
// EXACTO (ignorando mayúsculas y espacios de más) con alguna de las
// variantes que el usuario confirmó en proveedores.html — nunca fusiona por
// parecido automático sin confirmación.
function fusionarProveedor(p) {
  const nombreEstandar = String(p.nombreEstandar || '').trim();
  if (!nombreEstandar) throw new Error('Falta el nombre estándar del proveedor.');

  const variantesCrudas = Array.isArray(p.variantes) ? p.variantes : [];
  const clavesVariantes = {};
  variantesCrudas.concat([nombreEstandar]).forEach(function(v) {
    const s = String(v || '').trim();
    if (s) clavesVariantes[s.toLowerCase()] = true;
  });
  if (!Object.keys(clavesVariantes).length) {
    throw new Error('No se indicaron variantes a fusionar.');
  }

  const filasFacturas = reescribirColumnaProveedor_(getHoja(), COL.PROVEEDOR, clavesVariantes, nombreEstandar);
  const filasDesglose = reescribirColumnaProveedor_(getHojaDesglose(), DESGLOSE_COL.PROVEEDOR, clavesVariantes, nombreEstandar);
  const resultadoMaestro = fusionarProveedorEnMaestro_(clavesVariantes, nombreEstandar);

  return {
    nombreEstandar: nombreEstandar,
    filasFacturas: filasFacturas,
    filasDesglose: filasDesglose,
    filasMaestro: resultadoMaestro.filasRenombradas,
    filasMaestroFusionadas: resultadoMaestro.filasFusionadas
  };
}

// Reescribe in place el valor de una columna en todas las filas cuyo texto
// (recortado, sin importar mayúsculas) está en `clavesVariantes`. Devuelve
// cuántas filas cambió.
function reescribirColumnaProveedor_(hoja, colIdx, clavesVariantes, nombreEstandar) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return 0;
  const rango = hoja.getRange(2, colIdx, nFilas, 1);
  const valores = rango.getValues();
  let cambios = 0;
  for (let i = 0; i < valores.length; i++) {
    const actual = String(valores[i][0] || '').trim();
    if (!actual || actual === nombreEstandar) continue;
    if (clavesVariantes[actual.toLowerCase()]) {
      valores[i][0] = nombreEstandar;
      cambios++;
    }
  }
  if (cambios) rango.setValues(valores);
  return cambios;
}

// Maestro_Productos necesita algo más que renombrar: "Clave" se calcula a
// partir de Proveedor+Producto (ver claveMaestro_ más abajo), así que al
// renombrar el Proveedor de una fila hay que recalcular su Clave también —
// si no, el próximo maestro_sincronizar() no la reconoce como la misma fila
// y crea una fila nueva "pendiente", perdiendo el Nombre Estándar/Estado que
// el usuario ya había confirmado a mano para ese producto. Si, al renombrar,
// dos filas distintas (mismo producto, comprado bajo dos variantes del
// proveedor) terminan con la misma Clave nueva, se fusionan en una sola.
function fusionarProveedorEnMaestro_(clavesVariantes, nombreEstandar) {
  const hoja = getHojaMaestro();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return { filasRenombradas: 0, filasFusionadas: 0 };

  const ultimaCol = hoja.getLastColumn();
  const rango = hoja.getRange(2, 1, nFilas, ultimaCol);
  const filas = rango.getValues();

  let filasRenombradas = 0;
  filas.forEach(function(fila) {
    const proveedorActual = String(fila[MAESTRO_COL.PROVEEDOR - 1] || '').trim();
    if (proveedorActual && proveedorActual !== nombreEstandar && clavesVariantes[proveedorActual.toLowerCase()]) {
      fila[MAESTRO_COL.PROVEEDOR - 1] = nombreEstandar;
      fila[MAESTRO_COL.CLAVE - 1] = claveMaestro_(nombreEstandar, fila[MAESTRO_COL.NOMBRE_FACTURA - 1]);
      filasRenombradas++;
    }
  });

  // Detectar colisiones de Clave (varias filas cayeron en la misma Clave
  // tras el renombre) y fusionarlas en una sola fila.
  const porClave = {};
  filas.forEach(function(fila, i) {
    const clave = fila[MAESTRO_COL.CLAVE - 1];
    if (!clave) return;
    (porClave[clave] = porClave[clave] || []).push(i);
  });

  const filasAEliminar = [];
  let filasFusionadas = 0;
  Object.keys(porClave).forEach(function(clave) {
    const idxs = porClave[clave];
    if (idxs.length < 2) return;
    // Preferí la fila que ya tiene Nombre Estándar confirmado; si hay
    // varias o ninguna, la que tenga más "Veces visto".
    idxs.sort(function(a, b) {
      const confA = filas[a][MAESTRO_COL.NOMBRE_ESTANDAR - 1] ? 1 : 0;
      const confB = filas[b][MAESTRO_COL.NOMBRE_ESTANDAR - 1] ? 1 : 0;
      if (confA !== confB) return confB - confA;
      return (Number(filas[b][MAESTRO_COL.VECES_VISTO - 1]) || 0) - (Number(filas[a][MAESTRO_COL.VECES_VISTO - 1]) || 0);
    });
    const principal = idxs[0];
    let vecesTotal = Number(filas[principal][MAESTRO_COL.VECES_VISTO - 1]) || 0;
    const fechas = [filas[principal][MAESTRO_COL.PRIMERA_VEZ - 1], filas[principal][MAESTRO_COL.ULTIMA_VEZ - 1]];
    for (let k = 1; k < idxs.length; k++) {
      const i = idxs[k];
      vecesTotal += Number(filas[i][MAESTRO_COL.VECES_VISTO - 1]) || 0;
      if (filas[i][MAESTRO_COL.PRIMERA_VEZ - 1]) fechas.push(filas[i][MAESTRO_COL.PRIMERA_VEZ - 1]);
      if (filas[i][MAESTRO_COL.ULTIMA_VEZ - 1]) fechas.push(filas[i][MAESTRO_COL.ULTIMA_VEZ - 1]);
      filasAEliminar.push(i);
      filasFusionadas++;
    }
    filas[principal][MAESTRO_COL.VECES_VISTO - 1] = vecesTotal;
    const fechasValidas = fechas.filter(function(f) { return f; }).map(function(f) { return f instanceof Date ? f : new Date(f); }).filter(function(f) { return !isNaN(f.getTime()); });
    if (fechasValidas.length) {
      fechasValidas.sort(function(a, b) { return a - b; });
      filas[principal][MAESTRO_COL.PRIMERA_VEZ - 1] = fechasValidas[0];
      filas[principal][MAESTRO_COL.ULTIMA_VEZ - 1] = fechasValidas[fechasValidas.length - 1];
    }
  });

  if (filasRenombradas || filasFusionadas) {
    rango.setValues(filas);
  }
  if (filasAEliminar.length) {
    // Borrar de abajo hacia arriba para no correr los índices de fila.
    filasAEliminar.sort(function(a, b) { return b - a; }).forEach(function(i) {
      hoja.deleteRow(i + 2);
    });
  }

  return { filasRenombradas: filasRenombradas, filasFusionadas: filasFusionadas };
}

// ── MAESTRO DE PRODUCTOS (homologación de nombres de factura) ─────
// Agrupa las líneas de Desglose_IA por Proveedor + texto de producto (clave
// normalizada, sin acentos/mayúsculas/espacios extra) y arma una fila por
// combinación distinta con una propuesta automática de nombre estándar.
function claveMaestro_(proveedor, producto) {
  return normalizarTextoGS(proveedor) + '§' + normalizarTextoGS(producto);
}

// Valor más frecuente de un array de strings, ignorando vacíos ('' si no hay
// ninguno no vacío).
function modaGS_(valores) {
  const conteo = {};
  let mejor = '', mejorConteo = 0;
  valores.forEach(function(v) {
    const s = String(v || '').trim();
    if (!s) return;
    conteo[s] = (conteo[s] || 0) + 1;
    if (conteo[s] > mejorConteo) { mejorConteo = conteo[s]; mejor = s; }
  });
  return mejor;
}

// Fallback determinístico para cuando ninguna línea de Desglose_IA trae ya un
// "Nombre normalizado" de IA para ese texto: capitaliza cada palabra y
// colapsa espacios. La columna Nombre normalizado (IA) siempre gana cuando
// existe — esto es solo un piso razonable, no reemplaza revisar a mano.
function proponerNombreGS_(texto) {
  const limpio = String(texto || '').trim().replace(/\s+/g, ' ');
  if (!limpio) return '';
  return limpio.toLowerCase().replace(/(^|\s)([a-záéíóúñ])/g, function(_, esp, letra) {
    return esp + letra.toUpperCase();
  });
}

function sincronizarMaestro() {
  const hojaDesglose = getHojaDesglose();
  const nFilas = hojaDesglose.getLastRow() - 1;
  if (nFilas <= 0) return { nuevos: 0, actualizados: 0, total: 0 };

  const datos = hojaDesglose.getRange(2, 1, nFilas, DESGLOSE_COL.KIOSKO).getValues();
  const grupos = {}; // clave -> { proveedor, producto, categorias:[], unidades:[], normalizados:[], fechas:[], ultimaFecha, costoUltimo, monedaUltima }

  datos.forEach(function(fila) {
    const proveedor = fila[DESGLOSE_COL.PROVEEDOR - 1];
    const producto = fila[DESGLOSE_COL.PRODUCTO - 1];
    if (!proveedor && !producto) return;
    const clave = claveMaestro_(proveedor, producto);
    if (!grupos[clave]) {
      grupos[clave] = {
        proveedor: proveedor, producto: producto, categorias: [], unidades: [],
        normalizados: [], fechas: [], ultimaFecha: null, costoUltimo: '', monedaUltima: ''
      };
    }
    const g = grupos[clave];
    g.categorias.push(fila[DESGLOSE_COL.CATEGORIA - 1]);
    g.unidades.push(fila[DESGLOSE_COL.UNIDAD_MEDIDA - 1]);
    g.normalizados.push(fila[DESGLOSE_COL.NOMBRE_NORMALIZADO - 1]);
    const f = fila[DESGLOSE_COL.FECHA_FACTURA - 1];
    const fecha = f ? (f instanceof Date ? f : new Date(f)) : null;
    if (fecha && !isNaN(fecha.getTime())) {
      g.fechas.push(fecha);
      // Costo sugerido = Precio unitario + Moneda de la línea de Desglose_IA
      // MÁS RECIENTE de esta clave (no un promedio) — al completar la ficha
      // de producto interesa el último precio pagado, no un histórico.
      if (!g.ultimaFecha || fecha > g.ultimaFecha) {
        g.ultimaFecha = fecha;
        g.costoUltimo = fila[DESGLOSE_COL.PRECIO_UNITARIO - 1];
        g.monedaUltima = fila[DESGLOSE_COL.MONEDA - 1];
      }
    }
  });

  const hojaMaestro = getHojaMaestro();
  const nExistentes = hojaMaestro.getLastRow() - 1;
  const existentes = {}; // clave -> número de fila
  if (nExistentes > 0) {
    const clavesExistentes = hojaMaestro.getRange(2, MAESTRO_COL.CLAVE, nExistentes, 1).getValues();
    clavesExistentes.forEach(function(r, i) { if (r[0]) existentes[r[0]] = i + 2; });
  }

  // Columnas dinámicas que este sync también refresca en cada corrida (dato
  // derivado de Desglose_IA, igual criterio que Categoría/Unidad/Propuesta:
  // se recalcula siempre, sin importar si el usuario ya confirmó la fila).
  const colAplica = columnaPorNombre(hojaMaestro, 'Aplica');
  const colCostoSugerido = columnaPorNombre(hojaMaestro, 'Costo sugerido (última compra)');
  const colMonedaSugerida = columnaPorNombre(hojaMaestro, 'Moneda sugerida');
  const colFechaUltimaCompra = columnaPorNombre(hojaMaestro, 'Fecha última compra');
  const colFichaActualizada = columnaPorNombre(hojaMaestro, 'Ficha actualizada');
  const colCostoPorUnidad = columnaPorNombre(hojaMaestro, 'Costo por unidad');
  const colArea = columnaPorNombre(hojaMaestro, 'Área de negocio');
  const colPrecioSinIVA = columnaPorNombre(hojaMaestro, 'Precio sin IVA');

  let nuevos = 0, actualizados = 0;
  const ahora = new Date();

  Object.keys(grupos).forEach(function(clave) {
    const g = grupos[clave];
    const fechas = g.fechas.slice().sort(function(a, b) { return a - b; });
    const primera = fechas.length ? fechas[0] : '';
    const ultima = fechas.length ? fechas[fechas.length - 1] : '';
    const categoria = modaGS_(g.categorias);
    const unidad = modaGS_(g.unidades);
    const propuesta = modaGS_(g.normalizados) || proponerNombreGS_(g.producto);
    const costoSugerido = (g.costoUltimo !== '' && g.costoUltimo != null) ? (Number(g.costoUltimo) || '') : '';
    const monedaSugerida = g.monedaUltima || '';
    const fechaUltimaCompra = g.ultimaFecha || '';

    if (existentes[clave]) {
      const fila = existentes[clave];
      // Una vez que la ficha de producto ya se completó (tiene "Ficha
      // actualizada"), la Categoría pasa a ser clasificación manual del
      // usuario (ver guardarFichaMaestro) y ya no se pisa con la propuesta
      // automática de Desglose_IA en cada sync — si no, un "Sincronizar"
      // borraría la Categoría/Familia que se eligió a mano en la ficha.
      const fichaYaCompleta = hojaMaestro.getRange(fila, colFichaActualizada).getValue();
      if (!fichaYaCompleta) {
        hojaMaestro.getRange(fila, MAESTRO_COL.CATEGORIA).setValue(categoria);
        // "Costo por unidad" (= "Costo de compra" en la tabla) todavía no lo
        // fijó nadie a mano desde la ficha: mientras tanto, que refleje el
        // último precio de factura (igual que Costo sugerido) para que la
        // columna no quede vacía ni desactualizada. Solo si la última compra
        // vino en colones — en USD hace falta el tipo de cambio, que sólo se
        // resuelve al completar la ficha (ver guardarFichaMaestro). En
        // cuanto se guarda la ficha una vez, "Ficha actualizada" deja de
        // estar vacía y este bloque no vuelve a pisar el valor manual.
        if (colCostoPorUnidad && monedaSugerida !== 'USD' && costoSugerido !== '') {
          hojaMaestro.getRange(fila, colCostoPorUnidad).setValue(costoSugerido);
        }
        // "Precio sin IVA" (2026-07-27) — mismo criterio: Inventario lo usa
        // para valorizar unidades "cerrado/completo", y sin esto quedaba
        // en ₡0 hasta que alguien completara la ficha a mano.
        if (colPrecioSinIVA && monedaSugerida !== 'USD' && costoSugerido !== '') {
          hojaMaestro.getRange(fila, colPrecioSinIVA).setValue(costoSugerido);
        }
        // "Área de negocio" (2026-07-27) — mismo criterio: sin ficha
        // completada, se rellena con la Categoría (que sí llega bien
        // poblada desde Desglose_IA) para que Inventario pueda agrupar en
        // vivo aunque nadie haya abierto la ficha todavía. En cuanto se
        // guarda la ficha una vez, este bloque deja de pisar el valor.
        if (colArea) {
          hojaMaestro.getRange(fila, colArea).setValue(categoria);
        }
      }
      hojaMaestro.getRange(fila, MAESTRO_COL.UNIDAD).setValue(unidad);
      hojaMaestro.getRange(fila, MAESTRO_COL.VECES_VISTO).setValue(g.categorias.length);
      hojaMaestro.getRange(fila, MAESTRO_COL.PRIMERA_VEZ).setValue(primera);
      hojaMaestro.getRange(fila, MAESTRO_COL.ULTIMA_VEZ).setValue(ultima);
      hojaMaestro.getRange(fila, MAESTRO_COL.PROPUESTA).setValue(propuesta);
      hojaMaestro.getRange(fila, MAESTRO_COL.ACTUALIZADO).setValue(ahora);
      hojaMaestro.getRange(fila, colCostoSugerido).setValue(costoSugerido);
      hojaMaestro.getRange(fila, colMonedaSugerida).setValue(monedaSugerida);
      hojaMaestro.getRange(fila, colFechaUltimaCompra).setValue(fechaUltimaCompra);
      actualizados++;
    } else {
      hojaMaestro.appendRow([
        clave, g.proveedor, g.producto, categoria, unidad,
        g.categorias.length, primera, ultima, propuesta,
        '', 'Pendiente', ahora
      ]);
      // Fila nueva por sync (viene de una factura): "Aplica" arranca en "Sí"
      // por defecto. Si ya existía, no se toca (igual que Nombre Estándar/
      // Estado) para no pisar una fila que el usuario ya marcó "No" a mano.
      const filaNueva = hojaMaestro.getLastRow();
      hojaMaestro.getRange(filaNueva, colAplica).setValue('Sí');
      hojaMaestro.getRange(filaNueva, colCostoSugerido).setValue(costoSugerido);
      hojaMaestro.getRange(filaNueva, colMonedaSugerida).setValue(monedaSugerida);
      hojaMaestro.getRange(filaNueva, colFechaUltimaCompra).setValue(fechaUltimaCompra);
      // Fila sin ficha todavía: mismo criterio que arriba, "Costo por
      // unidad" arranca reflejando el último precio de factura (solo en
      // colones) hasta que alguien complete la ficha a mano.
      if (colCostoPorUnidad && monedaSugerida !== 'USD' && costoSugerido !== '') {
        hojaMaestro.getRange(filaNueva, colCostoPorUnidad).setValue(costoSugerido);
      }
      // Mismo criterio de "Precio sin IVA" que arriba, para filas nuevas.
      if (colPrecioSinIVA && monedaSugerida !== 'USD' && costoSugerido !== '') {
        hojaMaestro.getRange(filaNueva, colPrecioSinIVA).setValue(costoSugerido);
      }
      // Mismo criterio de "Área de negocio" que arriba, para filas nuevas.
      if (colArea) {
        hojaMaestro.getRange(filaNueva, colArea).setValue(categoria);
      }
      nuevos++;
    }
  });

  return { nuevos: nuevos, actualizados: actualizados, total: Object.keys(grupos).length };
}

function filaMaestroPorClave_(hoja, clave) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const claves = hoja.getRange(2, MAESTRO_COL.CLAVE, nFilas, 1).getValues();
  for (let i = 0; i < claves.length; i++) {
    if (String(claves[i][0]) === String(clave)) return i + 2;
  }
  return -1;
}

function guardarMaestro(p) {
  if (!p.clave) throw new Error('Falta la clave del producto.');
  if (!p.nombre_estandar) throw new Error('Falta el nombre estándar.');
  const hoja = getHojaMaestro();
  const fila = filaMaestroPorClave_(hoja, p.clave);
  if (fila === -1) throw new Error('No se encontró ese producto en el Maestro (sincronizá de nuevo).');
  hoja.getRange(fila, MAESTRO_COL.NOMBRE_ESTANDAR).setValue(p.nombre_estandar);
  hoja.getRange(fila, MAESTRO_COL.ESTADO).setValue(p.estado || 'Confirmado');
  hoja.getRange(fila, MAESTRO_COL.ACTUALIZADO).setValue(new Date());
  return { fila: fila };
}

// Marca una fila existente como "Aplica: Sí/No" — para las líneas que
// resultan ser servicios u otros conceptos que no hace falta homologar como
// producto (fletes, comisiones, servicios profesionales, etc.). Se guarda
// sola, sin tocar Nombre Estándar/Estado.
function guardarAplicaMaestro(p) {
  if (!p.clave) throw new Error('Falta la clave del producto.');
  const aplica = p.aplica === 'No' ? 'No' : 'Sí';
  const hoja = getHojaMaestro();
  const fila = filaMaestroPorClave_(hoja, p.clave);
  if (fila === -1) throw new Error('No se encontró ese producto en el Maestro (sincronizá de nuevo).');
  hoja.getRange(fila, columnaPorNombre(hoja, 'Aplica')).setValue(aplica);
  hoja.getRange(fila, MAESTRO_COL.ACTUALIZADO).setValue(new Date());
  return { fila: fila, aplica: aplica };
}

// Igual que guardarAplicaMaestro() pero para varias filas de un saque —
// evita una llamada al Web App por cada checkbox tildado cuando el usuario
// selecciona varios servicios/productos a la vez y marca "Aplica" en lote.
// No corta ante la primera clave no encontrada: sigue con el resto y al
// final informa cuántas sí se marcaron.
function guardarAplicaMaestroLote(p) {
  if (!Array.isArray(p.claves) || !p.claves.length) throw new Error('Falta indicar cuáles filas marcar.');
  const aplica = p.aplica === 'No' ? 'No' : 'Sí';
  const hoja = getHojaMaestro();
  const colAplica = columnaPorNombre(hoja, 'Aplica');
  const ahora = new Date();
  let marcadas = 0;
  p.claves.forEach(function(clave) {
    const fila = filaMaestroPorClave_(hoja, clave);
    if (fila === -1) return;
    hoja.getRange(fila, colAplica).setValue(aplica);
    hoja.getRange(fila, MAESTRO_COL.ACTUALIZADO).setValue(ahora);
    marcadas++;
  });
  if (!marcadas) throw new Error('No se encontró ninguna de esas filas (sincronizá de nuevo).');
  return { marcadas: marcadas, aplica: aplica };
}

// Agrega un producto a mano al Maestro, sin esperar a que aparezca en una
// factura ya procesada por Desglose_IA. Usa la misma clave (Proveedor +
// Nombre en Factura normalizados) que sincronizarMaestro(), así que si más
// adelante llega una factura con ese mismo texto, sincronizar la va a
// reconocer como la misma fila en vez de duplicarla.
function agregarManualMaestro(p) {
  if (!p.nombre_estandar) throw new Error('Falta el nombre del producto.');
  const proveedor = p.proveedor || '';
  const nombreFactura = p.nombre_factura || p.nombre_estandar;
  const clave = claveMaestro_(proveedor, nombreFactura);

  const hoja = getHojaMaestro();
  if (filaMaestroPorClave_(hoja, clave) !== -1) {
    throw new Error('Ya existe un producto con ese proveedor + nombre. Buscalo en la lista y editalo ahí.');
  }

  const ahora = new Date();
  hoja.appendRow([
    clave, proveedor, nombreFactura, p.categoria || '', p.unidad || '',
    0, '', '', '', p.nombre_estandar, 'Confirmado', ahora
  ]);
  const fila = hoja.getLastRow();
  const aplica = p.aplica === 'No' ? 'No' : 'Sí';
  hoja.getRange(fila, columnaPorNombre(hoja, 'Aplica')).setValue(aplica);

  return { clave: clave, fila: fila };
}

// Todas las filas del Maestro cuyo "Nombre Estándar" coincida (normalizado,
// sin importar mayúsculas/tildes/espacios) con el que se pasa. Un mismo
// producto puede haber quedado homologado desde varias filas Proveedor +
// Nombre en Factura distintas (comprado a más de un proveedor, o con más de
// un alias de texto en factura) — la ficha es "por producto", no por fila,
// así que se guarda igual en todas para que no importe cuál fila (proveedor)
// se haya usado para abrir el modal.
function filasMaestroPorNombreEstandar_(hoja, nombreEstandar) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return [];
  const buscado = normalizarTextoGS(nombreEstandar);
  if (!buscado) return [];
  const valores = hoja.getRange(2, MAESTRO_COL.NOMBRE_ESTANDAR, nFilas, 1).getValues();
  const filas = [];
  valores.forEach(function(r, i) { if (r[0] && normalizarTextoGS(r[0]) === buscado) filas.push(i + 2); });
  return filas;
}

// Guarda los campos de "ficha de producto" (ex módulo Base de Productos,
// fusionado acá — ver comentario en MAESTRO_ENCABEZADOS): clasificación
// (categoría/área/familia/subfamilia), precio/costo, presentación, kioskos
// donde se vende, activo, y la sección "Información para recetas" (adaptada
// de costos-productos.html de Ecosistema Lorito). Requiere que la fila
// recibida en "clave" ya exista en el Maestro (por sync o por alta manual)
// — no crea filas nuevas, a propósito, para no duplicar el mecanismo de
// claveMaestro_/sync. El precio siempre llega ya convertido a colones desde
// el cliente (la moneda original elegida en el modal no se persiste, solo
// el monto ya en ₡).
//
// La ficha se guarda en TODAS las filas que compartan el mismo Nombre
// Estándar que la fila de "clave" (ver filasMaestroPorNombreEstandar_) —
// así "Fichas de producto" puede agruparlas en el frontend y mostrar una
// sola clasificación/costo/receta por producto, con los distintos
// proveedores/nombres de factura solo como referencia de dónde se compró.
function guardarFichaMaestro(p) {
  if (!p.clave) throw new Error('Falta la clave del producto.');
  const hoja = getHojaMaestro();
  const filaOrigen = filaMaestroPorClave_(hoja, p.clave);
  if (filaOrigen === -1) throw new Error('No se encontró ese producto en el Maestro (sincronizá de nuevo).');

  const nombreEstandar = hoja.getRange(filaOrigen, MAESTRO_COL.NOMBRE_ESTANDAR).getValue();
  const filas = nombreEstandar ? filasMaestroPorNombreEstandar_(hoja, nombreEstandar) : [filaOrigen];
  if (filas.indexOf(filaOrigen) === -1) filas.push(filaOrigen);

  const precio = Number(p.precio_sin_iva) || 0;
  const cantidad = Number(p.cantidad_presentacion) || 0;
  const costoUnidad = cantidad > 0 ? Number((precio / cantidad).toFixed(4)) : 0;
  const rendimiento = (p.rendimiento_receta !== undefined && p.rendimiento_receta !== '' && p.rendimiento_receta != null)
    ? Number(p.rendimiento_receta) : 100;
  const costoRealReceta = rendimiento > 0 ? Number((costoUnidad / (rendimiento / 100)).toFixed(4)) : costoUnidad;

  // Control de inventario por peso (2026-07-27): ver nota junto a
  // MAESTRO_ENCABEZADOS. 'peso' exige contenido de envase y densidad —
  // sin esos dos datos, inventario.html no puede convertir gramos a ml.
  const tipoControl = p.tipo_control === 'peso' ? 'peso' : 'unitario';
  const contenidoMl = Number(p.contenido_envase_ml) || 0;
  const densidad = Number(p.densidad) || 0;
  const taraDefecto = (p.tara_defecto === '' || p.tara_defecto === undefined || p.tara_defecto === null) ? '' : Number(p.tara_defecto);
  if (tipoControl === 'peso') {
    if (!contenidoMl) throw new Error('Un producto de control por peso necesita el contenido del envase en ml.');
    if (!densidad) throw new Error('Un producto de control por peso necesita la densidad en g/ml (cerveza ≈ 1.005, destilados 40° ≈ 0.94).');
  }

  const ahora = new Date();

  const colCategoria = MAESTRO_COL.CATEGORIA;
  const colArea = columnaPorNombre(hoja, 'Área de negocio');
  const colPresentacion = columnaPorNombre(hoja, 'Presentación');
  const colTamano = columnaPorNombre(hoja, 'Tamaño');
  const colPrecio = columnaPorNombre(hoja, 'Precio sin IVA');
  const colIva = columnaPorNombre(hoja, 'IVA (%)');
  const colCantidad = columnaPorNombre(hoja, 'Cantidad presentación');
  const colCosto = columnaPorNombre(hoja, 'Costo por unidad');
  const colKioskos = columnaPorNombre(hoja, 'Kioskos');
  const colActivo = columnaPorNombre(hoja, 'Activo');
  const colFichaAct = columnaPorNombre(hoja, 'Ficha actualizada');
  const colFamilia = columnaPorNombre(hoja, 'Familia');
  const colSubfamilia = columnaPorNombre(hoja, 'Subfamilia');
  const colAplicaReceta = columnaPorNombre(hoja, 'Aplica Receta');
  const colUnidadReceta = columnaPorNombre(hoja, 'Unidad Receta');
  const colRendimiento = columnaPorNombre(hoja, 'Rendimiento Receta (%)');
  const colCostoReal = columnaPorNombre(hoja, 'Costo Real Receta');
  const colUsarManual = columnaPorNombre(hoja, 'Usar Costo Manual Receta');
  const colTipoControl = columnaPorNombre(hoja, 'Tipo de Control');
  const colContenidoMl = columnaPorNombre(hoja, 'Contenido Envase (ml)');
  const colDensidad = columnaPorNombre(hoja, 'Densidad (g/ml)');
  const colTaraDefecto = columnaPorNombre(hoja, 'Tara por Defecto (g)');

  filas.forEach(function(fila) {
    if (p.categoria) hoja.getRange(fila, colCategoria).setValue(p.categoria);
    hoja.getRange(fila, colArea).setValue(p.area || '');
    hoja.getRange(fila, colPresentacion).setValue(p.presentacion || '');
    hoja.getRange(fila, colTamano).setValue(p.tamano || '');
    hoja.getRange(fila, colPrecio).setValue(precio);
    hoja.getRange(fila, colIva).setValue(Number(p.iva) || 0);
    hoja.getRange(fila, colCantidad).setValue(cantidad);
    hoja.getRange(fila, colCosto).setValue(costoUnidad);
    hoja.getRange(fila, colKioskos).setValue(p.kioskos || 'Todos');
    hoja.getRange(fila, colActivo).setValue(p.activo === false ? false : true);
    hoja.getRange(fila, colFichaAct).setValue(ahora);
    hoja.getRange(fila, colFamilia).setValue(p.familia || '');
    hoja.getRange(fila, colSubfamilia).setValue(p.subfamilia || '');
    hoja.getRange(fila, colAplicaReceta).setValue(p.aplica_receta === 'No' ? 'No' : 'Sí');
    hoja.getRange(fila, colUnidadReceta).setValue(p.unidad_receta || '');
    hoja.getRange(fila, colRendimiento).setValue(rendimiento);
    hoja.getRange(fila, colCostoReal).setValue(costoRealReceta);
    hoja.getRange(fila, colUsarManual).setValue(p.usar_costo_manual_receta === true || p.usar_costo_manual_receta === 'true');
    hoja.getRange(fila, colTipoControl).setValue(tipoControl);
    hoja.getRange(fila, colContenidoMl).setValue(contenidoMl || '');
    hoja.getRange(fila, colDensidad).setValue(densidad || '');
    hoja.getRange(fila, colTaraDefecto).setValue(taraDefecto);
    hoja.getRange(fila, MAESTRO_COL.ACTUALIZADO).setValue(ahora);
  });

  return { filas: filas.length, costoPorUnidad: costoUnidad, costoRealReceta: costoRealReceta };
}
