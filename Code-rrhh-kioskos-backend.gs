/**
 * Backend RRHH completo — Ecosistema Kioskos (adaptado de Code-rrhh-backend.gs
 * de Ecosistema Lorito, mismo patrón: Google Sheet + Apps Script Web App).
 *
 * Además de "Personal" (ficha completa del colaborador), incluye: Vacaciones,
 * Control de vacaciones, Amonestaciones, Terminaciones, Cambios de salario,
 * Liquidaciones y Horarios — igual que en Lorito, con el campo "Kiosko"
 * agregado en Personal y Horarios para saber a qué ubicación pertenece cada
 * colaborador/turno (Lorito es un solo punto de venta y no lo necesita).
 *
 * Cómo desplegarlo:
 * 1. Abrí el Google Sheet "RRHH - Kioskos" (el mismo que ya usás) >
 *    Extensiones > Apps Script.
 * 2. Reemplazá TODO el contenido del archivo por este código.
 * 3. Corré UNA VEZ configurarHojas() desde el editor (▶ con esa función
 *    seleccionada) para crear las pestañas nuevas (Vacaciones,
 *    Amonestaciones, Terminaciones, CambiosSalario, Liquidaciones,
 *    Horarios, HorariosEstado) y agregar las columnas nuevas a "Personal"
 *    sin tocar los datos que ya tenías.
 * 4. Implementar > Gestionar implementaciones > Editar > Nueva versión.
 *    La URL /exec NO cambia — no hace falta actualizar los .html.
 * 5. Si vas a usar Horarios con cierre de semana en PDF, creá una carpeta
 *    en Drive para guardar esas copias, copiá su ID (de la URL de la
 *    carpeta) y pegalo abajo en FOLDER_ID_HORARIOS — después volvé a
 *    Implementar > Gestionar implementaciones > Editar > Nueva versión.
 *    Sin este paso, "Cerrar horario" va a fallar al intentar guardar el PDF.
 */

const HOJA_PERSONAL        = 'Personal';
const HOJA_VACACIONES      = 'Vacaciones';
const HOJA_AMONESTACIONES  = 'Amonestaciones';
const HOJA_TERMINACIONES   = 'Terminaciones';
const HOJA_CAMBIOS_SALARIO = 'CambiosSalario';
const HOJA_LIQUIDACIONES   = 'Liquidaciones';
const HOJA_HORARIOS        = 'Horarios';
const HOJA_HORARIOS_ESTADO = 'HorariosEstado';

// Ficha completa de personal (igual que Lorito) + "Kiosko" para saber la
// ubicación del colaborador (Lorito es un solo punto de venta, no lo tiene).
const ENCABEZADOS_PERSONAL = [
  'Nombre completo', 'Cédula', 'Puesto', 'Estado', 'Kiosko', 'Departamento',
  'Salario', 'Fecha ingreso', 'Fecha nacimiento', 'Edad', 'Nacionalidad',
  'Teléfono', 'Email', 'Antigüedad', 'Banco', 'Cuenta', 'Tipo cuenta',
  'Contrato', 'CCSS', 'INS RT', 'Carnet alimentos', 'Vence carnet',
  'Saldo vacaciones', 'Observaciones'
];
const ENCABEZADOS_VACACIONES = [
  'ID', 'Colaborador', 'Fecha inicio', 'Fecha fin', 'Días', 'Observaciones', 'Estado', 'Registrado'
];
const ENCABEZADOS_AMONESTACIONES = [
  'Fecha', 'Colaborador', 'Tipo', 'Motivo', 'Observaciones', 'Suspensión desde', 'Suspensión hasta', 'Registrado'
];
const ENCABEZADOS_TERMINACIONES = [
  'Colaborador', 'Tipo terminación', 'Fecha salida', 'Observaciones', 'Registrado'
];
const ENCABEZADOS_CAMBIOS_SALARIO = [
  'Colaborador', 'Salario anterior', 'Salario nuevo', 'Diferencia', 'Fecha efectiva', 'Registrado por', 'Motivo', 'Registrado'
];
const ENCABEZADOS_LIQUIDACIONES = [
  'Colaborador', 'Fecha pago', 'Confirmado por', 'Total pagado', 'Preaviso', 'Cesantía', 'Vacaciones', 'Aguinaldo', 'Motivo', 'Registrado'
];
// "Kiosko" agregado después de "Departamento" (Lorito no lo tiene, un solo PDV).
const ENCABEZADOS_HORARIOS = [
  'Semana inicio', 'Fecha', 'Colaborador', 'Departamento', 'Kiosko', 'Puesto',
  'Estado', 'Hora entrada', 'Hora salida', 'Horas', 'Nota', 'Detalle'
];
const ENCABEZADOS_HORARIOS_ESTADO = [
  'Semana inicio', 'Cerrado', 'Actualizado', 'PDF URL'
];

