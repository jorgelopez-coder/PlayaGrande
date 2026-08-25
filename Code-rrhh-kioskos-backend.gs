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
const HOJA_PERMISOS_SIN_GOCE = 'PermisosSinGoce';
const HOJA_AMONESTACIONES  = 'Amonestaciones';
const HOJA_TERMINACIONES   = 'Terminaciones';
const HOJA_CAMBIOS_SALARIO = 'CambiosSalario';
const HOJA_MOVIMIENTOS     = 'HistorialMovimientos';
const HOJA_LIQUIDACIONES   = 'Liquidaciones';
const HOJA_HORARIOS        = 'Horarios';
const HOJA_HORARIOS_ESTADO = 'HorariosEstado';
const HOJA_CONFIGURACION   = 'Configuracion';
const HOJA_ROLES           = 'Roles';
const HOJA_HORAS_EXTRA     = 'SolicitudesHorasExtra';

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
// ── PERMISOS SIN GOCE DE SALARIO (PSG, rrhh-permiso-sin-goce.html) ────
// Mismo patrón maestro que Vacaciones (crearSolicitudPermiso/
// cambiarEstadoPermiso, Pendiente → Aprobado/Rechazado), pero SIN "Saldo" —
// no acumula balance, y en vez de "Observaciones" pide "Motivo" (requerido).
// Aprobado se aplica automáticamente: en horarios.html pinta el día como
// "Permiso sin goce" (ver aplicarPermisos()) y en calcularPlanilla() suma
// esos días a "Días no trabajados" (sin monto propio — por eso NO tiene
// columna "Días" pagados: sin goce = ₡0 por esos días, a diferencia de
// Vacaciones que sí se paga).
const ENCABEZADOS_PERMISOS_SIN_GOCE = [
  'ID', 'Colaborador', 'Fecha inicio', 'Fecha fin', 'Días', 'Motivo', 'Estado', 'Registrado'
];
const ENCABEZADOS_AMONESTACIONES = [
  'Fecha', 'Colaborador', 'Tipo', 'Motivo', 'Observaciones', 'Suspensión desde', 'Suspensión hasta', 'Registrado',
  // Columnas nuevas (2026-08-01): categoría del motivo — Llegada tardía,
  // Falta de respeto, Consumo de licor o drogas — y, si es "Llegada
  // tardía", la cantidad de horas a mostrar como línea de "Tardanza" (en
  // negativo) en Ingresos de la planilla de la quincena en que cae la
  // fecha de la amonestación (ver sumarHorasTardanza() y calcularPlanilla()).
  'Motivo categoría', 'Horas tardanza'
];
const ENCABEZADOS_TERMINACIONES = [
  'Colaborador', 'Tipo terminación', 'Fecha salida', 'Observaciones', 'Registrado'
];
const ENCABEZADOS_CAMBIOS_SALARIO = [
  'Colaborador', 'Salario anterior', 'Salario nuevo', 'Diferencia', 'Fecha efectiva', 'Registrado por', 'Motivo', 'Registrado'
];
// Histórico de movimientos del expediente (sección "Histórico de movimientos"
// en rrhh-personal.html): un renglón por cada cambio relevante que se le hace
// a un colaborador — salario, puesto, departamento, kiosko, nombre, estado,
// terminación. No tiene pantalla de captura propia: se alimenta desde las
// funciones que ya escriben esos cambios (registrarCambioSalario,
// editarColaborador, cambiarEstado, registrarTerminacion) vía
// registrarMovimiento().
const ENCABEZADOS_MOVIMIENTOS = [
  'Colaborador', 'Tipo', 'Valor anterior', 'Valor nuevo', 'Motivo', 'Fecha efectiva', 'Registrado por', 'Registrado'
];
const ENCABEZADOS_LIQUIDACIONES = [
  'Colaborador', 'Fecha pago', 'Confirmado por', 'Total pagado', 'Preaviso', 'Cesantía', 'Vacaciones', 'Aguinaldo', 'Motivo', 'Registrado'
];

// ── AGUINALDO (rrhh-aguinaldo.html) ────────────────────────────────
// Periodo legal (Ley 1788): 1 de diciembre al 30 de noviembre del año
// siguiente. Se identifica un periodo por su año de CIERRE (ej. el periodo
// que va del 1-dic-2025 al 30-nov-2026 se identifica con anio=2026).
// El monto es la suma de "Base CCSS utilizada" (Total de ingresos
// calculados en cada planilla APROBADA para el cálculo de la CCSS) de todas
// las quincenas del periodo, dividido entre 12 — ver calcularAguinaldo().
// Una fila por Periodo aguinaldo + Kiosko + Colaborador (upsert, mismo
// patrón que Liquidaciones/Servicio 10%).
const HOJA_AGUINALDOS = 'Aguinaldos';
const ENCABEZADOS_AGUINALDOS = [
  'ID', 'Periodo aguinaldo', 'Colaborador', 'Kiosko', 'Puesto',
  'Base CCSS acumulada', 'Quincenas incluidas', 'Monto aguinaldo',
  'Fecha pago', 'Confirmado por', 'Notas', 'Registrado'
];
// "Kiosko" agregado después de "Departamento" (Lorito no lo tiene, un solo PDV).
// "Hora entrada 2"/"Hora salida 2" al final (nunca insertar en medio, ver
// prepararHoja): segundo tramo de un turno partido en el mismo día (ej.
// 08:00-12:00 y 17:00-21:00) — vacías si el turno de ese día es continuo.
// "Horas" ya viene sumada (tramo 1 + tramo 2, ver calcH en horarios.html), así
// que el reporte de horarios-historial.html no necesita tocarse: solo suma
// esa columna.
const ENCABEZADOS_HORARIOS = [
  'Semana inicio', 'Fecha', 'Colaborador', 'Departamento', 'Kiosko', 'Puesto',
  'Estado', 'Hora entrada', 'Hora salida', 'Horas', 'Nota', 'Detalle',
  'Hora entrada 2', 'Hora salida 2'
];
// "Kiosko" agregado para que el cierre de horario sea por Semana + Kiosko,
// no global — antes una sola fila por "Semana inicio" hacía que cerrar el
// horario de un kiosko marcara la semana como cerrada para TODOS los
// kioskos (aunque el PDF sí se guardaba por separado). Ver
// cambiarEstadoHorarioSemana().
const ENCABEZADOS_HORARIOS_ESTADO = [
  'Semana inicio', 'Kiosko', 'Cerrado', 'Actualizado', 'PDF URL'
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
].concat(ENCABEZADOS_HORARIO_KIOSKO).concat([
  'Registrado', 'Cédula Jurídica', 'Nombre Jurídico', 'Correo Facturas', 'Actividad Económica'
]);
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
  'Horas regulares', 'Comentario horas regulares',
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
  'CCSS base ajustada',
  // Agregada al final (2026-08-15): 'Es extra'='Sí' si se agregó con "+
  // Agregar colaborador extra" en el Paso 1 (por búsqueda o datos nuevos) —
  // distinto de 'Es manual' (que solo marca "sin ficha en Personal"): un
  // colaborador extra puede o no tener ficha. calcularPlanilla() usa esta
  // columna para NO considerarle vacaciones/horas extra/incapacidades
  // registradas (pertenecen a su kiosko nativo, o no tiene expediente).
  // Vacío/'No' en filas guardadas antes de este campo = comportamiento
  // histórico sin cambios (no se le retira nada retroactivamente).
  'Es extra',
  // Agregadas al final (2026-08-15, montos automáticos desde 2026-08-15
  // más tarde el mismo día): sección "Servicio 10% y Tips" del Paso 2 —
  // pago opcional de Servicio 10%/Tips junto con esta planilla. Solo se
  // guarda la DECISIÓN (incluir sí/no, rango de fechas, comentario) — el
  // monto NO se guarda acá, se recalcula siempre en vivo desde
  // ServicioRepartoDetalle (servicio-10.html) vía sumarServicio10Pendiente(),
  // mismo criterio que Horas extra. Ninguno de los dos (Servicio 10% ni
  // Tips) entra a la base de cotización de CCSS — ver calcularPlanilla().
  'Servicio 10% incluir', 'Servicio 10% fecha inicio', 'Servicio 10% fecha fin',
  'Comentario servicio 10'
];

// Reporte de horas extra CON nivel de aprobación (2026-08-01): a diferencia
// de 'Horas extra 50%/100%' en Incidencias (que quedaron como columnas
// legacy, ya no se leen), esta hoja es ahora la única fuente para el pago de
// horas extra en calcularPlanilla() — ver sumarHorasExtraAprobadas(). Se
// reporta por FECHA PUNTUAL (un turno/día específico), no por quincena
// completa: al calcular la planilla se suman todas las filas 'Aprobada' de
// un colaborador cuya Fecha cae dentro del rango del periodo. Mientras una
// fila está en 'Pendiente' (o si queda 'Rechazada') NO cuenta para el pago —
// por eso el wizard de Planilla (Paso 2) ya no deja editar horas extra a
// mano, solo muestra lo aprobado (rrhh-horas-extra.html es donde se corrige).
//
// Fusión 2026-08-08: rrhh-horas-extra.html ya no pide por separado "Horas
// extra 50%" y "Horas extra 100%" al reportar — un solo campo 'Horas'. El
// tipo de pago se define después, al calcular la planilla (planilla.html,
// Paso 2 → detalle de "Horas extra" de cada colaborador), y queda en 'Tipo
// pago' ('50%' o '100%') — vacío se trata como '50%' por defecto (ver
// sumarHorasExtraAprobadas() y cambiarTipoHorasExtra()). Filas registradas
// ANTES de esta fusión quedan con las columnas legacy 'Horas extra
// 50%'/'Horas extra 100%' (ya no se escriben, pero sumarHorasExtraAprobadas
// las sigue leyendo como respaldo para no perder ese historial).
const ENCABEZADOS_HORAS_EXTRA = [
  'ID', 'Fecha', 'Colaborador', 'Kiosko',
  'Horas', 'Justificación',
  'Estado', 'Aprobado por', 'Registrado', 'Actualizado',
  'Tipo pago'
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
  'CCSS registrado',
  // Agregadas al final (nunca insertar en medio, ver prepararHoja): horas de
  // "Llegada tardía" de Amonestaciones dentro de este periodo y su monto en
  // negativo, ya restados de 'Total ingresos' — ver calcularPlanilla().
  'Tardanza horas', 'Tardanza monto',
  // Agregadas al final (2026-08-01): reporte de pago por colaborador
  // (planilla.html, Paso 5 y vista de planilla aprobada) — check "Pagado"
  // por persona una vez que se ejecutó la transferencia, mismo patrón que
  // 'Pagado'/'Fecha pago' en ServicioRepartoDetalle. Ver marcarPlanillaPagado().
  'Pagado', 'Fecha pago',
  // Agregadas al final (2026-08-01): horas de SolicitudesHorasExtra ya
  // 'Aprobada' dentro de este periodo, para que el snapshot guardado quede
  // trazable sin tener que volver a esa hoja — ver sumarHorasExtraAprobadas().
  'Horas extra 50%', 'Horas extra 100%',
  // Agregadas al final (2026-08-15): si el colaborador quedó marcado 'Es
  // extra' en Incidencias (ver ENCABEZADOS_INCIDENCIAS) y el desglose de
  // Servicio 10%/Tips de esta corrida (Paso 2, sección "Servicio 10% y
  // Tips") — ver calcularPlanilla().
  'Es extra', 'Servicio 10% monto', 'Tips monto',
  // Agregada al final (permiso sin goce, rrhh-permiso-sin-goce.html): días
  // dentro de este periodo con permiso sin goce aprobado — sin monto
  // propio (ya restados de "Horas regulares" vía "Días no trabajados
  // monto"), se guarda solo para trazabilidad del detalle.
  'Permiso sin goce días'
];

