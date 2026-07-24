# Diseño — Inventario Kioskos v2

**Fecha:** 2026-07-24 · **Estado:** Borrador para aprobación de Jorge
**Reemplaza:** módulo actual `inventario.html` + `recetas.html` + `Code-inventario-kioskos-backend.gs` (rediseño desde cero, decidido 2026-07-24)

---

## 1. Objetivo

Controlar el inventario de licores y cervezas de todos los kioskos con dos métodos de control (conteo unitario y peso), alimentado por compras (factura electrónica o manual) y descargado automáticamente por las ventas de Square vía recetas. El ciclo cierra con la toma física de inventario (con evidencia fotográfica de la báscula y extracción de peso por IA), la comparación teórico vs. físico, y la generación de órdenes de compra según mínimos.

**El ciclo completo:**

```
Compras (+) ──►┌─────────────┐◄── Ventas Square × Recetas (−)
               │    STOCK     │◄── Mermas (−)
Ajustes (±) ──►│   TEÓRICO    │
               └──────┬───────┘
                      │ comparación
               ┌──────▼───────┐
               │ TOMA FÍSICA  │ conteo + peso con foto/IA
               └──────┬───────┘
                      │ diferencia (₡ y unidades)
               ┌──────▼───────┐
               │ ORDEN COMPRA │ stock vs mínimos
               └──────────────┘
```

---

## 2. Los dos tipos de control

Cada producto se marca con un **Tipo de Control**:

| Tipo | Aplica a | Cómo se mide |
|---|---|---|
| **Unitario** | Cerveza en botella/lata, gaseosas, agua, kombucha, vino cerrado, insumos | Conteo de unidades enteras |
| **Peso** | Cerveza en sifón (barriles) y destilados (ron, tequila, gin, licores) | Báscula, en **gramos** (consistente con Mermas) |

### El caso mixto (es la regla, no la excepción)

Un destilado tiene a la vez botellas **cerradas** (se cuentan) y una botella **abierta** (se pesa). Un sifón tiene barriles **cerrados** (se cuentan) y el barril **conectado** (se pesa). El producto es de tipo Peso, pero la toma captura ambos:

```
Stock total (ml) = cerradas × contenido_ml + (peso_bruto_g − tara_g) / densidad
```

Por eso cada producto de tipo Peso necesita tres datos maestros:

- **Contenido por envase (ml)** — ej. botella de ron 750 ml, barril 19 000 ml (quinto) o 58 670 ml (medio).
- **Tara (g)** — peso del envase vacío: botella vacía o barril vacío. Se captura una vez por producto (pesar un envase vacío al darlo de alta).
- **Densidad (g/ml)** — por producto (decidido 2026-07-24). Referencias: cerveza ≈ 1.005, destilados 40° ≈ 0.94, licores cremosos ≈ 1.05. Con la densidad, el peso neto se convierte a ml y se compara contra las recetas.

La **unidad base** de cada producto es en la que se lleva el stock y se escriben las recetas: `unidad` para unitarios, `ml` para peso.

---

## 3. Base de datos

Google Sheet nuevo: **"Inventario Kioskos v2"**, con backend Apps Script propio (`Code-inventario-v2-backend.gs`), mismo patrón del ecosistema (Web App JSON, `configurarHoja()`, PIN admin, log append-only).

