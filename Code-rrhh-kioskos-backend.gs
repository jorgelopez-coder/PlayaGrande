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
const HOJA_CONFIGURACION   = 'Configuracion';
const HOJA_ROLES           = 'Roles';

// Ficha completa de personal (igual que Lorito) + "Kiosko" para saber la
// ubicación del colaborador (Lorito es un solo punto de venta, no lo tiene).
const ENCABEZADOS_PERSONAL = [
  'Nombre completo', 'Cédula', 'Puesto', 'Estado', 'Kiosko', 'Departamento',
  'Salario', 'Fecha ingreso', 'Fecha nacimiento', 'Edad', 'Nacionalidad',
  'Teléfono', 'Email', 'Antigüedad', 'Banco', 'Cuenta', 'Tipo cuenta',
  'Contrato', 'CCSS', 'INS RT', 'Carnet alimentos', 'Vence carnet',
  'Saldo vacaciones', 'Observaciones',
  'Foto Cédula (URL)'
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
// Mismas abreviaturas que ENCABEZADOS_HORARIOS/horarios.html, para que el
// horario de atención del kiosko (Configuracion) use el mismo criterio de
// día que los turnos del equipo (Horarios).
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const ENCABEZADOS_HORARIO_KIOSKO = DIAS_SEMANA.map(function (d) { return 'Horario ' + d; });

// Configuración inicial: acá vive la lista de kioskos y su info general —
// única fuente de verdad, la consumen cierres.html, rrhh.html,
// rrhh-nuevo-ingreso.html, rrhh-personal.html y horarios.html vía
// ?modulo=kioskos, en vez de tener un arreglo hardcodeado y duplicado en
// cada archivo. El horario de atención va desplegado por día (una columna
// por día, valor "HH:MM-HH:MM" o vacío/"Cerrado") en vez de un solo campo
// de texto libre.
const ENCABEZADOS_CONFIGURACION = [
  'Kiosko', 'Activo', 'Ubicación', 'Encargado', 'Contacto', 'WhatsApp'
].concat(ENCABEZADOS_HORARIO_KIOSKO).concat(['Registrado']);
// Kioskos con los que arranca el sistema — solo se usan para sembrar la
// pestaña "Configuracion" la primera vez (si ya tiene filas, no se tocan).
const KIOSKOS_POR_DEFECTO = ['Playa Grande', 'Liberia', 'Nosara', 'Playa Hermosa'];

// Roles de acceso (admin-accesos.html / login.html): quién puede entrar al
// portal, con qué PIN, a qué módulos y a qué kiosko(s). "Modulos"/"Kioskos"
// se guardan como texto "todos" o una lista separada por comas (ej.
// "cierres,depositos,horarios") — nunca vacío para un rol activo: si no se
// marcó ningún módulo/kiosko, guardar "todos" es más seguro que un rol que
// no puede ver nada por error de carga.
const ENCABEZADOS_ROLES = [
  'ID', 'Nombre', 'PIN', 'Color', 'Modulos', 'Kioskos', 'Activo', 'Registrado'
];

// ── PLANILLA (planilla.html) ──────────────────────────────────────
// Feriados de pago obligatorio (Art. 148 CT) — tabla editable en vez de
// hardcodeada: las fechas cambian cada año (Semana Santa es movible, la Ley
// 8442 traslada algunos feriados a lunes), así que vive en el Sheet.
const HOJA_FERIADOS = 'Feriados';
const ENCABEZADOS_FERIADOS = ['Fecha', 'Nombre', 'Activo', 'Registrado'];

// Una fila por Periodo + Kiosko + Colaborador (upsert — ver guardarIncidencia).
const HOJA_INCIDENCIAS = 'Incidencias';
const ENCABEZADOS_INCIDENCIAS = [
  'ID', 'Periodo', 'Fecha inicio', 'Fecha fin', 'Kiosko', 'Colaborador',
  'Horas regulares',
  'Horas extra 50%', 'Comentario extra 50%',
  'Horas extra 100%', 'Comentario extra 100%',
  'Feriados trabajados',
  'Incapacidad CCSS fecha inicio', 'Incapacidad CCSS fecha fin', 'Comentario incapacidad CCSS',
  'Incapacidad INS fecha inicio', 'Incapacidad INS fecha fin', 'Comentario incapacidad INS',
  'Incapacidad interna fecha inicio', 'Incapacidad interna fecha fin', 'Incapacidad interna %', 'Comentario incapacidad interna',
  'Subsidio monto por día', 'Subsidio días', 'Subsidio tipo', 'Comentario subsidio',
  'Días no trabajados', 'Comentario días no trabajados',
  'Deducción adelanto salario', 'Comentario adelanto',
  'Deducción compras aprobadas', 'Comentario compras',
  'Deducción otras', 'Comentario otras',
  'Deducción embargo salarial', 'Comentario embargo',
  'Deducción pensión alimenticia', 'Comentario pensión',
  'Registrado', 'Actualizado',
  // Colaborador extra agregado a mano en el Paso 1 del wizard (sin fila en
  // Personal): 'Es manual'='Sí' hace que calcularPlanilla() use estas 2
  // columnas en vez de buscar salario/puesto en Personal por nombre.
  'Es manual', 'Salario manual', 'Puesto manual',
  // Override manual de la base de CCSS (Paso 3 del wizard) — vacío = usar
  // la base automática que calcula calcularPlanilla().
  'CCSS base ajustada'
];

// Cabecera de cada corrida de planilla guardada (una por Periodo + Kiosko).
const HOJA_PLANILLAS = 'Planillas';
const ENCABEZADOS_PLANILLAS = [
  'ID', 'Periodo', 'Fecha inicio', 'Fecha fin', 'Kiosko', 'Fecha cálculo',
  'Calculado por', 'Total ingresos', 'Total deducciones', 'Total neto', 'Colaboradores',
  // Estado del circuito de aprobación del wizard: 'Abierta' (Pasos 1-3, en
  // captura) → 'Pendiente de aprobación' (Paso 4, cerrada y calculada,
  // esperando revisión) → 'Aprobada' (Paso 5, checklist completo).
  'Estado', 'Enviado a revisión', 'Checklist aprobación', 'Aprobado por',
  'Fecha aprobación', 'PDF URL'
];

// Detalle por colaborador de cada corrida (mismo patrón maestro/detalle que
// TomaInventario/TomaInventarioDetalle en Inventario - Kioskos).
const HOJA_PLANILLAS_DETALLE = 'PlanillasDetalle';
const ENCABEZADOS_PLANILLAS_DETALLE = [
  'ID Planilla', 'Colaborador', 'Puesto', 'Salario mensual', 'Salario diario', 'Salario por hora',
  'Horas regulares monto', 'Horas extra 50% monto', 'Horas extra 100% monto', 'Feriados monto',
  'Incapacidad CCSS monto', 'Incapacidad INS monto', 'Incapacidad interna monto', 'Vacaciones monto',
  'Subsidio monto', 'Días no trabajados monto', 'Total ingresos',
  'Base CCSS utilizada', 'CCSS obrera monto', 'Adelanto salario', 'Compras aprobadas', 'Otras deducciones',
  'Embargo salarial', 'Pensión alimenticia', 'Total deducciones', 'Neto a pagar',
  // Si estaba marcado 'CCSS' en el expediente (Personal) al momento del
  // cálculo — deja registro de por qué el rebajo dio 0 cuando corresponde.
  'CCSS registrado'
];

// Cuota obrera de CCSS (SEM + IVM + Banco Popular) sobre el salario bruto —
// deducción de ley automática, no aparece en la lista de deducciones
// manuales porque no se ingresa a mano.
const PORCENTAJE_CCSS_OBRERA = 0.1067;

// ── SERVICIO 10% (servicio-10.html) ───────────────────────────────
// Cálculo y repartición del 10% de servicio entre el equipo, por kiosko y
// por un rango de fechas libre (no atado a la quincena de Planilla). Fórmula
// (ver servicio-10.html): "Total Ventas ₡" de Cierres ya incluye el 10% de
// servicio cobrado al cliente, así que Venta Neta = Total Ventas ₡ / 1.1, y
// Monto Servicio = Venta Neta × 10% — no es un porcentaje configurable, es
// el 10% de ley, así que no hay campo de porcentaje en la UI ni columna acá.
//
// A diferencia de la primera versión (que repartía el total del periodo
// proporcional a "días trabajados" agregados), acá la asignación es POR
// FECHA: cada día del periodo tiene su propia venta y su propio monto de
// servicio, y se reparte solo entre los colaboradores asignados ESE día
// específico (sugerido desde "Horarios", editable a mano día por día) — no
// todos los días reparten entre las mismas personas. El detalle guarda una
// fila por (fecha, colaborador), que es también la base del control de
// fechas duplicadas (abajo) y de la pestaña "Control de fechas".
//
// El cálculo se guarda ya CERRADO en un solo paso (botón "Cerrar cálculo" en
// servicio-10.html): valida que ninguna fecha se repita con un reparto ya
// cerrado del mismo kiosko, archiva una copia en PDF en Drive (si se mandó
// pdf_base64 y FOLDER_ID_SERVICIO está configurado) y guarda maestro+detalle
// de una vez — no existe un estado "borrador" editable después de cerrado.
const HOJA_SERVICIO_REPARTOS = 'ServicioRepartos';
const ENCABEZADOS_SERVICIO_REPARTOS = [
  'ID', 'Kiosko', 'Fecha inicio', 'Fecha fin', 'Fecha cálculo', 'Calculado por',
  'Ventas Netas ₡', 'Monto Servicio ₡', 'Total días', 'Colaboradores',
  'Estado', 'PDF URL', 'Notas'
];
const HOJA_SERVICIO_DETALLE = 'ServicioRepartoDetalle';
const ENCABEZADOS_SERVICIO_DETALLE = [
  'ID Detalle', 'ID Reparto', 'Kiosko', 'Fecha', 'Colaborador', 'Puesto', 'Monto ₡',
  'Pagado', 'Fecha pago', 'Referencia pago', 'Notas pago'
];

// Carpeta de Drive donde se archiva el PDF de cada cálculo de Servicio 10%
// cerrado. Pegá acá el ID de una carpeta tuya (de la URL de la carpeta en
// Drive) y volvé a Implementar → Gestionar implementaciones → Editar →
// Nueva versión — mientras esté vacío, "Cerrar cálculo" avisa que no se
// pudo archivar pero igual cierra el reparto (no bloquea el cierre).
const FOLDER_ID_SERVICIO = '';

// Guarda un cálculo YA CERRADO de reparto del 10% de servicio: una fila
// maestra en ServicioRepartos y una fila de detalle por (fecha, colaborador)
// en ServicioRepartoDetalle (todas arrancan "Pagado"="No"). Antes de
// guardar, rechaza el cálculo completo si alguna de sus fechas ya está
// cubierta por otro reparto cerrado del mismo kiosko (control de fechas
// repetidas — ver también servicio-10.html, que hace el mismo chequeo del
// lado del cliente para no dejar que el usuario llegue hasta acá con
// fechas repetidas, pero la validación real vive aquí). data:
// { id, kiosko, fecha_inicio, fecha_fin, calculado_por, ventas_netas,
//   monto_servicio, notas, pdf_base64 (opcional),
//   asignaciones: [{ fecha, colaborador, puesto, monto }, ...] }
function guardarServicioReparto(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.fecha_inicio || !p.fecha_fin) throw new Error('Falta el periodo (fecha inicio/fin).');
  if (!Array.isArray(p.asignaciones) || !p.asignaciones.length) {
    throw new Error('Falta el detalle de colaboradores por fecha.');
  }

  const hojaDetExistente = prepararHoja(HOJA_SERVICIO_DETALLE, ENCABEZADOS_SERVICIO_DETALLE);
  const fechasExistentes = {};
  filasComoObjetos(hojaDetExistente).forEach(function (d) {
    if (d['Kiosko'] === p.kiosko) fechasExistentes[valorComoTexto(d['Fecha']).slice(0, 10)] = true;
  });
  const fechasNuevas = [];
  p.asignaciones.forEach(function (a) {
    if (fechasNuevas.indexOf(a.fecha) === -1) fechasNuevas.push(a.fecha);
  });
  const fechasRepetidas = fechasNuevas.filter(function (f) { return fechasExistentes[f]; });
  if (fechasRepetidas.length) {
    throw new Error('Estas fechas ya fueron incluidas en otro reparto cerrado de ' + p.kiosko + ': ' + fechasRepetidas.join(', '));
  }

  const idReparto = p.id || Date.now();

  let pdfUrl = '';
  if (p.pdf_base64 && FOLDER_ID_SERVICIO) {
    pdfUrl = guardarPDFServicioEnDrive(p.kiosko, p.fecha_inicio, p.fecha_fin, p.pdf_base64);
  }

  const colaboradoresUnicos = {};
  p.asignaciones.forEach(function (a) { colaboradoresUnicos[a.colaborador] = true; });

  const hoja = prepararHoja(HOJA_SERVICIO_REPARTOS, ENCABEZADOS_SERVICIO_REPARTOS);
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_SERVICIO_REPARTOS, {
    'ID': idReparto,
    'Kiosko': p.kiosko,
    'Fecha inicio': p.fecha_inicio,
    'Fecha fin': p.fecha_fin,
    'Fecha cálculo': new Date().toISOString(),
    'Calculado por': p.calculado_por || '',
    'Ventas Netas ₡': Number(p.ventas_netas) || 0,
    'Monto Servicio ₡': Number(p.monto_servicio) || 0,
    'Total días': fechasNuevas.length,
    'Colaboradores': Object.keys(colaboradoresUnicos).length,
    'Estado': 'Cerrado',
    'PDF URL': pdfUrl,
    'Notas': p.notas || ''
  });

  const hojaDet = prepararHoja(HOJA_SERVICIO_DETALLE, ENCABEZADOS_SERVICIO_DETALLE);
  p.asignaciones.forEach(function (a, i) {
    agregarFilaPorEncabezado(hojaDet, ENCABEZADOS_SERVICIO_DETALLE, {
      'ID Detalle': idReparto + '-' + i,
      'ID Reparto': idReparto,
      'Kiosko': p.kiosko,
      'Fecha': a.fecha,
      'Colaborador': a.colaborador || '',
      'Puesto': a.puesto || '',
      'Monto ₡': Number(a.monto) || 0,
      'Pagado': 'No',
      'Fecha pago': '',
      'Referencia pago': '',
      'Notas pago': ''
    });
  });

  return { id: idReparto, pdf_url: pdfUrl, fechas: fechasNuevas.length, asignaciones: p.asignaciones.length };
}