// Cuota obrera de CCSS (SEM + IVM + Banco Popular) sobre el salario bruto —
// deducción de ley automática, no aparece en la lista de deducciones
// manuales porque no se ingresa a mano.
const PORCENTAJE_CCSS_OBRERA = 0.1083;

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
// 'Monto Tips ₡'/'Monto Total ₡' agregadas al final (nunca insertar en medio,
// ver prepararHoja): propinas pendientes (columna "Tips ₡" de Cierres, no
// cubiertas todavía en "TipsPagos") que se incluyen en el mismo reparto y se
// distribuyen con la misma lógica equitativa por fecha que el 10% de
// servicio — ver guardarServicioReparto() y servicio-10.html.
const ENCABEZADOS_SERVICIO_REPARTOS = [
  'ID', 'Kiosko', 'Fecha inicio', 'Fecha fin', 'Fecha cálculo', 'Calculado por',
  'Ventas Netas ₡', 'Monto Servicio ₡', 'Total días', 'Colaboradores',
  'Estado', 'PDF URL', 'Notas',
  'Monto Tips ₡', 'Monto Total ₡'
];
const HOJA_SERVICIO_DETALLE = 'ServicioRepartoDetalle';
// 'Monto ₡' sigue siendo el TOTAL por colaborador+fecha (servicio + tips) —
// es lo que usan Pendientes de pago/Historial para agrupar y pagar, sin
// cambios. 'Monto Servicio ₡'/'Monto Tips ₡' (al final) son el desglose,
// solo para auditoría.
const ENCABEZADOS_SERVICIO_DETALLE = [
  'ID Detalle', 'ID Reparto', 'Kiosko', 'Fecha', 'Colaborador', 'Puesto', 'Monto ₡',
  'Pagado', 'Fecha pago', 'Referencia pago', 'Notas pago',
  'Monto Servicio ₡', 'Monto Tips ₡'
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

  // Control de fechas repetidas — SOLO para el Servicio 10%: una fecha con
  // Monto Servicio ₡ > 0 ya guardado antes para este kiosko no puede volver
  // a traer servicio (se duplicaría el pago). Los tips no bloquean nada acá
  // porque se rastrean aparte por ID de cierre en TipsPagos — sin este
  // matiz, una fecha con servicio ya cerrado pero tips todavía pendientes
  // quedaría imposible de cerrar nunca más (ver servicio-10.html).
  const hojaDetExistente = prepararHoja(HOJA_SERVICIO_DETALLE, ENCABEZADOS_SERVICIO_DETALLE);
  const fechasConServicioExistente = {};
  const kioskoNorm = String(p.kiosko || '').trim().toLowerCase();
  filasComoObjetos(hojaDetExistente).forEach(function (d) {
    if (String(d['Kiosko'] || '').trim().toLowerCase() === kioskoNorm && (Number(d['Monto Servicio ₡']) || 0) > 0) {
      fechasConServicioExistente[valorComoTexto(d['Fecha']).slice(0, 10)] = true;
    }
  });
  const fechasNuevas = [];
  p.asignaciones.forEach(function (a) {
    if (fechasNuevas.indexOf(a.fecha) === -1) fechasNuevas.push(a.fecha);
  });
  const fechasServicioNuevas = [];
  p.asignaciones.forEach(function (a) {
    if ((Number(a.monto_servicio) || 0) > 0 && fechasServicioNuevas.indexOf(a.fecha) === -1) fechasServicioNuevas.push(a.fecha);
  });
  const fechasRepetidas = fechasServicioNuevas.filter(function (f) { return fechasConServicioExistente[f]; });
  if (fechasRepetidas.length) {
    throw new Error('El servicio de estas fechas ya fue incluido en otro reparto cerrado de ' + p.kiosko + ': ' + fechasRepetidas.join(', '));
  }

  const idReparto = p.id || Date.now();

  let pdfUrl = '';
  if (p.pdf_base64 && FOLDER_ID_SERVICIO) {
    pdfUrl = guardarPDFServicioEnDrive(p.kiosko, p.fecha_inicio, p.fecha_fin, p.pdf_base64);
  }

  const colaboradoresUnicos = {};
  p.asignaciones.forEach(function (a) { colaboradoresUnicos[a.colaborador] = true; });

  const montoServicioTotal = Number(p.monto_servicio) || 0;
  const montoTipsTotal = Number(p.monto_tips) || 0;

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
    'Monto Servicio ₡': montoServicioTotal,
    'Total días': fechasNuevas.length,
    'Colaboradores': Object.keys(colaboradoresUnicos).length,
    'Estado': 'Cerrado',
    'PDF URL': pdfUrl,
    'Notas': p.notas || '',
    'Monto Tips ₡': montoTipsTotal,
    'Monto Total ₡': montoServicioTotal + montoTipsTotal
  });

  const hojaDet = prepararHoja(HOJA_SERVICIO_DETALLE, ENCABEZADOS_SERVICIO_DETALLE);
  const filasDetalle = p.asignaciones.map(function (a, i) {
    const montoServicio = Number(a.monto_servicio) || 0;
    const montoTips = Number(a.monto_tips) || 0;
    return {
      'ID Detalle': idReparto + '-' + i,
      'ID Reparto': idReparto,
      'Kiosko': p.kiosko,
      'Fecha': a.fecha,
      'Colaborador': a.colaborador || '',
      'Puesto': a.puesto || '',
      'Monto ₡': a.monto != null ? (Number(a.monto) || 0) : (montoServicio + montoTips),
      'Pagado': 'No',
      'Fecha pago': '',
      'Referencia pago': '',
      'Notas pago': '',
      'Monto Servicio ₡': montoServicio,
      'Monto Tips ₡': montoTips
    };
  });
  agregarFilasPorEncabezado(hojaDet, ENCABEZADOS_SERVICIO_DETALLE, filasDetalle);

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
const FOLDER_ID_PLANILLAS = '1p3Z80BTbMB_0kMK2XPeIOaVfk6Rb8stO';

// Corré esta función UNA VEZ desde el editor de Apps Script para preparar el
// Sheet: agrega las columnas nuevas a "Personal" (sin tocar filas existentes)
// y crea el resto de pestañas con sus encabezados.
function configurarHojas() {
  prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  prepararHoja(HOJA_VACACIONES, ENCABEZADOS_VACACIONES);
  prepararHoja(HOJA_PERMISOS_SIN_GOCE, ENCABEZADOS_PERMISOS_SIN_GOCE);
  prepararHoja(HOJA_AMONESTACIONES, ENCABEZADOS_AMONESTACIONES);
  prepararHoja(HOJA_TERMINACIONES, ENCABEZADOS_TERMINACIONES);
  prepararHoja(HOJA_CAMBIOS_SALARIO, ENCABEZADOS_CAMBIOS_SALARIO);
  prepararHoja(HOJA_MOVIMIENTOS, ENCABEZADOS_MOVIMIENTOS);
  prepararHoja(HOJA_LIQUIDACIONES, ENCABEZADOS_LIQUIDACIONES);
  prepararHoja(HOJA_AGUINALDOS, ENCABEZADOS_AGUINALDOS);
  prepararHoja(HOJA_HORARIOS, ENCABEZADOS_HORARIOS);
  prepararHoja(HOJA_HORARIOS_ESTADO, ENCABEZADOS_HORARIOS_ESTADO);
  prepararHoja(HOJA_FERIADOS, ENCABEZADOS_FERIADOS);
  prepararHoja(HOJA_INCIDENCIAS, ENCABEZADOS_INCIDENCIAS);
  prepararHoja(HOJA_HORAS_EXTRA, ENCABEZADOS_HORAS_EXTRA);
  prepararHoja(HOJA_PLANILLAS, ENCABEZADOS_PLANILLAS);
  prepararHoja(HOJA_PLANILLAS_DETALLE, ENCABEZADOS_PLANILLAS_DETALLE);
  prepararHoja(HOJA_SERVICIO_REPARTOS, ENCABEZADOS_SERVICIO_REPARTOS);
  prepararHoja(HOJA_SERVICIO_DETALLE, ENCABEZADOS_SERVICIO_DETALLE);
  sembrarConfiguracion();
  sembrarRoles();
  sembrarFeriados();
}

