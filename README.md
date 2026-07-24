# Ecosistema Kioskos — Playa Grande Brew House

Sistema de operaciones para los kioskos de cerveza y cocteles (Playa Grande,
Liberia, Nosara, Playa Hermosa, con planes de abrir más), adaptado del
Ecosistema Lorito (Grupo del Sol / Casa Aguizotes). Misma arquitectura:
Google Apps Script + Google Sheets como backend, HTML/JS plano de frontend
(sin framework), un `.gs` por módulo desplegado como Web App.

## Estado actual

Primer módulo: **Cierre de Caja**, con selector de kiosko (en vez de un punto
de venta fijo como en Lorito) y categorías de venta simplificadas — sin
crédito, plataformas de delivery ni 10% de servicio, porque no aplican a un
kiosko de playa.

Segundo módulo: **Depósitos**, adaptado de `depositos.html`/`Code-cierres-backend.gs`
(hoja "Depositos") de Ecosistema Lorito, con selector de **Kiosko** (Lorito es
un solo punto de venta y agrupa directo por fecha; acá primero se filtra por
el kiosko elegido arriba de las 3 pestañas y recién ahí se agrupa por fecha):

- `depositos.html` — 3 pestañas: **Resumen diario** (efectivo sin depósito
  asignado, por fecha, con detalle desplegable por denominación), **Asignar
  depósito** (foto del comprobante, fecha/referencia/monto, selección de una
  o varias fechas pendientes a cubrir, comparación comprobante vs. calculado
  con tolerancia ±₡500/±$1, botón de WhatsApp con el resumen) e **Historial
  de depósitos** (depósitos ya asignados, con las fechas que cubre cada uno).
  El backend (`guardarDeposito`/`agregarEncabezadosDepositos` en
  `Code-cierres-kioskos-backend.gs`) ya venía armado con el campo Kiosko —
  solo faltaba esta pantalla para poder usarlo.

Tercer módulo: **RRHH completo**, adaptado 1:1 de la lógica de
`Code-rrhh-backend.gs`/las 8 pantallas `rrhh-*.html` + `horarios.html` de
Ecosistema Lorito, con el campo **Kiosko** agregado en Personal y Horarios
(Lorito es un solo punto de venta y no lo necesita):

- `rrhh-acciones.html` — hub con las pantallas del módulo, incluyendo
  Planilla (link principal desde `index.html`).
- `rrhh-personal.html` — expedientes digitales del equipo (datos personales,
  laborales, bancarios, documentos, amonestaciones), con búsqueda y filtro
  por kiosko/departamento/estado. Botón **"✎ Editar"** en cada expediente:
  abre un modal para corregir cualquier dato editable (nombre, cédula,
  contacto, kiosko/departamento/puesto, banco, documentos, observaciones) y
  para subir o reemplazar la foto de cédula. A propósito no permite tocar
  **salario** ni **estado** — esos cambios siguen pasando por
  `rrhh-cambio-salario.html`, `rrhh-terminacion.html` y
  `rrhh-liquidaciones.html` para no perder el historial que esas pantallas
  registran aparte.
- `rrhh-nuevo-ingreso.html` — alta completa de colaborador (ficha larga:
  cédula, nacionalidad, kiosko, departamento, puesto, salario, datos
  bancarios, checklist de documentos entregados).
- `rrhh-vacaciones.html` / `rrhh-control-vacaciones.html` — solicitud de
  vacaciones y panel de control (saldos por colaborador, pendientes de
  aprobar, historial). Saldo calculado automáticamente por antigüedad (1 día
  por mes trabajado) si no hay un saldo manual cargado en el Sheet.
- `rrhh-amonestaciones.html` — llamadas de atención, amonestaciones verbales/
  escritas y suspensiones sin goce de salario, con historial por
  colaborador.
- `rrhh-terminacion.html` — registra la salida de un colaborador (cambia su
  Estado a LIQUIDACIÓN).
- `rrhh-cambio-salario.html` — actualiza el salario de un colaborador y
  guarda el historial de cambios.
- `rrhh-liquidaciones.html` — cálculo preliminar de liquidación (preaviso,
  cesantía, vacaciones, aguinaldo) según el Código de Trabajo de Costa Rica,
  para colaboradores en estado LIQUIDACIÓN, y confirmación de pago (pasa el
  Estado a INACTIVO).
- `horarios.html` / `horarios-historial.html` — turnos semanales **por
  kiosko** (pestañas Playa Grande/Liberia/Nosara/Playa Hermosa — un
  colaborador sin Kiosko asignado aparece como "rotativo" en las 4), con
  vacaciones aplicadas automáticamente desde las solicitudes aprobadas,
  cierre de semana en PDF (guardado en Drive) e historial de semanas
  guardadas. **Importante:** el cierre de semana ("Cerrar horario") es
  global para esa semana en las 4 pestañas — no hay un cierre independiente
  por kiosko; el PDF que se genera/descarga sí es el de la pestaña activa en
  ese momento.
- `rrhh.html` — la pantalla simple original (alta rápida + listado con
  activar/desactivar) queda intacta y sigue funcionando contra el mismo
  backend, pero ya no es el punto de entrada del módulo — usá
  `rrhh-acciones.html`.

Cuarto módulo: **Control de Tips**, `control-tips.html` — control de pago de
propinas cobradas por tarjeta en el cierre de caja (campo "Tips ₡" que ya
existía en la hoja "Cierres"), que se depositan aparte a los colaboradores.
Dos pestañas:

- **Pendientes de pago**: lista cada cierre con tips > 0 (fecha, kiosko,
  encargado/turno, monto), con checkbox para seleccionar uno o varios y
  asignarles de una vez un número de referencia y fecha de pago ("Marcar
  como pagado ✓"). Filtro opcional por kiosko arriba (o "Todos").
- **Historial de pagos**: pagos ya registrados, expandibles para ver qué
  cierres cubre cada uno.

Backend (`Code-cierres-kioskos-backend.gs`, hoja nueva "TipsPagos",
`agregarEncabezadosTipsPagos()`/`guardarPagoTips()`): cada fila es un PAGO
(puede cubrir varios cierres de uno o más kioskos a la vez), con los ID de
"Cierres" cubiertos guardados como JSON en "IDs cierres cubiertos" — mismo
patrón que "Fechas cubiertas" en Depositos. Un cierre con tips deja de
aparecer como pendiente en cuanto su ID queda cubierto por algún pago,
sin importar el filtro de kiosko activo.

`index.html` agrega un 4to ticket "Propinas pendientes de pago" (rojo si
hay pendientes, verde si no) con detalle desplegable por fecha/kiosko/monto
al hacer click, más una acción rápida "Pagar propinas pendientes".

Quinto módulo: **Mantenimiento**, adaptado 1:1 de `mantenimiento.html`/
`Code-mantenimiento-backend.gs` de Ecosistema Lorito, con el campo **Kiosko**
agregado (Lorito es un solo punto de venta y no lo necesita):

- `mantenimiento.html` — 2 pestañas: **Nuevo reporte** (kiosko, reportado por
  —filtrado por kiosko igual que en `cierres.html`—, fecha, tipo de
  incidencia con 12 categorías predefinidas, detalle, foto de evidencia
  opcional con compresión client-side, botón de WhatsApp con el resumen) y
  **Seguimiento** (lista de reportes con filtro Activos/Resueltos/Todos +
  filtro por kiosko + buscador, badge de kiosko en cada tarjeta, marcar en
  proceso/resuelto, fecha estimada de resolución con alerta si está vencida,
  notas de seguimiento acumulables).
- Backend (`Code-mantenimiento-backend.gs`, hoja "Reportes" en su propio
  Sheet): guarda cada reporte con su columna "Kiosko" y organiza las fotos de
  evidencia en Drive en una subcarpeta por kiosko dentro de la carpeta raíz
  fija (mismo patrón que `getOrCreateCarpetaKiosko` en
  `Code-cierres-kioskos-backend.gs`).

Sexto módulo: **Mermas de Cerveza**, `mermas.html` — captura diaria de merma
de barril **por peso** (báscula), con foto de la pesada y extracción del
peso por IA:

- **Nueva merma**: selector de **Kiosko**, fecha, foto de la báscula
  (comprimida client-side, mismo patrón que `mantenimiento.html`) con botón
  **"Extraer peso con IA"** (llama a `Code-mermas-extractor.gs`, un Web App
  de Apps Script independiente que usa la API de Anthropic con visión para
  leer el número que marca la báscula y devolverlo en gramos — ver
  "Extracción con IA" más abajo), peso bruto (editable a mano si la IA falla
  o no está desplegada todavía), peso del contenedor vacío (autocompletado
  desde la pestaña **Configuración** de este mismo módulo, según el kiosko
  elegido) y la merma neta calculada en vivo (bruto − contenedor).
- **Historial**: filtro por kiosko, gráfico lineal (SVG inline, sin
  librerías externas) de la evolución de la merma neta por día, y tabla con
  el detalle de cada pesada (fecha, kiosko, peso bruto, contenedor, neto,
  quién la registró, link a la foto en Drive).
- **Configuración**: peso del contenedor (barril) vacío **por kiosko** —
  cada uno puede tener un valor distinto (barriles de distinto tamaño o
  proveedor). Se guarda en la pestaña "MermasConfig" y se actualiza
  (upsert), no se acumula historial de cambios de tara.

Unidad de captura: **gramos**. La merma neta de cada pesada queda fija en
el momento de guardarla (usa el peso de contenedor vigente en ese instante),
así que corregir la tara de un kiosko más adelante no altera pesadas ya
guardadas.

Backend: mismo Web App de `mantenimiento.html`
(`Code-mantenimiento-backend.gs`, Sheet **"Operaciones - Kioskos"**),
extendido con las pestañas "Mermas" y "MermasConfig"
(`configurarHoja()`/`?modulo=mermas`/`?modulo=mermas_config`/acciones
`merma_guardar` y `merma_config_guardar` en `doPost`). Las fotos de báscula
se organizan en Drive por subcarpeta de kiosko, igual que las de
mantenimiento pero en una carpeta raíz separada (`FOLDER_ID_MERMAS`).

`index.html` agrega, dentro de la sección **"Cerveza de barril vendida
(onzas)"** (que ya solo existe para los kioskos con Square propio — ver
arriba), el peso de la merma del día y el % que representa sobre el total
vendido: como la merma se pesa en gramos y las ventas se cuentan en onzas,
el % convierte el peso a onzas asumiendo una densidad estándar de cerveza
(`DENSIDAD_CERVEZA_G_ML = 1.005`) — es una aproximación, no una medición
exacta, y queda documentada como tal en el pie de esa sección. El histórico
por día de cada kiosko también muestra la merma junto a las onzas vendidas.

Séptimo módulo: **Inventario y Recetas**, `inventario.html` + `recetas.html` —
catálogo de productos, toma de inventario física por kiosko y descuento
automático de stock según las ventas de Square:

- `inventario.html` — 3 pestañas:
  - **Productos**: catálogo agrupado por categoría (alta/edición de
    categorías desde la misma pantalla). Cada producto guarda, además del
    nombre interno, tres alias: **Nombre de Facturación** (como aparece en la
    factura del proveedor), **Nombre de Compra** (como se pide/ordena) y
    **Nombre de Venta** (como aparece vendido en Square/menú — es lo que
    matchea el consumo automático de `recetas.html`), más unidad y **mínimo
    recomendado**.
  - **Toma de Inventario**: selector de kiosko; **"Iniciar toma"** fija la
    fecha y congela un snapshot (stock esperado) de cada producto activo. Con
    la toma abierta, se cuenta por categoría con autosave por línea y
    bandera de bajo-mínimo. **"Cerrar toma"** pide el PIN de un rol admin
    (mismo mecanismo de roles de `login.html`, `portal_roles`/
    `ADMIN_DEFAULT`) y, además, el backend valida su propio `ADMIN_PIN`
    (Script Properties) como segunda barrera — al cerrar, aplica los ajustes
    de stock por la diferencia contada vs. esperada y bloquea la toma de
    forma permanente (no hay "reabrir"; el backend rechaza cualquier
    `toma_guardar_conteo` sobre una toma ya Cerrada, no solo la UI).
  - **Historial y Stock**: stock en vivo por producto/kiosko con badge de
    bajo-mínimo y drill-down a los movimientos (compras, ajustes, consumo por
    venta, conteos), y el historial de tomas cerradas con el detalle
    esperado/contado/diferencia de cada una.