// Sube el PDF del reparto cerrado a la carpeta fija FOLDER_ID_SERVICIO,
// reemplazando una copia previa del mismo kiosko+periodo si existiera.
function guardarPDFServicioEnDrive(kiosko, fechaInicio, fechaFin, base64) {
  const folder = DriveApp.getFolderById(FOLDER_ID_SERVICIO);
  const kioskoLimpio = String(kiosko || '').trim().replace(/[\\:*?"<>|]/g, '').replace(/\s+/g, '_');
  const nombre = 'Servicio10_' + (kioskoLimpio ? kioskoLimpio + '_' : '') + fechaInicio + '_a_' + fechaFin + '.pdf';
  const existentes = folder.getFilesByName(nombre);
  while (existentes.hasNext()) existentes.next().setTrashed(true);
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, 'application/pdf', nombre);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// Marca como pagados uno o varios renglones de detalle (uno por colaborador
// por reparto), pudiendo cubrir de una vez colaboradores de distintos
// repartos/kioskos/periodos con una misma referencia de pago — mismo
// espíritu que guardarPagoTips() pero a nivel de colaborador en vez de
// cierre. data: { ids_detalle: ['<idReparto>-<i>', ...], fecha_pago,
// referencia, notas }
function marcarServicioPagado(p) {
  if (!Array.isArray(p.ids_detalle) || !p.ids_detalle.length) {
    throw new Error('Falta seleccionar al menos un colaborador a pagar.');
  }
  if (!p.fecha_pago) throw new Error('Falta la fecha de pago.');

  const hoja = prepararHoja(HOJA_SERVICIO_DETALLE, ENCABEZADOS_SERVICIO_DETALLE);
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) throw new Error('No hay repartos registrados todavía.');

  const colId = colPorEncabezado(hoja, 'ID Detalle');
  const colPagado = colPorEncabezado(hoja, 'Pagado');
  const colFecha = colPorEncabezado(hoja, 'Fecha pago');
  const colRef = colPorEncabezado(hoja, 'Referencia pago');
  const colNotas = colPorEncabezado(hoja, 'Notas pago');
  const ids = hoja.getRange(2, colId, nFilas, 1).getValues();
  const buscados = new Set(p.ids_detalle.map(String));

  let actualizados = 0;
  for (let i = 0; i < ids.length; i++) {
    if (buscados.has(String(ids[i][0]))) {
      const fila = i + 2;
      hoja.getRange(fila, colPagado).setValue('Sí');
      hoja.getRange(fila, colFecha).setValue(p.fecha_pago);
      hoja.getRange(fila, colRef).setValue(p.referencia || '');
      hoja.getRange(fila, colNotas).setValue(p.notas || '');
      actualizados++;
    }
  }
  if (!actualizados) throw new Error('No se encontraron los registros a marcar como pagados.');
  return { actualizados: actualizados };
}

// Feriados de pago obligatorio de Costa Rica para 2026 — punto de partida
// EDITABLE desde la pestaña "Feriados" de planilla.html (solo siembra la
// hoja si está vacía, ver sembrarFeriados()). Semana Santa y los traslados a
// lunes de la Ley 8442 (11 abril/25 julio/15 agosto si caen martes,
// miércoles o jueves) pueden variar — verificalos contra el decreto oficial
// del año antes de calcular planilla con ellos.
const FERIADOS_2026_POR_DEFECTO = [
  { fecha: '2026-01-01', nombre: 'Año Nuevo' },
  { fecha: '2026-04-02', nombre: 'Jueves Santo' },
  { fecha: '2026-04-03', nombre: 'Viernes Santo' },
  { fecha: '2026-04-11', nombre: 'Día de Juan Santamaría' },
  { fecha: '2026-05-01', nombre: 'Día del Trabajo' },
  { fecha: '2026-07-25', nombre: 'Anexión del Partido de Nicoya' },
  { fecha: '2026-08-15', nombre: 'Día de la Madre' },
  { fecha: '2026-09-15', nombre: 'Independencia' },
  { fecha: '2026-12-25', nombre: 'Navidad' }
];

// Carpeta de Drive donde se guarda una copia del PDF al cerrar una semana de
// horarios. Pegá acá el ID de una carpeta tuya (ver instrucciones arriba) —
// mientras esté vacío, "Cerrar horario" va a fallar al generar el PDF.
const FOLDER_ID_HORARIOS = '1nK59bV-QSeip4f-L7cvG9QjVzYdL-CA2';

// Carpeta de Drive donde se guarda la foto de cédula de cada colaborador
// dado de alta desde rrhh-nuevo-ingreso.html (un archivo por persona,
// nombrado con cédula + nombre). Ya viene con el ID de la carpeta que se usó
// para este proyecto — si se necesita cambiarla, reemplazá el ID de abajo
// (de la URL de la carpeta en Drive) y volvé a Implementar → Gestionar
// implementaciones → Editar → Nueva versión.
const FOLDER_ID_CEDULAS = '1a6cdpjL85_26UP4nto35Ht4ata1rODPA';

// Carpeta de Drive donde se archiva el PDF de cada planilla aprobada (Paso 5
// del wizard, planilla.html). Pegá acá el ID de una carpeta tuya (de la URL
// de la carpeta en Drive) y volvé a Implementar → Gestionar implementaciones
// → Editar → Nueva versión — mientras esté vacío, "Aprobar planilla" avisa
// que falta este paso en vez de fallar en silencio (podés seguir aprobando
// planillas sin archivarlas mientras tanto).
const FOLDER_ID_PLANILLAS = '';

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
  prepararHoja(HOJA_FERIADOS, ENCABEZADOS_FERIADOS);
  prepararHoja(HOJA_INCIDENCIAS, ENCABEZADOS_INCIDENCIAS);
  prepararHoja(HOJA_PLANILLAS, ENCABEZADOS_PLANILLAS);
  prepararHoja(HOJA_PLANILLAS_DETALLE, ENCABEZADOS_PLANILLAS_DETALLE);
  prepararHoja(HOJA_SERVICIO_REPARTOS, ENCABEZADOS_SERVICIO_REPARTOS);
  prepararHoja(HOJA_SERVICIO_DETALLE, ENCABEZADOS_SERVICIO_DETALLE);
  sembrarConfiguracion();
  sembrarRoles();
  sembrarFeriados();
}