// ── CALCULAR BALANCE INICIAL DE VACACIONES (correr UNA VEZ) ─────────
// Corré esta función UNA VEZ desde el editor de Apps Script (▶ con esta
// función seleccionada) para llenar la columna "Saldo vacaciones" de
// "Personal" con el saldo calculado de cada colaborador ACTIVO, como punto
// de partida inicial. Una vez corrida, ese saldo queda escrito en el Sheet y
// rrhh-control-vacaciones.html lo toma como base fija (ver calcularSaldo()
// ahí: si "Saldo vacaciones" > 0, tiene prioridad sobre el cálculo
// automático desde "Fecha ingreso") — las vacaciones que se aprueben de ahí
// en adelante se restan solas de ese saldo. No hace falta volver a correrla
// salvo que se quiera reiniciar el cálculo desde cero para todos.
//
// Regla legal (Código de Trabajo, Art. 153): 1 día por mes completo
// trabajado + 1 día extra si ya pasaron más de 20 días del mes en curso
// desde la fecha de ingreso — misma fórmula que calcularSaldo() usa en el
// navegador, replicada acá para que el saldo guardado coincida con lo que
// esa pantalla mostraría si no hubiera saldo manual. Se le restan los días
// ya tomados y Aprobados en la pestaña "Vacaciones".
function calcularBalanceVacacionesInicial() {
  const hojaPersonal = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  const personal = filasComoObjetos(hojaPersonal);
  const vacaciones = filasComoObjetos(prepararHoja(HOJA_VACACIONES, ENCABEZADOS_VACACIONES));

  const hoy = parsearFechaVac(hoyCR());
  const colSaldo = colPorEncabezado(hojaPersonal, 'Saldo vacaciones');
  if (!colSaldo) throw new Error('La columna "Saldo vacaciones" no existe en "Personal".');

  const resumen = [];
  personal.forEach(function (p, i) {
    const nombre = (p['Nombre completo'] || '').toString().trim();
    if (!nombre) return; // fila vacía

    const estado = (p['Estado'] || 'ACTIVO').toString().trim().toUpperCase();
    if (estado !== 'ACTIVO') return; // solo activos: a los inactivos ya se les liquidó

    const dIng = parsearFechaVac(p['Fecha ingreso']);
    if (!dIng) {
      resumen.push({ colaborador: nombre, error: 'Sin fecha de ingreso válida — no se calculó.' });
      return;
    }

    const diasTomados = vacaciones
      .filter(function (v) {
        const colab   = (v['Colaborador'] || '').toString().trim().toLowerCase();
        const estadoV = (v['Estado'] || '').toString().trim().toLowerCase();
        return colab === nombre.toLowerCase() && estadoV === 'aprobado';
      })
      .reduce(function (acc, v) { return acc + (Number(v['Días']) || 0); }, 0);

    const diasDevengados = diasDevengadosVac(dIng, hoy);
    const saldo = Math.max(0, diasDevengados - diasTomados);

    hojaPersonal.getRange(i + 2, colSaldo).setValue(saldo);
    resumen.push({ colaborador: nombre, diasDevengados: diasDevengados, diasTomados: diasTomados, saldo: saldo });
  });

  Logger.log(JSON.stringify(resumen, null, 2));
  return resumen;
}

// Mismo parseo que rrhh-control-vacaciones.html: toma solo "yyyy-MM-dd" (los
// primeros 10 caracteres) para no depender de si el valor quedó guardado en
// el Sheet como texto o como fecha real.
function parsearFechaVac(valor) {
  if (!valor) return null;
  const str = valorComoTexto(valor).trim().substring(0, 10);
  const partes = str.split('-');
  if (partes.length < 3) return null;
  const anio = parseInt(partes[0], 10);
  const mes  = parseInt(partes[1], 10) - 1;
  const dia  = parseInt(partes[2], 10);
  if (isNaN(anio) || isNaN(mes) || isNaN(dia)) return null;
  return new Date(anio, mes, dia);
}

// Misma regla que calcularSaldo() en rrhh-control-vacaciones.html: 1 día por
// mes completo + 1 día extra si ya pasaron más de 20 días del mes en curso.
function diasDevengadosVac(dIng, hoy) {
  let anios = hoy.getFullYear() - dIng.getFullYear();
  let meses = hoy.getMonth() - dIng.getMonth();
  let dias  = hoy.getDate() - dIng.getDate();

  if (dias < 0) meses--;
  if (meses < 0) { anios--; meses += 12; }

  const mesesCompletos = Math.max(0, anios * 12 + meses);

  let diasEnMesActual;
  if (dias >= 0) {
    diasEnMesActual = dias;
  } else {
    const diasEnMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate();
    diasEnMesActual = diasEnMesAnterior + dias;
  }

  const extra = diasEnMesActual > 20 ? 1 : 0;
  return mesesCompletos + extra;
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
  COLUMNAS_TEXTO_POR_HOJA[HOJA_HORARIOS] = ['Semana inicio', 'Fecha', 'Hora entrada', 'Hora salida', 'Hora entrada 2', 'Hora salida 2'];
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
  COLUMNAS_TEXTO_POR_HOJA[HOJA_PLANILLAS_DETALLE] = ['Fecha pago'];
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
      case 'permisos_sin_goce': hoja = prepararHoja(HOJA_PERMISOS_SIN_GOCE, ENCABEZADOS_PERMISOS_SIN_GOCE); break;
      case 'amonestaciones':  hoja = prepararHoja(HOJA_AMONESTACIONES, ENCABEZADOS_AMONESTACIONES); break;
      case 'terminaciones':   hoja = prepararHoja(HOJA_TERMINACIONES, ENCABEZADOS_TERMINACIONES); break;
      case 'cambios_salario': hoja = prepararHoja(HOJA_CAMBIOS_SALARIO, ENCABEZADOS_CAMBIOS_SALARIO); break;
      case 'movimientos':     hoja = prepararHoja(HOJA_MOVIMIENTOS, ENCABEZADOS_MOVIMIENTOS); break;
      case 'liquidaciones':   hoja = prepararHoja(HOJA_LIQUIDACIONES, ENCABEZADOS_LIQUIDACIONES); break;
      case 'aguinaldos':      hoja = prepararHoja(HOJA_AGUINALDOS, ENCABEZADOS_AGUINALDOS); break;
      case 'aguinaldo_calcular':
        // Preview del acumulado del periodo — misma función que usa
        // confirmarAguinaldo() para validar, así el preview y lo guardado
        // nunca se desincronizan. e.parameter.anio = año de CIERRE del
        // periodo (ej. 2026 para el periodo 1-dic-2025 a 30-nov-2026).
        return jsonOut({ ok: true, resultado: calcularAguinaldo(e.parameter.anio, e.parameter.kiosko) });
      case 'horarios':        hoja = prepararHoja(HOJA_HORARIOS, ENCABEZADOS_HORARIOS); break;
      case 'horarios_estado': hoja = prepararHoja(HOJA_HORARIOS_ESTADO, ENCABEZADOS_HORARIOS_ESTADO); break;
      case 'feriados':          hoja = prepararHoja(HOJA_FERIADOS, ENCABEZADOS_FERIADOS); break;
      case 'incidencias':       hoja = prepararHoja(HOJA_INCIDENCIAS, ENCABEZADOS_INCIDENCIAS); break;
      case 'horas_extra':       hoja = prepararHoja(HOJA_HORAS_EXTRA, ENCABEZADOS_HORAS_EXTRA); break;
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
        // "registros" trae todas las filas (para configuracion.html, que
        // también necesita ver los inactivos); "kioskos" trae solo los
        // nombres activos, en orden — eso es lo que consumen los selects
        // de cierres.html/rrhh*.html/horarios.html.
        return jsonOut(rrhhConCache('kioskos', function () {
          const h = prepararHoja(HOJA_CONFIGURACION, ENCABEZADOS_CONFIGURACION);
          return { ok: true, registros: filasComoObjetos(h), kioskos: obtenerKioskosActivos() };
        }));
      case 'roles':
        // Trae TODOS los roles (activos e inactivos) — admin-accesos.html
        // necesita ver los inactivos para poder reactivarlos; login.html
        // filtra a Activo=Sí del lado del cliente antes de comparar el PIN.
        hoja = prepararHoja(HOJA_ROLES, ENCABEZADOS_ROLES);
        break;
      default:
        return jsonOut({ ok: false, error: 'Módulo no reconocido: ' + modulo });
    }
    return jsonOut(rrhhConCache(modulo, function () {
      return { ok: true, registros: filasComoObjetos(hoja) };
    }));
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// === Cache de lecturas (2026-08-12) ====================================
// Mismo problema que en Code-cierres-kioskos-backend.gs: cada pantalla de
// RRHH (13 pantallas + planilla.html + index.html) vuelve a leer su hoja
// completa en cada carga, sin cache. Acá el doGet está centralizado en un
// solo switch por "modulo", así que un único wrapper alcanza para todos los
// casos que devuelven filas de una hoja (no se aplica a los "preview" que no
// leen una hoja completa: aguinaldo_calcular, planilla_calcular, acciones).
//
// A diferencia de Cierres (que invalida solo la llave puntual que tocó cada
// escritura), acá cualquier doPost exitoso limpia TODAS las llaves de RRHH
// de una vez (ver invalidarCacheRRHH() más abajo) — varias escrituras tocan
// más de una hoja a la vez (ej. una terminación cambia Personal Y
// Terminaciones; una planilla puede tocar Planillas Y PlanillasDetalle) y
// mapear cada acción a su hoja exacta es fácil de dejar desactualizado. Es
// una invalidación más generosa de lo estrictamente necesario, pero barata
// (removeAll de unas ~20 llaves) y evita mostrar datos viejos después de
// guardar algo.
var RRHH_CACHE_TTL_SEGUNDOS = 120;
var RRHH_CACHE_MODULOS = [
  'personal', 'vacaciones', 'permisos_sin_goce', 'amonestaciones', 'terminaciones',
  'cambios_salario', 'movimientos', 'liquidaciones', 'aguinaldos',
  'horarios', 'horarios_estado', 'feriados', 'incidencias', 'horas_extra',
  'planillas', 'planillas_detalle', 'servicio_repartos', 'servicio_detalle',
  'kioskos', 'roles'
];

function rrhhConCache(modulo, calcular) {
  var key = 'rrhh_' + modulo;
  var cache = CacheService.getScriptCache();
  try {
    var cached = cache.get(key);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* si falla la lectura de cache, seguimos y recalculamos */ }

  var resultado = calcular();

  try {
    cache.put(key, JSON.stringify(resultado), RRHH_CACHE_TTL_SEGUNDOS);
  } catch (e) {
    // Hojas muy grandes (Personal con muchas columnas, o históricos largos
    // de Incidencias/Horarios) pueden superar el límite de ~100KB por
    // llave de CacheService — en ese caso simplemente no se cachea esa
    // llave puntual, sin romper la respuesta.
  }

  return resultado;
}