- `recetas.html` — recetas que mapean un **Nombre de Venta** (el nombre con
  el que Square vende el ítem, ej. "Mojito") a una lista de ingredientes
  (Producto + cantidad por unidad vendida), opcionalmente restringidas a un
  kiosko. Botón **"Sincronizar ventas ahora"**: trae las ventas nuevas desde
  el Web App de Square (`?action=ventasPorProducto`, agregado a
  `Codigo-Square-completo-con-Descuentos.gs`) y por cada línea nueva
  descuenta stock — según receta si el nombre matchea una, o 1:1 si matchea
  el "Nombre de Venta" de un Producto (venta directa, sin receta). Lo que no
  matchea ninguno de los dos se reporta como "sin mapear" (no falla). Cada
  línea aplicada queda en la pestaña "VentasProcesadas" para no descontarse
  dos veces si el sync se corre otra vez sobre el mismo rango de fechas.

Backend (`Code-inventario-kioskos-backend.gs`, Sheet nuevo **"Inventario -
Kioskos"**): 9 pestañas — Productos, Categorias, Stock (cantidad actual por
producto/kiosko), StockMovimientos (auditoría append-only de toda alta/
ajuste/consumo/conteo), TomaInventario/TomaInventarioDetalle, Recetas/
RecetasDetalle y VentasProcesadas. Puede correr `sincronizarVentasAutomatico()`
sola cada hora si se crea el trigger (`crearTriggerSincronizacion()`, una vez
desde el editor) — sin eso, el consumo por venta solo se aplica al apretar
"Sincronizar ventas ahora".

`index.html` reemplaza el tile "Inventario y Compras (Próximamente)" por dos
tiles activos: **Inventario** (`inventario.html`) y **Recetas**
(`recetas.html`).

Módulo de **Planilla**, `planilla.html` — cálculo de planilla quincenal por
kiosko según la legislación laboral de Costa Rica, reutilizando Personal
(salario, estado, kiosko) y Vacaciones (solicitudes aprobadas) del mismo
Sheet de RRHH. Selector de **Kiosko + Quincena** arriba de las 3 pestañas
(mismo patrón que `depositos.html`): **Planilla** (el wizard, ver abajo),
**Historial** y **Feriados** (tabla editable de feriados de pago
obligatorio, fecha+nombre+activo/inactivo — a propósito no está hardcodeada
en el código porque las fechas cambian cada año: Semana Santa es movible, la
Ley 8442 traslada algunos feriados a lunes).

La pestaña **Planilla** es un wizard de 5 pasos (pensado para no tener que
abrir el panel completo de cada colaborador uno por uno cuando el kiosko
tiene muchos empleados — todo se edita en tablas, con default ya cargado):

1. **Verificar colaboradores activos**: checklist de los ACTIVOS del kiosko
   (todos tildados por default) + botón para agregar a alguien extra, ya sea
   buscándolo en Personal completo (otro kiosko o rotativo, reusa su
   salario) o escribiendo datos nuevos a mano (nombre+puesto+salario, para
   ayuda de una sola quincena). "Continuar" sincroniza Incidencias para ese
   Periodo+Kiosko con el set confirmado (crea con default `Horas
   regulares=120` a quien falte, borra a quien se desmarcó) — es idempotente,
   así que reabrir el wizard más adelante no resetea lo ya cargado.
2. **Ingresos**: tabla (horas regulares/extra 50%/extra 100%) con "Detalle"
   expandible por fila para feriados trabajados, incapacidades CCSS/INS/
   interna, vacaciones (info automática + link a `rrhh-vacaciones.html` para
   pedir una si hace falta), subsidio de alimentación/transporte (en su
   propia card, separado de vacaciones) y otros días no trabajados
   (ausencias sin incapacidad ni vacación — esas ya suman días solas, ver
   más abajo).
3. **Deducciones**: tabla con la base de CCSS automática + un campo para
   ajustarla a mano si hace falta, más las 5 deducciones manuales (adelanto,
   compras aprobadas, otras, embargo salarial, pensión alimenticia).
4. **Cálculo**: preview del cálculo completo (desglose expandible + total
   del kiosko + nota legal). "Cerrar cálculo y enviar a aprobación" guarda
   el snapshot con Estado="Pendiente de aprobación" y ofrece un botón de
   WhatsApp (sin número fijo, el usuario elige el contacto) avisando que
   está lista para revisión.
5. **Revisión final**: detalle de solo lectura + checklist de verificación
   (4 ítems) que hay que completar para habilitar "Aprobar planilla"
   (Estado="Aprobada"). Al aprobar: genera PDF (jsPDF + html2canvas, mismo
   patrón que el cierre de semana de `horarios.html`) y Excel/CSV
   descargables, archiva el PDF en Drive, y ofrece un botón de WhatsApp con
   el kiosko, el periodo y el total a pagar.

La pestaña **Historial** lista las planillas por Estado (Pendiente de
aprobación/Aprobada) — click en una no aprobada retoma el wizard en el paso
que corresponda; en una aprobada muestra el detalle y el link al PDF
archivado.

Reglas de cálculo (nota legal visible en el Paso 4): salario diario =
salario mensual / 30, hora = diario / 8 (Art. 136 CT); hora extra 50%/100%
(Art. 139 CT); feriado paga un día completo siempre y otro día más si se
marcó trabajado (Art. 148 CT); incapacidad CCSS al 50% a cargo del patrono
solo en los primeros 3 días de cada incapacidad (Ley 9756, el resto lo paga
la CCSS directo); incapacidad INS siempre en ₡0 a cargo del patrono (el INS
paga 100% desde el día 1); incapacidad interna a discreción de la empresa (%
editable); vacaciones automáticas (Art. 153 CT) desde solicitudes con
Estado="Aprobado" (mismo valor que escribe `rrhh-control-vacaciones.html`).
**Cada día de incapacidad (de cualquier tipo) y cada día de vacaciones
dentro de la quincena suma 1 "día no trabajado"** además de su pago
específico — sin esto, "Horas regulares" (pensado como el total de la
quincena) pagaría esos días completos encima del pago de la
incapacidad/vacación. La base de CCSS (cuota obrera 10.67%, deducción
automática) excluye el subsidio y los 3 montos de incapacidad, y admite un
ajuste manual por colaborador que tiene prioridad sobre la automática. Toda
la lógica vive una sola vez en `calcularPlanilla()`
(`Code-rrhh-kioskos-backend.gs`), reutilizada por el preview, el "enviar a
aprobación" y el snapshot guardado, para que nunca queden desincronizados —
la fuente de "quiénes participan" es Incidencias (lo que confirmó el Paso 1
del wizard), no Personal filtrado por kiosko.