// Carpeta de Drive donde se guarda una copia del PDF al cerrar una semana de
// horarios. Pegá acá el ID de una carpeta tuya (ver instrucciones arriba) —
// mientras esté vacío, "Cerrar horario" va a fallar al generar el PDF.
const FOLDER_ID_HORARIOS = 'TODO_FOLDER_ID_HORARIOS_KIOSKOS';

// Corré esta función UNA VEZ desde el editor de Apps Script para preparar el
// Sheet: agrega las columnas nuevas a "Personal" (sin tocar filas existentes)
// y crea el resto de pestañas con sus encabezados.
function configurarHojas() {
  prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  prepararHoja(HOJA_VACACIONES, ENCABEZADOS_VACACIONES);
  prepararHoja(HOJA_AMONESTACIONES, ENCABEZADOS_AMONESTACIONES);
  prepararHoja(HOJA_TERMINACIONES, ENCABEZADOS_TERMINACIONES);
  prepararHoja(HOJA_CAMBIOS_SALARIO, ENCABEZADOS_CAMBIOS_SALARIO);
  prepararHoja(HOJA_LIQUIDACIONES, ENCABEZADOS_LIQUIDACIONES);
  prepararHoja(HOJA_HORARIOS, ENCABEZADOS_HORARIOS);
  prepararHoja(HOJA_HORARIOS_ESTADO, ENCABEZADOS_HORARIOS_ESTADO);
}

function prepararHoja(nombre, encabezados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) hoja = ss.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
    hoja.getRange(1, 1, 1, encabezados.length).setFontWeight('bold');
    hoja.setFrozenRows(1);
  } else {
    // Si se agrega una columna nueva a un ENCABEZADOS_* después de que la
    // hoja ya tenía datos, completar los encabezados faltantes al final sin
    // tocar los existentes. Las columnas nuevas SIEMPRE van al final del
    // array correspondiente, nunca en el medio.
    const actuales = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0];
    const faltantes = encabezados.filter(function (h) { return actuales.indexOf(h) === -1; });
    if (faltantes.length) {
      hoja.getRange(1, actuales.length + 1, 1, faltantes.length).setValues([faltantes]);
      hoja.getRange(1, actuales.length + 1, 1, faltantes.length).setFontWeight('bold');
    }
  }
  // "Semana inicio"/"Fecha"/"Hora entrada"/"Hora salida" son strings
  // ("yyyy-MM-dd" / "HH:mm"), no fechas ni horas de reloj reales: forzar
  // formato de texto para que Sheets no las autoconvierta a un valor de
  // fecha/hora (rompería tanto la lectura como las comparaciones exactas que
  // usan eliminarFilasPorColumna/filaPorColumna al reemplazar una semana).
  const COLUMNAS_TEXTO_POR_HOJA = {};
  COLUMNAS_TEXTO_POR_HOJA[HOJA_HORARIOS] = ['Semana inicio', 'Fecha', 'Hora entrada', 'Hora salida'];
  COLUMNAS_TEXTO_POR_HOJA[HOJA_HORARIOS_ESTADO] = ['Semana inicio'];
  (COLUMNAS_TEXTO_POR_HOJA[nombre] || []).forEach(function (col) {
    const idx = encabezados.indexOf(col) + 1;
    if (idx > 0) hoja.getRange(2, idx, Math.max(hoja.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  });
  return hoja;
}

// Normaliza un valor de celda a texto comparable: si Sheets autoconvirtió un
// string tipo fecha/hora a un objeto Date a pesar del formato de texto,
// devuelve "yyyy-MM-dd" en vez del toString() por defecto de Date, para que
// las comparaciones de igualdad sigan funcionando.
function valorComoTexto(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Costa_Rica', 'yyyy-MM-dd');
  return String(v);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── doGet ──────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const modulo = e.parameter.modulo;
    let hoja;
    switch (modulo) {
      case 'personal':        hoja = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL); break;
      case 'vacaciones':      hoja = prepararHoja(HOJA_VACACIONES, ENCABEZADOS_VACACIONES); break;
      case 'amonestaciones':  hoja = prepararHoja(HOJA_AMONESTACIONES, ENCABEZADOS_AMONESTACIONES); break;
      case 'terminaciones':   hoja = prepararHoja(HOJA_TERMINACIONES, ENCABEZADOS_TERMINACIONES); break;
      case 'cambios_salario': hoja = prepararHoja(HOJA_CAMBIOS_SALARIO, ENCABEZADOS_CAMBIOS_SALARIO); break;
      case 'liquidaciones':   hoja = prepararHoja(HOJA_LIQUIDACIONES, ENCABEZADOS_LIQUIDACIONES); break;
      case 'horarios':        hoja = prepararHoja(HOJA_HORARIOS, ENCABEZADOS_HORARIOS); break;
      case 'horarios_estado': hoja = prepararHoja(HOJA_HORARIOS_ESTADO, ENCABEZADOS_HORARIOS_ESTADO); break;
      case 'acciones':        return jsonOut({ ok: true, registros: [] });
      default:
        return jsonOut({ ok: false, error: 'Módulo no reconocido: ' + modulo });
    }
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
  return datos.map(function (fila) {
    const obj = {};
    encabezados.forEach(function (h, i) {
      if (!h) return;
      let v = fila[i];
      if (v instanceof Date) {
        // "Hora entrada"/"Hora salida" son horas de reloj ("HH:mm"), no
        // fechas — si Sheets las autoconvirtió antes de forzar el formato
        // de texto, recuperar la hora en vez de "yyyy-MM-dd" (sin sentido).
        v = (h === 'Hora entrada' || h === 'Hora salida')
          ? Utilities.formatDate(v, 'America/Costa_Rica', 'HH:mm')
          : Utilities.formatDate(v, 'America/Costa_Rica', 'yyyy-MM-dd');
      }
      obj[h] = v;
    });
    return obj;
  });
}