function invalidarCacheRRHH() {
  try {
    CacheService.getScriptCache().removeAll(RRHH_CACHE_MODULOS.map(function (m) { return 'rrhh_' + m; }));
  } catch (e) { /* no crítico */ }
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
        v = (h === 'Hora entrada' || h === 'Hora salida' || h === 'Hora entrada 2' || h === 'Hora salida 2')
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
      case 'permiso_sin_goce':        result = crearSolicitudPermiso(payload); break;
      case 'permiso_sin_goce_estado': result = cambiarEstadoPermiso(payload); break;
      case 'amonestacion':          result = registrarAmonestacion(payload); break;
      case 'terminacion':           result = registrarTerminacion(payload); break;
      case 'cambio_salario':        result = registrarCambioSalario(payload); break;
      case 'confirmar_liquidacion': result = confirmarLiquidacion(payload); break;
      case 'aguinaldo_confirmar':   result = confirmarAguinaldo(payload); break;
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
      case 'horas_extra_guardar':   result = guardarSolicitudHorasExtra(payload); break;
      case 'horas_extra_estado':    result = cambiarEstadoHorasExtra(payload); break;
      case 'horas_extra_tipo':      result = cambiarTipoHorasExtra(payload); break;
      case 'planilla_guardar':      result = guardarPlanilla(payload); break;
      case 'planilla_abrir_periodo': result = abrirPeriodoPlanilla(payload); break;
      case 'planilla_enviar_revision':
        payload.estado = 'Pendiente de aprobación';
        result = guardarPlanilla(payload);
        break;
      case 'planilla_aprobar':      result = aprobarPlanilla(payload); break;
      case 'planilla_guardar_archivo': result = guardarArchivoPlanilla(payload); break;
      case 'planilla_pago':          result = marcarPlanillaPagado(payload); break;
      case 'planilla_enviar_boletas': result = enviarBoletasPago(payload); break;
      case 'servicio_guardar':      result = guardarServicioReparto(payload); break;
      case 'servicio_pago':         result = marcarServicioPagado(payload); break;
      default:
        throw new Error('Módulo no reconocido: ' + payload.modulo);
    }
    invalidarCacheRRHH();
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

// Agrega un renglón al histórico de movimientos del expediente (ver
// ENCABEZADOS_MOVIMIENTOS). La llaman las funciones que ya modifican datos
// sensibles de un colaborador (salario, puesto, departamento, kiosko,
// nombre, estado, terminación) — no tiene su propia acción en doPost.
// No lanza error si falta colaborador/tipo: es un registro "best effort"
// que nunca debe hacer fallar la operación principal que la invoca.
function registrarMovimiento(p) {
  if (!p || !p.colaborador || !p.tipo) return;
  const hoja = prepararHoja(HOJA_MOVIMIENTOS, ENCABEZADOS_MOVIMIENTOS);
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_MOVIMIENTOS, {
    'Colaborador': p.colaborador,
    'Tipo': p.tipo,
    'Valor anterior': (p.valor_anterior === undefined || p.valor_anterior === null) ? '' : p.valor_anterior,
    'Valor nuevo': (p.valor_nuevo === undefined || p.valor_nuevo === null) ? '' : p.valor_nuevo,
    'Motivo': p.motivo || '',
    'Fecha efectiva': p.fecha_efectiva || '',
    'Registrado por': p.registrado_por || '',
    'Registrado': p.registrado_en || new Date().toISOString()
  });
}

// Cambia solo el Estado (ACTIVO/INACTIVO) — usado por el toggle rápido de
// activar/desactivar en la pestaña "Personal".
function cambiarEstado(p) {
  if (!p.nombre) throw new Error('Falta el nombre del colaborador.');
  const hoja = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  const fila = filaColaborador(hoja, p.nombre);
  if (fila === -1) throw new Error('No se encontró ese colaborador.');
  const colEstado = colPorEncabezado(hoja, 'Estado');
  const estadoAnterior = hoja.getRange(fila, colEstado).getValue();
  const estadoNuevo = p.estado || 'INACTIVO';
  hoja.getRange(fila, colEstado).setValue(estadoNuevo);
  if (String(estadoAnterior || '') !== String(estadoNuevo)) {
    registrarMovimiento({
      colaborador: p.nombre, tipo: 'Estado',
      valor_anterior: estadoAnterior, valor_nuevo: estadoNuevo,
      registrado_por: p.registrado_por || ''
    });
  }
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

  // Registrar en el histórico de movimientos los campos "sensibles" que
  // cambiaron con esta edición (Estado y Salario quedan fuera a propósito,
  // igual que arriba: los registran cambiarEstado()/registrarCambioSalario()).
  [
    { tipo: 'Nombre',        antes: original,                    despues: nombreCompleto },
    { tipo: 'Puesto',        antes: valorActual('Puesto'),        despues: p.puesto || '' },
    { tipo: 'Departamento',  antes: valorActual('Departamento'),  despues: p.departamento || '' },
    { tipo: 'Kiosko',        antes: valorActual('Kiosko'),        despues: p.kiosko || '' }
  ].forEach(function (c) {
    const antes = String(c.antes || '').trim();
    const despues = String(c.despues || '').trim();
    if (antes !== despues) {
      registrarMovimiento({ colaborador: nombreCompleto, tipo: c.tipo, valor_anterior: antes, valor_nuevo: despues });
    }
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

// ── Permiso sin goce de salario (rrhh-permiso-sin-goce.html) ──────────
// Mismo mecanismo que crearSolicitudVacaciones/cambiarEstadoVacaciones:
// reportar y aprobar viven en la misma pantalla, el acceso se controla a
// nivel de módulo completo (admin-accesos.html). A diferencia de
// Vacaciones, "Motivo" es obligatorio.
function crearSolicitudPermiso(p) {
  if (!p.colaborador) throw new Error('Falta el colaborador.');
  if (!p.fecha_inicio || !p.fecha_fin) throw new Error('Faltan las fechas del permiso.');
  if (!p.motivo || !String(p.motivo).trim()) throw new Error('Falta el motivo del permiso.');
  const hoja = prepararHoja(HOJA_PERMISOS_SIN_GOCE, ENCABEZADOS_PERMISOS_SIN_GOCE);
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PERMISOS_SIN_GOCE, {
    'ID': p.id || Date.now(),
    'Colaborador': p.colaborador,
    'Fecha inicio': p.fecha_inicio || '',
    'Fecha fin': p.fecha_fin || '',
    'Días': Number(p.dias) || 0,
    'Motivo': String(p.motivo).trim(),
    'Estado': p.estado || 'Pendiente',
    'Registrado': p.registrado || p.registrado_en || new Date().toISOString()
  });
  return { fila: fila };
}

function cambiarEstadoPermiso(p) {
  if (!p.id) throw new Error('Falta el ID de la solicitud.');
  const hoja = prepararHoja(HOJA_PERMISOS_SIN_GOCE, ENCABEZADOS_PERMISOS_SIN_GOCE);
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
  const esTardia = p.motivo_categoria === 'Llegada tardía';
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
    'Registrado': p.registrado_en || new Date().toISOString(),
    'Motivo categoría': p.motivo_categoria || '',
    'Horas tardanza': esTardia ? (Number(p.horas_tardanza) || 0) : ''
  });
  return { fila: fila };
}

// Suma las horas de "Llegada tardía" registradas en Amonestaciones para un
// colaborador cuya Fecha cae dentro de [fechaInicio, fechaFin] (la quincena
// que se está abriendo en planilla.html). Se usa para descontar ese tiempo
// de "Horas regulares" al abrir el periodo — ver abrirPeriodoPlanilla().
// Devuelve { horas, fechas } — fechas es la lista de fechas que aportaron,
// para armar el comentario de la incidencia.
function sumarHorasTardanza(colaborador, fechaInicio, fechaFin) {
  const resultado = { horas: 0, fechas: [] };
  if (!colaborador || !fechaInicio || !fechaFin) return resultado;
  const hoja = prepararHoja(HOJA_AMONESTACIONES, ENCABEZADOS_AMONESTACIONES);
  const buscado = String(colaborador).trim().toLowerCase();
  filasComoObjetos(hoja).forEach(function (row) {
    if (String(row['Colaborador'] || '').trim().toLowerCase() !== buscado) return;
    if (String(row['Motivo categoría'] || '') !== 'Llegada tardía') return;
    const fecha = valorComoTexto(row['Fecha'] || '');
    if (!fecha || fecha < fechaInicio || fecha > fechaFin) return;
    const horas = Number(row['Horas tardanza']) || 0;
    if (horas <= 0) return;
    resultado.horas += horas;
    resultado.fechas.push(fecha);
  });
  return resultado;
}

// ── SolicitudesHorasExtra (rrhh-horas-extra.html) ──────────────────────
// Reporte de horas extra por fecha puntual con nivel de aprobación: se
// reporta 'Pendiente' y solo cuenta para el pago de planilla una vez que
// alguien la marca 'Aprobada' (ver sumarHorasExtraAprobadas(), usada por
// calcularPlanilla()). Mismo patrón que Vacaciones (crearSolicitudVacaciones
// / cambiarEstadoVacaciones): reportar y aprobar viven en la misma pantalla,
// el acceso se controla a nivel de módulo completo (admin-accesos.html).
function guardarSolicitudHorasExtra(p) {
  if (!p.colaborador) throw new Error('Falta el colaborador.');
  if (!p.fecha) throw new Error('Falta la fecha.');
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  const horas = Number(p.horas) || 0;
  if (horas <= 0) throw new Error('Ingresá la cantidad de horas extra.');
  if (!p.justificacion || !String(p.justificacion).trim()) throw new Error('Falta la justificación de las horas extra.');

  const hoja = prepararHoja(HOJA_HORAS_EXTRA, ENCABEZADOS_HORAS_EXTRA);
  const ahora = new Date().toISOString();
  const fila = agregarFilaPorEncabezado(hoja, ENCABEZADOS_HORAS_EXTRA, {
    'ID': p.id || Date.now(),
    'Fecha': p.fecha,
    'Colaborador': p.colaborador,
    'Kiosko': p.kiosko,
    'Horas': horas,
    'Justificación': String(p.justificacion).trim(),
    'Estado': 'Pendiente',
    'Aprobado por': '',
    'Registrado': ahora,
    'Actualizado': ahora,
    'Tipo pago': ''
  });
  return { fila: fila };
}