Backend: mismo Web App de RRHH (`Code-rrhh-kioskos-backend.gs`), extendido
con 4 pestañas nuevas — Feriados, Incidencias (una fila por
Periodo+Kiosko+Colaborador, upsert; columnas `Es manual`/`Salario manual`/
`Puesto manual` para colaboradores extra sin fila en Personal y `CCSS base
ajustada` para el override del Paso 3), Planillas (con `Estado`, `Checklist
aprobación`, `Aprobado por`, `PDF URL`, etc.) y PlanillasDetalle (maestro/
detalle de cada corrida guardada, mismo patrón que TomaInventario/
TomaInventarioDetalle en Inventario). El PDF aprobado se archiva en la
carpeta de Drive fija `FOLDER_ID_PLANILLAS` (vacía por default — pegá un ID
de carpeta tuya ahí y volvé a Implementar → Nueva versión; mientras esté
vacío, "Aprobar planilla" avisa en vez de fallar en silencio, y se puede
seguir aprobando/descargando sin archivar).

El resto de módulos (reportes consolidados) quedan como "Próximamente" en
`index.html`, a construir después.

Archivos:
- `index.html` — home con navegación entre módulos.
- `login.html` — acceso por PIN (mismo patrón simple que Lorito, sin backend
  propio — roles guardados en `localStorage`; ver "Pendiente" más abajo).
- `configuracion.html` — sección de configuración inicial: alta/edición/
  activación de kioskos (nombre, ubicación, encargado, contacto, WhatsApp,
  horario de atención desplegado por día con hora de apertura y cierre).
  Única fuente de la lista de kioskos que consume el resto del sistema (ver
  "Kioskos activos" más abajo). Incluye un mapa (Leaflet + OpenStreetMap,
  sin API key) con un marcador por kiosko: el campo "Ubicación" acepta
  coordenadas `lat,lng`, un link de Google Maps, o una dirección/nombre de
  lugar (en ese caso se geocodifica con Nominatim y se cachea en
  `localStorage` para no repetir la consulta). El popup de cada marcador y
  la tarjeta de la lista muestran el horario de hoy; cada tarjeta tiene un
  desplegable "Ver horario semanal" con los 7 días.
- `cierres.html` — módulo de cierre de caja (formulario + historial).
- `depositos.html` — módulo de depósitos bancarios (resumen diario, asignar
  depósito, historial — ver detalle arriba).
- `control-tips.html` — control de pago de propinas de tarjeta (pendientes
  de pago, historial de pagos — ver detalle arriba).
- `servicio-10.html` — cálculo y reparto del 10% de servicio por kiosko y
  periodo, según días trabajados (nuevo reparto, pendientes de pago,
  historial — ver detalle arriba).
- `mantenimiento.html` — módulo de reportes de mantenimiento por kiosko
  (nuevo reporte + seguimiento — ver detalle arriba).
- `mermas.html` — módulo de mermas de cerveza por peso (nueva merma +
  historial con gráfico + configuración de tara por kiosko — ver detalle
  arriba).
- `rrhh.html`, `rrhh-acciones.html`, `rrhh-personal.html`,
  `rrhh-nuevo-ingreso.html`, `rrhh-vacaciones.html`,
  `rrhh-control-vacaciones.html`, `rrhh-amonestaciones.html`,
  `rrhh-terminacion.html`, `rrhh-cambio-salario.html`,
  `rrhh-liquidaciones.html`, `horarios.html`, `horarios-historial.html` —
  módulo de RRHH completo (ver detalle arriba).
- `planilla.html` — módulo de planilla: wizard de 5 pasos por kiosko/
  quincena (colaboradores, ingresos, deducciones, cálculo, revisión final y
  aprobación), historial y feriados (ver detalle arriba).
- `inventario.html` — catálogo de productos, toma de inventario física por
  kiosko (con cierre bloqueado por PIN admin) e historial/stock en vivo —
  ver detalle arriba.
- `recetas.html` — recetas de venta y sincronización de consumo automático
  desde Square — ver detalle arriba.
- `admin-accesos.html` — CRUD de roles de acceso (PIN, color, módulos y
  kioskos permitidos por rol) — ver detalle en "Login / control de accesos"
  más abajo.
- `Code-cierres-kioskos-backend.gs` — backend del Sheet de ventas (hoja
  "Cierres") y de depósitos bancarios (hoja "Depositos", que alimenta
  `depositos.html`).
- `Code-rrhh-kioskos-backend.gs` — backend completo de RRHH (Personal,
  Vacaciones, Amonestaciones, Terminaciones, CambiosSalario, Liquidaciones,
  Horarios, HorariosEstado, Configuracion, Roles, Feriados, Incidencias,
  Planillas, PlanillasDetalle) — alimenta las 13 pantallas de arriba
  (incluyendo `planilla.html`), el dropdown de "Encargado" en cierres.html y
  la lista de kioskos de `configuracion.html` + selects del resto del
  sistema.
- `Code-mantenimiento-backend.gs` — backend del Sheet "Operaciones -
  Kioskos": reportes de mantenimiento (hoja "Reportes", alimenta
  `mantenimiento.html`) y mermas de cerveza (hojas "Mermas"/"MermasConfig",
  alimenta `mermas.html`), ambos con fotos organizadas por subcarpeta de
  kiosko en Drive (carpetas raíz separadas para cada uno).
- `Code-mermas-extractor.gs` — proyecto de Apps Script independiente
  (Web App propio, no comparte Sheet con lo demás) que usa la API de
  Anthropic con visión para leer el peso de una foto de báscula — alimenta
  el botón "Extraer peso con IA" de `mermas.html` (ver "Extracción con IA"
  más abajo).
- `Code-inventario-kioskos-backend.gs` — backend del Sheet nuevo "Inventario
  - Kioskos": productos, categorías, stock en vivo, toma de inventario y
  recetas — alimenta `inventario.html` y `recetas.html` (ver detalle
  arriba). Le pega por `UrlFetchApp` al Web App de
  `Codigo-Square-completo-con-Descuentos.gs` para traer las ventas por
  producto y aplicar el consumo automático.