// Crea la pestaña "Feriados" y, si está recién creada (sin filas todavía),
// la siembra con los feriados de pago obligatorio de Costa Rica para 2026
// (FERIADOS_2026_POR_DEFECTO) como punto de partida editable. Si ya tiene
// filas (el usuario ya la editó desde planilla.html), no la vuelve a tocar.
function sembrarFeriados() {
  const hoja = prepararHoja(HOJA_FERIADOS, ENCABEZADOS_FERIADOS);
  if (hoja.getLastRow() > 1) return;
  FERIADOS_2026_POR_DEFECTO.forEach(function (f) {
    agregarFilaPorEncabezado(hoja, ENCABEZADOS_FERIADOS, {
      'Fecha': f.fecha,
      'Nombre': f.nombre,
      'Activo': 'Sí',
      'Registrado': new Date().toISOString()
    });
  });
}

// Crea la pestaña "Configuracion" y, si está recién creada (sin filas de
// datos todavía), la llena con los kioskos que ya venían hardcodeados en
// los .html — así configuracion.html y el resto de pantallas no arrancan
// con la lista vacía. Si ya tiene filas (el usuario ya la editó/agregó
// kioskos desde configuracion.html), no la vuelve a tocar.
function sembrarConfiguracion() {
  const hoja = prepararHoja(HOJA_CONFIGURACION, ENCABEZADOS_CONFIGURACION);
  if (hoja.getLastRow() > 1) return;
  KIOSKOS_POR_DEFECTO.forEach(function (nombre) {
    const valores = {
      'Kiosko': nombre,
      'Activo': 'Sí',
      'Ubicación': '',
      'Encargado': '',
      'Contacto': '',
      'WhatsApp': '',
      'Registrado': new Date().toISOString()
    };
    ENCABEZADOS_HORARIO_KIOSKO.forEach(function (h) { valores[h] = ''; });
    agregarFilaPorEncabezado(hoja, ENCABEZADOS_CONFIGURACION, valores);
  });
}

// Crea la pestaña "Roles" y, si está recién creada (sin filas de datos
// todavía), la siembra con un único rol Administrador (PIN "admin", acceso a
// todos los módulos y todos los kioskos) — mismo PIN que login.html usaba
// hardcodeado antes de este módulo, así nadie queda afuera del portal la
// primera vez que se corre configurarHojas(). Si ya tiene filas (alguien ya
// usó admin-accesos.html), no la vuelve a tocar.
function sembrarRoles() {
  const hoja = prepararHoja(HOJA_ROLES, ENCABEZADOS_ROLES);
  if (hoja.getLastRow() > 1) return;
  agregarFilaPorEncabezado(hoja, ENCABEZADOS_ROLES, {
    'ID': 'admin',
    'Nombre': 'Administrador',
    'PIN': 'admin',
    'Color': '#1a7a4a',
    'Modulos': 'todos',
    'Kioskos': 'todos',
    'Activo': 'Sí',
    'Registrado': new Date().toISOString()
  });
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
  // "Horario Lun".."Horario Dom" guardan "HH:MM-HH:MM" (o vacío/"Cerrado"),
  // no una hora de reloj real — forzar texto para que Sheets no autoconvierta.
  COLUMNAS_TEXTO_POR_HOJA[HOJA_CONFIGURACION] = ENCABEZADOS_HORARIO_KIOSKO;
  // Fechas de Planilla, mismo motivo: son strings "yyyy-MM-dd" comparados
  // como texto (calcularPlanilla los reparsea con parseFechaISO), no fechas
  // de reloj — evitar que Sheets las autoconvierta a Date.
  COLUMNAS_TEXTO_POR_HOJA[HOJA_FERIADOS] = ['Fecha'];
  COLUMNAS_TEXTO_POR_HOJA[HOJA_INCIDENCIAS] = [
    'Fecha inicio', 'Fecha fin',
    'Incapacidad CCSS fecha inicio', 'Incapacidad CCSS fecha fin',
    'Incapacidad INS fecha inicio', 'Incapacidad INS fecha fin',
    'Incapacidad interna fecha inicio', 'Incapacidad interna fecha fin'
  ];
  COLUMNAS_TEXTO_POR_HOJA[HOJA_PLANILLAS] = ['Fecha inicio', 'Fecha fin'];
  COLUMNAS_TEXTO_POR_HOJA[HOJA_SERVICIO_REPARTOS] = ['Fecha inicio', 'Fecha fin'];
  COLUMNAS_TEXTO_POR_HOJA[HOJA_SERVICIO_DETALLE] = ['Fecha', 'Fecha pago'];
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
      case 'feriados':          hoja = prepararHoja(HOJA_FERIADOS, ENCABEZADOS_FERIADOS); break;
      case 'incidencias':       hoja = prepararHoja(HOJA_INCIDENCIAS, ENCABEZADOS_INCIDENCIAS); break;
      case 'planillas':         hoja = prepararHoja(HOJA_PLANILLAS, ENCABEZADOS_PLANILLAS); break;
      case 'planillas_detalle': hoja = prepararHoja(HOJA_PLANILLAS_DETALLE, ENCABEZADOS_PLANILLAS_DETALLE); break;
      case 'servicio_repartos': hoja = prepararHoja(HOJA_SERVICIO_REPARTOS, ENCABEZADOS_SERVICIO_REPARTOS); break;
      case 'servicio_detalle':  hoja = prepararHoja(HOJA_SERVICIO_DETALLE, ENCABEZADOS_SERVICIO_DETALLE); break;
      case 'planilla_calcular':
        // Preview sin guardar — misma función de cálculo que usa
        // planilla_guardar en doPost, para que el preview y el snapshot
        // guardado nunca se desincronicen.
        return jsonOut({
          ok: true,
          resultado: calcularPlanilla(e.parameter.periodo, e.parameter.fecha_inicio, e.parameter.fecha_fin, e.parameter.kiosko)
        });
      case 'acciones':        return jsonOut({ ok: true, registros: [] });
      case 'kioskos':
        hoja = prepararHoja(HOJA_CONFIGURACION, ENCABEZADOS_CONFIGURACION);
        // "registros" trae todas las filas (para configuracion.html, que
        // también necesita ver los inactivos); "kioskos" trae solo los
        // nombres activos, en orden — eso es lo que consumen los selects
        // de cierres.html/rrhh*.html/horarios.html.
        return jsonOut({ ok: true, registros: filasComoObjetos(hoja), kioskos: obtenerKioskosActivos() });
      case 'roles':
        // Trae TODOS los roles (activos e inactivos) — admin-accesos.html
        // necesita ver los inactivos para poder reactivarlos; login.html
        // filtra a Activo=Sí del lado del cliente antes de comparar el PIN.
        hoja = prepararHoja(HOJA_ROLES, ENCABEZADOS_ROLES);
        break;
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
      case 'editar_colaborador':    result = editarColaborador(payload); break;
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
      case 'kiosko_guardar':        result = guardarKiosko(payload); break;
      case 'kiosko_estado':         result = cambiarEstadoKiosko(payload); break;
      case 'rol_guardar':           result = guardarRol(payload); break;
      case 'rol_estado':            result = cambiarEstadoRol(payload); break;
      case 'feriado_guardar':       result = guardarFeriado(payload); break;
      case 'feriado_estado':        result = cambiarEstadoFeriado(payload); break;
      case 'incidencia_guardar':    result = guardarIncidencia(payload); break;
      case 'incidencias_guardar_lote': result = guardarIncidenciasLote(payload); break;
      case 'planilla_guardar':      result = guardarPlanilla(payload); break;
      case 'planilla_abrir_periodo': result = abrirPeriodoPlanilla(payload); break;
      case 'planilla_enviar_revision':
        payload.estado = 'Pendiente de aprobación';
        result = guardarPlanilla(payload);
        break;
      case 'planilla_aprobar':      result = aprobarPlanilla(payload); break;
      case 'planilla_guardar_archivo': result = guardarArchivoPlanilla(payload); break;
      case 'servicio_guardar':      result = guardarServicioReparto(payload); break;
      case 'servicio_pago':         result = marcarServicioPagado(payload); break;
      default:
        throw new Error('Módulo no reconocido: ' + payload.modulo);
    }
    return jsonOut({ ok: true, result: result });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// Devuelve el número de columna (1-indexada) de un encabezado, leyendo la
// fila 1 REAL de la hoja — nunca asumir que coincide con la posición de ese
// encabezado dentro de un array ENCABEZADOS_*. Si una hoja ya existía con
// columnas en otro orden antes de agregar campos nuevos (como pasó con
// "Personal" al pasar de la versión mínima a la completa, donde las
// columnas nuevas se agregaron al final en vez de reordenar), el orden real
// del Sheet puede no coincidir con el orden declarado en el código.
// Devuelve 0 si el encabezado no existe todavía.
function colPorEncabezado(hoja, nombreCol) {
  const nCols = Math.max(hoja.getLastColumn(), 1);
  const encabezados = hoja.getRange(1, 1, 1, nCols).getValues()[0];
  return encabezados.indexOf(nombreCol) + 1;
}