// Aprobar/Rechazar una solicitud — mismo mecanismo que cambiarEstadoVacaciones,
// pero además deja registro de quién resolvió y cuándo (columnas propias de
// esta hoja) para trazabilidad del nivel de aprobación.
function cambiarEstadoHorasExtra(p) {
  if (!p.id) throw new Error('Falta el ID de la solicitud.');
  const hoja = prepararHoja(HOJA_HORAS_EXTRA, ENCABEZADOS_HORAS_EXTRA);
  const fila = filaPorColumna(hoja, ENCABEZADOS_HORAS_EXTRA, 'ID', p.id);
  if (fila === -1) throw new Error('No se encontró la solicitud ' + p.id);
  const colEstado = colPorEncabezado(hoja, 'Estado');
  const colAprobadoPor = colPorEncabezado(hoja, 'Aprobado por');
  const colActualizado = colPorEncabezado(hoja, 'Actualizado');
  hoja.getRange(fila, colEstado).setValue(p.estado || 'Pendiente');
  if (colAprobadoPor) hoja.getRange(fila, colAprobadoPor).setValue(p.aprobado_por || '');
  if (colActualizado) hoja.getRange(fila, colActualizado).setValue(new Date().toISOString());
  return { fila: fila };
}

// Define (o cambia) si una solicitud se paga con recargo del 50% (ordinario)
// o del 100% (feriado/descanso trabajado) — la decisión que antes se pedía
// al reportar (dos campos separados) y desde la fusión 2026-08-08 se toma
// acá, al calcular la planilla (planilla.html, Paso 2, detalle de "Horas
// extra" de cada colaborador). No valida que la solicitud esté 'Aprobada':
// se puede dejar definido de antemano sin que eso la apruebe.
function cambiarTipoHorasExtra(p) {
  if (!p.id) throw new Error('Falta el ID de la solicitud.');
  if (p.tipo !== '50%' && p.tipo !== '100%') throw new Error('Tipo de pago inválido: ' + p.tipo);
  const hoja = prepararHoja(HOJA_HORAS_EXTRA, ENCABEZADOS_HORAS_EXTRA);
  const fila = filaPorColumna(hoja, ENCABEZADOS_HORAS_EXTRA, 'ID', p.id);
  if (fila === -1) throw new Error('No se encontró la solicitud ' + p.id);
  const colTipo = colPorEncabezado(hoja, 'Tipo pago');
  const colActualizado = colPorEncabezado(hoja, 'Actualizado');
  hoja.getRange(fila, colTipo).setValue(p.tipo);
  if (colActualizado) hoja.getRange(fila, colActualizado).setValue(new Date().toISOString());
  return { fila: fila };
}

// Suma las horas extra 'Aprobada' de un colaborador cuya Fecha cae dentro de
// [fechaInicio, fechaFin] (la quincena de planilla) — única fuente de horas
// extra para el pago desde 2026-08-01 (ver calcularPlanilla()). Las
// 'Pendiente'/'Rechazada' NO suman. Devuelve también fechas/justificaciones
// para mostrar de dónde salió el monto (Paso 2 de planilla.html).
//
// Desde la fusión 2026-08-08 cada fila trae un solo total en 'Horas' + un
// 'Tipo pago' ('50%'/'100%', definido en planilla.html) que decide en cuál
// de los dos baldes (horas50/horas100) cae — sin tipo definido se asume
// '50%' para no bloquear el cálculo, pero esas horas quedan contadas también
// en 'pendientesTipo' para que la pantalla pueda avisar que falta revisarlas.
// Filas de ANTES de la fusión no tienen 'Horas' (quedó vacío) y siguen
// leyéndose de las columnas legacy 'Horas extra 50%'/'Horas extra 100%'.
function sumarHorasExtraAprobadas(colaborador, fechaInicio, fechaFin) {
  const resultado = { horas50: 0, horas100: 0, fechas: [], justificaciones: [], pendientesTipo: 0 };
  if (!colaborador || !fechaInicio || !fechaFin) return resultado;
  const hoja = prepararHoja(HOJA_HORAS_EXTRA, ENCABEZADOS_HORAS_EXTRA);
  const buscado = String(colaborador).trim().toLowerCase();
  filasComoObjetos(hoja).forEach(function (row) {
    if (String(row['Colaborador'] || '').trim().toLowerCase() !== buscado) return;
    if (String(row['Estado'] || '').trim().toLowerCase() !== 'aprobada') return;
    const fecha = valorComoTexto(row['Fecha'] || '');
    if (!fecha || fecha < fechaInicio || fecha > fechaFin) return;

    const horas = Number(row['Horas']) || 0;
    if (horas > 0) {
      const tipo = String(row['Tipo pago'] || '').trim();
      if (tipo === '100%') {
        resultado.horas100 += horas;
      } else {
        resultado.horas50 += horas;
        if (tipo !== '50%') resultado.pendientesTipo += horas;
      }
    } else {
      const h50 = Number(row['Horas extra 50%']) || 0;
      const h100 = Number(row['Horas extra 100%']) || 0;
      if (h50 <= 0 && h100 <= 0) return;
      resultado.horas50 += h50;
      resultado.horas100 += h100;
    }
    resultado.fechas.push(fecha);
    if (row['Justificación']) resultado.justificaciones.push(fecha + ': ' + row['Justificación']);
  });
  return resultado;
}

