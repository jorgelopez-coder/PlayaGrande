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

⚠️ **DESCONTINUADO (2026-07-27):** el módulo "Inventario v2, Compras y
Recetas" descrito en esta sección (`Code-inventario-v2-backend.gs` +
`compras.html` + `recetas.html` + el `inventario.html` con ledger de stock
en vivo, control por peso/tara/densidad, auto-descuento por ventas de
Square y lectura automática de facturas de Gmail) **nunca se desplegó a
producción** y se reemplazó por un puerto más fiel de la lógica real de
Ecosistema Lorito — conteo físico periódico + órdenes de compra sugeridas
por mínimo + directorio de proveedores, sin ledger en vivo ni las
integraciones de arriba. Ver la sección **"Inventario, Órdenes de Compra y
Proveedores"** más abajo para el módulo vigente. Se deja el resto de esta
sección como referencia del diseño descartado; `compras.html` y
`recetas.html` quedan en el repo sin tocar pero **ya no tienen tile** en
`index.html`, y `inventario.html` fue **reemplazado** (mismo nombre de
archivo, contenido nuevo).

Séptimo módulo (descontinuado, ver aviso arriba): **Inventario v2, Compras y
Recetas** — `inventario.html` + `compras.html` + `recetas.html`, rediseño
completo (ver `Diseno-Inventario-v2.md`) adaptado de la lógica de base de
productos, compras, menú/recetas e inventario de Ecosistema Lorito.
**Reemplazaba** al módulo v1 (que usaba `Code-inventario-kioskos-backend.gs`
sobre el Sheet "Inventario - Kioskos") — ese backend v1 y el propio v2 quedan
retirados; el código de ambos se conserva en el repo
(`Code-inventario-kioskos-backend.gs`, `Code-inventario-v2-backend.gs`) solo
por si hace falta consultar datos viejos o revisar el diseño descartado.

Cada producto se marca con un **Tipo de Control**: **Unitario** (conteo de
unidades — cerveza en botella/lata, gaseosas, insumos) o **Peso** (báscula,
en gramos — cerveza en sifón/barril y destilados), con **Tara** (peso del
envase vacío) y **Densidad** (g/ml) para convertir el peso neto a mililitros
comparables contra las recetas. El caso mixto (envases cerrados que se
cuentan + un envase abierto/barril conectado que se pesa) es la regla, no la
excepción, para destilados y sifones.