// ── doPost ─────────────────────────────────────────────────────────
// Soporta tanto body JSON crudo como form-encoded con { data: JSON.stringify(payload) },
// porque las distintas pantallas de RRHH usan ambos estilos indistintamente.
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
      case 'nuevo_ingreso':         result = nuevoIngreso(payload); break;
      case 'cambiar_estado':        result = cambiarEstado(payload); break;
      case 'vacaciones':            result = crearSolicitudVacaciones(payload); break;
      case 'vacaciones_estado':     result = cambiarEstadoVacaciones(payload); break;
      case 'amonestacion':          result = registrarAmonestacion(payload); break;
      case 'terminacion':           result = registrarTerminacion(payload); break;
      case 'cambio_salario':        result = registrarCambioSalario(payload); break;
      case 'confirmar_liquidacion': result = confirmarLiquidacion(payload); break;
      case 'horario_semana':        result = registrarHorarioSemana(payload); break;
      case 'cerrar_horario':        result = cambiarEstadoHorarioSemana(payload, 'Sí'); break;
      case 'reabrir_horario':       result = cambiarEstadoHorarioSemana(payload, 'No'); break;
      default:
        throw new Error('Módulo no reconocido: ' + payload.modulo);
    }
    return jsonOut({ ok: true, result: result });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// Escribe un objeto {NombreDeEncabezado: valor} en una fila, respetando el orden real de columnas.
function escribirFilaPorEncabezado(hoja, fila, encabezados, valores) {
  const datos = encabezados.map(function (h) { return (h in valores) ? valores[h] : ''; });
  hoja.getRange(fila, 1, 1, encabezados.length).setValues([datos]);
}

// Busca la fila (1-indexada) de un colaborador en Personal por "Nombre completo"
// (case-insensitive, sin espacios extra). Devuelve -1 si no existe.
function filaColaborador(hoja, nombre) {
  if (!nombre) return -1;
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const colNombre = ENCABEZADOS_PERSONAL.indexOf('Nombre completo') + 1;
  const nombres = hoja.getRange(2, colNombre, nFilas, 1).getValues();
  const buscado = String(nombre).trim().toLowerCase();
  for (let i = 0; i < nombres.length; i++) {
    if (String(nombres[i][0]).trim().toLowerCase() === buscado) return i + 2;
  }
  return -1;
}