// Trae, para un colaborador+kiosko+rango de fechas, el Servicio 10%/Tips
// PENDIENTE de pago (Pagado != 'Sí') registrado en ServicioRepartoDetalle
// (servicio-10.html) — usado por calcularPlanilla() para la sección
// "Servicio 10% y Tips" del wizard (automática desde 2026-08-15, antes era
// monto manual). Devuelve también los 'ID Detalle' incluidos, para que
// aprobarPlanilla() los marque como pagados vía marcarServicioPagado() y no
// se vuelvan a ofrecer como pendientes en servicio-10.html (evita pago
// doble entre los dos módulos).
function sumarServicio10Pendiente(colaborador, kiosko, fechaInicio, fechaFin) {
  const resultado = { montoServicio: 0, montoTips: 0, ids: [], fechas: [] };
  if (!colaborador || !kiosko || !fechaInicio || !fechaFin) return resultado;
  const hoja = prepararHoja(HOJA_SERVICIO_DETALLE, ENCABEZADOS_SERVICIO_DETALLE);
  const buscado = String(colaborador).trim().toLowerCase();
  filasComoObjetos(hoja).forEach(function (row) {
    if (String(row['Colaborador'] || '').trim().toLowerCase() !== buscado) return;
    if (!kioskosIguales(row['Kiosko'], kiosko)) return;
    if (String(row['Pagado'] || '').trim().toLowerCase() === 'sí') return;
    const fecha = valorComoTexto(row['Fecha'] || '').slice(0, 10);
    if (!fecha || fecha < fechaInicio || fecha > fechaFin) return;
    resultado.montoServicio += Number(row['Monto Servicio ₡']) || 0;
    resultado.montoTips += Number(row['Monto Tips ₡']) || 0;
    resultado.ids.push(row['ID Detalle']);
    resultado.fechas.push(fecha);
  });
  return resultado;
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
  let estadoAnterior = '';
  if (filaP !== -1) {
    const colEstado = colPorEncabezado(hojaPersonal, 'Estado');
    estadoAnterior = hojaPersonal.getRange(filaP, colEstado).getValue();
    hojaPersonal.getRange(filaP, colEstado).setValue(p.nuevo_estado || 'LIQUIDACIÓN');
  }
  registrarMovimiento({
    colaborador: p.colaborador, tipo: 'Terminación',
    valor_anterior: estadoAnterior, valor_nuevo: p.nuevo_estado || 'LIQUIDACIÓN',
    motivo: p.tipo_terminacion || '', fecha_efectiva: p.fecha_salida || '',
    registrado_en: p.registrado_en
  });
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
  registrarMovimiento({
    colaborador: p.colaborador, tipo: 'Salario',
    valor_anterior: Number(p.salario_actual) || 0, valor_nuevo: Number(p.salario_nuevo) || 0,
    motivo: p.motivo || '', fecha_efectiva: p.fecha_efectiva || '',
    registrado_por: p.registrado_por || '', registrado_en: p.registrado_en
  });
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

// ── AGUINALDO (rrhh-aguinaldo.html) ───────────────────────────────
// Devuelve las fechas límite (strings "yyyy-MM-dd") del periodo de
// aguinaldo que CIERRA en `anioFin` — Ley 1788: del 1 de diciembre del año
// anterior al 30 de noviembre de `anioFin`.
function rangoAguinaldo(anioFin) {
  const anio = Number(anioFin);
  if (!anio) throw new Error('Falta el año de cierre del periodo de aguinaldo.');
  return {
    anio: anio,
    fechaInicio: (anio - 1) + '-12-01',
    fechaFin: anio + '-11-30',
    periodo: (anio - 1) + '-12-01_a_' + anio + '-11-30'
  };
}

// Acumula, por Kiosko + Colaborador, la "Base CCSS utilizada" de cada
// quincena de planilla APROBADA cuyo rango cae dentro del periodo de
// aguinaldo — esa base es, por definición, "el total de ingresos calculados
// en la planilla para el cálculo de la CCSS" que pidió el usuario (ver
// calcularPlanilla() en el módulo de Planilla: es el total de ingresos menos
// los montos que no cotizan CCSS — subsidios e incapacidades). El monto de
// aguinaldo es esa suma entre 12 (Ley 1788: doceava parte de lo devengado en
// el periodo). Si `kioskoFiltro` viene vacío, trae todos los kioskos.
// También asegura que aparezca cada colaborador ACTIVO del kiosko con
// asignación fija aunque todavía no tenga ninguna planilla aprobada en el
// periodo (monto en 0, para que no quede invisible en el listado), y cruza
// contra "Aguinaldos" para marcar si ese periodo ya se confirmó como pagado.
function calcularAguinaldo(anioFin, kioskoFiltro) {
  const r = rangoAguinaldo(anioFin);
  const kioskoNorm = kioskoFiltro ? String(kioskoFiltro).trim().toLowerCase() : '';

  const hojaPlanillas = prepararHoja(HOJA_PLANILLAS, ENCABEZADOS_PLANILLAS);
  const idsPlanillasDelPeriodo = {}; // ID Planilla -> Kiosko
  filasComoObjetos(hojaPlanillas).forEach(function (row) {
    if (String(row['Estado']) !== 'Aprobada') return;
    const ini = valorComoTexto(row['Fecha inicio']).slice(0, 10);
    const fin = valorComoTexto(row['Fecha fin']).slice(0, 10);
    if (ini < r.fechaInicio || fin > r.fechaFin) return;
    const kiosko = String(row['Kiosko'] || '').trim();
    if (kioskoNorm && kiosko.toLowerCase() !== kioskoNorm) return;
    idsPlanillasDelPeriodo[row['ID']] = kiosko;
  });

  const acumulado = {}; // key "Kiosko||Colaborador" -> { kiosko, colaborador, puesto, baseCcss, quincenas }
  const hojaDetalle = prepararHoja(HOJA_PLANILLAS_DETALLE, ENCABEZADOS_PLANILLAS_DETALLE);
  filasComoObjetos(hojaDetalle).forEach(function (d) {
    const kiosko = idsPlanillasDelPeriodo[d['ID Planilla']];
    if (kiosko === undefined) return;
    const colaborador = String(d['Colaborador'] || '').trim();
    if (!colaborador) return;
    const key = kiosko + '||' + colaborador;
    if (!acumulado[key]) acumulado[key] = { kiosko: kiosko, colaborador: colaborador, puesto: d['Puesto'] || '', baseCcss: 0, quincenas: 0 };
    acumulado[key].baseCcss += Number(d['Base CCSS utilizada']) || 0;
    acumulado[key].quincenas += 1;
    if (d['Puesto']) acumulado[key].puesto = d['Puesto'];
  });

  const hojaPersonal = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  filasComoObjetos(hojaPersonal).forEach(function (p) {
    if (String(p['Estado'] || '').toUpperCase() !== 'ACTIVO') return;
    const kiosko = String(p['Kiosko'] || '').trim();
    if (!kiosko) return; // rotativo sin kiosko fijo: no se puede ubicar en la tabla por kiosko
    if (kioskoNorm && kiosko.toLowerCase() !== kioskoNorm) return;
    const colaborador = String(p['Nombre completo'] || '').trim();
    if (!colaborador) return;
    const key = kiosko + '||' + colaborador;
    if (!acumulado[key]) acumulado[key] = { kiosko: kiosko, colaborador: colaborador, puesto: p['Puesto'] || '', baseCcss: 0, quincenas: 0 };
  });

  const hojaAguinaldos = prepararHoja(HOJA_AGUINALDOS, ENCABEZADOS_AGUINALDOS);
  const yaConfirmados = {};
  filasComoObjetos(hojaAguinaldos).forEach(function (a) {
    if (String(a['Periodo aguinaldo']) !== r.periodo) return;
    yaConfirmados[String(a['Kiosko'] || '').trim() + '||' + String(a['Colaborador'] || '').trim()] = a;
  });

  const colaboradores = Object.keys(acumulado).map(function (key) {
    const c = acumulado[key];
    const confirmado = yaConfirmados[key];
    return {
      kiosko: c.kiosko,
      colaborador: c.colaborador,
      puesto: c.puesto,
      base_ccss_acumulada: c.baseCcss,
      quincenas_incluidas: c.quincenas,
      monto_aguinaldo: c.baseCcss / 12,
      pagado: !!confirmado,
      monto_pagado: confirmado ? Number(confirmado['Monto aguinaldo']) || 0 : 0,
      fecha_pago: confirmado ? confirmado['Fecha pago'] || '' : '',
      confirmado_por: confirmado ? confirmado['Confirmado por'] || '' : ''
    };
  }).sort(function (a, b) {
    return a.kiosko.localeCompare(b.kiosko) || a.colaborador.localeCompare(b.colaborador);
  });

  return { periodo: r.periodo, fecha_inicio: r.fechaInicio, fecha_fin: r.fechaFin, colaboradores: colaboradores };
}

// Registra el pago de aguinaldo confirmado para un colaborador de un
// periodo (upsert por Periodo aguinaldo + Kiosko + Colaborador, mismo
// patrón que guardarPlanilla/guardarServicioReparto). Guarda un snapshot de
// la base y el monto usados al momento de confirmar, para que quede
// histórico aunque después se recalculen o corrijan planillas del periodo.
function confirmarAguinaldo(p) {
  if (!p.colaborador) throw new Error('Falta el colaborador.');
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.periodo) throw new Error('Falta el periodo de aguinaldo.');
  if (!p.fecha_pago) throw new Error('Falta la fecha de pago.');
  if (!p.confirmado_por) throw new Error('Falta quién confirma el pago.');

  const hoja = prepararHoja(HOJA_AGUINALDOS, ENCABEZADOS_AGUINALDOS);
  eliminarFilasPorCriterios(hoja, { 'Periodo aguinaldo': p.periodo, 'Kiosko': p.kiosko, 'Colaborador': p.colaborador });

  const id = 'agu_' + Date.now();
  agregarFilaPorEncabezado(hoja, ENCABEZADOS_AGUINALDOS, {
    'ID': id,
    'Periodo aguinaldo': p.periodo,
    'Colaborador': p.colaborador,
    'Kiosko': p.kiosko,
    'Puesto': p.puesto || '',
    'Base CCSS acumulada': Number(p.base_ccss_acumulada) || 0,
    'Quincenas incluidas': Number(p.quincenas_incluidas) || 0,
    'Monto aguinaldo': Number(p.monto_aguinaldo) || 0,
    'Fecha pago': p.fecha_pago,
    'Confirmado por': p.confirmado_por,
    'Notas': p.notas || '',
    'Registrado': new Date().toISOString()
  });
  return { id: id };
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

// Como filaPorColumna pero matcheando varias columnas a la vez (ej. "Semana
// inicio" + "Kiosko"). Devuelve la fila 1-indexada o -1 si no existe.
function filaPorCriterios(hoja, criterios) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const nCols = hoja.getLastColumn();
  const encabezados = hoja.getRange(1, 1, 1, nCols).getValues()[0];
  const datos = hoja.getRange(2, 1, nFilas, nCols).getValues();
  const claves = Object.keys(criterios);
  for (let i = 0; i < datos.length; i++) {
    const coincide = claves.every(function (clave) {
      const idx = encabezados.indexOf(clave);
      return idx !== -1 && valorComoTexto(datos[i][idx]).trim().toLowerCase() === String(criterios[clave]).trim().toLowerCase();
    });
    if (coincide) return i + 2;
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

// Igual que agregarFilaPorEncabezado pero para muchas filas a la vez: una
// sola lectura de encabezados + un solo setValues para todo el bloque, en
// vez de un par de llamadas a Sheets por fila. Usar cuando se insertan
// varias filas seguidas (p. ej. detalle de Servicio 10% por colaborador) —
// escribir fila por fila ahí es lo que hacía que "Cerrar cálculo" se
// tardara tanto que el fetch del navegador se agotaba (30s) aunque el
// guardado en Sheets siguiera corriendo del lado del servidor.
function agregarFilasPorEncabezado(hoja, encabezadosEsperados, listaValores) {
  if (!listaValores || !listaValores.length) return;
  const nCols = Math.max(hoja.getLastColumn(), encabezadosEsperados.length);
  const encabezadosReales = hoja.getRange(1, 1, 1, nCols).getValues()[0];
  const filas = listaValores.map(function (valores) {
    return encabezadosReales.map(function (h) { return (h && (h in valores)) ? valores[h] : ''; });
  });
  const filaInicio = hoja.getLastRow() + 1;
  hoja.getRange(filaInicio, 1, filas.length, encabezadosReales.length).setValues(filas);
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
      'Detalle': d.detalle || '',
      'Hora entrada 2': d.entrada2 || '',
      'Hora salida 2': d.salida2 || ''
    });
  });

  return { semana: p.semana_inicio, filas: p.dias.length };
}

