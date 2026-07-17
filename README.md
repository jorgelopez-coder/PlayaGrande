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

Segundo módulo: **RRHH** (`rrhh.html`) — alta de colaboradores reales (nombre,
cédula, puesto, kiosko, fecha de ingreso, teléfono, email, salario,
observaciones) y listado de personal con filtro por kiosko/estado y botón
para activar/desactivar. Usa el mismo backend mínimo (`Code-rrhh-kioskos-
backend.gs`) que ya alimentaba el dropdown de "Encargado" en cierres.html —
no requirió cambios en el Sheet ni en Apps Script. Lo que falta para RRHH
completo (editar datos ya cargados, vacaciones, amonestaciones, horarios)
queda para más adelante, ver "Próximos módulos".

El resto de módulos (inventario/compras, reportes) quedan como
"Próximamente" en `index.html`, a construir después.

Archivos:
- `index.html` — home con navegación entre módulos.
- `login.html` — acceso por PIN (mismo patrón simple que Lorito, sin backend
  propio — roles guardados en `localStorage`; ver "Pendiente" más abajo).
- `cierres.html` — módulo de cierre de caja (formulario + historial).
- `rrhh.html` — módulo de RRHH (alta de personal + listado con activar/
  desactivar).
- `Code-cierres-kioskos-backend.gs` — backend del Sheet de ventas.
- `Code-rrhh-kioskos-backend.gs` — backend mínimo de personal (alimenta el
  dropdown de "Encargado" en cierres.html y ahora también rrhh.html).

## Pendiente de conexión (todo manual, vía script.google.com)

Apps Script no tiene API para automatizar el despliegue — estos pasos hay
que hacerlos una vez a mano.

### 1. Sheet de ventas (Cierres de Caja)

1. Creá un Google Sheet nuevo, ej. **"Registro Ventas - Kioskos"**.
2. Extensiones → Apps Script, pegá **todo** el contenido de
   `Code-cierres-kioskos-backend.gs`.
3. Corré **una vez** `agregarEncabezados()` desde el editor (▶ con esa
   función seleccionada) para crear la pestaña "Cierres" con encabezados.
4. Implementar → Nueva implementación → Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
5. Copiá la URL `/exec` resultante y pegala en `cierres.html`, constante
   `SHEETS_URL` (arriba del todo en el `<script>`).
6. Creá una carpeta en Drive para las fotos de respaldo de los cierres (ej.
   **"Cierres de caja - Kioskos"**), copiá su ID (de la URL de la carpeta) y
   pegalo en `Code-cierres-kioskos-backend.gs`, constante
   `FOLDER_ID_CIERRES` — después de pegarlo, volvé a Implementar → Gestionar
   implementaciones → Editar → Nueva versión (la URL `/exec` no cambia).

Sin el paso 6, guardar un cierre con foto va a fallar (`DriveApp.getFolderById`
con un ID inválido) — si por ahora no vas a usar fotos, no pasa nada, se puede
guardar el cierre sin adjuntar ninguna.

### 2. Sheet de personal (RRHH mínimo)

1. Creá un Google Sheet nuevo, ej. **"RRHH - Kioskos"**.
2. Extensiones → Apps Script, pegá **todo** el contenido de
   `Code-rrhh-kioskos-backend.gs`.
3. Corré **una vez** `configurarHojas()` desde el editor para crear la
   pestaña "Personal" con encabezados (Nombre completo, Cédula, Puesto,
   Estado, Kiosko, Fecha ingreso, Teléfono, Email, Salario, Observaciones).
4. Implementar → Nueva implementación → Tipo: **Aplicación web** (mismo
   patrón que arriba: Ejecutar como Yo, Acceso: Cualquiera).
5. Copiá la URL `/exec` resultante y pegala en `cierres.html`, constante
   `APPS_SCRIPT_RRHH`.
6. Cargá el personal desde `rrhh.html` → pestaña "Agregar colaborador" (queda
   con `Estado = ACTIVO` automáticamente), o directamente en la pestaña
   "Personal" del Sheet si preferís cargar varios de una vez. El campo
   `Kiosko` es opcional: si un colaborador trabaja fijo en un solo kiosko,
   completalo para que solo aparezca como opción ahí; dejándolo vacío,
   aparece como encargado disponible en cualquier kiosko.
7. Copiá esa misma URL `/exec` en `rrhh.html`, constante `APPS_SCRIPT_RRHH`
   (arriba del todo en el `<script>`) — es la misma URL que en `cierres.html`.

Sin el paso 5, el dropdown "Encargado" en `cierres.html` muestra "Configurá
APPS_SCRIPT_RRHH primero". Sin el paso 7, `rrhh.html` muestra el mismo
mensaje al intentar cargar o guardar personal.

**Nota:** `rrhh.html` solo permite dar de alta y activar/desactivar
colaboradores — no permite editar un registro ya cargado (cédula, puesto,
salario, etc.). Para corregir un dato existente, hacelo directamente en la
pestaña "Personal" del Sheet.

## Kioskos activos

La lista de kioskos vive directo en `cierres.html` (constante `KIOSKOS`, al
inicio del `<script>`) — no depende de ningún backend. Para sumar un kiosko
nuevo (o abrir uno más adelante) alcanza con agregarlo a ese arreglo; el
Sheet no necesita ningún cambio, el nombre nuevo se guarda tal cual en la
columna "Kiosko".

## Extracción con IA (opcional, no incluida todavía)

En Lorito, `cierres.html` tiene un botón "Extraer datos con IA" que lee la
foto del cierre con un extractor separado (Apps Script + `ANTHROPIC_API_KEY`,
ver `EXTRACTOR_URL` en el código de Lorito). Acá quedó **desconectado a
propósito** (`EXTRACTOR_URL = ''`) — el botón queda oculto y todo el
formulario funciona 100% manual. Si más adelante lo querés activar, hay que:

1. Copiar el proyecto `cierre-extractor/Code.gs` de Ecosistema-Lorito a un
   Sheet nuevo, desplegarlo como Web App con su propia `ANTHROPIC_API_KEY` en
   Propiedades del script.
2. Pegar esa URL `/exec` en `EXTRACTOR_URL` dentro de `cierres.html`.

## Login / control de accesos

`login.html` usa el mismo patrón simple que Lorito: PIN guardado en
`localStorage` (`portal_roles`), sin backend propio. Por ahora solo existe el
PIN de administrador por defecto (`admin`/`admin`) — para producción, sumale
un rol por persona/kiosko editando el arreglo `ADMIN_DEFAULT` en
`login.html`, o construí más adelante una pantalla de "Administrar accesos"
como `admin-accesos.html` en Lorito.

## Próximos módulos (sugeridos, sin construir todavía)

- **Inventario y compras** por kiosko (stock de cerveza/licores/insumos).
- **RRHH completo** (vacaciones, amonestaciones, horarios) — ampliando
  `Code-rrhh-kioskos-backend.gs` con el mismo patrón que
  `Code-rrhh-backend.gs` de Lorito.
- **Reportes consolidados** — comparativo de ventas/balance entre los 4
  kioskos y los que se vayan sumando.