## Pendiente de conexión (todo manual, vía script.google.com)

Apps Script no tiene API para automatizar el despliegue — estos pasos hay
que hacerlos una vez a mano.

### 1. Sheet de ventas (Cierres de Caja y Depósitos)

1. Creá un Google Sheet nuevo, ej. **"Registro Ventas - Kioskos"**.
2. Extensiones → Apps Script, pegá **todo** el contenido de
   `Code-cierres-kioskos-backend.gs`.
3. Corré **una vez** `agregarEncabezados()` desde el editor (▶ con esa
   función seleccionada) para crear la pestaña "Cierres" con encabezados,
   **una vez más** `agregarEncabezadosDepositos()` para crear la pestaña
   "Depositos" con los suyos, y **una vez más** `agregarEncabezadosTipsPagos()`
   para crear la pestaña "TipsPagos" (usada por `control-tips.html`).
4. Implementar → Nueva implementación → Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
5. Copiá la URL `/exec` resultante y pegala en `cierres.html`, `depositos.html`
   **y `control-tips.html`**, constante `SHEETS_URL` (arriba del todo en el
   `<script>` de cada uno) — es el mismo Sheet para los tres módulos.
6. Creá una carpeta en Drive para las fotos de respaldo de los cierres (ej.
   **"Cierres de caja - Kioskos"**), copiá su ID (de la URL de la carpeta) y
   pegalo en `Code-cierres-kioskos-backend.gs`, constante
   `FOLDER_ID_CIERRES` — después de pegarlo, volvé a Implementar → Gestionar
   implementaciones → Editar → Nueva versión (la URL `/exec` no cambia). Esta
   misma carpeta se usa también para los comprobantes de depósito (subcarpeta
   "Depósitos - Comprobantes", se crea sola).

Sin el paso 6, guardar un cierre con foto va a fallar (`DriveApp.getFolderById`
con un ID inválido) — si por ahora no vas a usar fotos, no pasa nada, se puede
guardar el cierre sin adjuntar ninguna.

### 2. Sheet de personal (RRHH completo)

1. Si ya tenías el Sheet **"RRHH - Kioskos"** con la versión mínima
   desplegada, seguí usando ese mismo Sheet — no hace falta crear uno
   nuevo. Si es la primera vez, creá un Google Sheet nuevo con ese nombre.
2. Extensiones → Apps Script, reemplazá **todo** el contenido por
   `Code-rrhh-kioskos-backend.gs` (la versión completa).
3. Corré **una vez** `configurarHojas()` desde el editor. Si el Sheet ya
   tenía datos en "Personal", esto **no los borra**: agrega al final las
   columnas nuevas (Departamento, Fecha nacimiento, Edad, Nacionalidad,
   Antigüedad, Banco, Cuenta, Tipo cuenta, Contrato, CCSS, INS RT, Carnet
   alimentos, Vence carnet, Saldo vacaciones, Observaciones, **Foto Cédula
   (URL)**) y crea las pestañas nuevas: Vacaciones, Amonestaciones,
   Terminaciones, CambiosSalario, Liquidaciones, Horarios, HorariosEstado,
   Configuracion (esta última sembrada automáticamente con los 4 kioskos
   originales, ver "Kioskos activos" más abajo), **Roles** (sembrada con un
   único rol Administrador, PIN `admin`, ver "Login / control de accesos"
   más abajo) y **Feriados, Incidencias, Planillas, PlanillasDetalle**
   (módulo de Planilla — "Feriados" se siembra automáticamente con los
   feriados de pago obligatorio de Costa Rica para 2026 como punto de
   partida editable desde la pestaña "Feriados" de `planilla.html`;
   verificalos contra el decreto oficial del año antes de calcular planilla
   con ellos, porque Semana Santa y algunos traslados de la Ley 8442
   cambian cada año) y **ServicioRepartos, ServicioRepartoDetalle** (módulo
   de Servicio 10%, ver detalle arriba). Si ya habías corrido
   `configurarHojas()` antes de sumar la foto de cédula, el módulo de
   Accesos, el de Planilla o el de Servicio 10%, volvé a correrla una vez
   más: solo agrega lo que falte, sin tocar lo que ya tenías.
4. Implementar → Gestionar implementaciones → Editar → **Nueva versión**
   (si ya tenías el Web App desplegado, la URL `/exec` no cambia — no hace
   falta tocar ningún `.html`). Si es la primera vez: Implementar → Nueva
   implementación → Tipo: Aplicación web, Ejecutar como Yo, Acceso:
   Cualquiera, y pegá la URL resultante en `APPS_SCRIPT_RRHH`/
   `APPS_SCRIPT_URL` de `cierres.html` y las 13 pantallas de RRHH
   (incluyendo `planilla.html`).
5. Para que **Horarios** pueda cerrar la semana en PDF, creá una carpeta en
   Drive (ej. **"Horarios - Kioskos"**), copiá su ID (de la URL de la
   carpeta) y pegalo en `Code-rrhh-kioskos-backend.gs`, constante
   `FOLDER_ID_HORARIOS` — después volvé a Implementar → Gestionar
   implementaciones → Editar → Nueva versión. Sin este paso, "Cerrar
   horario" en `horarios.html` va a fallar al generar el PDF (podés seguir
   usando Horarios sin cerrar semanas mientras tanto).