function cambiarEstadoHorarioSemana(p, cerrado) {
  if (!p.semana_inicio) throw new Error('Falta la semana (semana_inicio).');
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  const hoja = prepararHoja(HOJA_HORARIOS_ESTADO, ENCABEZADOS_HORARIOS_ESTADO);
  // Match por Semana + Kiosko (no solo Semana): cada kiosko cierra/reabre su
  // propio horario sin afectar a los demás. Filas viejas sin "Kiosko" (antes
  // de este cambio) simplemente quedan huérfanas y ya no se vuelven a matchear.
  const fila = filaPorCriterios(hoja, { 'Semana inicio': p.semana_inicio, 'Kiosko': p.kiosko });

  // Al cerrar, si el front-end mandó el PDF ya generado, guardarlo en Drive.
  // Al reabrir se limpia la URL: el contenido puede cambiar antes del próximo
  // cierre, así que el PDF viejo queda obsoleto hasta que se vuelva a cerrar.
  let pdfUrl = '';
  if (cerrado === 'Sí' && p.pdf_base64) {
    pdfUrl = guardarPDFHorarioEnDrive(p.semana_inicio, p.pdf_base64, p.kiosko);
  }

  const valores = {
    'Semana inicio': p.semana_inicio,
    'Kiosko': p.kiosko,
    'Cerrado': cerrado,
    'Actualizado': new Date().toISOString(),
    'PDF URL': pdfUrl
  };
  if (fila !== -1) {
    escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_HORARIOS_ESTADO, valores);
  } else {
    agregarFilaPorEncabezado(hoja, ENCABEZADOS_HORARIOS_ESTADO, valores);
  }
  return { semana: p.semana_inicio, kiosko: p.kiosko, cerrado: cerrado, pdf_url: pdfUrl };
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
    'Registrado': p.registrado_en || new Date().toISOString(),
    'Cédula Jurídica': p.cedula_juridica || '',
    'Nombre Jurídico': p.nombre_juridico || '',
    'Correo Facturas': p.correo_facturas || '',
    'Actividad Económica': p.actividad_economica || ''
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
    'Comentario horas regulares': p.comentario_horas_regulares || '',
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
    'CCSS base ajustada': (p.ccss_base_ajustada === undefined || p.ccss_base_ajustada === '' || p.ccss_base_ajustada === null) ? '' : Number(p.ccss_base_ajustada),
    'Es extra': p.es_extra || 'No',
    'Servicio 10% incluir': p.servicio10_incluir || 'No',
    'Servicio 10% fecha inicio': p.servicio10_fecha_inicio || '',
    'Servicio 10% fecha fin': p.servicio10_fecha_fin || '',
    'Comentario servicio 10': p.comentario_servicio10 || ''
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

  // Permisos sin goce aprobados — mismo criterio que vacacionesAprobadas.
  // A diferencia de vacaciones, sus días NO generan un monto propio (por
  // eso no aparece pagado en ningún lado): solo restan de "Horas
  // regulares" vía diasNoTrabajadosAuto más abajo, para que ese día quede
  // efectivamente sin goce de salario.
  const permisosAprobados = filasComoObjetos(prepararHoja(HOJA_PERMISOS_SIN_GOCE, ENCABEZADOS_PERMISOS_SIN_GOCE))
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

    // Colaborador extra (agregado con "+ Agregar colaborador extra" en el
    // wizard, Paso 1, por búsqueda o con datos nuevos): sus vacaciones/horas
    // extra/incapacidades registradas NO se consideran en esta planilla —
    // pertenecen a su kiosko nativo (o, si no tiene ficha en Personal, no
    // hay expediente contra el cual traerlas). Vacío/'No' (filas guardadas
    // antes de este campo) = comportamiento histórico, sin cambios. Mismo
    // criterio en el cliente (planilla.html, calcularClientePreview).
    const esExtra = String(inc['Es extra'] || '').trim().toLowerCase().indexOf('s') === 0;

    // Horas extra: SOLO cuenta lo reportado y ya 'Aprobada' en
    // SolicitudesHorasExtra dentro de esta quincena (rrhh-horas-extra.html)
    // — 'Horas extra 50%/100%' de Incidencias quedaron como columnas legacy,
    // ya no se leen acá. Ver sumarHorasExtraAprobadas(). Colaborador extra:
    // no se le suma nada acá (ver esExtra arriba).
    const horasExtra = esExtra
      ? { horas50: 0, horas100: 0, fechas: [], justificaciones: [] }
      : sumarHorasExtraAprobadas(nombre, fechaInicioStr, fechaFinStr);
    const extra50Horas = horasExtra.horas50;
    const extra100Horas = horasExtra.horas100;
    const extra50Monto = extra50Horas * salarioHora * 1.5;
    const extra100Monto = extra100Horas * salarioHora * 2;

    // Tardanza: horas de "Llegada tardía" registradas en Amonestaciones con
    // fecha dentro de esta quincena — se muestran como línea propia en
    // negativo dentro de Ingresos (en vez de restarse en silencio de "Horas
    // regulares" al abrir el periodo, como antes) y se descuentan del total.
    const tardanza = sumarHorasTardanza(nombre, fechaInicioStr, fechaFinStr);
    const tardanzaHoras = tardanza.horas;
    const tardanzaMonto = tardanzaHoras * salarioHora;

    // Feriados: el día del feriado ya está cubierto por el salario base de
    // la quincena (Horas regulares) — un feriado NO trabajado no suma nada
    // extra. Si SÍ está marcado como trabajado en la incidencia, se paga el
    // recargo de ley: 1 día de salario extra por encima del salario base
    // (Art. 148 CT).
    let feriadosTrabajados = [];
    try { feriadosTrabajados = JSON.parse(inc['Feriados trabajados'] || '[]'); } catch (err) { feriadosTrabajados = []; }
    const feriadosMonto = feriadosEnPeriodo.reduce(function (acc, f) {
      const fechaFeriado = valorComoTexto(f['Fecha']);
      const trabajado = feriadosTrabajados.indexOf(fechaFeriado) !== -1;
      return acc + (trabajado ? salarioDiario : 0);
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
    const ccssIni = esExtra ? null : parseFechaISO(inc['Incapacidad CCSS fecha inicio']);
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
    const insIni = esExtra ? null : parseFechaISO(inc['Incapacidad INS fecha inicio']);
    if (insIni) {
      const insFin = parseFechaISO(inc['Incapacidad INS fecha fin']) || insIni;
      diasINSEnPeriodo = diasInterseccion(insIni, insFin, fechaInicio, fechaFin);
    }
    const incapINSMonto = 0;

    // Incapacidad interna: política propia de la empresa (no respaldada por
    // CCSS/INS), % editable por incidencia — default 100%.
    let incapInternaMonto = 0, diasInternaEnPeriodo = 0;
    const internaIni = esExtra ? null : parseFechaISO(inc['Incapacidad interna fecha inicio']);
    const internaFin = esExtra ? null : parseFechaISO(inc['Incapacidad interna fecha fin']);
    if (internaIni && internaFin) {
      diasInternaEnPeriodo = diasInterseccion(internaIni, internaFin, fechaInicio, fechaFin);
      const pct = (inc['Incapacidad interna %'] === '' || inc['Incapacidad interna %'] === undefined) ? 100 : Number(inc['Incapacidad interna %']);
      incapInternaMonto = diasInternaEnPeriodo * salarioDiario * (pct / 100);
    }

    // Vacaciones: automático desde "Vacaciones" (Estado=Aprobado) — no se
    // ingresa a mano en Incidencias. Colaborador extra: no se le consideran
    // (ver esExtra arriba).
    const vacacionesDias = esExtra ? 0 : vacacionesAprobadas
      .filter(function (v) { return (v['Colaborador'] || '') === nombre; })
      .reduce(function (acc, v) {
        return acc + diasInterseccion(parseFechaISO(v['Fecha inicio']), parseFechaISO(v['Fecha fin']), fechaInicio, fechaFin);
      }, 0);
    const vacacionesMonto = vacacionesDias * salarioDiario;

    // Permiso sin goce de salario: automático desde "PermisosSinGoce"
    // (Estado=Aprobado) — igual que vacaciones, no se ingresa a mano en
    // Incidencias. Sin monto propio (sin goce = ₡0 esos días): solo cuenta
    // para "días no trabajados" más abajo.
    const permisoDias = esExtra ? 0 : permisosAprobados
      .filter(function (v) { return (v['Colaborador'] || '') === nombre; })
      .reduce(function (acc, v) {
        return acc + diasInterseccion(parseFechaISO(v['Fecha inicio']), parseFechaISO(v['Fecha fin']), fechaInicio, fechaFin);
      }, 0);

    // Subsidio de alimentación/transporte — no forma parte de la base de
    // cotización de CCSS (se resta antes de calcular la cuota obrera).
    const subsidioMonto = (Number(inc['Subsidio monto por día']) || 0) * (Number(inc['Subsidio días']) || 0);

    // Servicio 10% y Tips (sección "Servicio 10% y Tips" del Paso 2):
    // automático desde ServicioRepartoDetalle (servicio-10.html) — solo lo
    // PENDIENTE de pago (Pagado != 'Sí') dentro del rango de fechas elegido
    // ahí (si no se eligió rango, usa el de esta quincena) — ver
    // sumarServicio10Pendiente(). Ni el Servicio 10% ni los Tips entran a la
    // base de cotización de CCSS (decisión de Jorge, 2026-08-15) — ver
    // baseCCSSAuto más abajo. Aplica también a colaboradores extra (no
    // depende de esExtra). Al aprobar la planilla (aprobarPlanilla), los
    // 'ID Detalle' incluidos se marcan pagados en ServicioRepartoDetalle
    // para no ofrecerlos de nuevo en servicio-10.html (evita pago doble).
    const servicio10Incluir = String(inc['Servicio 10% incluir'] || '').trim().toLowerCase().indexOf('s') === 0;
    const servicio10FechaIniStr = valorComoTexto(inc['Servicio 10% fecha inicio'] || '') || fechaInicioStr;
    const servicio10FechaFinStr = valorComoTexto(inc['Servicio 10% fecha fin'] || '') || fechaFinStr;
    const servicio10Pendiente = servicio10Incluir
      ? sumarServicio10Pendiente(nombre, kiosko, servicio10FechaIniStr, servicio10FechaFinStr)
      : { montoServicio: 0, montoTips: 0, ids: [], fechas: [] };
    const servicio10Monto = servicio10Pendiente.montoServicio;
    const tipsMonto = servicio10Pendiente.montoTips;

    // Días no trabajados = manual (otras ausencias, ej. injustificada) +
    // automático (cada día de incapacidad de cualquier tipo y cada día de
    // vacaciones dentro del periodo) — sin esto, "Horas regulares" (pensado
    // como el total de la quincena) pagaría esos días completos ADEMÁS del
    // pago específico de la incapacidad/vacación (pago doble).
    const diasNoTrabajadosAuto = diasCCSSEnPeriodo + diasINSEnPeriodo + diasInternaEnPeriodo + vacacionesDias + permisoDias;
    const diasNoTrabajadosManual = Number(inc['Días no trabajados']) || 0;
    const diasNoTrabajadosTotal = diasNoTrabajadosAuto + diasNoTrabajadosManual;
    const diasNoTrabajadosMonto = diasNoTrabajadosTotal * salarioDiario;

    const totalIngresos = horasRegularesMonto + extra50Monto + extra100Monto + feriadosMonto
      + incapCCSSMonto + incapINSMonto + incapInternaMonto + vacacionesMonto + subsidioMonto
      + servicio10Monto + tipsMonto
      - diasNoTrabajadosMonto - tardanzaMonto;

    // Base de CCSS: excluye el subsidio, el Servicio 10%, los Tips (ninguno
    // de los tres es salario sujeto a la cuota obrera, decisión de Jorge) y
    // los 3 montos de incapacidad. Editable por incidencia ('CCSS base
    // ajustada'), si no se guardó ninguna se usa la automática.
    const baseCCSSAuto = Math.max(totalIngresos - subsidioMonto - incapCCSSMonto - incapINSMonto - incapInternaMonto - servicio10Monto - tipsMonto, 0);
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
      colaborador: nombre, puesto: puesto, esManual: esManual, esExtra: esExtra,
      salario: salario, salarioDiario: salarioDiario, salarioHora: salarioHora,
      horasRegularesMonto: horasRegularesMonto,
      extra50Horas: extra50Horas, extra50Monto: extra50Monto,
      extra100Horas: extra100Horas, extra100Monto: extra100Monto,
      extraFechas: horasExtra.fechas, extraJustificaciones: horasExtra.justificaciones,
      feriadosMonto: feriadosMonto, incapCCSSMonto: incapCCSSMonto, incapINSMonto: incapINSMonto,
      incapInternaMonto: incapInternaMonto, vacacionesMonto: vacacionesMonto, vacacionesDias: vacacionesDias,
      permisoDias: permisoDias,
      subsidioMonto: subsidioMonto, servicio10Monto: servicio10Monto, tipsMonto: tipsMonto,
      servicio10Ids: servicio10Pendiente.ids,
      diasNoTrabajadosAuto: diasNoTrabajadosAuto, diasNoTrabajadosManual: diasNoTrabajadosManual,
      diasNoTrabajadosTotal: diasNoTrabajadosTotal, diasNoTrabajadosMonto: diasNoTrabajadosMonto,
      tardanzaHoras: tardanzaHoras, tardanzaMonto: tardanzaMonto, tardanzaFechas: tardanza.fechas,
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
      'Tardanza horas': c.tardanzaHoras,
      'Tardanza monto': c.tardanzaMonto,
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
      'CCSS registrado': c.ccssRegistrado ? 'Sí' : 'No',
      'Pagado': 'No',
      'Fecha pago': '',
      'Horas extra 50%': c.extra50Horas,
      'Horas extra 100%': c.extra100Horas,
      'Es extra': c.esExtra ? 'Sí' : 'No',
      'Servicio 10% monto': c.servicio10Monto,
      'Tips monto': c.tipsMonto,
      'Permiso sin goce días': c.permisoDias
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
// de contarlo). `p.colaboradores`: [{ nombre, puesto, salario, es_manual, es_extra }].
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
      esManual: !!c.es_manual,
      esExtra: !!c.es_extra
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
    // Las horas regulares arrancan siempre en 120 (quincena completa) — la
    // tardanza de Amonestaciones ya NO se resta acá en silencio. Ahora se
    // calcula y se muestra como su propia línea en negativo dentro de
    // Ingresos (ver sumarHorasTardanza() + calcularPlanilla()), para que
    // quede visible y no se pierda si alguien ajusta "Horas regulares" a
    // mano después de abrir el periodo.
    guardarIncidencia({
      periodo: p.periodo, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin,
      kiosko: p.kiosko, colaborador: c.nombre,
      horas_regulares: 120,
      es_manual: c.esManual ? 'Sí' : 'No',
      salario_manual: c.esManual ? c.salario : '',
      puesto_manual: c.esManual ? c.puesto : '',
      es_extra: c.esExtra ? 'Sí' : 'No'
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
// verificación completado y quién aprobó — no recalcula los montos ya
// guardados por guardarPlanilla(), pero SÍ vuelve a correr calcularPlanilla()
// una vez más para saber qué renglones de Servicio 10%/Tips quedaron
// incluidos y marcarlos pagados (ver más abajo) — recién en este paso,
// porque es donde el founder confirma que sí se va a pagar (antes, en
// Paso 4, todavía puede volver atrás y no aprobar).
function aprobarPlanilla(p) {
  if (!p.id) throw new Error('Falta el ID de la planilla.');
  if (!p.aprobado_por) throw new Error('Falta quién aprueba.');
  if (!Array.isArray(p.checklist) || !p.checklist.length) {
    throw new Error('Falta completar el checklist de verificación.');
  }

  const hoja = prepararHoja(HOJA_PLANILLAS, ENCABEZADOS_PLANILLAS);
  const fila = filaPorColumna(hoja, ENCABEZADOS_PLANILLAS, 'ID', p.id);
  if (fila === -1) throw new Error('No se encontró esa planilla.');
  const filaPlanilla = filasComoObjetos(hoja)[fila - 2];

  const ahora = new Date().toISOString();
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PLANILLAS, Object.assign(
    filaPlanilla,
    {
      'Estado': 'Aprobada',
      'Checklist aprobación': JSON.stringify(p.checklist),
      'Aprobado por': p.aprobado_por,
      'Fecha aprobación': ahora
    }
  ));

  // Marca como pagados (en ServicioRepartoDetalle, servicio-10.html) los
  // renglones de Servicio 10%/Tips que se incluyeron en esta planilla, para
  // que no se vuelvan a ofrecer como pendientes ahí — evita pagarlos doble.
  // No crítico: si falla, la planilla queda igual aprobada (se reporta el
  // error en la respuesta para que se revise a mano).
  let servicio10Marcados = 0, servicio10Error = '';
  try {
    const resultado = calcularPlanilla(filaPlanilla['Periodo'], filaPlanilla['Fecha inicio'], filaPlanilla['Fecha fin'], filaPlanilla['Kiosko']);
    const idsAMarcar = [];
    resultado.colaboradores.forEach(function (c) {
      (c.servicio10Ids || []).forEach(function (id) { idsAMarcar.push(id); });
    });
    if (idsAMarcar.length) {
      const fechaPago = Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd');
      const resPago = marcarServicioPagado({
        ids_detalle: idsAMarcar, fecha_pago: fechaPago,
        referencia: 'Planilla ' + filaPlanilla['Periodo'] + ' - ' + filaPlanilla['Kiosko'],
        notas: 'Marcado automáticamente al aprobar la planilla (' + p.aprobado_por + ').'
      });
      servicio10Marcados = resPago.actualizados;
    }
  } catch (err) {
    servicio10Error = err.message;
  }

  return { fila: fila, id: p.id, fecha_aprobacion: ahora, servicio10_marcados: servicio10Marcados, servicio10_error: servicio10Error };
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

// Marca (o desmarca) el pago de UN colaborador dentro de una planilla ya
// aprobada — reporte de pago de planilla.html (Paso 5 y vista de planilla
// aprobada), mismo patrón que marcarServicioPagado() pero identificando la
// fila por 'ID Planilla' + 'Colaborador' en vez de un ID propio (el detalle
// de Planillas nunca tuvo un ID de fila individual). data:
// { id_planilla, colaborador, pagado: true/false, fecha_pago }
function marcarPlanillaPagado(p) {
  if (!p.id_planilla) throw new Error('Falta el ID de la planilla.');
  if (!p.colaborador) throw new Error('Falta el colaborador.');

  const hoja = prepararHoja(HOJA_PLANILLAS_DETALLE, ENCABEZADOS_PLANILLAS_DETALLE);
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) throw new Error('No hay planillas guardadas todavía.');

  const colIdPlanilla = colPorEncabezado(hoja, 'ID Planilla');
  const colColaborador = colPorEncabezado(hoja, 'Colaborador');
  const colPagado = colPorEncabezado(hoja, 'Pagado');
  const colFecha = colPorEncabezado(hoja, 'Fecha pago');
  const datos = hoja.getRange(2, 1, nFilas, Math.max(colColaborador, colIdPlanilla)).getValues();

  const idBuscado = String(p.id_planilla).trim();
  const nombreBuscado = String(p.colaborador).trim().toLowerCase();
  let fila = -1;
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][colIdPlanilla - 1]).trim() === idBuscado
      && String(datos[i][colColaborador - 1]).trim().toLowerCase() === nombreBuscado) {
      fila = i + 2;
      break;
    }
  }
  if (fila === -1) throw new Error('No se encontró ese colaborador en esta planilla.');

  const pagado = !!p.pagado;
  const fechaPago = pagado ? (p.fecha_pago || Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd')) : '';
  hoja.getRange(fila, colPagado).setValue(pagado ? 'Sí' : 'No');
  hoja.getRange(fila, colFecha).setValue(fechaPago);
  return { fila: fila, pagado: pagado, fecha_pago: fechaPago };
}