// Escribe un objeto {NombreDeEncabezado: valor} en una fila, ubicando cada
// valor por el NOMBRE real de la columna en la hoja (fila 1), no por la
// posición del encabezado dentro del array `encabezadosEsperados` — eso es
// lo que causaba que columnas como Departamento/Banco/CCSS/etc. quedaran
// vacías o con el valor de otra columna en el Sheet "Personal" de Kioskos,
// que ya existía con un orden de columnas distinto antes de ampliarse.
function escribirFilaPorEncabezado(hoja, fila, encabezadosEsperados, valores) {
  const nCols = Math.max(hoja.getLastColumn(), encabezadosEsperados.length);
  const encabezadosReales = hoja.getRange(1, 1, 1, nCols).getValues()[0];
  const datos = encabezadosReales.map(function (h) { return (h && (h in valores)) ? valores[h] : ''; });
  hoja.getRange(fila, 1, 1, datos.length).setValues([datos]);
}

// Busca la fila (1-indexada) de un colaborador en Personal por "Nombre completo"
// (case-insensitive, sin espacios extra). Devuelve -1 si no existe.
function filaColaborador(hoja, nombre) {
  if (!nombre) return -1;
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const colNombre = colPorEncabezado(hoja, 'Nombre completo');
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
  const fotoCedulaUrl = guardarFotoCedula(p, nombreCompleto);
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
    'Observaciones': p.observaciones || '',
    'Foto Cédula (URL)': fotoCedulaUrl
  });
  return { fila: fila, nombre: nombreCompleto };
}

// ── FOTO DE CÉDULA → GOOGLE DRIVE ─────────────────────────────────
// Guarda la foto (base64, tomada/subida desde rrhh-nuevo-ingreso.html) en la
// carpeta fija FOLDER_ID_CEDULAS, un archivo por colaborador nombrado con su
// cédula y nombre para poder ubicarlo a simple vista. Si no viene foto (alta
// desde rrhh.html, que no la pide), devuelve '' sin tocar Drive.
function guardarFotoCedula(p, nombreCompleto) {
  if (!p.fotoCedula) return '';
  const carpeta = DriveApp.getFolderById(FOLDER_ID_CEDULAS);
  const cedulaSlug = (p.cedula || 'sin-cedula').toString().trim().replace(/[^\w\-]+/g, '_');
  const nombreSlug = nombreCompleto.toString().trim().replace(/[^\w\-]+/g, '_');
  const fileName = `${cedulaSlug}_${nombreSlug}.jpg`;
  return guardarImagenBase64(carpeta, p.fotoCedula, p.fotoCedulaMime || 'image/jpeg', fileName);
}

// Sube un archivo en base64 a una carpeta de Drive y devuelve su URL, con
// permiso de "cualquiera con el link puede ver" (para que se pueda abrir
// desde rrhh-personal.html sin pedir acceso).
function guardarImagenBase64(folder, base64, mimeType, fileName) {
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// Cambia solo el Estado (ACTIVO/INACTIVO) — usado por el toggle rápido de
// activar/desactivar en la pestaña "Personal".
function cambiarEstado(p) {
  if (!p.nombre) throw new Error('Falta el nombre del colaborador.');
  const hoja = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  const fila = filaColaborador(hoja, p.nombre);
  if (fila === -1) throw new Error('No se encontró ese colaborador.');
  const colEstado = colPorEncabezado(hoja, 'Estado');
  hoja.getRange(fila, colEstado).setValue(p.estado || 'INACTIVO');
  return { fila: fila };
}

// Edita un expediente ya existente (usado por el botón "Editar" del
// expediente en rrhh-personal.html). Localiza la fila por "nombre_original"
// (el nombre completo con el que se abrió el expediente, por si el nombre
// cambia como parte de la edición) y reescribe todos los campos editables.
// A propósito NO toca "Estado" ni "Salario" ni "Saldo vacaciones" — esos
// quedan reservados a sus propias pantallas (rrhh-terminacion.html,
// rrhh-cambio-salario.html, rrhh-vacaciones.html/control-vacaciones.html)
// para no perder el historial que esas pantallas registran aparte. La foto
// de cédula solo se reemplaza si llega una nueva (`p.fotoCedula`); si no,
// se conserva la que ya hubiera.
function editarColaborador(p) {
  const original = (p.nombre_original || '').toString().trim();
  if (!original) throw new Error('Falta identificar qué colaborador editar.');
  const hoja = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  const fila = filaColaborador(hoja, original);
  if (fila === -1) throw new Error('No se encontró ese colaborador.');

  const nombreCompleto = (p.nombre || '').toString().trim();
  if (!nombreCompleto) throw new Error('Falta el nombre completo.');

  // Si el nombre cambia, verificar que no choque con otro colaborador ya existente.
  if (nombreCompleto.toLowerCase() !== original.toLowerCase()) {
    const otraFila = filaColaborador(hoja, nombreCompleto);
    if (otraFila !== -1 && otraFila !== fila) {
      throw new Error('Ya existe otro colaborador con ese nombre.');
    }
  }

  const nCols = Math.max(hoja.getLastColumn(), ENCABEZADOS_PERSONAL.length);
  const encabezadosReales = hoja.getRange(1, 1, 1, nCols).getValues()[0];
  const filaActual = hoja.getRange(fila, 1, 1, nCols).getValues()[0];
  const valorActual = function (nombreCol) {
    const idx = encabezadosReales.indexOf(nombreCol);
    return idx === -1 ? '' : filaActual[idx];
  };

  const doc = p.documentos || {};
  let fotoCedulaUrl = valorActual('Foto Cédula (URL)') || '';
  if (p.fotoCedula) {
    fotoCedulaUrl = guardarFotoCedula(p, nombreCompleto);
  }

  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PERSONAL, {
    'Nombre completo': nombreCompleto,
    'Cédula': p.cedula || '',
    'Puesto': p.puesto || '',
    'Estado': valorActual('Estado') || 'ACTIVO',
    'Kiosko': p.kiosko || '',
    'Departamento': p.departamento || '',
    'Salario': valorActual('Salario') || 0,
    'Fecha ingreso': p.fecha_ingreso || valorActual('Fecha ingreso') || '',
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
    'Saldo vacaciones': valorActual('Saldo vacaciones') || 0,
    'Observaciones': p.observaciones || '',
    'Foto Cédula (URL)': fotoCedulaUrl
  });
  return { fila: fila, nombre: nombreCompleto };
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
  const colId = colPorEncabezado(hoja, 'ID');
  const colEstado = colPorEncabezado(hoja, 'Estado');
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
    const colEstado = colPorEncabezado(hojaPersonal, 'Estado');
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
    const colSalario = colPorEncabezado(hojaPersonal, 'Salario');
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
    const colEstado = colPorEncabezado(hojaPersonal, 'Estado');
    hojaPersonal.getRange(filaP, colEstado).setValue(p.nuevo_estado || 'INACTIVO');
  }
  return { fila: fila };
}

// ── HORARIOS (compartido con horarios.html / horarios-historial.html) ──