// Acepta tanto un "nombre" ya completo (patrón simple, usado por rrhh-nuevo-
// ingreso.html si se manda así) como "nombre" + "apellidos" por separado
// (patrón de Lorito). Si vienen los dos, se concatenan.
function nuevoIngreso(p) {
  const nombreCompleto = (p.apellidos ? ((p.nombre || '') + ' ' + p.apellidos).trim() : (p.nombre || '').trim());
  if (!nombreCompleto) throw new Error('Falta el nombre del colaborador.');
  const hoja = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  if (filaColaborador(hoja, nombreCompleto) !== -1) {
    throw new Error('Ya existe un colaborador con ese nombre.');
  }
  const doc = p.documentos || {};
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PERSONAL, {
    'Nombre completo': nombreCompleto,
    'Cédula': p.cedula || '',
    'Puesto': p.puesto || '',
    'Estado': p.estado || 'ACTIVO',
    'Kiosko': p.kiosko || '',
    'Departamento': p.departamento || '',
    'Salario': Number(p.salario) || 0,
    'Fecha ingreso': p.fecha_ingreso || p.fechaIngreso || hoyCR(),
    'Fecha nacimiento': p.fecha_nacimiento || '',
    'Edad': p.edad || '',
    'Nacionalidad': p.nacionalidad || '',
    'Teléfono': p.telefono || '',
    'Email': p.email || '',
    'Antigüedad': p.antiguedad || '',
    'Banco': p.banco || '',
    'Cuenta': p.cuenta || '',
    'Tipo cuenta': p.tipo_cuenta || '',
    'Contrato': !!doc.contrato,
    'CCSS': !!doc.ccss,
    'INS RT': !!doc.ins_rt,
    'Carnet alimentos': !!doc.carnet,
    'Vence carnet': doc.carnet_vence || '',
    'Saldo vacaciones': 0,
    'Observaciones': p.observaciones || ''
  });
  return { fila: fila, nombre: nombreCompleto };
}

// Cambia solo el Estado (ACTIVO/INACTIVO) — usado por el toggle rápido de
// activar/desactivar en la pestaña "Personal".
function cambiarEstado(p) {
  if (!p.nombre) throw new Error('Falta el nombre del colaborador.');
  const hoja = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  const fila = filaColaborador(hoja, p.nombre);
  if (fila === -1) throw new Error('No se encontró ese colaborador.');
  const colEstado = ENCABEZADOS_PERSONAL.indexOf('Estado') + 1;
  hoja.getRange(fila, colEstado).setValue(p.estado || 'INACTIVO');
  return { fila: fila };
}

function crearSolicitudVacaciones(p) {
  if (!p.colaborador) throw new Error('Falta el colaborador.');
  const hoja = prepararHoja(HOJA_VACACIONES, ENCABEZADOS_VACACIONES);
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_VACACIONES, {
    'ID': p.id || Date.now(),
    'Colaborador': p.colaborador,
    'Fecha inicio': p.fecha_inicio || '',
    'Fecha fin': p.fecha_fin || '',
    'Días': Number(p.dias) || 0,
    'Observaciones': p.observaciones || '',
    'Estado': p.estado || 'Pendiente',
    'Registrado': p.registrado || p.registrado_en || new Date().toISOString()
  });
  return { fila: fila };
}

function cambiarEstadoVacaciones(p) {
  if (!p.id) throw new Error('Falta el ID de la solicitud.');
  const hoja = prepararHoja(HOJA_VACACIONES, ENCABEZADOS_VACACIONES);
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) throw new Error('No hay solicitudes registradas.');
  const colId = ENCABEZADOS_VACACIONES.indexOf('ID') + 1;
  const colEstado = ENCABEZADOS_VACACIONES.indexOf('Estado') + 1;
  const ids = hoja.getRange(2, colId, nFilas, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(p.id)) {
      hoja.getRange(i + 2, colEstado).setValue(p.estado || 'Pendiente');
      return { fila: i + 2 };
    }
  }
  throw new Error('No se encontró la solicitud ' + p.id);
}