// Envía, por correo, la boleta de pago en PDF (base64, generada en
// planilla.html con jsPDF/html2canvas, mismo patrón que generarPDFPlanilla)
// a cada colaborador de la lista — buscando su Email en "Personal" por
// 'Nombre completo' (igual que buscarPersonal() dentro de calcularPlanilla).
// No falla toda la corrida si a alguien le falta el correo: lo reporta en
// "sin_correo" y sigue con el resto. data: { id, kiosko, periodo,
// boletas: [{ colaborador, pdf_base64 }, ...] }
function enviarBoletasPago(p) {
  if (!Array.isArray(p.boletas) || !p.boletas.length) {
    throw new Error('Falta el detalle de boletas a enviar.');
  }

  const personalTodos = filasComoObjetos(prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL));
  function buscarPersonal(nombre) {
    const buscado = String(nombre || '').trim().toLowerCase();
    return personalTodos.find(function (per) { return String(per['Nombre completo'] || '').trim().toLowerCase() === buscado; });
  }

  const enviados = [];
  const sinCorreo = [];
  const errores = [];

  p.boletas.forEach(function (b) {
    const nombre = String(b.colaborador || '').trim();
    if (!nombre) return;
    if (!b.pdf_base64) { errores.push(nombre + ' (sin PDF generado)'); return; }

    const persona = buscarPersonal(nombre);
    const email = persona && persona['Email'] ? String(persona['Email']).trim() : '';
    if (!email) { sinCorreo.push(nombre); return; }

    try {
      const nombreArchivo = 'Boleta de pago - ' + nombre + (p.periodo ? ' - ' + p.periodo : '') + '.pdf';
      const bytes = Utilities.base64Decode(b.pdf_base64);
      const blob = Utilities.newBlob(bytes, 'application/pdf', nombreArchivo);
      const asunto = 'Boleta de pago' + (p.periodo ? ' — ' + p.periodo : '') + (p.kiosko ? ' (' + p.kiosko + ')' : '');
      const cuerpo = 'Hola ' + nombre + ',\n\n'
        + 'Adjunto encontrás el detalle de tu pago' + (p.periodo ? ' correspondiente al periodo ' + p.periodo : '')
        + (p.kiosko ? ' — ' + p.kiosko : '') + '.\n\n'
        + 'Cualquier consulta, respondé este correo.\n\nSaludos.';
      MailApp.sendEmail({ to: email, subject: asunto, body: cuerpo, attachments: [blob] });
      enviados.push(nombre);
    } catch (err) {
      errores.push(nombre + ' (' + err.message + ')');
    }
  });

  return { enviados: enviados, sin_correo: sinCorreo, errores: errores };
}

// TEMPORAL — solo para diagnosticar el error de permiso de MailApp. Corré
// ESTA función a mano desde el editor (seleccionala en el desplegable de
// arriba y clic en ▶ Ejecutar) — a diferencia de enviarBoletasPago(), esta
// no depende de ningún parámetro, así que si el permiso de correo está bien
// autorizado para esta cuenta, te va a llegar un correo de prueba sin
// ningún error en el editor. Si tira el mismo error de permiso acá adentro
// del editor (no desde el sitio), es que la autorización nunca se completó
// de verdad — hay que repetirla. Borrala cuando terminemos de diagnosticar.
function TEST_permisoCorreo() {
  MailApp.sendEmail({
    to: Session.getActiveUser().getEmail() || 'jorge.lopez@casaaguizotes.com',
    subject: 'Prueba de permiso de correo — Planilla',
    body: 'Si te llegó este correo, el permiso de MailApp.sendEmail ya está autorizado correctamente para esta cuenta.'
  });
}