// Busca la fila (1-indexada) donde una columna (por nombre de encabezado) tiene cierto valor.
// El parámetro `encabezados` ya no se usa para calcular la posición (queda
// solo por compatibilidad con los call sites existentes) — la columna se
// resuelve siempre leyendo la fila 1 real de la hoja, ver colPorEncabezado().
function filaPorColumna(hoja, encabezados, nombreCol, valor) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const col = colPorEncabezado(hoja, nombreCol);
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
  const col = colPorEncabezado(hoja, nombreCol);
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
    pdfUrl = guardarPDFHorarioEnDrive(p.semana_inicio, p.pdf_base64, p.kiosko);
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
// previa de la MISMA semana + kiosko si existe (para no acumular versiones
// viejas). El nombre incluye el kiosko para poder identificar el archivo
// correcto a simple vista dentro de la carpeta (antes solo tenía la fecha,
// lo que mezclaba los PDF de todos los kioskos bajo el mismo nombre).
function guardarPDFHorarioEnDrive(semanaInicio, base64, kiosko) {
  const folder = DriveApp.getFolderById(FOLDER_ID_HORARIOS);
  const kioskoLimpio = String(kiosko || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
  const nombre = 'Horario_' + (kioskoLimpio ? kioskoLimpio + '_' : '') + semanaInicio + '.pdf';
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

// ── CONFIGURACIÓN DE KIOSKOS (sección de configuración inicial) ─────

// Nombres de kioskos activos, en el orden en que aparecen en el Sheet —
// esto es lo que alimenta todos los selects de kiosko del sistema.
function obtenerKioskosActivos() {
  const hoja = prepararHoja(HOJA_CONFIGURACION, ENCABEZADOS_CONFIGURACION);
  return filasComoObjetos(hoja)
    .filter(function (r) { return String(r['Activo'] || 'Sí').trim().toLowerCase() !== 'no'; })
    .map(function (r) { return r['Kiosko']; })
    .filter(Boolean);
}

// Crea un kiosko nuevo o edita uno existente. Si viene "kiosko_original" y
// existe una fila con ese nombre, la actualiza entera (permite renombrar);
// si no, crea una fila nueva. Usado por configuracion.html.
function guardarKiosko(p) {
  const nombre = String(p.kiosko || '').trim();
  if (!nombre) throw new Error('Falta el nombre del kiosko.');
  const hoja = prepararHoja(HOJA_CONFIGURACION, ENCABEZADOS_CONFIGURACION);
  const original = String(p.kiosko_original || '').trim();
  const filaExistente = original ? filaPorColumna(hoja, ENCABEZADOS_CONFIGURACION, 'Kiosko', original) : -1;

  // Si el nombre cambia (o es nuevo), verificar que no choque con otro kiosko.
  if (nombre.toLowerCase() !== original.toLowerCase()) {
    const enUso = filasComoObjetos(hoja).some(function (r) {
      return String(r['Kiosko'] || '').trim().toLowerCase() === nombre.toLowerCase();
    });
    if (enUso) throw new Error('Ya existe un kiosko con ese nombre.');
  }

  const valores = {
    'Kiosko': nombre,
    'Activo': p.activo || 'Sí',
    'Ubicación': p.ubicacion || '',
    'Encargado': p.encargado || '',
    'Contacto': p.contacto || '',
    'WhatsApp': p.whatsapp || '',
    'Registrado': p.registrado_en || new Date().toISOString()
  };
  // p.horarios: { Lun: 'HH:MM-HH:MM', Mar: '', ... } — un día cerrado o sin
  // definir se guarda vacío. configuracion.html siempre manda los 7 días.
  const horarios = p.horarios || {};
  DIAS_SEMANA.forEach(function (d) { valores['Horario ' + d] = horarios[d] || ''; });

  if (filaExistente !== -1) {
    escribirFilaPorEncabezado(hoja, filaExistente, ENCABEZADOS_CONFIGURACION, valores);
    return { fila: filaExistente, kiosko: nombre };
  }
  const fila = agregarFilaPorEncabezado(hoja, ENCABEZADOS_CONFIGURACION, valores);
  return { fila: fila, kiosko: nombre };
}

// Activa/desactiva un kiosko sin abrir el formulario completo (toggle rápido
// desde la lista de configuracion.html). Un kiosko inactivo deja de aparecer
// en los selects, pero no se borra ni afecta los registros ya guardados con
// ese nombre.
function cambiarEstadoKiosko(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  const hoja = prepararHoja(HOJA_CONFIGURACION, ENCABEZADOS_CONFIGURACION);
  const fila = filaPorColumna(hoja, ENCABEZADOS_CONFIGURACION, 'Kiosko', p.kiosko);
  if (fila === -1) throw new Error('No se encontró ese kiosko.');
  const colActivo = colPorEncabezado(hoja, 'Activo');
  hoja.getRange(fila, colActivo).setValue(p.activo || 'No');
  return { fila: fila };
}

// ── ROLES Y ACCESOS (admin-accesos.html / login.html) ────────────────

// Crea un rol nuevo o edita uno existente. Si viene "id" y existe una fila
// con ese ID, la actualiza entera; si no, crea una fila nueva con un ID
// generado a partir de la hora (nunca se reutiliza, ni siquiera si el rol se
// desactiva después). El PIN debe ser único entre los roles ACTIVOS — dos
// roles inactivos pueden compartir PIN sin problema porque nunca van a poder
// confundirse en el login (login.html descarta los inactivos).
function guardarRol(p) {
  const nombre = String(p.nombre || '').trim();
  if (!nombre) throw new Error('Falta el nombre del rol.');
  const pin = String(p.pin || '').trim();
  if (!pin) throw new Error('Falta el código de acceso (PIN).');

  const hoja = prepararHoja(HOJA_ROLES, ENCABEZADOS_ROLES);
  const id = String(p.id || '').trim();
  const filaExistente = id ? filaPorColumna(hoja, ENCABEZADOS_ROLES, 'ID', id) : -1;
  const activo = p.activo === 'No' ? 'No' : 'Sí';

  if (activo === 'Sí') {
    const chocaPin = filasComoObjetos(hoja).some(function (r) {
      return String(r['ID']) !== id
        && String(r['PIN']) === pin
        && String(r['Activo'] || 'Sí').trim().toLowerCase() !== 'no';
    });
    if (chocaPin) throw new Error('Ya hay otro rol activo con ese mismo código de acceso (PIN).');
  }

  // "modulos"/"kioskos" llegan como array desde admin-accesos.html (lista de
  // claves marcadas) o como el string 'todos' si se tildó "Todos los
  // módulos/kioskos". Un array vacío se guarda como 'todos' también — un rol
  // sin nada marcado por error no debería quedar sin poder ver nada.
  const modulos = Array.isArray(p.modulos) ? (p.modulos.length ? p.modulos.join(',') : 'todos') : (p.modulos || 'todos');
  const kioskosRol = Array.isArray(p.kioskos) ? (p.kioskos.length ? p.kioskos.join(',') : 'todos') : (p.kioskos || 'todos');

  const valores = {
    'ID': id || ('rol_' + Date.now()),
    'Nombre': nombre,
    'PIN': pin,
    'Color': p.color || '#1a7a4a',
    'Modulos': modulos,
    'Kioskos': kioskosRol,
    'Activo': activo,
    'Registrado': p.registrado_en || new Date().toISOString()
  };

  if (filaExistente !== -1) {
    escribirFilaPorEncabezado(hoja, filaExistente, ENCABEZADOS_ROLES, valores);
    return { fila: filaExistente, id: valores['ID'] };
  }
  const fila = agregarFilaPorEncabezado(hoja, ENCABEZADOS_ROLES, valores);
  return { fila: fila, id: valores['ID'] };
}

// Activa/desactiva un rol sin abrir el formulario completo (toggle rápido
// desde admin-accesos.html). Un rol inactivo deja de poder iniciar sesión,
// pero no se borra ni pierde su configuración de módulos/kioskos.
function cambiarEstadoRol(p) {
  if (!p.id) throw new Error('Falta el ID del rol.');
  const hoja = prepararHoja(HOJA_ROLES, ENCABEZADOS_ROLES);
  const fila = filaPorColumna(hoja, ENCABEZADOS_ROLES, 'ID', p.id);
  if (fila === -1) throw new Error('No se encontró ese rol.');
  const colActivo = colPorEncabezado(hoja, 'Activo');
  hoja.getRange(fila, colActivo).setValue(p.activo || 'No');
  return { fila: fila };
}

// ── PLANILLA (planilla.html) ──────────────────────────────────────────

// Crea un feriado nuevo o edita uno existente (identificado por su fecha
// original, por si la fecha cambia como parte de la edición). Mismo patrón
// que guardarKiosko.
function guardarFeriado(p) {
  const fecha = String(p.fecha || '').trim();
  if (!fecha) throw new Error('Falta la fecha del feriado.');
  if (!p.nombre) throw new Error('Falta el nombre del feriado.');

  const hoja = prepararHoja(HOJA_FERIADOS, ENCABEZADOS_FERIADOS);
  const original = String(p.fecha_original || '').trim();
  const filaExistente = original ? filaPorColumna(hoja, ENCABEZADOS_FERIADOS, 'Fecha', original) : -1;

  if (fecha !== original) {
    const enUso = filasComoObjetos(hoja).some(function (r) {
      return valorComoTexto(r['Fecha']).trim() === fecha;
    });
    if (enUso) throw new Error('Ya existe un feriado con esa fecha.');
  }

  const valores = {
    'Fecha': fecha,
    'Nombre': p.nombre,
    'Activo': p.activo || 'Sí',
    'Registrado': p.registrado_en || new Date().toISOString()
  };

  if (filaExistente !== -1) {
    escribirFilaPorEncabezado(hoja, filaExistente, ENCABEZADOS_FERIADOS, valores);
    return { fila: filaExistente, fecha: fecha };
  }
  const fila = agregarFilaPorEncabezado(hoja, ENCABEZADOS_FERIADOS, valores);
  return { fila: fila, fecha: fecha };
}

// Activa/desactiva un feriado sin abrir el formulario completo (un feriado
// inactivo deja de contarse en calcularPlanilla, pero no se borra).
function cambiarEstadoFeriado(p) {
  if (!p.fecha) throw new Error('Falta la fecha del feriado.');
  const hoja = prepararHoja(HOJA_FERIADOS, ENCABEZADOS_FERIADOS);
  const fila = filaPorColumna(hoja, ENCABEZADOS_FERIADOS, 'Fecha', p.fecha);
  if (fila === -1) throw new Error('No se encontró ese feriado.');
  const colActivo = colPorEncabezado(hoja, 'Activo');
  hoja.getRange(fila, colActivo).setValue(p.activo || 'No');
  return { fila: fila };
}

// Busca la fila (1-indexada) de una incidencia por Periodo + Kiosko +
// Colaborador combinados — a diferencia de filaPorColumna (una sola
// columna), acá la clave de upsert son 3 columnas a la vez.
function filaIncidencia(hoja, periodo, kiosko, colaborador) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const nCols = hoja.getLastColumn();
  const encabezados = hoja.getRange(1, 1, 1, nCols).getValues()[0];
  const colPeriodo = encabezados.indexOf('Periodo');
  const colKiosko = encabezados.indexOf('Kiosko');
  const colColab = encabezados.indexOf('Colaborador');
  const datos = hoja.getRange(2, 1, nFilas, nCols).getValues();
  const buscadoPeriodo = String(periodo).trim();
  const buscadoKiosko = String(kiosko).trim().toLowerCase();
  const buscadoColab = String(colaborador).trim().toLowerCase();
  for (let i = 0; i < datos.length; i++) {
    if (valorComoTexto(datos[i][colPeriodo]).trim() === buscadoPeriodo
        && String(datos[i][colKiosko]).trim().toLowerCase() === buscadoKiosko
        && String(datos[i][colColab]).trim().toLowerCase() === buscadoColab) {
      return i + 2;
    }
  }
  return -1;
}

// Guarda (crea o reemplaza) la incidencia de un colaborador para un
// Periodo + Kiosko. planilla.html manda siempre el objeto completo — un
// campo que no aplica ese periodo simplemente se manda en 0/vacío.
function guardarIncidencia(p) {
  if (!p.periodo) throw new Error('Falta el periodo.');
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.colaborador) throw new Error('Falta el colaborador.');

  const hoja = prepararHoja(HOJA_INCIDENCIAS, ENCABEZADOS_INCIDENCIAS);
  const filaExistente = filaIncidencia(hoja, p.periodo, p.kiosko, p.colaborador);
  const ahora = new Date().toISOString();
  const pctInterna = (p.incap_interna_porcentaje === '' || p.incap_interna_porcentaje === undefined || p.incap_interna_porcentaje === null)
    ? 100 : Number(p.incap_interna_porcentaje);

  const valores = {
    'ID': p.id || Date.now(),
    'Periodo': p.periodo,
    'Fecha inicio': p.fecha_inicio || '',
    'Fecha fin': p.fecha_fin || '',
    'Kiosko': p.kiosko,
    'Colaborador': p.colaborador,
    'Horas regulares': Number(p.horas_regulares) || 0,
    'Horas extra 50%': Number(p.extra_50) || 0,
    'Comentario extra 50%': p.comentario_extra_50 || '',
    'Horas extra 100%': Number(p.extra_100) || 0,
    'Comentario extra 100%': p.comentario_extra_100 || '',
    'Feriados trabajados': JSON.stringify(p.feriados_trabajados || []),
    'Incapacidad CCSS fecha inicio': p.incap_ccss_inicio || '',
    'Incapacidad CCSS fecha fin': p.incap_ccss_fin || '',
    'Comentario incapacidad CCSS': p.comentario_incap_ccss || '',
    'Incapacidad INS fecha inicio': p.incap_ins_inicio || '',
    'Incapacidad INS fecha fin': p.incap_ins_fin || '',
    'Comentario incapacidad INS': p.comentario_incap_ins || '',
    'Incapacidad interna fecha inicio': p.incap_interna_inicio || '',
    'Incapacidad interna fecha fin': p.incap_interna_fin || '',
    'Incapacidad interna %': pctInterna,
    'Comentario incapacidad interna': p.comentario_incap_interna || '',
    'Subsidio monto por día': Number(p.subsidio_monto) || 0,
    'Subsidio días': Number(p.subsidio_dias) || 0,
    'Subsidio tipo': p.subsidio_tipo || '',
    'Comentario subsidio': p.comentario_subsidio || '',
    'Días no trabajados': Number(p.dias_no_trabajados) || 0,
    'Comentario días no trabajados': p.comentario_dias_no_trabajados || '',
    'Deducción adelanto salario': Number(p.ded_adelanto) || 0,
    'Comentario adelanto': p.comentario_adelanto || '',
    'Deducción compras aprobadas': Number(p.ded_compras) || 0,
    'Comentario compras': p.comentario_compras || '',
    'Deducción otras': Number(p.ded_otras) || 0,
    'Comentario otras': p.comentario_otras || '',
    'Deducción embargo salarial': Number(p.ded_embargo) || 0,
    'Comentario embargo': p.comentario_embargo || '',
    'Deducción pensión alimenticia': Number(p.ded_pension) || 0,
    'Comentario pensión': p.comentario_pension || '',
    'Registrado': ahora,
    'Actualizado': ahora,
    'Es manual': p.es_manual || 'No',
    'Salario manual': (p.salario_manual === undefined || p.salario_manual === '' || p.salario_manual === null) ? '' : Number(p.salario_manual),
    'Puesto manual': p.puesto_manual || '',
    'CCSS base ajustada': (p.ccss_base_ajustada === undefined || p.ccss_base_ajustada === '' || p.ccss_base_ajustada === null) ? '' : Number(p.ccss_base_ajustada)
  };

  if (filaExistente !== -1) {
    // Conservar el ID y la fecha de "Registrado" originales — solo
    // "Actualizado" cambia en una edición.
    const nCols = Math.max(hoja.getLastColumn(), ENCABEZADOS_INCIDENCIAS.length);
    const encabezadosReales = hoja.getRange(1, 1, 1, nCols).getValues()[0];
    const filaActual = hoja.getRange(filaExistente, 1, 1, nCols).getValues()[0];
    const idxId = encabezadosReales.indexOf('ID');
    const idxReg = encabezadosReales.indexOf('Registrado');
    if (idxId !== -1) valores['ID'] = filaActual[idxId];
    if (idxReg !== -1) valores['Registrado'] = filaActual[idxReg];
    escribirFilaPorEncabezado(hoja, filaExistente, ENCABEZADOS_INCIDENCIAS, valores);
    return { fila: filaExistente };
  }
  const fila = agregarFilaPorEncabezado(hoja, ENCABEZADOS_INCIDENCIAS, valores);
  return { fila: fila };
}

