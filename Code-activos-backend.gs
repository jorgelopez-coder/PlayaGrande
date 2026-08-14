/**
 * Backend Apps Script para el módulo de Activos Menores (activos.html) del
 * Ecosistema Kioskos (Playa Grande, Liberia, Nosara, Playa Hermosa y los que
 * se agreguen). Mismo patrón que Code-mantenimiento-backend.gs: un Web App
 * standalone atado a un Sheet propio, fotos guardadas en Drive organizadas
 * en una subcarpeta por kiosko.
 *
 * Qué registra:
 * - "Activos": una fila por activo menor (mobiliario, equipo, decoración,
 *   etc.), con el kiosko donde está actualmente, descripción, medidas
 *   (alto/ancho/fondo) y foto.
 * - "Traslados": historial de movimientos entre kioskos — una fila por
 *   traslado (incluye el alta inicial como el primer "traslado", con
 *   Kiosko Origen vacío), para poder reconstruir por dónde pasó cada activo.
 *
 * Sheet de datos: crear un Sheet nuevo, ej. "Activos Menores - Kioskos"
 * (no reutiliza "Operaciones - Kioskos" para no mezclar historiales).
 * Carpeta de fotos (raíz, ya creada por Jorge):
 *   https://drive.google.com/drive/u/0/folders/1xazvuBRc86GwMPlVwa3TEVq_uvkjtImr
 *   Adentro se crea automáticamente una subcarpeta por kiosko (mismo patrón
 *   que Code-mantenimiento-backend.gs → getOrCreateCarpetaKiosko).
 *
 * Cómo desplegarlo:
 * 1. Creá un Google Sheet nuevo (ej. "Activos Menores - Kioskos") →
 *    Extensiones > Apps Script.
 * 2. Pegá este código completo.
 * 3. Corré UNA VEZ la función configurarHoja() desde el editor (▶ con
 *    configurarHoja seleccionado) para crear las pestañas "Activos" y
 *    "Traslados". La primera vez va a pedir autorizar el script (acceso a
 *    Drive para guardar fotos).
 * 4. Implementar > Nueva implementación > Tipo: Aplicación web, Ejecutar
 *    como Yo, Acceso: Cualquiera.
 * 5. Copiá la URL /exec resultante y pegala en activos.html (constante
 *    ACTIVOS_URL).
 *
 * Si se agregan columnas nuevas: agregarlas al FINAL del ENCABEZADOS que
 * corresponda (nunca insertar en el medio), volver a pegar el código,
 * Implementar > Gestionar implementaciones > Editar > Nueva versión (la URL
 * /exec no cambia), y correr configurarHoja() de nuevo para que la fila de
 * encabezados se actualice sin tocar los datos ya guardados.
 */

const HOJA_ACTIVOS = 'Activos';
// Cantidad / Valor Estimado / Fecha Adquisición / Marca / Modelo se
// agregaron al FINAL a propósito (no insertadas en el medio) para no correr
// el resto de columnas en Sheets que ya tengan filas cargadas — mismo
// criterio que el resto del ecosistema (ver
// project_maestro_productos_aplica_manual.md).
const ENCABEZADOS_ACTIVOS = [
  'ID', 'Nombre', 'Categoría', 'Descripción', 'Alto (cm)', 'Ancho (cm)', 'Fondo (cm)',
  'Kiosko Actual', 'Estado', 'Foto URL', 'Fecha Registro', 'Registrado por', 'Registrado', 'Notas',
  'Cantidad', 'Valor Estimado', 'Fecha Adquisición', 'Marca', 'Modelo'
];

const HOJA_TRASLADOS = 'Traslados';
const ENCABEZADOS_TRASLADOS = [
  'ID', 'Activo ID', 'Activo Nombre', 'Fecha', 'Kiosko Origen', 'Kiosko Destino',
  'Motivo', 'Trasladado por', 'Registrado'
];

// ── CATEGORÍAS (configurables desde la pestaña "Configuración" de
// activos.html) ─────────────────────────────────────────────────────
// Una fila por categoría. "Activa" = No no borra la categoría (los activos
// ya registrados con esa categoría la conservan) — solo la saca del select
// para altas nuevas. configurarHoja() siembra la lista inicial una sola vez
// (si la hoja está vacía), después el usuario la administra desde la UI.
const HOJA_CATEGORIAS = 'Categorias';
const ENCABEZADOS_CATEGORIAS = ['Categoría', 'Activa', 'Actualizado'];
const CATEGORIAS_DEFAULT = [
  'Mobiliario', 'Equipo de cocina', 'Iluminación', 'Decoración',
  'Smallware', 'Electrónico', 'Otro'
];