- `inventario.html` — 4 pestañas:
  - **Stock**: stock en vivo por producto/kiosko con badge de bajo-mínimo.
  - **Toma de Inventario**: selector de kiosko; **"Iniciar toma"** congela el
    stock teórico del momento. Para productos **Unitario** se digita el
    conteo; para **Peso**, se cuentan los envases cerrados y se pesa el
    envase abierto/barril conectado con **foto de la báscula** — botón
    "Extraer peso con IA" (reutiliza el Web App de
    `Code-mermas-extractor.gs`) precarga el peso leído, editable si falla. La
    foto queda en Drive como evidencia (carpeta "Inventario v2 -
    Fotos"/kiosko, se crea sola junto al Sheet). **"Cerrar toma"** pide el
    PIN de un rol admin (mismo mecanismo de `login.html`) y además el
    backend valida su propio `ADMIN_PIN` (Script Properties) como segunda
    barrera — al cerrar, ajusta el Stock a lo contado (movimiento tipo
    `Conteo`) de forma permanente, sin "reabrir".
  - **Resultados**: histórico de tomas cerradas con la diferencia
    contado-vs-teórico por producto, en unidad base y en colones al costo.
  - **Catálogo**: alta/edición de productos (tipo de control, tara,
    densidad, costo, proveedor habitual, "Nombre Venta" para matchear ventas
    directas de Square sin receta), categorías y **mínimos por kiosko** (no
    globales — Playa Grande no vende igual que Liberia).
- `compras.html` — 4 pestañas:
  - **Compras**: bandeja de facturas electrónicas leídas de Gmail (XML de
    Hacienda v4.3/v4.4, botón "Buscar facturas en Gmail ahora" + trigger
    horario) en estado **pendiente**, con cada línea mapeada a un producto
    (aprendiendo el mapeo por proveedor+texto para las próximas facturas) o
    quedando marcada "sin mapear" para completar a mano antes de aplicar; más
    un formulario de **compra manual** (proveedor, factura, kiosko, líneas
    producto+cantidad+costo) para compras sin factura electrónica. Al
    aplicar una compra (con kiosko destino), suma al Stock y queda en el
    historial.
  - **Órdenes de Compra**: por kiosko, sugiere `nivel objetivo − stock` (o
    2× mínimo sin nivel objetivo) para todo producto bajo mínimo, agrupado
    por proveedor; se ajusta cantidad, se guarda (borrador → enviada →
    recibida) y se exporta a CSV.
  - **Mapeos de Factura**: mapeos aprendidos (texto de línea de factura de un
    proveedor → producto + factor de conversión), editables/eliminables.
  - **Proveedores**: alta/edición (nombre, cédula jurídica para matchear
    facturas XML, correo de pedidos, teléfono).
- `recetas.html` — recetas que mapean un **Nombre de Venta** de Square (ej.
  "Mojito") a una lista de ingredientes (Producto + cantidad en la unidad
  base del producto — ml o unidad), opcionalmente restringidas a un kiosko.
  Botón **"Sincronizar ventas ahora"** (con selector de kiosko o "todos"):
  trae las ventas nuevas desde el Web App de Square
  (`?action=ventasPorProducto`) y por cada línea nueva descuenta stock —
  según receta si el nombre matchea una, o 1:1 si matchea el "Nombre Venta"
  de un Producto (venta directa, sin receta). Lo que no matchea ninguno de
  los dos se reporta como "sin mapear" (no falla). Cada línea aplicada queda
  en "VentasProcesadas" para no descontarse dos veces.

Backend (`Code-inventario-v2-backend.gs`, Sheet nuevo **"Inventario Kioskos
v2"**): 16 pestañas — Productos, Categorias, Minimos (por producto×kiosko),
Stock, StockMovimientos (auditoría append-only), Proveedores, Compras/
ComprasDetalle, MapeoFacturas, Recetas/RecetasDetalle, VentasProcesadas,
TomaInventario/TomaDetalle y OrdenesCompra/OrdenesCompraDetalle. Incluye el
lector de facturas Gmail (`procesarFacturasGmail()`) y el sync de ventas
Square, ambos con trigger horario opcional (`crearTriggers()`). Trae
`importarDesdeV1()` para migrar Productos y Recetas del Sheet v1 una sola
vez (los productos migrados quedan en tipo Unitario por default — revisar
tipo de control/tara/densidad de licores y sifones después).

`index.html` ya no tiene tiles para `compras.html` ni `recetas.html` (ver
aviso de descontinuado arriba); `inventario.html` sigue con tile pero es el
archivo nuevo descrito a continuación.

---

Séptimo módulo (vigente): **Inventario, Órdenes de Compra y Proveedores** —
`inventario.html` + `ordenes-compra.html` + `proveedores.html`, puerto fiel
de la lógica real de `inventario.html` / `ordenes-compra.html` /
`proveedores.html` de Ecosistema Lorito, adaptada con una dimensión de
kiosko que Lorito no tiene (Lorito es un solo local). **No** tiene ledger de
stock en vivo, control por peso/báscula, auto-descuento por ventas de
Square ni lectura de facturas de Gmail — esas capacidades se descartaron a
propósito al portar la lógica (ver aviso de descontinuado de "Inventario
v2" arriba). El catálogo de productos **no es propio de este módulo**: sale
en vivo del **Maestro de Productos** (`maestro-productos.html`, hoja
"Maestro_Productos" del Sheet "Cuentas por Pagar - Kioskos", gviz, mismo
mecanismo que ya usaba Inventario v2) — Área de negocio y Categoría también
salen de ahí. Un producto del Maestro aplica a un kiosko según su columna
"Kioskos" (vacío/"Todos" o lista separada por comas), igual que ya
administra `maestro-productos.html`.

- `inventario.html` — selector de kiosko arriba de 3 pestañas: **Tomas**
  (lista, con botón "Nueva toma de inventario" — solo puede haber una toma
  "en proceso" por kiosko a la vez, iniciar una nueva cancela la anterior),
  **Toma actual** (grid de conteo agrupado por área/categoría/familia,
  colapsable, con dos campos por producto: **Cerrado/Completo** — unidades
  enteras de la presentación de compra — y **En uso/Abierto** — cantidad en
  la unidad de receta del producto; valorización en vivo por línea, por
  área y total: `cerrado × Precio sin IVA + abierto × Costo por unidad`,
  ambos campos leídos del Maestro; botón "Imprimir formato" genera una hoja
  en blanco para conteo en papel), **Historial** (tomas finalizadas del
  kiosko, leídas por gviz de `HISTORIAL_inventario`, detalle expandible por
  producto). "Finalizar toma" pide confirmación simple (sin PIN — a
  diferencia del intento de Inventario v2, igual que el original de
  Lorito) y escribe una fila por producto contado en `HISTORIAL_inventario`
  vía el backend. El estado de la toma en curso vive en
  `localStorage['kiosko_inv_tomas']` (por kiosko), igual que en Lorito — no
  hay ledger de stock server-side.
- `ordenes-compra.html` (nueva) — selector de kiosko + dos tipos de orden:
  **principal** (sugiere `mínimo − stock actual` por producto, redondeado
  hacia arriba, tomando el mínimo de la pestaña `Minimos` del Sheet nuevo
  y el stock de una **toma finalizada elegida a mano** por el usuario —
  igual que Lorito, no hay stock en vivo) y **recarga** (arranca en 0, sin
  sugerido, para pedidos de mitad de semana). Agrupado por Área de negocio
  del Maestro (dinámico, a diferencia del `Cocina/Bar/Consumible/Otro`
  hardcodeado de Lorito). Franja de **presupuesto semanal** = 35% de las
  ventas netas (sin IVA) de la semana calendario anterior **del kiosko
  seleccionado**, leída de la hoja "Cierres" del backend de
  `Code-cierres-kioskos-backend.gs` (mismo Web App que usa `cierres.html`)
  — resta lo ya comprometido en otras órdenes de esa semana y ese kiosko.
  Al aprobar, genera tarjetas por proveedor con PDF (jsPDF + html2canvas,
  mismo patrón que ya usa `horarios.html` en "cierre de semana") y enlaces
  de WhatsApp/correo (`wa.me`/`mailto:`, o `navigator.share` en celular),
  con checkbox manual de "marcado como enviado". Las órdenes viven
  **solo** en `localStorage['ordenes_compra_kioskos']` (por kiosko) — igual
  que en Lorito, no hay backend para esto.
- `proveedores.html` (nueva) — CRUD de proveedores (nombre jurídico/
  comercial, categoría, contacto, teléfono, correo, días de pedido,
  cuenta/IBAN, condición de pago, notas) contra la pestaña `Proveedores`
  del Sheet nuevo. Pestaña "Por agregar" sugiere proveedores vistos en la
  columna "Proveedor" del Maestro de Productos que todavía no tienen ficha
  acá.

**Fuente única de proveedores (2026-07-28):** la pestaña "Proveedores" de
este Sheet ("Inventario - Kioskos") es ahora la **única** base de
proveedores de todo el ecosistema — antes `cuentas-por-pagar.html` tenía su
propio catálogo duplicado (misma estructura, otro Sheet, sin comunicarse
con este). Ver el aviso "Proveedores unificados" en la sección de
**Maestro de Productos** más abajo, donde se documenta el backend de
`cuentas-por-pagar.html`.

Backend nuevo (`Code-inventario-kioskos-v3-backend.gs`, Sheet nuevo en
blanco **"Inventario - Kioskos"**): angosto a propósito, igual que el
`Code-inventario-backend.gs` de Lorito — sin `doGet` (todo se lee por gviz
directo contra el Sheet, que debe compartirse como "Cualquiera con el
enlace puede ver"), `doPost` con tres casos únicamente: `inventario`
(agrega las líneas de una toma finalizada a `HISTORIAL_inventario`, con
columna `Kiosko`), `minimo_guardar` (upsert por Producto×Kiosko en
`Minimos`) y `guardar_proveedor`/`eliminar_proveedor` (`Proveedores`, mismo
esquema `PROV_ENCABEZADOS` que ya usaba Lorito). Ver la sección de
despliegue "5. Inventario, Órdenes de Compra y Proveedores" más abajo.

`index.html` tiene tres tiles para este módulo: **Inventario**
(`inventario.html`), **Órdenes de Compra** (`ordenes-compra.html`) y
**Proveedores** (`proveedores.html`).

---

⚠️ **DESCONTINUADO (2026-07-25):** este módulo nunca se desplegó y se
fusionó dentro de **Maestro de Productos** (`maestro-productos.html`) — ver
la sección "Maestro de Productos" más abajo. Se deja el resto de esta
sección como referencia del diseño de campos, pero `productos.html` /
`Code-productos-backend.gs` ya no están enlazados desde `index.html`.

Octavo módulo: **Base de Productos**, `productos.html` — catálogo de
productos, **independiente** de la pestaña "Productos" de Inventario v2
(esa sigue siendo la fuente para stock/mínimos/recetas). Adaptado de "Base
de Productos · Costos" de Ecosistema Lorito (`costos-productos.html` /
`Code-costos-backend.gs`, la versión más completa del maestro de productos
ahí — reemplaza a la versión anterior más simple de este mismo módulo en
Kioskos), pero simplificado: sin Alias_Productos, sin Costo_Promedio
calculado automático desde facturas ni panel de "Pendientes de mapear"
(esas tres cosas viven del lado de facturas/compras en Lorito y acá todavía
no aplican — acá el precio/costo se ingresa a mano o por carga masiva).

Campos por producto: nombre, categoría, área de negocio, unidad,
presentación del proveedor, tamaño, precio de compra sin IVA, IVA%,
cantidad en la presentación, costo por unidad (calculado automáticamente =
precio / cantidad), rendimiento%, proveedor, stock mínimo esperado, nota y
activo/inactivo — más **Kioskos**, un campo propio de este ecosistema que
no existe en Lorito (ver abajo). Búsqueda (nombre y proveedor) y filtro por
categoría/kiosko/estado.

**Kioskos por producto**: cada producto tiene un checkbox por kiosko para
marcar dónde se vende/usa, con una opción maestra "Todos los kioskos"
(default) que aplica automáticamente a los que abran después — así no hay
que volver a editar cada producto cuando Jorge abre un kiosko nuevo. La
lista de kioskos **no está hardcodeada**: `productos.html` la trae en vivo
de la misma pestaña "Configuracion" del Sheet de RRHH que usan
`compras.html`/`mermas.html`/`recetas.html`/`inventario.html` (administrada
desde `configuracion.html`), con el mismo patrón `KIOSKOS` +
`kioskosPermitidos()`.

**Carga masiva**: botón "⇧ Carga masiva" para subir un .xlsx/.csv con
varios productos de una vez (parseo client-side con SheetJS, igual que
`costos-productos.html` de Lorito), con previsualización antes de confirmar
y un botón "Descargar plantilla de ejemplo" que genera el Excel con
encabezados + 3 filas de ejemplo al vuelo (sin archivo estático que
mantener). Siempre crea productos nuevos — para editar uno existente se usa
el formulario, no la carga masiva.

**Configuración (v3, botón "⚙ Configurar")**: copiado de la pestaña "⚙
Configuración" de `costos-productos.html` (Lorito) — Categoría, Área de
negocio, Unidad, Presentación del proveedor, Familia (con Subfamilia
dependiente) y Tipo de cambio (₡ por US$) pasan de ser listas hardcodeadas o
campos de texto libre a catálogos editables (agregar/quitar) guardados en
una pestaña nueva del Sheet, "Configuracion". El modal de producto usa esas
mismas listas: Unidad y Presentación ahora son selects (antes texto libre),
se agregan Familia/Subfamilia opcionales, y el precio de compra tiene un
selector de Moneda (₡/US$) — si se elige dólares, convierte a colones con el
tipo de cambio configurado antes de guardar (igual que Lorito, no se
persiste la moneda original, el Sheet siempre tiene el precio en ₡). Fuera
de alcance, igual que en v1/v2: "aplica para recetas", conversión automática
unidad de compra → unidad de receta, "peso de botella vacía" (eso ya vive
en `mermas.html` con su propio flujo de tara) e historial de compras.

Backend (`Code-productos-backend.gs`, Sheet nuevo **"Base de Productos -
Kioskos"**, pestañas "Productos" y "Configuracion"): `producto_guardar`,
`producto_eliminar`, `productos_carga_masiva`, `config_agregar`,
`config_eliminar`, `config_subfamilia_agregar`, `config_subfamilia_eliminar`
y `config_tipo_cambio_guardar`. La pestaña "Configuracion" se siembra sola
con catálogos por defecto la primera vez que se crea (categorías y áreas de
negocio sugeridas para kioskos de cerveza y cocteles precargadas en los
selectores (Categorías: Cerveza, Licores y Destilados, Insumos de
Coctelería, Bebidas No Alcohólicas, Hielo, Vasos y Desechables, Snacks,
Limpieza e Higiene, Equipo y Utensilios, Otros — Áreas: Barra/Coctelería,
Bodega, Cocina/Snacks, Limpieza e Higiene, Administración, Mantenimiento y
Equipo) pero editables libremente — no restringen lo ya guardado.

⚠️ Si ya tenías la versión anterior (7 columnas) desplegada con datos
reales: la estructura de columnas cambió (18 columnas ahora, ver el
comentario al inicio de `Code-productos-backend.gs`). Reemplazá la fila 1
de encabezados del Sheet a mano antes de seguir usando el módulo — si la
pestaña estaba vacía no hace falta hacer nada especial.

`index.html` ya no tiene un tile aparte para este módulo (ver más abajo).

**Maestro de Productos**, `maestro-productos.html` — pantalla de
homologación de nombres de producto vistos en facturas (Desglose_IA):
agrupa por Proveedor + texto de producto (clave normalizada, sin
acentos/mayúsculas), propone un Nombre Estándar (moda del "Nombre
normalizado" que ya calculó la IA, o una limpieza básica si no hay
ninguno) y deja confirmarlo. Campo "Aplica" (Sí/No) para descartar líneas
que son servicios (fletes, comisiones) en vez de producto, con selección
múltiple para marcarlas en lote. Botón "+ Agregar producto" para dar de
alta uno a mano sin esperar a que aparezca en una factura. Backend:
`Code-cuentas-por-pagar-kioskos-backend.gs`, hoja "Maestro_Productos" del
Sheet "Cuentas por Pagar - Kioskos" (ya desplegado).

**Proveedores unificados (2026-07-28):** `cuentas-por-pagar.html` (pestaña
"Proveedores", 5ta pestaña) tenía su propio catálogo de proveedores en la
hoja "proveedores" de este mismo Sheet — duplicaba 1:1 el esquema y el CRUD
de `proveedores.html` (Sheet "Inventario - Kioskos") sin comunicarse con él.
Se retiró: `guardar_proveedor`/`eliminar_proveedor` y la hoja "proveedores"
ya no existen en `Code-cuentas-por-pagar-kioskos-backend.gs` (ver comentario
v4 al inicio de ese archivo); `cuentas-por-pagar.html` ahora lee/escribe
proveedores directo contra el Web App/Sheet de Inventario (constantes
`INVENTARIO_SHEET_ID`/`APPS_SCRIPT_INVENTARIO`, mismos valores que
`proveedores.html`). Si la hoja "proveedores" de este Sheet ya tenía filas
cargadas, copialas a mano a la pestaña "Proveedores" del Sheet "Inventario -
Kioskos" antes de borrarla — después de eso alcanza con pegar el código
nuevo del backend e Implementar → Nueva versión (no hace falta volver a
correr `configurarHojas()`).

**Fusión con Base de Productos (2026-07-25):** cada fila confirmada del
Maestro ahora ES también el catálogo de producto — botón **"🏷️ Ficha"**
por fila abre un modal con los mismos campos que iba a tener el módulo
descontinuado de arriba (Área de negocio, Presentación, Tamaño, Precio sin
IVA, IVA%, Cantidad presentación, Costo por unidad calculado, moneda ₡/US$
con conversión antes de guardar, Kioskos donde se vende vía la lista real
de RRHH, Activo). No hay Sheet ni ID aparte: los campos nuevos son
columnas dinámicas de "Maestro_Productos" (mismo mecanismo de
`columnaPorNombre()` que ya usaba "Aplica"), identificadas por la misma
Clave. Acción de backend nueva: `maestro_guardar_ficha`.

**Sugerencia de costo desde Desglose_IA**: en cada corrida de
"Sincronizar", `sincronizarMaestro()` también busca la línea de factura
más reciente de esa clave y guarda "Costo sugerido (última compra)" +
"Moneda sugerida" + "Fecha última compra" (columnas dinámicas, se
recalculan siempre, el usuario no las edita). El modal de ficha muestra esa
sugerencia con un botón "Usar esta sugerencia" que la copia al campo
Precio (ajustando la moneda). El Proveedor de la ficha no se pide aparte:
ya es el mismo Proveedor de la clave homologada.

**"Costo de compra" auto antes de la ficha (2026-07-27)**: mientras una
fila todavía no tiene ficha completada (sin "Ficha actualizada"),
`sincronizarMaestro()` también pisa "Costo por unidad" (la columna "Costo
de compra" de la tabla) con el último precio de factura — mismo valor que
"Costo sugerido" — para que no quede vacía ni desactualizada antes de que
alguien abra la ficha. Solo aplica si la última compra vino en colones (en
USD hace falta el tipo de cambio, que se resuelve al completar la ficha).
En cuanto se guarda la ficha una vez, "Costo por unidad" pasa a ser 100%
manual (Precio sin IVA ÷ Cantidad presentación) y el sync deja de tocarla.

`index.html` tiene un solo tile para este módulo: **Maestro de Productos**.

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
incapacidad/vacación. La base de CCSS (cuota obrera 10.83%, deducción
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
- `inventario.html` — catálogo de productos (tipo de control unitario/peso,
  tara, densidad, mínimos por kiosko), toma de inventario física con foto+IA
  para productos por peso (cierre bloqueado por PIN admin) y resultados/stock
  en vivo — ver detalle arriba.
- `compras.html` — facturas electrónicas de Gmail + compra manual, órdenes de
  compra sugeridas por mínimos, mapeos de factura aprendidos y proveedores —
  ver detalle arriba.
- `recetas.html` — recetas de venta y sincronización de consumo automático
  desde Square — ver detalle arriba.
- `productos.html` — catálogo básico de productos (**descontinuado**, nunca
  se desplegó; fusionado dentro de `maestro-productos.html` — ver detalle
  arriba).
- `maestro-productos.html` — homologación de nombres de factura a Nombre
  Estándar **y** ficha de producto (precio, costo, kioskos) por fila — ver
  detalle arriba.
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
- `Code-inventario-kioskos-v3-backend.gs` — backend vigente del Sheet nuevo
  "Inventario - Kioskos" (3 pestañas: `HISTORIAL_inventario`, `Minimos`,
  `Proveedores`) — alimenta `inventario.html`, `ordenes-compra.html` y
  `proveedores.html` (ver detalle arriba). Sin `doGet`; solo tres casos de
  `doPost` (`inventario`, `minimo_guardar`, `guardar_proveedor`/
  `eliminar_proveedor`). No depende del Maestro de Productos del lado del
  backend — el catálogo lo lee cada HTML directo por gviz.
- `Code-inventario-v2-backend.gs` — **DESCONTINUADO**, backend del Sheet
  "Inventario Kioskos v2" (16 pestañas: productos, categorías, mínimos por
  kiosko, stock en vivo, compras con lector de facturas XML de Gmail,
  mapeos de factura, proveedores, órdenes de compra, toma de inventario y
  recetas). Nunca se desplegó; reemplazado por
  `Code-inventario-kioskos-v3-backend.gs`. Conservado en el repo solo como
  referencia del diseño descartado.
- `Code-inventario-kioskos-backend.gs` — backend v1, descontinuado antes que
  v2 lo reemplazara; conservado en el repo solo como referencia.
- `Code-productos-backend.gs` — backend del Sheet nuevo "Base de Productos -
  Kioskos" (pestaña "Productos"): catálogo básico independiente, alimenta
  `productos.html` (ver detalle arriba).
- `Code-productos-backend.gs` — backend del Sheet nuevo "Base de Productos -
  Kioskos" (pestaña "Productos"): catálogo básico independiente, alimenta
  `productos.html` (ver detalle arriba).

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
6b. Para que "Cerrar cálculo" de `servicio-10.html` pueda archivar el PDF de
   cada reparto de Servicio 10%, creá una carpeta en Drive (ej. **"Servicio
   10% - Kioskos"**), copiá su ID y pegalo en `Code-rrhh-kioskos-backend.gs`,
   constante `FOLDER_ID_SERVICIO` — después volvé a Implementar → Gestionar
   implementaciones → Editar → Nueva versión. Sin este paso, el reparto se
   cierra igual (no bloquea) — solo el archivado en Drive queda pendiente.
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

### 5. Inventario, Órdenes de Compra y Proveedores

Sheet nuevo, en blanco — este módulo **no reutiliza** el Sheet de v1/v2 (el
de la sección 5b más abajo, ID `1Ghdop5T0Vo...`, si es que llegó a
desplegarse). Aunque el nombre sugerido sea el mismo ("Inventario -
Kioskos"), es un archivo de Google Sheets **distinto y nuevo** — no le
pongas el ID viejo.

1. Creá un Google Sheet nuevo, ej. **"Inventario - Kioskos"**.
2. Extensiones → Apps Script, pegá **todo** el contenido de
   `Code-inventario-kioskos-v3-backend.gs`.
3. Corré **una vez** `configurarHojas()` desde el editor (▶ con
   `configurarHojas` seleccionado) para crear las 3 pestañas
   (`HISTORIAL_inventario`, `Minimos`, `Proveedores`) con sus encabezados.
4. Implementar → Nueva implementación → Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
5. Copiá la URL `/exec` resultante y pegala en **`inventario.html`** y
   **`ordenes-compra.html`**, constante `APPS_SCRIPT_INVENTARIO`, y en
   **`proveedores.html`**, misma constante — es el mismo Web App para los
   tres archivos.
6. Copiá el **ID del Sheet** (de su URL) y pegalo en la constante
   `INVENTARIO_SHEET_ID` de esos mismos tres archivos — se usa para leer
   `HISTORIAL_inventario`/`Minimos`/`Proveedores` por gviz.
7. Compartí el Sheet como **"Cualquiera con el enlace puede ver"** (Lector)
   — sin esto, los tres archivos no pueden leer por gviz aunque el Web App
   ya esté configurado.

Sin los pasos 5-7, los tres archivos muestran "Falta configurar
APPS_SCRIPT_INVENTARIO"/listas vacías al cargar. El catálogo de productos
no se configura acá — sale del Maestro de Productos, ya desplegado (ver
sección "Maestro de Productos" más abajo); si ese Sheet no está compartido
como público-lector, tampoco va a cargar el catálogo.

### 5b. Inventario v2, Compras y Recetas — DESCONTINUADO, instructivo viejo

⚠️ Estos pasos corresponden al módulo descartado (ver aviso al inicio de la
sección "Inventario v2, Compras y Recetas" más arriba). Se dejan como
referencia, no hace falta seguirlos.

Sheet elegido: **"Inventario - Kioskos"** —
`1Ghdop5T0VoDomANJcdtqZclsu6Z4220eYxltJgnvDuA`
(https://docs.google.com/spreadsheets/d/1Ghdop5T0VoDomANJcdtqZclsu6Z4220eYxltJgnvDuA/edit,
dueño: jorge.lopez@casaaguizotes.com) — es el mismo Sheet que ya existía para
el módulo v1, reutilizado para v2 en vez de crear uno nuevo.

1. **Antes de pegar el código nuevo:** ese Sheet todavía tiene las 9 pestañas
   del esquema v1 (`Productos`, `Categorias`, `Stock`, `StockMovimientos`,
   `TomaInventario`, `TomaInventarioDetalle`, `Recetas`, `RecetasDetalle`,
   `VentasProcesadas`), con un único producto de prueba cargado ("Producto de
   prueba (borrar)"). 8 de esos nombres **coinciden** con pestañas que usa
   v2 pero con columnas distintas — `configurarHoja()` (ver paso 3) no
   pisa una pestaña que ya tiene filas, así que si no se limpia antes, el
   backend nuevo escribiría datos v2 bajo encabezados v1 desalineados.
   Borrá (clic derecho → Eliminar) las 9 pestañas v1 completas —no hay nada
   que valga la pena conservar, es solo el producto de prueba— y dejá el
   Sheet solo con la pestaña por defecto ("Hoja 1" u otra en blanco).
2. Extensiones → Apps Script, pegá **todo** el contenido de
   `Code-inventario-v2-backend.gs` (reemplazando cualquier código v1 que
   hubiera quedado pegado ahí).
3. Corré **una vez** `configurarHoja()` desde el editor para crear las 16
   pestañas (Productos, Categorias, Minimos, Stock, StockMovimientos,
   Proveedores, Compras, ComprasDetalle, MapeoFacturas, Recetas,
   RecetasDetalle, VentasProcesadas, TomaInventario, TomaDetalle,
   OrdenesCompra, OrdenesCompraDetalle) con sus encabezados. La primera
   ejecución va a pedir autorizar permisos de Sheets, Drive, Gmail y
   UrlFetch (Drive para las fotos de toma, Gmail para leer facturas XML,
   UrlFetch para consultar Square).
4. ⚙️ Configuración del proyecto → Propiedades del script → agregá
   `ADMIN_PIN` con el código que va a pedir "Cerrar toma" en
   `inventario.html` (default `admin` si no lo configurás — mismo PIN que
   `ADMIN_DEFAULT` en `login.html`; si cambiás uno, cambiá el otro).
5. Editá, arriba del código, la constante `SQUARE_URLS` con la URL `/exec`
   del Web App de Square (`Codigo-Square-completo-con-Descuentos.gs`, acción
   `?action=ventasPorProducto`) de cada kiosko que tenga Square propio —
   ej. `{ 'Playa Grande': 'https://script.google.com/macros/s/XXX/exec' }`.
   Los kioskos que falten acá simplemente no descuentan stock por venta
   automáticamente (pueden seguir usando compras/toma/OC igual). También
   podés ajustar `GMAIL_QUERY` (default `has:attachment filename:xml
   newer_than:7d`) a como reciben las facturas electrónicas.
6. Implementar → Nueva implementación → Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
7. Copiá la URL `/exec` resultante y pegala en **`inventario.html`,
   `compras.html` y `recetas.html`**, constante `INVENTARIO_V2_URL` (arriba
   del todo en el `<script>` de cada uno) — es el mismo Web App para los
   tres.
8. (Opcional) Corré **una vez** `crearTriggers()` desde el editor para que
   `sincronizarVentasAutomatico()` y `procesarFacturasAutomatico()` corran
   solas cada hora. Sin esto, el consumo por venta solo se aplica al apretar
   "Sincronizar ventas ahora" en `recetas.html`, y las facturas de Gmail solo
   se leen al apretar "Buscar facturas en Gmail ahora" en `compras.html`.
9. (Opcional, no aplica al Sheet elegido arriba porque su único dato v1 era
   el producto de prueba que se borra en el paso 1) Si en algún momento hay
   que traer Productos/Recetas reales desde **otro** Sheet v1 con datos
   cargados, poné su ID en la constante `V1_SPREADSHEET_ID` (arriba del
   código), volvé a Implementar → Nueva versión, y corré **una vez**
   `importarDesdeV1()` desde el editor — los productos migrados quedan en
   tipo "Unitario" por default: revisá después cuáles son en realidad de
   tipo "Peso" (licores y sifones) y completales tara/densidad desde el
   Catálogo de `inventario.html`.

Sin el paso 7, `inventario.html`, `compras.html` y `recetas.html` muestran el
error "Falta configurar INVENTARIO_V2_URL" al cargar. Sin los pasos 5, 8 y 9,
el resto del módulo (catálogo, mínimos, stock manual, compra manual, toma de
inventario, órdenes de compra, recetas) funciona igual — solo quedan
inactivos el descuento automático por venta, la lectura automática de
facturas de Gmail y la migración de datos viejos.

### 6. Base de Productos (módulo independiente) — DESCONTINUADO

⚠️ **No hace falta desplegar este Sheet.** Este módulo se fusionó dentro de
Maestro de Productos (2026-07-25) — los mismos campos ahora viven como
columnas dinámicas de la hoja "Maestro_Productos" ya desplegada (ver sección
"Maestro de Productos" arriba). Se deja este instructivo como referencia por
si algún día se necesita un catálogo verdaderamente aparte.

Sheet nuevo, **no reutiliza ningún Sheet existente** — este módulo es
intencionalmente independiente de Inventario v2.

1. Creá un Google Sheet nuevo, ej. **"Base de Productos - Kioskos"**.
2. Extensiones → Apps Script, pegá **todo** el contenido de
   `Code-productos-backend.gs`.
3. Corré **una vez** `configurarHoja()` desde el editor para crear la
   pestaña "Productos" con sus encabezados.
4. Implementar → Nueva implementación → Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
5. Copiá la URL `/exec` resultante y pegala en `productos.html`, constante
   `PRODUCTOS_URL` (arriba del todo en el `<script>`).

Sin el paso 5, `productos.html` muestra "Falta configurar PRODUCTOS_URL" al
cargar. No requiere carpeta de Drive (no maneja fotos) ni Script Properties.
El checkbox de kioskos por producto reutiliza `APPS_SCRIPT_RRHH` (la misma
URL que ya usan `compras.html`/`mermas.html`/`recetas.html`), así que no
hace falta ningún despliegue extra para eso — si esa URL cambia algún día
hay que actualizarla en todos esos archivos, `productos.html` incluido.

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
- `compras.html`
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
suelta por cierre), acá el monto a repartir se **calcula por fecha**:
"Total Ventas ₡" de Cierres ya incluye el 10% cobrado al cliente, así que
por cada día del periodo, **Venta Neta = Total Ventas ₡ ÷ 1.1** y **Monto
Servicio = Venta Neta × 10%** (10% fijo de ley, sin campo editable). Además,
no todos los días reparten entre el mismo equipo: la asignación de quién
recibe es **por fecha específica**, no un total del periodo prorrateado por
días trabajados. Cuatro pestañas:

- **Nuevo reparto**: elegís el kiosko (arriba) y el periodo (fecha inicio/
  fin), "Calcular reparto" trae la Venta Neta y el Monto Servicio de cada
  día individual desde "Cierres", y sugiere para cada uno los colaboradores
  que lo reciben según "Horarios" (turnos con Estado="Trabajo" ese día
  específico — vacaciones, incapacidad, permiso y días libres no cuentan).
  Cada día es editable por separado: se pueden agregar o quitar
  colaboradores solo para esa fecha (selector de Personal activo del
  kiosko, o "Otro / escribir nombre…"), y el monto por persona de ese día
  se recalcula en vivo (Monto Servicio del día ÷ cantidad de colaboradores
  asignados ese día). Debajo se arma un resumen agregado por colaborador
  (días totales y monto total en el periodo) solo para lectura — la edición
  real pasa siempre por el día, no por el total. Las fechas que ya quedaban
  cubiertas por un reparto cerrado anterior del mismo kiosko se **omiten
  automáticamente** del cálculo (con aviso) para no pagarlas dos veces.
  **"Cerrar cálculo"** genera un PDF del detalle (jsPDF + html2canvas, mismo
  patrón que el cierre de semana de `horarios.html`), lo archiva en Drive y
  guarda el reparto ya cerrado en un solo paso — no existe un estado
  "borrador" editable después; si hace falta corregir algo, se cierra un
  reparto nuevo (las fechas ya cerradas no se pueden repetir, ver control
  de fechas abajo).
- **Pendientes de pago**: agrupa el detalle (guardado por fecha) por
  colaborador + reparto, mostrando una sola fila por persona con el rango de
  fechas y el monto total de ese reparto — se puede seleccionar y pagar de a
  uno o varios juntos (incluso de distintos repartos/kioskos) con una fecha
  y referencia común, igual que control-tips.html.
- **Historial de repartos**: lista de cálculos cerrados por kiosko, con
  badge de Pagado completo/Parcial/Pendiente, link al PDF archivado en
  Drive (si se pudo subir) y detalle desplegable con el resumen por
  colaborador (días, monto, estado de pago).
- **Control de fechas**: para el kiosko elegido y un rango de fechas,
  compara los días con ventas registradas en "Cierres" contra los días ya
  cubiertos por algún reparto cerrado, y marca cada fecha como "Incluida ✓"
  o "Falta ⚠" — para poder verificar que ningún día quedó sin repartir.

**Control de fechas repetidas**: además de omitirlas automáticamente al
calcular (arriba), `guardarServicioReparto()` en el backend vuelve a
validar — por las dudas de que dos personas cierren cálculos casi al mismo
tiempo — que ninguna fecha del reparto que se está cerrando ya esté cubierta
por otro reparto cerrado del mismo kiosko, y rechaza el cierre completo si
encuentra alguna (listándola en el mensaje de error) en vez de guardar
datos duplicados.

Backend: mismo Web App de RRHH (`Code-rrhh-kioskos-backend.gs`), extendido
con 2 pestañas nuevas — **ServicioRepartos** (maestro, uno por reparto
cerrado: kiosko, periodo, ventas netas, monto total, cantidad de días y
colaboradores, y la URL del PDF archivado) y **ServicioRepartoDetalle**
(una fila por **fecha + colaborador**, con su propio Pagado/Fecha pago/
Referencia pago — la fecha vive a nivel de detalle, no de maestro, porque
un mismo reparto puede tener distintos colaboradores en distintos días).
`servicio-10.html` además lee directamente el Web App de ventas
(`SHEETS_URL`, mismo que cierres.html/control-tips.html) para traer Total
Ventas ₡ de "Cierres" día por día, y `?modulo=horarios`/`?modulo=personal`
del Web App de RRHH para sugerir colaboradores por fecha y ofrecer el
selector de "+ agregar" — no hace falta ningún despliegue nuevo del lado de
ventas, solo correr `configurarHojas()` una vez más en el Sheet de RRHH
(ver paso 2 más abajo) para que cree las 2 pestañas nuevas.

Para que "Cerrar cálculo" pueda archivar el PDF en Drive, creá una carpeta
(ej. **"Servicio 10% - Kioskos"**), copiá su ID y pegalo en
`Code-rrhh-kioskos-backend.gs`, constante `FOLDER_ID_SERVICIO` — después
volvé a Implementar → Gestionar implementaciones → Editar → Nueva versión.
Mientras esté vacío, el reparto se cierra igual (no bloquea), solo no queda
copia en Drive.

## Próximos módulos (sugeridos, sin construir todavía)

- **Reportes consolidados** — comparativo de ventas/balance entre los 4
  kioskos y los que se vayan sumando.
- **Cierre de semana de Horarios por kiosko** — hoy "Cerrar horario" bloquea
  la semana completa en las 4 pestañas a la vez (ver nota en la sección de
  RRHH); si hace falta cerrar cada kiosko por separado, requeriría cambiar
  la clave de `HorariosEstado` de "Semana inicio" a "Semana inicio + Kiosko".