| Pestaña | Contenido (columnas clave) |
|---|---|
| **Productos** | ID, Nombre Interno, Categoría, Tipo Control (unitario/peso), Unidad Base, Contenido Envase (ml), Tara (g), Densidad (g/ml), Costo por Unidad Base (₡), Proveedor habitual, Activo |
| **Categorias** | Nombre, Orden, Activo |
| **Minimos** | Producto ID, Kiosko, Mínimo, Nivel Objetivo, Actualizado — *mínimos por kiosko, no globales: Playa Grande no vende igual que Liberia* |
| **Stock** | Producto ID, Kiosko, Cantidad Actual (unidad base), Actualizado — upsert, una fila por producto×kiosko |
| **StockMovimientos** | ID, Fecha, Kiosko, Producto, Tipo (compra/venta/merma/ajuste/conteo), Cantidad ±, Referencia, Registrado por — *auditoría append-only* |
| **Proveedores** | ID, Nombre, Cédula jurídica, Correo pedidos, Teléfono, Activo |
| **Compras** | ID, Fecha, Kiosko, Proveedor, Nº factura / Clave Hacienda, Origen (gmail-xml/manual), Total ₡, Estado (pendiente-mapeo/aplicada), Registrado por |
| **ComprasDetalle** | Compra ID, Línea original (texto factura), Producto ID, Cantidad (unidad base), Costo línea |
| **MapeoFacturas** | Proveedor, Texto/código de línea en factura (CABYS o descripción), Producto ID, Factor (ej. "caja 24" → 24 unidades) — *se aprende una vez y las siguientes facturas del proveedor se mapean solas* |
| **Recetas** | ID, Nombre de Venta (Square), Kiosko (o "todos"), Activo |
| **RecetasDetalle** | Receta ID, Producto ID, Cantidad por unidad vendida (en unidad base: ml o unidades) |
| **VentasProcesadas** | Clave única por línea de venta — idempotencia del sync (mismo patrón que hoy) |
| **TomaInventario** | ID, Kiosko, Fecha, Estado (abierta/cerrada), Abierta/Cerrada por y en |
| **TomaDetalle** | Toma ID, Producto ID, Envases cerrados contados, Peso bruto (g), Tara usada, Neto (ml), Total contado (unidad base), Stock teórico, Diferencia, Diferencia ₡, Foto ID (Drive), Notas |
| **OrdenesCompra** | ID, Fecha, Kiosko, Proveedor, Estado (borrador/enviada/recibida), Generada por |
| **OrdenesCompraDetalle** | OC ID, Producto ID, Stock al generar, Mínimo, Cantidad sugerida, Cantidad final, Compra ID de recepción |

---

## 4. Procesos operativos

### 4.1 Alta de productos (una vez, y mantenimiento)

Admin da de alta cada producto con su tipo de control. Para tipo Peso, el alta exige tara y densidad (formulario no deja guardar sin esos campos). Ritual de alta: pesar un envase vacío en la báscula del kiosko → ese es la tara.

### 4.2 Compras

Dos vías de entrada, misma tabla:

**A. Automática desde factura electrónica (Gmail).** Trigger horario en el backend busca correos con XML adjunto (facturas Hacienda v4.4) bajo una etiqueta/query de Gmail acordada. Parsea emisor, clave y líneas (descripción, CABYS, cantidad, precio). Cada línea se matchea contra **MapeoFacturas**; lo que no matchea queda en estado **pendiente-mapeo** y aparece en la pantalla de Compras para que alguien lo asigne a un producto (con su factor de conversión, ej. 1 caja = 24 botellas). Ese mapeo queda aprendido. La clave de Hacienda evita duplicados. *Pendiente definir: el kiosko destino no viene en la factura — se asigna al aprobar (ver §7).*

**B. Manual.** Formulario en la pantalla de Compras: proveedor, factura, kiosko, líneas producto+cantidad+costo. Para compras sin factura electrónica o traslados entre kioskos.

Al quedar **aplicada**, la compra genera movimientos tipo `compra` y suma al Stock.

### 4.3 Consumo teórico (Square × Recetas)

Igual concepto que hoy, reconstruido en v2: cada **Nombre de Venta** de Square (ej. "Mojito", "Beach Lager Draft 16 onz") tiene una receta que lista qué productos descuenta y cuánto por unidad vendida — "Mojito" → 60 ml Ron blanco; "Draft 16 onz" → 473 ml del barril correspondiente. El sync (horario + botón manual) lee `?action=ventasPorProducto` del Web App de Square de cada kiosko, aplica recetas y genera movimientos tipo `venta`. Ventas sin receta se listan como "sin mapear" para completarlas — con los ~80 nombres de venta activos (ver `pedido_recomendado_*.csv`) la carga inicial de recetas es un trabajo de una tarde.

Las **mermas** ya registradas en `mermas.html` se leen del Sheet de Mermas y se aplican como movimientos tipo `merma` (descargo justificado, no aparece como faltante en la toma).

### 4.4 Toma de inventario (con foto y IA)

Por kiosko. "Iniciar toma" congela el stock teórico del momento; "Cerrar toma" pide PIN admin (patrón actual).

El formulario recorre los productos por categoría:

- **Unitario:** se digita el conteo.
- **Peso:** por cada producto, (1) se cuentan los envases cerrados y (2) se pone el envase abierto/barril conectado en la báscula y **se toma foto de la pantalla de la báscula con la botella**. La IA extrae el peso de la foto (mismo patrón ya operativo de `Code-mermas-extractor.gs` — Apps Script + visión de Anthropic) y lo precarga en el campo, editable si la lectura falla. La foto se guarda en Drive (carpeta "Inventario - Fotos"/kiosko, igual que Mermas) como **evidencia auditable** de cada pesaje, enlazada a la línea de la toma.