// Carpeta raíz fija de Drive donde se guardan las fotos de los activos.
// Adentro se crea automáticamente una subcarpeta por kiosko (mismo patrón
// que FOLDER_ID_MANTENIMIENTO en Code-mantenimiento-backend.gs).
// https://drive.google.com/drive/u/0/folders/1xazvuBRc86GwMPlVwa3TEVq_uvkjtImr
const FOLDER_ID_ACTIVOS = '1xazvuBRc86GwMPlVwa3TEVq_uvkjtImr';

// Corré esta función UNA VEZ (o cada vez que se agreguen columnas nuevas)
// desde el editor de Apps Script para preparar el Sheet.
function configurarHoja() {
  prepararHoja(HOJA_ACTIVOS, ENCABEZADOS_ACTIVOS);
  prepararHoja(HOJA_TRASLADOS, ENCABEZADOS_TRASLADOS);
  const hojaCat = prepararHoja(HOJA_CATEGORIAS, ENCABEZADOS_CATEGORIAS);
  // Sembrar categorías por defecto solo si la hoja está recién creada (sin
  // filas de datos todavía) — no pisa categorías que el usuario ya haya
  // agregado o desactivado.
  if (hojaCat.getLastRow() <= 1) {
    const ahora = new Date().toISOString();
    const filas = CATEGORIAS_DEFAULT.map(c => [c, 'Sí', ahora]);
    hojaCat.getRange(2, 1, filas.length, ENCABEZADOS_CATEGORIAS.length).setValues(filas);
  }
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

// ── doGet ──────────────────────────────────────────────────────────
// ?modulo=activos (o sin modulo): lista de activos.
// ?modulo=traslados[&activoId=...]: historial de traslados, opcionalmente
// filtrado por un activo puntual (si no se pasa activoId, trae todo).
// ?modulo=categorias: lista de categorías configurables (Activa Sí/No).
function doGet(e) {
  try {
    const modulo = (e && e.parameter && e.parameter.modulo) || 'activos';
    if (modulo === 'traslados') {
      const hoja = prepararHoja(HOJA_TRASLADOS, ENCABEZADOS_TRASLADOS);
      let registros = filasComoObjetos(hoja);
      const activoId = e && e.parameter && e.parameter.activoId;
      if (activoId) registros = registros.filter(r => String(r['Activo ID']) === String(activoId));
      return jsonOut({ ok: true, registros: registros });
    }
    if (modulo === 'categorias') {
      const hoja = prepararHoja(HOJA_CATEGORIAS, ENCABEZADOS_CATEGORIAS);
      return jsonOut({ ok: true, registros: filasComoObjetos(hoja) });
    }
    const hoja = prepararHoja(HOJA_ACTIVOS, ENCABEZADOS_ACTIVOS);
    return jsonOut({ ok: true, registros: filasComoObjetos(hoja) });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
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
      case 'trasladar':         return jsonOut(trasladarActivo(payload));
      case 'editar':             return jsonOut(editarActivo(payload));
      case 'estado':             return jsonOut(cambiarEstadoActivo(payload));
      case 'nota':               return jsonOut(agregarNotaActivo(payload));
      case 'categoria_agregar':  return jsonOut(agregarCategoria(payload));
      case 'categoria_estado':   return jsonOut(cambiarEstadoCategoria(payload));
      default:                   return jsonOut(crearActivo(payload));
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// Escribe un objeto {NombreDeEncabezado: valor} en una fila, respetando el orden real de columnas.
function escribirFilaPorEncabezado(hoja, fila, encabezados, valores) {
  const datos = encabezados.map(function(h) { return (h in valores) ? valores[h] : ''; });
  hoja.getRange(fila, 1, 1, encabezados.length).setValues([datos]);
}

// Busca la fila (1-indexada) de un activo por ID. Devuelve -1 si no existe.
function filaActivo(hoja, id) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const colId = ENCABEZADOS_ACTIVOS.indexOf('ID') + 1;
  const ids = hoja.getRange(2, colId, nFilas, 1).getValues();
  const buscado = String(id);
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === buscado) return i + 2;
  }
  return -1;
}