function registrarAmonestacion(p) {
  if (!p.colaborador) throw new Error('Falta el colaborador.');
  if (!p.tipo) throw new Error('Falta el tipo de amonestación.');
  const hoja = prepararHoja(HOJA_AMONESTACIONES, ENCABEZADOS_AMONESTACIONES);
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_AMONESTACIONES, {
    'Fecha': p.fecha || '',
    'Colaborador': p.colaborador,
    'Tipo': p.tipo,
    'Motivo': p.motivo || '',
    'Observaciones': p.observaciones || '',
    'Suspensión desde': p.susp_desde || '',
    'Suspensión hasta': p.susp_hasta || '',
    'Registrado': p.registrado_en || new Date().toISOString()
  });
  return { fila: fila };
}

function registrarTerminacion(p) {
  if (!p.colaborador) throw new Error('Falta el colaborador.');
  const hoja = prepararHoja(HOJA_TERMINACIONES, ENCABEZADOS_TERMINACIONES);
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_TERMINACIONES, {
    'Colaborador': p.colaborador,
    'Tipo terminación': p.tipo_terminacion || '',
    'Fecha salida': p.fecha_salida || '',
    'Observaciones': p.observaciones || '',
    'Registrado': p.registrado_en || new Date().toISOString()
  });

  const hojaPersonal = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  const filaP = filaColaborador(hojaPersonal, p.colaborador);
  if (filaP !== -1) {
    const colEstado = ENCABEZADOS_PERSONAL.indexOf('Estado') + 1;
    hojaPersonal.getRange(filaP, colEstado).setValue(p.nuevo_estado || 'LIQUIDACIÓN');
  }
  return { fila: fila };
}

function registrarCambioSalario(p) {
  if (!p.colaborador) throw new Error('Falta el colaborador.');
  const hoja = prepararHoja(HOJA_CAMBIOS_SALARIO, ENCABEZADOS_CAMBIOS_SALARIO);
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_CAMBIOS_SALARIO, {
    'Colaborador': p.colaborador,
    'Salario anterior': Number(p.salario_actual) || 0,
    'Salario nuevo': Number(p.salario_nuevo) || 0,
    'Diferencia': Number(p.diferencia) || 0,
    'Fecha efectiva': p.fecha_efectiva || '',
    'Registrado por': p.registrado_por || '',
    'Motivo': p.motivo || '',
    'Registrado': p.registrado_en || new Date().toISOString()
  });

  const hojaPersonal = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  const filaP = filaColaborador(hojaPersonal, p.colaborador);
  if (filaP !== -1) {
    const colSalario = ENCABEZADOS_PERSONAL.indexOf('Salario') + 1;
    hojaPersonal.getRange(filaP, colSalario).setValue(Number(p.salario_nuevo) || 0);
  }
  return { fila: fila };
}

function confirmarLiquidacion(p) {
  if (!p.colaborador) throw new Error('Falta el colaborador.');
  const hoja = prepararHoja(HOJA_LIQUIDACIONES, ENCABEZADOS_LIQUIDACIONES);
  const desglose = p.desglose || {};
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_LIQUIDACIONES, {
    'Colaborador': p.colaborador,
    'Fecha pago': p.fecha_pago || '',
    'Confirmado por': p.confirmado_por || '',
    'Total pagado': Number(p.total_pagado) || 0,
    'Preaviso': Number(desglose.preaviso) || 0,
    'Cesantía': Number(desglose.cesantia) || 0,
    'Vacaciones': Number(desglose.vacaciones) || 0,
    'Aguinaldo': Number(desglose.aguinaldo) || 0,
    'Motivo': p.motivo || '',
    'Registrado': p.registrado_en || new Date().toISOString()
  });

  const hojaPersonal = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  const filaP = filaColaborador(hojaPersonal, p.colaborador);
  if (filaP !== -1) {
    const colEstado = ENCABEZADOS_PERSONAL.indexOf('Estado') + 1;
    hojaPersonal.getRange(filaP, colEstado).setValue(p.nuevo_estado || 'INACTIVO');
  }
  return { fila: fila };
}

// ── HORARIOS (compartido con horarios.html / horarios-historial.html) ──

// Busca la fila (1-indexada) donde una columna (por nombre de encabezado) tiene cierto valor.
function filaPorColumna(hoja, encabezados, nombreCol, valor) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const col = encabezados.indexOf(nombreCol) + 1;
  if (col === 0) return -1;
  const valores = hoja.getRange(2, col, nFilas, 1).getValues();
  const buscado = String(valor).trim();
  for (let i = 0; i < valores.length; i++) {
    if (valorComoTexto(valores[i][0]).trim() === buscado) return i + 2;
  }
  return -1;
}