// ── CÁLCULO DE PLANILLA (Código de Trabajo CR) ────────────────────────

// Convierte "yyyy-MM-dd" a Date a medianoche local, evitando los líos de
// zona horaria de `new Date('yyyy-MM-dd')` (que la interpreta en UTC).
function parseFechaISO(s) {
  if (!s) return null;
  const partes = String(s).split('-');
  if (partes.length !== 3) return null;
  const d = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  return isNaN(d.getTime()) ? null : d;
}

// Días de intersección (inclusive en ambos extremos) entre los rangos
// [aIni,aFin] y [bIni,bFin]. Devuelve 0 si no hay traslape o falta alguna fecha.
function diasInterseccion(aIni, aFin, bIni, bFin) {
  if (!aIni || !aFin || !bIni || !bFin) return 0;
  const ini = aIni > bIni ? aIni : bIni;
  const fin = aFin < bFin ? aFin : bFin;
  if (fin < ini) return 0;
  return Math.round((fin - ini) / 86400000) + 1;
}

// Comparación case-insensitive de nombres de kiosko: "Personal" no siempre
// tiene el mismo case que la pestaña Configuracion (ej. "PLAYA GRANDE" vs
// "Playa Grande") — mismo problema ya resuelto en horarios.html
// (buildFromPersonal). Usar siempre esto en vez de ===.
function kioskosIguales(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

// Calcula la planilla de un Kiosko para un Periodo (quincena) dado. La
// fuente de "quiénes participan" es Incidencias (Periodo+Kiosko) — no
// Personal filtrado por kiosko+activo — porque el wizard (Paso 1,
// abrirPeriodoPlanilla) es quien decide y confirma esa lista, incluyendo
// colaboradores extra que no tienen fila en Personal ('Es manual'='Sí').
// Para cada incidencia no manual, el salario/puesto se busca en Personal por
// nombre. NO guarda nada — la usan tanto el preview (doGet
// ?modulo=planilla_calcular) como guardarPlanilla, para que el preview y el
// snapshot guardado nunca queden desincronizados.
//
// Nota legal: cálculo preliminar según el Código de Trabajo de Costa Rica
// (jornada ordinaria Art. 136, horas extra Art. 139, feriados Art. 148,
// vacaciones Art. 153) y la Ley 9756 (incapacidad CCSS). Los montos deben
// ser revisados por contabilidad antes del pago — no incluye Impuesto de
// Renta ni convenios colectivos particulares.
function calcularPlanilla(periodo, fechaInicioStr, fechaFinStr, kiosko) {
  if (!periodo) throw new Error('Falta el periodo.');
  if (!fechaInicioStr || !fechaFinStr) throw new Error('Faltan las fechas del periodo.');
  if (!kiosko) throw new Error('Falta el kiosko.');

  const fechaInicio = parseFechaISO(fechaInicioStr);
  const fechaFin = parseFechaISO(fechaFinStr);
  if (!fechaInicio || !fechaFin) throw new Error('Fechas de periodo inválidas.');

  const incidencias = filasComoObjetos(prepararHoja(HOJA_INCIDENCIAS, ENCABEZADOS_INCIDENCIAS))
    .filter(function (i) { return String(i['Periodo']) === String(periodo) && kioskosIguales(i['Kiosko'], kiosko); });

  const personalTodos = filasComoObjetos(prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL));
  function buscarPersonal(nombre) {
    const buscado = String(nombre || '').trim().toLowerCase();
    return personalTodos.find(function (p) { return String(p['Nombre completo'] || '').trim().toLowerCase() === buscado; });
  }

  // Fix: rrhh-control-vacaciones.html escribe el estado aprobado como
  // 'Aprobado' (masculino, ver cambiarEstado() ahí) — antes este filtro
  // comparaba contra 'aprobada' y nunca matcheaba nada.
  const vacacionesAprobadas = filasComoObjetos(prepararHoja(HOJA_VACACIONES, ENCABEZADOS_VACACIONES))
    .filter(function (v) { return (v['Estado'] || '').toLowerCase() === 'aprobado'; });

  const feriadosEnPeriodo = filasComoObjetos(prepararHoja(HOJA_FERIADOS, ENCABEZADOS_FERIADOS))
    .filter(function (f) {
      if (String(f['Activo'] || 'Sí').trim().toLowerCase() === 'no') return false;
      const d = parseFechaISO(valorComoTexto(f['Fecha']));
      return d && d >= fechaInicio && d <= fechaFin;
    });

  const detalle = incidencias.map(function (inc) {
    const nombre = inc['Colaborador'];
    const esManual = String(inc['Es manual'] || '').trim().toLowerCase().indexOf('s') === 0;
    let salario, puesto, ccssRegistrado;
    if (esManual) {
      salario = Number(inc['Salario manual']) || 0;
      puesto = inc['Puesto manual'] || '';
      // Colaborador extra sin fila en Personal: no hay expediente contra el
      // cual verificar, así que se asume registrado (comportamiento
      // histórico) — si no corresponde, se ajusta a mano en Paso 3.
      ccssRegistrado = true;
    } else {
      const persona = buscarPersonal(nombre);
      salario = persona ? (Number(persona['Salario']) || 0) : 0;
      puesto = persona ? (persona['Puesto'] || '') : '';
      // La cuota obrera de CCSS solo se rebaja si el expediente del
      // colaborador (Personal, columna 'CCSS') tiene ese casillero marcado.
      // Si no está marcado, el colaborador no está registrado ante la CCSS
      // por este patrono y no corresponde aplicarle el rebajo.
      ccssRegistrado = persona ? !!persona['CCSS'] : false;
    }
    const salarioDiario = salario / 30;
    const salarioHora = salarioDiario / 8;

    const horasRegularesMonto = (Number(inc['Horas regulares']) || 0) * salarioHora;
    const extra50Monto = (Number(inc['Horas extra 50%']) || 0) * salarioHora * 1.5;
    const extra100Monto = (Number(inc['Horas extra 100%']) || 0) * salarioHora * 2;

    // Feriados: cada feriado activo del periodo paga un día completo de
    // salario (se trabaje o no, Art. 148 CT); si además está marcado como
    // trabajado en la incidencia, paga un día extra más (doble).
    let feriadosTrabajados = [];
    try { feriadosTrabajados = JSON.parse(inc['Feriados trabajados'] || '[]'); } catch (err) { feriadosTrabajados = []; }
    const feriadosMonto = feriadosEnPeriodo.reduce(function (acc, f) {
      const fechaFeriado = valorComoTexto(f['Fecha']);
      const trabajado = feriadosTrabajados.indexOf(fechaFeriado) !== -1;
      return acc + salarioDiario * (trabajado ? 2 : 1);
    }, 0);

    // Incapacidad CCSS: 50% a cargo del patrono solo en los primeros 3 días
    // calendario desde la fecha de inicio REAL de la incapacidad (aunque
    // haya empezado antes de este periodo, y topado por su propia fecha de
    // fin si la incapacidad duró menos de 3 días), y solo la porción de
    // esos días que cae dentro de este periodo. Del día 4 en adelante: ₡0
    // (lo paga la CCSS directo, no pasa por planilla). El total de días de
    // esta incapacidad dentro del periodo (no solo los primeros 3) suma a
    // "días no trabajados" más abajo, para no pagar doble.
    let incapCCSSMonto = 0, diasCCSSEnPeriodo = 0;
    const ccssIni = parseFechaISO(inc['Incapacidad CCSS fecha inicio']);
    if (ccssIni) {
      const ccssFin = parseFechaISO(inc['Incapacidad CCSS fecha fin']) || ccssIni;
      diasCCSSEnPeriodo = diasInterseccion(ccssIni, ccssFin, fechaInicio, fechaFin);
      const primerosTresFinCalendario = new Date(ccssIni.getFullYear(), ccssIni.getMonth(), ccssIni.getDate() + 2);
      const primerosTresFin = primerosTresFinCalendario < ccssFin ? primerosTresFinCalendario : ccssFin;
      const diasPagados = diasInterseccion(ccssIni, primerosTresFin, fechaInicio, fechaFin);
      incapCCSSMonto = diasPagados * salarioDiario * 0.5;
    }

    // Incapacidad INS (riesgo de trabajo): el INS cubre 100% desde el día 1,
    // así que el patrono no paga nada — se registra solo para historial,
    // pero sus días sí suman a "días no trabajados" (no se pagan como
    // horas regulares).
    let diasINSEnPeriodo = 0;
    const insIni = parseFechaISO(inc['Incapacidad INS fecha inicio']);
    if (insIni) {
      const insFin = parseFechaISO(inc['Incapacidad INS fecha fin']) || insIni;
      diasINSEnPeriodo = diasInterseccion(insIni, insFin, fechaInicio, fechaFin);
    }
    const incapINSMonto = 0;

    // Incapacidad interna: política propia de la empresa (no respaldada por
    // CCSS/INS), % editable por incidencia — default 100%.
    let incapInternaMonto = 0, diasInternaEnPeriodo = 0;
    const internaIni = parseFechaISO(inc['Incapacidad interna fecha inicio']);
    const internaFin = parseFechaISO(inc['Incapacidad interna fecha fin']);
    if (internaIni && internaFin) {
      diasInternaEnPeriodo = diasInterseccion(internaIni, internaFin, fechaInicio, fechaFin);
      const pct = (inc['Incapacidad interna %'] === '' || inc['Incapacidad interna %'] === undefined) ? 100 : Number(inc['Incapacidad interna %']);
      incapInternaMonto = diasInternaEnPeriodo * salarioDiario * (pct / 100);
    }

    // Vacaciones: automático desde "Vacaciones" (Estado=Aprobado) — no se
    // ingresa a mano en Incidencias.
    const vacacionesDias = vacacionesAprobadas
      .filter(function (v) { return (v['Colaborador'] || '') === nombre; })
      .reduce(function (acc, v) {
        return acc + diasInterseccion(parseFechaISO(v['Fecha inicio']), parseFechaISO(v['Fecha fin']), fechaInicio, fechaFin);
      }, 0);
    const vacacionesMonto = vacacionesDias * salarioDiario;

    // Subsidio de alimentación/transporte — no forma parte de la base de
    // cotización de CCSS (se resta antes de calcular la cuota obrera).
    const subsidioMonto = (Number(inc['Subsidio monto por día']) || 0) * (Number(inc['Subsidio días']) || 0);

    // Días no trabajados = manual (otras ausencias, ej. injustificada) +
    // automático (cada día de incapacidad de cualquier tipo y cada día de
    // vacaciones dentro del periodo) — sin esto, "Horas regulares" (pensado
    // como el total de la quincena) pagaría esos días completos ADEMÁS del
    // pago específico de la incapacidad/vacación (pago doble).
    const diasNoTrabajadosAuto = diasCCSSEnPeriodo + diasINSEnPeriodo + diasInternaEnPeriodo + vacacionesDias;
    const diasNoTrabajadosManual = Number(inc['Días no trabajados']) || 0;
    const diasNoTrabajadosTotal = diasNoTrabajadosAuto + diasNoTrabajadosManual;
    const diasNoTrabajadosMonto = diasNoTrabajadosTotal * salarioDiario;

    const totalIngresos = horasRegularesMonto + extra50Monto + extra100Monto + feriadosMonto
      + incapCCSSMonto + incapINSMonto + incapInternaMonto + vacacionesMonto + subsidioMonto
      - diasNoTrabajadosMonto;

    // Base de CCSS: excluye el subsidio (no es salario) y los 3 montos de
    // incapacidad (no están sujetos a la cuota obrera) — editable por
    // incidencia ('CCSS base ajustada'), si no se guardó ninguna se usa la
    // automática.
    const baseCCSSAuto = Math.max(totalIngresos - subsidioMonto - incapCCSSMonto - incapINSMonto - incapInternaMonto, 0);
    const ccssAjustada = inc['CCSS base ajustada'];
    const usaCCSSAjustada = !(ccssAjustada === '' || ccssAjustada === undefined || ccssAjustada === null);
    const baseCCSSFinal = usaCCSSAjustada ? Math.max(Number(ccssAjustada) || 0, 0) : baseCCSSAuto;
    // Sin CCSS marcado en el expediente, no se rebaja nada aunque haya base
    // calculada — ver ccssRegistrado más arriba.
    const ccssObreraMonto = ccssRegistrado ? baseCCSSFinal * PORCENTAJE_CCSS_OBRERA : 0;

    const adelanto = Number(inc['Deducción adelanto salario']) || 0;
    const compras  = Number(inc['Deducción compras aprobadas']) || 0;
    const otras    = Number(inc['Deducción otras']) || 0;
    const embargo  = Number(inc['Deducción embargo salarial']) || 0;
    const pension  = Number(inc['Deducción pensión alimenticia']) || 0;
    const totalDeducciones = ccssObreraMonto + adelanto + compras + otras + embargo + pension;
    const neto = totalIngresos - totalDeducciones;

    return {
      colaborador: nombre, puesto: puesto, esManual: esManual,
      salario: salario, salarioDiario: salarioDiario, salarioHora: salarioHora,
      horasRegularesMonto: horasRegularesMonto, extra50Monto: extra50Monto, extra100Monto: extra100Monto,
      feriadosMonto: feriadosMonto, incapCCSSMonto: incapCCSSMonto, incapINSMonto: incapINSMonto,
      incapInternaMonto: incapInternaMonto, vacacionesMonto: vacacionesMonto, vacacionesDias: vacacionesDias,
      subsidioMonto: subsidioMonto,
      diasNoTrabajadosAuto: diasNoTrabajadosAuto, diasNoTrabajadosManual: diasNoTrabajadosManual,
      diasNoTrabajadosTotal: diasNoTrabajadosTotal, diasNoTrabajadosMonto: diasNoTrabajadosMonto,
      totalIngresos: totalIngresos,
      baseCCSSAuto: baseCCSSAuto, baseCCSSFinal: baseCCSSFinal, usaCCSSAjustada: usaCCSSAjustada,
      ccssRegistrado: ccssRegistrado,
      ccssObreraMonto: ccssObreraMonto, adelanto: adelanto, compras: compras, otras: otras,
      embargo: embargo, pension: pension, totalDeducciones: totalDeducciones, neto: neto
    };
  });

  const totales = detalle.reduce(function (acc, d) {
    acc.totalIngresos += d.totalIngresos;
    acc.totalDeducciones += d.totalDeducciones;
    acc.totalNeto += d.neto;
    return acc;
  }, { totalIngresos: 0, totalDeducciones: 0, totalNeto: 0 });

  return {
    periodo: periodo, fecha_inicio: fechaInicioStr, fecha_fin: fechaFinStr, kiosko: kiosko,
    colaboradores: detalle, totales: totales,
    feriados_en_periodo: feriadosEnPeriodo.map(function (f) { return { fecha: valorComoTexto(f['Fecha']), nombre: f['Nombre'] }; })
  };
}