// ── ALTA DE ACTIVO ────────────────────────────────────────────────
// Crea el activo y además registra el primer renglón del historial de
// traslados (Kiosko Origen vacío, Motivo "Alta - registro inicial") para
// que el historial completo empiece desde el día que se dio de alta.
function crearActivo(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.nombre) throw new Error('Falta el nombre del activo.');
  const hoja = prepararHoja(HOJA_ACTIVOS, ENCABEZADOS_ACTIVOS);
  const id = p.id || Date.now();
  const fotoUrl = guardarFotoActivoEnDrive(p, id, p.kiosko);
  const fecha = p.fecha || hoyCR();
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_ACTIVOS, {
    'ID': id,
    'Nombre': p.nombre,
    'Categoría': p.categoria || '',
    'Descripción': p.descripcion || '',
    'Alto (cm)': p.alto !== undefined && p.alto !== '' ? Number(p.alto) : '',
    'Ancho (cm)': p.ancho !== undefined && p.ancho !== '' ? Number(p.ancho) : '',
    'Fondo (cm)': p.fondo !== undefined && p.fondo !== '' ? Number(p.fondo) : '',
    'Kiosko Actual': p.kiosko,
    'Estado': 'Activo',
    'Foto URL': fotoUrl,
    'Fecha Registro': fecha,
    'Registrado por': p.registradoPor || '',
    'Registrado': p.registrado_en || new Date().toISOString(),
    'Notas': '',
    'Cantidad': p.cantidad !== undefined && p.cantidad !== '' ? Number(p.cantidad) : 1,
    'Valor Estimado': p.valorEstimado !== undefined && p.valorEstimado !== '' ? Number(p.valorEstimado) : '',
    'Fecha Adquisición': p.fechaAdquisicion || '',
    'Marca': p.marca || '',
    'Modelo': p.modelo || ''
  });

  const hojaTras = prepararHoja(HOJA_TRASLADOS, ENCABEZADOS_TRASLADOS);
  const filaTras = hojaTras.getLastRow() + 1;
  escribirFilaPorEncabezado(hojaTras, filaTras, ENCABEZADOS_TRASLADOS, {
    'ID': Date.now() + 1,
    'Activo ID': id,
    'Activo Nombre': p.nombre,
    'Fecha': fecha,
    'Kiosko Origen': '',
    'Kiosko Destino': p.kiosko,
    'Motivo': 'Alta - registro inicial',
    'Trasladado por': p.registradoPor || '',
    'Registrado': new Date().toISOString()
  });

  return { ok: true, fila: fila, fotoUrl: fotoUrl, id: id };
}

// ── TRASLADO ENTRE KIOSKOS ────────────────────────────────────────
function trasladarActivo(p) {
  if (!p.id) throw new Error('Falta el ID del activo.');
  if (!p.kioskoDestino) throw new Error('Falta el kiosko de destino.');
  const hoja = prepararHoja(HOJA_ACTIVOS, ENCABEZADOS_ACTIVOS);
  const fila = filaActivo(hoja, p.id);
  if (fila === -1) throw new Error('No se encontró el activo ' + p.id);

  const colKiosko = ENCABEZADOS_ACTIVOS.indexOf('Kiosko Actual') + 1;
  const colNombre = ENCABEZADOS_ACTIVOS.indexOf('Nombre') + 1;
  const origen = String(hoja.getRange(fila, colKiosko).getValue() || '');
  const nombreActivo = String(hoja.getRange(fila, colNombre).getValue() || '');
  if (origen === p.kioskoDestino) throw new Error('El activo ya está en ese kiosko.');

  hoja.getRange(fila, colKiosko).setValue(p.kioskoDestino);

  const hojaTras = prepararHoja(HOJA_TRASLADOS, ENCABEZADOS_TRASLADOS);
  const filaTras = hojaTras.getLastRow() + 1;
  escribirFilaPorEncabezado(hojaTras, filaTras, ENCABEZADOS_TRASLADOS, {
    'ID': Date.now(),
    'Activo ID': p.id,
    'Activo Nombre': nombreActivo,
    'Fecha': p.fecha || hoyCR(),
    'Kiosko Origen': origen,
    'Kiosko Destino': p.kioskoDestino,
    'Motivo': p.motivo || '',
    'Trasladado por': p.trasladadoPor || '',
    'Registrado': new Date().toISOString()
  });

  return { ok: true, fila: fila, origen: origen, destino: p.kioskoDestino };
}