El sistema calcula en vivo: neto = bruto − tara, ml = neto ÷ densidad, total = cerradas × contenido + ml.

### 4.5 Resultados: teórico vs. físico

Al cerrar la toma, por producto:

```
Teórico  = toma anterior + compras − ventas (recetas) − mermas ± ajustes
Diferencia = contado − teórico     (en unidad base y en ₡ al costo)
```

Reporte por toma con las diferencias ordenadas por impacto en colones, % de diferencia por categoría, y evolución entre tomas. Es el número que dice si hay fuga: lo que falta y **no** está justificado ni por venta ni por merma registrada. El cierre de la toma ajusta el Stock al valor contado (movimiento tipo `conteo`), para que cada período arranque limpio.

### 4.6 Órdenes de compra

Desde la pantalla de compras: para un kiosko, el sistema lista todo producto con `stock < mínimo` y sugiere `nivel objetivo − stock` (si no hay nivel objetivo, sugiere hasta 2× mínimo), redondeado a envases/cajas enteras. El usuario ajusta, agrupa por proveedor y genera la OC (borrador → enviada). Exportable a PDF/CSV o enviada por correo al proveedor. Cuando llega la factura, la compra se enlaza a la OC (estado `recibida`) y el ciclo cierra.

---

## 5. Arquitectura técnica

Consistente con el ecosistema (HTML estático + Apps Script Web App JSON, sin librerías externas):

| Pieza | Descripción |
|---|---|
| `Code-inventario-v2-backend.gs` | Web App nuevo atado al Sheet "Inventario Kioskos v2". Incluye el lector de Gmail (permiso Gmail en el mismo proyecto), el sync de Square y los triggers horarios. |
| `inventario.html` (rediseñada) | Pestañas: Stock por kiosko · Toma de inventario · Resultados/histórico · Catálogo (productos, categorías, mínimos). |
| `compras.html` (nueva) | Pestañas: Compras (bandeja XML pendiente-mapeo + formulario manual) · Mapeos de factura · Órdenes de compra · Proveedores. |
| `recetas.html` (rediseñada) | Recetas por nombre de venta + estado del sync + ventas sin mapear. |
| Extractor IA | Reutiliza el Web App de `Code-mermas-extractor.gs` ya desplegado (misma `EXTRACTOR_URL`); solo se agrega la carpeta Drive de evidencias de inventario. |
| Square | Acción `?action=ventasPorProducto` ya existente en cada Web App de Square por kiosko. |

Kioskos sin Square propio: pueden usar todo (compras, toma, OC); solo el descuento automático por venta queda inactivo, igual que hoy.

---

## 6. Fases de implementación

| Fase | Alcance | Resultado visible |
|---|---|---|
| **1. Base** | Sheet v2 + backend + catálogo con tipo control/tara/densidad + mínimos por kiosko + stock + compras manuales | Ya se puede cargar el catálogo y registrar compras |
| **2. Toma + resultados** | Toma con conteo/peso, foto + IA, evidencia en Drive, reporte teórico vs. físico | Primera toma real con evidencia |
| **3. Ventas y mermas** | Recetas + sync Square + lectura de mermas | Stock teórico se mueve solo |
| **4. Facturas Gmail** | Lector XML + bandeja pendiente-mapeo + MapeoFacturas | Compras entran solas |
| **5. Órdenes de compra** | Sugeridos por mínimos + OC + envío | Ciclo completo cerrado |

Migración desde v1: importar Productos y Recetas existentes al formato nuevo (script de una vez); las páginas v1 se retiran cuando la fase 3 esté viva.

---

## 7. Decisiones abiertas (para resolver antes o durante Fase 1)

1. **Kiosko destino de facturas XML:** ¿un correo/etiqueta por kiosko, o se asigna a mano al aprobar cada factura? (Recomendado: asignar al aprobar; es un clic y evita configurar correos.)
2. **Básculas:** confirmar que cada kiosko tiene báscula con capacidad para el barril conectado (un medio barril lleno ronda 72 kg). Si no, el barril conectado se estima por ventas y solo destilados se pesan.
3. **Nivel objetivo:** ¿lo definimos por producto×kiosko desde el inicio, o arrancamos con la regla 2× mínimo?
4. **Frecuencia de toma:** ¿semanal por kiosko? Define qué tan fino es el reporte de diferencias.
5. **Quién mapea:** facturas pendientes y ventas sin receta necesitan un responsable (¿administrador de cada kiosko o central?).