// Borra las filas donde TODAS las columnas indicadas en `criterios` (objeto
// {NombreColumna: valor}) coinciden — a diferencia de eliminarFilasPorColumna
// (un solo criterio), acá hace falta Periodo + Kiosko a la vez para no
// borrar los otros kioskos del mismo periodo al reemplazar una planilla.
function eliminarFilasPorCriterios(hoja, criterios) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return;
  const nCols = hoja.getLastColumn();
  const encabezados = hoja.getRange(1, 1, 1, nCols).getValues()[0];
  const datos = hoja.getRange(2, 1, nFilas, nCols).getValues();
  const claves = Object.keys(criterios);
  for (let i = datos.length - 1; i >= 0; i--) {
    const coincide = claves.every(function (clave) {
      const idx = encabezados.indexOf(clave);
      return idx !== -1 && valorComoTexto(datos[i][idx]).trim().toLowerCase() === String(criterios[clave]).trim().toLowerCase();
    });
    if (coincide) hoja.deleteRow(i + 2);
  }
}

// Calcula y guarda un snapshot permanente de la planilla (cabecera en
// "Planillas" + una fila por colaborador en "PlanillasDetalle"). Si ya
// existía una corrida guardada para este mismo Periodo + Kiosko, la
// reemplaza entera — mismo criterio que "Guardar semana" en Horarios.
function guardarPlanilla(p) {
  if (!p.periodo) throw new Error('Falta el periodo.');
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.fecha_inicio || !p.fecha_fin) throw new Error('Faltan las fechas del periodo.');

  const resultado = calcularPlanilla(p.periodo, p.fecha_inicio, p.fecha_fin, p.kiosko);

  const hojaPlanillas = prepararHoja(HOJA_PLANILLAS, ENCABEZADOS_PLANILLAS);
  const hojaDetalle = prepararHoja(HOJA_PLANILLAS_DETALLE, ENCABEZADOS_PLANILLAS_DETALLE);

  const existentes = filasComoObjetos(hojaPlanillas).filter(function (r) {
    return String(r['Periodo']) === String(p.periodo)
      && String(r['Kiosko'] || '').trim().toLowerCase() === String(p.kiosko).trim().toLowerCase();
  });
  existentes.forEach(function (r) {
    eliminarFilasPorColumna(hojaDetalle, ENCABEZADOS_PLANILLAS_DETALLE, 'ID Planilla', r['ID']);
  });
  eliminarFilasPorCriterios(hojaPlanillas, { 'Periodo': p.periodo, 'Kiosko': p.kiosko });

  const id = 'plan_' + Date.now();
  const ahora = new Date().toISOString();

  agregarFilaPorEncabezado(hojaPlanillas, ENCABEZADOS_PLANILLAS, {
    'ID': id,
    'Periodo': p.periodo,
    'Fecha inicio': p.fecha_inicio,
    'Fecha fin': p.fecha_fin,
    'Kiosko': p.kiosko,
    'Fecha cálculo': ahora,
    'Calculado por': p.calculado_por || '',
    'Total ingresos': resultado.totales.totalIngresos,
    'Total deducciones': resultado.totales.totalDeducciones,
    'Total neto': resultado.totales.totalNeto,
    'Colaboradores': resultado.colaboradores.length,
    'Estado': p.estado || 'Pendiente de aprobación',
    'Enviado a revisión': ahora,
    'Checklist aprobación': '',
    'Aprobado por': '',
    'Fecha aprobación': '',
    'PDF URL': ''
  });

  resultado.colaboradores.forEach(function (c) {
    agregarFilaPorEncabezado(hojaDetalle, ENCABEZADOS_PLANILLAS_DETALLE, {
      'ID Planilla': id,
      'Colaborador': c.colaborador,
      'Puesto': c.puesto,
      'Salario mensual': c.salario,
      'Salario diario': c.salarioDiario,
      'Salario por hora': c.salarioHora,
      'Horas regulares monto': c.horasRegularesMonto,
      'Horas extra 50% monto': c.extra50Monto,
      'Horas extra 100% monto': c.extra100Monto,
      'Feriados monto': c.feriadosMonto,
      'Incapacidad CCSS monto': c.incapCCSSMonto,
      'Incapacidad INS monto': c.incapINSMonto,
      'Incapacidad interna monto': c.incapInternaMonto,
      'Vacaciones monto': c.vacacionesMonto,
      'Subsidio monto': c.subsidioMonto,
      'Días no trabajados monto': c.diasNoTrabajadosMonto,
      'Total ingresos': c.totalIngresos,
      'Base CCSS utilizada': c.baseCCSSFinal,
      'CCSS obrera monto': c.ccssObreraMonto,
      'Adelanto salario': c.adelanto,
      'Compras aprobadas': c.compras,
      'Otras deducciones': c.otras,
      'Embargo salarial': c.embargo,
      'Pensión alimenticia': c.pension,
      'Total deducciones': c.totalDeducciones,
      'Neto a pagar': c.neto,
      'CCSS registrado': c.ccssRegistrado ? 'Sí' : 'No'
    });
  });

  return { id: id, colaboradores: resultado.colaboradores.length, total_neto: resultado.totales.totalNeto };
}