6. Para que el Paso 5 de `planilla.html` (Revisión final) pueda archivar el
   PDF de cada planilla aprobada, creá una carpeta en Drive (ej. **"Planillas
   - Kioskos"**), copiá su ID y pegalo en `Code-rrhh-kioskos-backend.gs`,
   constante `FOLDER_ID_PLANILLAS` — después volvé a Implementar → Gestionar
   implementaciones → Editar → Nueva versión. Sin este paso, "Aprobar
   planilla" avisa que falta configurarlo pero igual aprueba y deja
   descargar el PDF/Excel — solo el archivado en Drive queda pendiente.
7. `rrhh-nuevo-ingreso.html` incluye un espacio para tomar/subir la foto de
   la cédula del colaborador (opcional) y se guarda en la carpeta de Drive
   fija `FOLDER_ID_CEDULAS` (ya viene con un ID real cargado en
   `Code-rrhh-kioskos-backend.gs`, no hace falta configurarlo — si en algún
   momento querés usar otra carpeta, reemplazá ese ID por el de tu carpeta y
   volvé a Implementar → Gestionar implementaciones → Editar → Nueva
   versión). La URL del archivo queda guardada en la columna nueva
   **"Foto Cédula (URL)"** de "Personal", visible desde el expediente en
   `rrhh-personal.html` ("Ver foto ↗"). `rrhh.html` (alta rápida) no tiene
   este campo todavía.
8. Cargá el personal desde `rrhh-nuevo-ingreso.html` (ficha completa, con
   foto de cédula) o `rrhh.html` (alta rápida, campos básicos) — ambos
   escriben en la misma pestaña "Personal". El campo `Kiosko` es opcional:
   si un colaborador trabaja fijo en un solo kiosko, completalo para que
   solo aparezca ahí; dejándolo vacío, aparece como "rotativo" — disponible
   en cualquier kiosko (dropdown de Encargado en cierres.html, y en las 4
   pestañas de Horarios).

Sin el paso 4, `cierres.html` y todas las pantallas de RRHH muestran
"Configurá APPS_SCRIPT_RRHH primero" (o el error de conexión equivalente).

**Nota:** `rrhh-personal.html` ya permite editar un expediente completo
(botón "✎ Editar" en cada colaborador) incluyendo la foto de cédula.
`rrhh.html` (alta rápida) sigue sin edición, solo activar/desactivar — para
corregir esos registros básicos, hacelo directamente en la pestaña
"Personal" del Sheet. En ambos casos, salario y estado siguen reservados a
sus propias pantallas (`rrhh-cambio-salario.html`, `rrhh-terminacion.html`,
`rrhh-liquidaciones.html`) para dejar historial.

### 3. Sheet de mantenimiento

1. Creá un Google Sheet nuevo, ej. **"Mantenimiento - Kioskos"**.
2. Extensiones → Apps Script, pegá **todo** el contenido de
   `Code-mantenimiento-backend.gs`.
3. Corré **una vez** `configurarHoja()` desde el editor para crear la
   pestaña "Reportes" con sus encabezados (incluye la columna "Kiosko"). La
   primera vez va a pedir autorizar el script (accede a Drive para guardar
   fotos).
4. Implementar → Nueva implementación → Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
5. Copiá la URL `/exec` resultante y pegala en `mantenimiento.html`,
   constante `MANT_URL` (reemplazá `TODO_APPS_SCRIPT_MANTENIMIENTO`).
6. La carpeta de fotos ya está creada y cargada en el código —
   **"Mantenimiento - Fotos"** dentro de la carpeta general de Kioskos en
   Drive (`FOLDER_ID_MANTENIMIENTO` en `Code-mantenimiento-backend.gs`, ID
   `1MgRs-4z53D-S3Jr0N5YQGUo09v7WueHC`). Adentro se crea sola una subcarpeta
   por kiosko la primera vez que alguien adjunta una foto en ese kiosko.

Sin el paso 5, `mantenimiento.html` muestra el error de conexión al abrir
la pestaña Seguimiento o al guardar un reporte.

### 4. Mermas de cerveza (mismo Sheet que Mantenimiento)

El módulo de Mermas **reutiliza el Sheet "Operaciones - Kioskos"** de arriba
(no crea uno nuevo) — solo hay que agregarle las pestañas nuevas.

1. Sheet "Operaciones - Kioskos" → Extensiones → Apps Script, reemplazá
   **todo** el contenido por la versión actualizada de
   `Code-mantenimiento-backend.gs` (ya incluye Mermas y MermasConfig).
2. Corré **una vez** `configurarHoja()` desde el editor: crea (o deja
   intactas, si ya existían) las pestañas "Reportes", "Mermas" y
   "MermasConfig".
3. Implementar → Gestionar implementaciones → Editar → **Nueva versión**
   (la URL `/exec` no cambia — no hace falta tocar `mantenimiento.html`).
4. Pegá esa misma URL `/exec` en `mermas.html`, constante `MERMAS_URL` (ya
   viene cargada si copiaste este repo tal cual, porque es el mismo Web App
   que `mantenimiento.html`).
5. La carpeta de fotos de mermas ya está creada y cargada en el código —
   **"Mermas - Fotos"** dentro de la carpeta general de Kioskos en Drive
   (`FOLDER_ID_MERMAS` en `Code-mantenimiento-backend.gs`, ID
   `1I5_9y1Uqv2pskynPTJi9T9jJzAMx_EDt`). Adentro se crea sola una subcarpeta
   por kiosko la primera vez que alguien adjunta una foto de báscula en ese
   kiosko.
6. Antes de cargar la primera merma de cada kiosko, entrá a `mermas.html` →
   pestaña **Configuración** y definí el peso del contenedor (barril) vacío
   de ese kiosko — si no se configura, se usa 0 (la merma neta queda igual
   al peso bruto, con un aviso en pantalla).

Para activar el botón "Extraer peso con IA" (lee el número de la báscula
directo de la foto), seguí la sección **"Extracción con IA"** más abajo —
es un despliegue aparte, independiente de este Sheet.

### 5. Inventario, toma de inventario y recetas

1. Creá un Google Sheet nuevo, ej. **"Inventario - Kioskos"**.
2. Extensiones → Apps Script, pegá **todo** el contenido de
   `Code-inventario-kioskos-backend.gs`.
3. Corré **una vez** `configurarHoja()` desde el editor para crear las 9
   pestañas (Productos, Categorias, Stock, StockMovimientos, TomaInventario,
   TomaInventarioDetalle, Recetas, RecetasDetalle, VentasProcesadas) con sus
   encabezados.
4. ⚙️ Configuración del proyecto → Propiedades del script → agregá
   `ADMIN_PIN` con el código que va a pedir el botón "Cerrar toma" de
   `inventario.html` (si no lo configurás, el default es `admin` — mismo PIN
   que `ADMIN_DEFAULT` en `login.html`; si cambiás uno, cambiá el otro para
   que sigan coincidiendo).
5. Implementar → Nueva implementación → Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
6. Copiá la URL `/exec` resultante y pegala en **`inventario.html` y
   `recetas.html`**, constante `INVENTARIO_URL` (arriba del todo en el
   `<script>` de cada uno) — es el mismo Web App para los dos.
7. Para que el descuento automático por venta funcione, el Sheet de Square
   (`Codigo-Square-completo-con-Descuentos.gs`) necesita la acción
   `?action=ventasPorProducto` (ya agregada al archivo): entrá a ese
   proyecto de Apps Script → Implementar → Gestionar implementaciones →
   Editar → **Nueva versión** (la URL `/exec` no cambia). Copiá esa URL y
   pegala en `Code-inventario-kioskos-backend.gs`, constante `SQUARE_URL`, y
   volvé a Implementar → Gestionar implementaciones → Editar → Nueva
   versión en **este** proyecto (Inventario) para que tome el cambio.
8. (Opcional) Corré **una vez** `crearTriggerSincronizacion()` desde el
   editor de Inventario para que `sincronizarVentasAutomatico()` corra sola
   cada hora. Sin esto, el consumo por venta solo se aplica cuando alguien
   aprieta **"Sincronizar ventas ahora"** en `recetas.html`.

Sin el paso 6, `inventario.html` y `recetas.html` muestran el error "Falta
configurar INVENTARIO_URL" al cargar. Sin los pasos 7-8, el resto del módulo
(productos, stock manual, toma de inventario, recetas) funciona igual — solo
el descuento automático por venta queda inactivo, y "Sincronizar ventas
ahora" avisa que falta `SQUARE_URL` en vez de fallar en silencio. Como hoy
solo Playa Grande tiene Square conectado (`LOCATION_KIOSKO_MAP`), los demás
kioskos no van a tener consumo automático hasta que tengan su propio
`location_id` — pueden seguir usando la toma de inventario y los ajustes
manuales de stock sin problema mientras tanto.

## Kioskos activos — sección de Configuración

La lista de kioskos ya **no** está duplicada en cada `.html`. Vive en la
pestaña **"Configuracion"** del Sheet de RRHH, y se administra desde
`configuracion.html` (tile "Configuración" en `index.html`): nombre,
ubicación (link o ID de Google Maps), encargado, contacto, WhatsApp,
horario y estado activo/inactivo.

Para abrir un kiosko nuevo (o desactivar uno), entrá a `configuracion.html`
y usá "+ Agregar kiosko" — no hace falta tocar ningún archivo `.html` ni el
backend. Los siguientes archivos leen la lista de kioskos activos al cargar
(`fetch(APPS_SCRIPT_URL + '?modulo=kioskos')`, con un arreglo `KIOSKOS`
hardcodeado como respaldo si no hay conexión):

- `cierres.html`
- `depositos.html`
- `rrhh.html`
- `rrhh-nuevo-ingreso.html`
- `rrhh-personal.html`
- `horarios.html`
- `mantenimiento.html`
- `inventario.html`
- `recetas.html`
- `planilla.html`
- `servicio-10.html`

Backend (`Code-rrhh-kioskos-backend.gs`): `configurarHojas()` crea la
pestaña "Configuracion" y, si está vacía, la siembra con los 4 kioskos
originales (`sembrarConfiguracion()`). `doGet` con `?modulo=kioskos`
devuelve tanto los registros completos (para `configuracion.html`, que
también necesita ver los inactivos) como el array `kioskos` con solo los
nombres activos, en orden — eso es lo que consumen los selects del resto de
pantallas. `doPost` con `modulo: 'kiosko_guardar'` crea o edita un kiosko
(incluye renombrar, vía `kiosko_original`) y `modulo: 'kiosko_estado'`
activa/desactiva uno sin abrir el formulario completo.

El Sheet no necesita ningún cambio manual más allá de correr
`configurarHojas()` una vez — el nombre del kiosko se guarda tal cual en la
columna "Kiosko" de Personal/Horarios/Cierres, y en `horarios.html` aparece
automáticamente como una pestaña más.

## Extracción con IA

### Cierres y Depósitos (opcional, no incluida todavía)

En Lorito, `cierres.html` y `depositos.html` tienen un botón "Extraer datos
con IA" que lee la foto (del cierre o del comprobante de depósito) con un
extractor separado (Apps Script + `ANTHROPIC_API_KEY`, ver `EXTRACTOR_URL` en
el código de Lorito). Acá quedó **desconectado a propósito** en los dos
(`EXTRACTOR_URL = ''`) — el botón queda oculto y ambos formularios funcionan
100% manual. Si más adelante lo querés activar, hay que:

1. Copiar el proyecto `cierre-extractor/Code.gs` de Ecosistema-Lorito a un
   Sheet nuevo, desplegarlo como Web App con su propia `ANTHROPIC_API_KEY` en
   Propiedades del script.
2. Pegar esa URL `/exec` en `EXTRACTOR_URL` dentro de `cierres.html` y/o
   `depositos.html`, según cuál de los dos querás activar (son independientes
   — `depositos.html` manda `tipo:'deposito'` en el payload para que el
   extractor sepa qué formato de respuesta devolver).

### Mermas de cerveza (`mermas.html`) — código listo, falta el despliegue manual

A diferencia de Cierres/Depósitos, acá el extractor **sí está escrito y
conectado** en el código (`Code-mermas-extractor.gs` + botón "Extraer peso
con IA" siempre visible en `mermas.html`) — pero Apps Script no tiene API
para desplegarse solo, así que el último paso (crear el proyecto y pegar la
URL) lo tenés que hacer una vez a mano:

1. https://script.google.com/ → Proyecto nuevo (independiente, no
   necesita Sheet propio).
2. Pegá **todo** el contenido de `Code-mermas-extractor.gs`.
3. ⚙️ Configuración del proyecto → Propiedades del script → Agregar
   propiedad: clave `ANTHROPIC_API_KEY`, valor tu API key de Anthropic
   (console.anthropic.com/settings/keys).
4. Implementar → Nueva implementación → Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
5. Copiá la URL `/exec` resultante y pegala en `mermas.html`, constante
   `EXTRACTOR_URL` (arriba del todo en el `<script>` — hoy está vacía).

Mientras `EXTRACTOR_URL` esté vacío, el botón sigue visible pero avisa que
falta este paso en vez de fallar en silencio. Cada foto extraída es una
llamada a la API de Anthropic (se cobra por uso, ver anthropic.com/pricing)
— no hay llamadas automáticas, solo al apretar el botón.

## Login / control de accesos

Octavo módulo: **Accesos**, `admin-accesos.html` — a diferencia del patrón
mínimo original (PIN hardcodeado en `login.html`), los roles ahora viven en
la pestaña **"Roles"** del mismo Sheet de RRHH (mismo Web App que
Personal/Configuracion), con CRUD completo desde `admin-accesos.html`:

- **Por rol**: nombre, PIN, color, estado activo/inactivo, **módulos
  permitidos** (multi-selección sobre el catálogo completo de pantallas del
  sistema, o "Todos los módulos") y **kioskos permitidos** (multi-selección
  sobre los kioskos de Configuración, o "Todos los kioskos").
- `login.html` trae los roles activos desde el backend (`?modulo=roles`) al
  cargar; si no hay conexión (o todavía no se desplegó la pestaña "Roles"),
  cae a un caché en `localStorage` y, si tampoco hay caché, al rol
  administrador por defecto (`admin`/`admin`) — para no dejar a nadie afuera
  del portal por un problema de red.
- Al iniciar sesión, `portal_sesion` (en `localStorage`, vigente 8 horas)
  guarda `modulos` y `kioskos` del rol (cada uno `'todos'` o un arreglo de
  claves/nombres). **Cada pantalla del sistema (no solo `index.html`)** revisa
  esto al cargar: sin sesión válida redirige a `login.html`; con sesión pero
  sin ese módulo permitido redirige a `index.html`; y el selector de kiosko de
  la pantalla (donde aplica) se filtra a los kioskos permitidos del rol vía la
  función `kioskosPermitidos()` que cada archivo define localmente. `index.html`
  además oculta del menú los tiles de los módulos no permitidos y limita su
  dashboard comparativo a los kioskos permitidos.
- Los módulos **Configuración** (`configuracion.html`, administra la lista
  completa de kioskos) y **Acciones de personal** (`rrhh-acciones.html`, es
  solo un menú de links) quedan protegidos por rol/módulo pero sin filtro de
  kiosko — no tiene sentido limitarlos a un subconjunto.

Backend (`Code-rrhh-kioskos-backend.gs`, pestaña nueva "Roles",
`sembrarRoles()`/`doGet ?modulo=roles`/`doPost` acciones `rol_guardar` y
`rol_estado`): igual que Configuracion, `configurarHojas()` la crea sola y,
si está vacía, la siembra con un único rol Administrador (PIN `admin`,
"todos" los módulos y "todos" los kioskos) — **correlo una vez más si ya
tenías el backend desplegado** (Implementar → Gestionar implementaciones →
Editar → Nueva versión; la URL `/exec` no cambia, no hace falta tocar ningún
`.html`). El PIN debe ser único entre los roles **activos** (dos roles
inactivos pueden compartir PIN sin problema). No hay borrado — un rol que ya
no se usa se desactiva, igual que los kioskos.

`index.html` agrega el tile **Accesos** (junto a Configuración) para entrar a
`admin-accesos.html` — como cualquier otro módulo, solo aparece si el rol
logueado tiene permiso sobre `accesos`.

Noveno módulo: **Servicio 10%**, `servicio-10.html` — cálculo y repartición
del 10% de servicio entre el equipo, por kiosko y por un rango de fechas
libre (no atado a la quincena de Planilla, a diferencia de esta). A
diferencia de Control de Tips (propina voluntaria de tarjeta, ya cobrada
suelta por cierre), acá el monto a repartir se **calcula**: 10% (editable)
de las Ventas Netas ₡ sumadas de los cierres de caja del kiosko en el rango
elegido. Tres pestañas:

- **Nuevo reparto**: elegís el kiosko (arriba) y el periodo (fecha inicio/
  fin), "Calcular reparto" trae el total de Ventas Netas ₡ de "Cierres" para
  ese kiosko+rango y sugiere el monto (10%, editable) y la tabla de
  colaboradores con sus **días trabajados**, contados automáticamente desde
  "Horarios" (días con Estado="trabajo" en ese kiosko+rango — vacaciones,
  incapacidad, permiso y días libres no cuentan). Cada fila es editable
  (ajustar días a mano) y se puede agregar un colaborador que no salió en
  Horarios (selector de Personal activo del kiosko, o "Otro / escribir
  nombre…" para alguien sin ficha). El monto de cada colaborador se
  recalcula en vivo, proporcional a sus días sobre el total, con el
  redondeo ajustado en la última fila para que la suma cierre exacta.
  "Guardar reparto" archiva el cálculo como snapshot (no se recalcula solo
  después) — si hace falta corregirlo, se guarda un reparto nuevo.
- **Pendientes de pago**: cada colaborador de cada reparto guardado es una
  fila independiente con su propio estado de pago (a diferencia de
  TipsPagos, que paga varios cierres de una sola vez) — se puede seleccionar
  y pagar de a uno o varios juntos (incluso de distintos periodos/kioskos)
  con una fecha y referencia común, igual que control-tips.html.
- **Historial de repartos**: lista de cálculos guardados por kiosko, con
  badge de Pagado completo/Parcial/Pendiente y detalle desplegable por
  colaborador (días, monto, estado de pago).

Backend: mismo Web App de RRHH (`Code-rrhh-kioskos-backend.gs`), extendido
con 2 pestañas nuevas — **ServicioRepartos** (maestro, uno por cálculo
guardado: kiosko, periodo, ventas netas, porcentaje, monto total) y
**ServicioRepartoDetalle** (uno por colaborador de cada reparto, con su
propio Pagado/Fecha pago/Referencia pago — mismo patrón maestro/detalle que
Planillas/PlanillasDetalle). `servicio-10.html` además lee directamente el
Web App de ventas (`SHEETS_URL`, mismo que cierres.html/control-tips.html)
para sumar Ventas Netas ₡ de "Cierres", y `?modulo=horarios`/`?modulo=personal`
del Web App de RRHH para sugerir días trabajados y ofrecer el selector de
"+ Agregar colaborador" — no hace falta ningún despliegue nuevo, solo correr
`configurarHojas()` una vez más en el Sheet de RRHH (ver paso 2 más abajo)
para que cree las 2 pestañas nuevas.

## Próximos módulos (sugeridos, sin construir todavía)

- **Reportes consolidados** — comparativo de ventas/balance entre los 4
  kioskos y los que se vayan sumando.
- **Cierre de semana de Horarios por kiosko** — hoy "Cerrar horario" bloquea
  la semana completa en las 4 pestañas a la vez (ver nota en la sección de
  RRHH); si hace falta cerrar cada kiosko por separado, requeriría cambiar
  la clave de `HorariosEstado` de "Semana inicio" a "Semana inicio + Kiosko".