// Borra todas las filas donde una columna tiene cierto valor (de abajo hacia arriba,
// para no romper los índices mientras se borra).
function eliminarFilasPorColumna(hoja, encabezados, nombreCol, valor) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return;
  const col = encabezados.indexOf(nombreCol) + 1;
  if (col === 0) return;
  const valores = hoja.getRange(2, col, nFilas, 1).getValues();
  const buscado = String(valor).trim();
  for (let i = valores.length - 1; i >= 0; i--) {
    if (valorComoTexto(valores[i][0]).trim() === buscado) hoja.deleteRow(i + 2);
  }
}

function agregarFilaPorEncabezado(hoja, encabezados, valores) {
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, encabezados, valores);
  return fila;
}

// "Guardar semana" reemplaza lo guardado antes para esa semana (no acumula
// duplicados cada vez que se guarda), igual que hace horarios.html en memoria.
function registrarHorarioSemana(p) {
  if (!p.semana_inicio) throw new Error('Falta la semana (semana_inicio).');
  if (!Array.isArray(p.dias)) throw new Error('Faltan los días de la semana.');
  const hoja = prepararHoja(HOJA_HORARIOS, ENCABEZADOS_HORARIOS);

  eliminarFilasPorColumna(hoja, ENCABEZADOS_HORARIOS, 'Semana inicio', p.semana_inicio);

  p.dias.forEach(function (d) {
    agregarFilaPorEncabezado(hoja, ENCABEZADOS_HORARIOS, {
      'Semana inicio': p.semana_inicio,
      'Fecha': d.fecha || '',
      'Colaborador': d.colaborador || '',
      'Departamento': d.departamento || '',
      'Kiosko': d.kiosko || '',
      'Puesto': d.puesto || '',
      'Estado': d.estado || 'trabajo',
      'Hora entrada': d.entrada || '',
      'Hora salida': d.salida || '',
      'Horas': Number(d.horas) || 0,
      'Nota': d.nota || '',
      'Detalle': d.detalle || ''
    });
  });

  return { semana: p.semana_inicio, filas: p.dias.length };
}

function cambiarEstadoHorarioSemana(p, cerrado) {
  if (!p.semana_inicio) throw new Error('Falta la semana (semana_inicio).');
  const hoja = prepararHoja(HOJA_HORARIOS_ESTADO, ENCABEZADOS_HORARIOS_ESTADO);
  const fila = filaPorColumna(hoja, ENCABEZADOS_HORARIOS_ESTADO, 'Semana inicio', p.semana_inicio);

  // Al cerrar, si el front-end mandó el PDF ya generado, guardarlo en Drive.
  // Al reabrir se limpia la URL: el contenido puede cambiar antes del próximo
  // cierre, así que el PDF viejo queda obsoleto hasta que se vuelva a cerrar.
  let pdfUrl = '';
  if (cerrado === 'Sí' && p.pdf_base64) {
    pdfUrl = guardarPDFHorarioEnDrive(p.semana_inicio, p.pdf_base64);
  }

  const valores = {
    'Semana inicio': p.semana_inicio,
    'Cerrado': cerrado,
    'Actualizado': new Date().toISOString(),
    'PDF URL': pdfUrl
  };
  if (fila !== -1) {
    escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_HORARIOS_ESTADO, valores);
  } else {
    agregarFilaPorEncabezado(hoja, ENCABEZADOS_HORARIOS_ESTADO, valores);
  }
  return { semana: p.semana_inicio, cerrado: cerrado, pdf_url: pdfUrl };
}

// Guarda el PDF (base64) en la carpeta fija de Drive, reemplazando una copia
// previa de la misma semana si existe (para no acumular versiones viejas).
function guardarPDFHorarioEnDrive(semanaInicio, base64) {
  const folder = DriveApp.getFolderById(FOLDER_ID_HORARIOS);
  const nombre = 'Horario_' + semanaInicio + '.pdf';
  const existentes = folder.getFilesByName(nombre);
  while (existentes.hasNext()) existentes.next().setTrashed(true);

  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, 'application/pdf', nombre);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function hoyCR() {
  return Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd');
}