// ── EDITAR FICHA (nombre, categoría, descripción, medidas, foto, notas) ──
function editarActivo(p) {
  if (!p.id) throw new Error('Falta el ID del activo.');
  const hoja = prepararHoja(HOJA_ACTIVOS, ENCABEZADOS_ACTIVOS);
  const fila = filaActivo(hoja, p.id);
  if (fila === -1) throw new Error('No se encontró el activo ' + p.id);

  const setCol = (nombreCol, valor) => {
    const col = ENCABEZADOS_ACTIVOS.indexOf(nombreCol) + 1;
    hoja.getRange(fila, col).setValue(valor);
  };
  if (p.nombre !== undefined) setCol('Nombre', p.nombre);
  if (p.categoria !== undefined) setCol('Categoría', p.categoria);
  if (p.descripcion !== undefined) setCol('Descripción', p.descripcion);
  if (p.alto !== undefined) setCol('Alto (cm)', p.alto === '' ? '' : Number(p.alto));
  if (p.ancho !== undefined) setCol('Ancho (cm)', p.ancho === '' ? '' : Number(p.ancho));
  if (p.fondo !== undefined) setCol('Fondo (cm)', p.fondo === '' ? '' : Number(p.fondo));
  if (p.cantidad !== undefined) setCol('Cantidad', p.cantidad === '' ? '' : Number(p.cantidad));
  if (p.valorEstimado !== undefined) setCol('Valor Estimado', p.valorEstimado === '' ? '' : Number(p.valorEstimado));
  if (p.fechaAdquisicion !== undefined) setCol('Fecha Adquisición', p.fechaAdquisicion);
  if (p.marca !== undefined) setCol('Marca', p.marca);
  if (p.modelo !== undefined) setCol('Modelo', p.modelo);

  let fotoUrl = '';
  if (p.foto) {
    const colKiosko = ENCABEZADOS_ACTIVOS.indexOf('Kiosko Actual') + 1;
    const kioskoActual = String(hoja.getRange(fila, colKiosko).getValue() || '');
    fotoUrl = guardarFotoActivoEnDrive(p, p.id, kioskoActual);
    if (fotoUrl) setCol('Foto URL', fotoUrl);
  }

  return { ok: true, fila: fila, fotoUrl: fotoUrl };
}

// ── ESTADO (Activo / Dado de baja) ────────────────────────────────
function cambiarEstadoActivo(p) {
  if (!p.id) throw new Error('Falta el ID del activo.');
  const hoja = prepararHoja(HOJA_ACTIVOS, ENCABEZADOS_ACTIVOS);
  const fila = filaActivo(hoja, p.id);
  if (fila === -1) throw new Error('No se encontró el activo ' + p.id);
  const colEstado = ENCABEZADOS_ACTIVOS.indexOf('Estado') + 1;
  hoja.getRange(fila, colEstado).setValue(p.estado || 'Activo');
  return { ok: true, fila: fila };
}

// ── NOTA LIBRE SOBRE UN ACTIVO ─────────────────────────────────────
function agregarNotaActivo(p) {
  if (!p.id) throw new Error('Falta el ID del activo.');
  if (!p.nota) throw new Error('Falta el texto de la nota.');
  const hoja = prepararHoja(HOJA_ACTIVOS, ENCABEZADOS_ACTIVOS);
  const fila = filaActivo(hoja, p.id);
  if (fila === -1) throw new Error('No se encontró el activo ' + p.id);
  const colNotas = ENCABEZADOS_ACTIVOS.indexOf('Notas') + 1;
  const actual = String(hoja.getRange(fila, colNotas).getValue() || '');
  const autor = p.autor ? ' - ' + p.autor : '';
  const linea = `[${hoyCR()}${autor}] ${p.nota}`;
  const nuevo = actual ? actual + '\n' + linea : linea;
  hoja.getRange(fila, colNotas).setValue(nuevo);
  return { ok: true, fila: fila };
}

// ── CATEGORÍAS (Configuración) ────────────────────────────────────
// Alta de categoría nueva: no permite duplicados (comparación case-insensitive
// contra las ya existentes, activas o no) para no llenar el select de
// variantes del mismo nombre.
function agregarCategoria(p) {
  if (!p.categoria || !p.categoria.trim()) throw new Error('Falta el nombre de la categoría.');
  const nombre = p.categoria.trim();
  const hoja = prepararHoja(HOJA_CATEGORIAS, ENCABEZADOS_CATEGORIAS);
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas > 0) {
    const existentes = hoja.getRange(2, 1, nFilas, 1).getValues().map(r => String(r[0]).toLowerCase());
    if (existentes.includes(nombre.toLowerCase())) throw new Error('Esa categoría ya existe.');
  }
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_CATEGORIAS, {
    'Categoría': nombre,
    'Activa': 'Sí',
    'Actualizado': new Date().toISOString()
  });
  return { ok: true, fila: fila };
}