// ── WIZARD DE PLANILLA (planilla.html) ────────────────────────────────

// Paso 1 del wizard: sincroniza Incidencias para este Periodo+Kiosko con el
// set de colaboradores confirmado en pantalla (ACTIVOS tildados + extras
// agregados a mano). Idempotente: a quien ya tenía incidencia (de una
// sesión anterior del wizard) NO se le resetean los datos ya cargados; a
// quien se desmarcó respecto de una apertura previa se le borra la
// incidencia (para que calcularPlanilla, que ahora lee de Incidencias, deje
// de contarlo). `p.colaboradores`: [{ nombre, puesto, salario, es_manual }].
function abrirPeriodoPlanilla(p) {
  if (!p.periodo) throw new Error('Falta el periodo.');
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.fecha_inicio || !p.fecha_fin) throw new Error('Faltan las fechas del periodo.');
  if (!Array.isArray(p.colaboradores) || !p.colaboradores.length) {
    throw new Error('Confirmá al menos un colaborador para abrir el periodo.');
  }

  const hoja = prepararHoja(HOJA_INCIDENCIAS, ENCABEZADOS_INCIDENCIAS);
  const confirmados = p.colaboradores.map(function (c) {
    return {
      nombre: String(c.nombre || '').trim(),
      puesto: c.puesto || '',
      salario: Number(c.salario) || 0,
      esManual: !!c.es_manual
    };
  });
  const nombresConfirmados = confirmados.map(function (c) { return c.nombre.toLowerCase(); });

  const existentesAntes = filasComoObjetos(hoja).filter(function (row) {
    return String(row['Periodo']) === String(p.periodo) && kioskosIguales(row['Kiosko'], p.kiosko);
  });

  // Quitar del periodo a quien ya tenía incidencia pero se desmarcó ahora.
  existentesAntes.forEach(function (row) {
    const nombreFila = String(row['Colaborador'] || '').trim();
    if (nombresConfirmados.indexOf(nombreFila.toLowerCase()) === -1) {
      eliminarFilasPorCriterios(hoja, { 'Periodo': p.periodo, 'Kiosko': p.kiosko, 'Colaborador': nombreFila });
    }
  });

  const nombresExistentes = existentesAntes.map(function (row) { return String(row['Colaborador'] || '').trim().toLowerCase(); });

  let agregados = 0;
  confirmados.forEach(function (c) {
    if (nombresExistentes.indexOf(c.nombre.toLowerCase()) !== -1) return; // ya tenía incidencia, no resetear
    guardarIncidencia({
      periodo: p.periodo, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin,
      kiosko: p.kiosko, colaborador: c.nombre,
      horas_regulares: 120,
      es_manual: c.esManual ? 'Sí' : 'No',
      salario_manual: c.esManual ? c.salario : '',
      puesto_manual: c.esManual ? c.puesto : ''
    });
    agregados++;
  });

  return { periodo: p.periodo, kiosko: p.kiosko, agregados: agregados, total: confirmados.length };
}

// Pasos 2 y 3 del wizard (Ingresos/Deducciones): guarda en un solo request
// todas las incidencias de la tabla (evita N idas y vueltas a Apps Script,
// que tiene latencia propia por cada exec). Cada elemento del arreglo es el
// mismo shape que espera guardarIncidencia().
function guardarIncidenciasLote(p) {
  if (!Array.isArray(p.incidencias) || !p.incidencias.length) {
    throw new Error('Falta el arreglo de incidencias a guardar.');
  }
  const resultados = p.incidencias.map(function (inc) { return guardarIncidencia(inc); });
  return { guardadas: resultados.length };
}

// Paso 5 del wizard: aprueba una planilla ya enviada a revisión (Estado
// 'Pendiente de aprobación'), dejando registro del checklist de
// verificación completado y quién aprobó — no recalcula nada, solo cambia
// el estado de la corrida ya guardada por guardarPlanilla().
function aprobarPlanilla(p) {
  if (!p.id) throw new Error('Falta el ID de la planilla.');
  if (!p.aprobado_por) throw new Error('Falta quién aprueba.');
  if (!Array.isArray(p.checklist) || !p.checklist.length) {
    throw new Error('Falta completar el checklist de verificación.');
  }

  const hoja = prepararHoja(HOJA_PLANILLAS, ENCABEZADOS_PLANILLAS);
  const fila = filaPorColumna(hoja, ENCABEZADOS_PLANILLAS, 'ID', p.id);
  if (fila === -1) throw new Error('No se encontró esa planilla.');

  const ahora = new Date().toISOString();
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PLANILLAS, Object.assign(
    filasComoObjetos(hoja)[fila - 2],
    {
      'Estado': 'Aprobada',
      'Checklist aprobación': JSON.stringify(p.checklist),
      'Aprobado por': p.aprobado_por,
      'Fecha aprobación': ahora
    }
  ));
  return { fila: fila, id: p.id, fecha_aprobacion: ahora };
}

// Sube el PDF (base64, generado en planilla.html con jsPDF/html2canvas al
// aprobar) a la carpeta fija de Drive y guarda la URL en la fila de
// Planillas correspondiente — mismo patrón que guardarPDFHorarioEnDrive.
function guardarArchivoPlanilla(p) {
  if (!p.id) throw new Error('Falta el ID de la planilla.');
  if (!p.pdf_base64) throw new Error('Falta el archivo PDF.');
  if (!FOLDER_ID_PLANILLAS) throw new Error('Falta configurar FOLDER_ID_PLANILLAS en el backend.');

  const folder = DriveApp.getFolderById(FOLDER_ID_PLANILLAS);
  const kioskoLimpio = String(p.kiosko || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
  const nombre = 'Planilla_' + (kioskoLimpio ? kioskoLimpio + '_' : '') + (p.periodo || p.id) + '.pdf';
  const existentes = folder.getFilesByName(nombre);
  while (existentes.hasNext()) existentes.next().setTrashed(true);

  const bytes = Utilities.base64Decode(p.pdf_base64);
  const blob = Utilities.newBlob(bytes, 'application/pdf', nombre);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = file.getUrl();

  const hoja = prepararHoja(HOJA_PLANILLAS, ENCABEZADOS_PLANILLAS);
  const fila = filaPorColumna(hoja, ENCABEZADOS_PLANILLAS, 'ID', p.id);
  if (fila !== -1) {
    const colPdfUrl = colPorEncabezado(hoja, 'PDF URL');
    hoja.getRange(fila, colPdfUrl).setValue(url);
  }
  return { url: url };
}