// Activar/desactivar una categoría (no la borra — los activos ya
// registrados con esa categoría la conservan, solo deja de ofrecerse para
// altas nuevas).
function cambiarEstadoCategoria(p) {
  if (!p.categoria) throw new Error('Falta la categoría.');
  const hoja = prepararHoja(HOJA_CATEGORIAS, ENCABEZADOS_CATEGORIAS);
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) throw new Error('No hay categorías registradas.');
  const nombres = hoja.getRange(2, 1, nFilas, 1).getValues();
  let fila = -1;
  for (let i = 0; i < nombres.length; i++) {
    if (String(nombres[i][0]) === String(p.categoria)) { fila = i + 2; break; }
  }
  if (fila === -1) throw new Error('No se encontró la categoría ' + p.categoria);
  const colActiva = ENCABEZADOS_CATEGORIAS.indexOf('Activa') + 1;
  const colAct = ENCABEZADOS_CATEGORIAS.indexOf('Actualizado') + 1;
  hoja.getRange(fila, colActiva).setValue(p.activa || 'No');
  hoja.getRange(fila, colAct).setValue(new Date().toISOString());
  return { ok: true, fila: fila };
}

// ── FOTO DEL ACTIVO → GOOGLE DRIVE ────────────────────────────────
// Carpeta raíz fija (FOLDER_ID_ACTIVOS) con una subcarpeta por kiosko —
// mismo patrón que getOrCreateCarpetaKiosko en Code-mantenimiento-backend.gs.
// La subcarpeta usada es la del kiosko donde está el activo en el momento
// de subir/reemplazar la foto (no se mueve el archivo si el activo se
// traslada después — el registro del traslado queda en "Traslados").
function guardarFotoActivoEnDrive(p, id, kiosko) {
  if (!p.foto) return '';
  const datos = extraerBase64(p.foto);
  if (!datos) return '';
  const carpeta = getOrCreateCarpetaKioskoActivos(kiosko);
  const nombreActivo = (p.nombre || 'activo').toString().replace(/[^\w\-]+/g, '_');
  const nombre = `${p.fecha || hoyCR()}_${nombreActivo}_${id}.jpg`;
  const bytes = Utilities.base64Decode(datos.base64);
  const blob = Utilities.newBlob(bytes, datos.mime, nombre);
  const file = carpeta.createFile(blob);
  // file.getUrl() da la página visor de Drive (HTML), no la imagen — eso es
  // lo que hacía que <img src="..."> saliera "rota" en activos.html.
  // Hay que exponer el archivo para que cualquiera con el link pueda verlo
  // y devolver la URL de thumbnail, que sí sirve como <img src>.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return urlThumbnailFoto(file.getId());
}

// URL de imagen directa (no la página visor) a partir del ID del archivo en
// Drive. sz=w600 pide una versión ya redimensionada, liviana para la tarjeta.
function urlThumbnailFoto(fileId) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;
}

// Función de uso único: recorre la hoja "Activos" y, para cada fila con
// "Foto URL" en el formato viejo (link visor de Drive, .../file/d/ID/view),
// la comparte "cualquiera con el link" y la reemplaza por la URL de
// thumbnail. Correr una sola vez desde el editor de Apps Script (▶) después
// de desplegar este cambio, para arreglar las fotos ya guardadas.
function arreglarFotosExistentes() {
  const hoja = SpreadsheetApp.getActive().getSheetByName(HOJA_ACTIVOS);
  const datos = hoja.getDataRange().getValues();
  const encabezados = datos[0];
  const colFoto = encabezados.indexOf('Foto URL');
  if (colFoto === -1) return 'No se encontró la columna "Foto URL".';
  let arregladas = 0;
  for (let i = 1; i < datos.length; i++) {
    const valor = (datos[i][colFoto] || '').toString();
    const match = /\/file\/d\/([^/]+)\//.exec(valor);
    if (!match) continue; // ya está en formato thumbnail, o vacía
    const fileId = match[1];
    try {
      const file = DriveApp.getFileById(fileId);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      hoja.getRange(i + 1, colFoto + 1).setValue(urlThumbnailFoto(fileId));
      arregladas++;
    } catch (e) {
      Logger.log(`Fila ${i + 1}: no se pudo arreglar (${e.message})`);
    }
  }
  return `Fotos arregladas: ${arregladas}`;
}

function getOrCreateCarpetaKioskoActivos(kiosko) {
  const root = DriveApp.getFolderById(FOLDER_ID_ACTIVOS);
  const nombre = (kiosko || 'Sin kiosko').toString();
  const existing = root.getFoldersByName(nombre);
  return existing.hasNext() ? existing.next() : root.createFolder(nombre);
}

// Separa una data URL ("data:image/jpeg;base64,/9j/4AAQ...") en mime + base64.
function extraerBase64(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}
