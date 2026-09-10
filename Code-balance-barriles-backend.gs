/**
 * Balance de Barriles de Cerveza — Backend (Code-balance-barriles-backend.gs)
 * ============================================================================
 * Sheet dedicado: "Balance Barriles - Kioskos" (este script va pegado en el
 * Apps Script atado a ESE Sheet — no comparte Sheet con Mermas ni con nada
 * más del ecosistema).
 *
 * Diseño completo: Diseno-Modulo-Balance-Barriles.md (raíz del repo).
 *
 * Qué hace (y qué NO hace) este backend: solo CRUD de las 4 pestañas propias
 * del módulo, y fotos a Drive. Compras (Cuentas por Pagar), ventas (Square)
 * y mermas se leen en vivo desde balance-barriles.html vía gviz — este
 * script no las toca ni las duplica, así que no hay nada que sincronizar.
 *
 * PASOS DE INSTALACIÓN:
 *   1. Crear un Sheet nuevo: "Balance Barriles - Kioskos".
 *   2. Extensiones ▸ Apps Script, pegar este archivo completo.
 *   3. Crear una carpeta en Drive para las fotos (ej. "Balance Barriles -
 *      Fotos", dentro de la carpeta general de Kioskos) y pegar su ID acá
 *      abajo en FOLDER_ID_BALANCE_BARRILES (el ID es lo que va entre
 *      /folders/ y el final en la URL de la carpeta).
 *   4. Correr la función configurarHojas() UNA VEZ desde el editor (▶ con
 *      configurarHojas seleccionado) — va a pedir autorizar acceso a Drive
 *      y a esta hoja.
 *   5. Implementar ▸ Nueva implementación ▸ Tipo: Aplicación web,
 *      "Ejecutar como: yo", "Quién tiene acceso: cualquier persona".
 *   6. Copiar la URL /exec resultante y pegarla en BALANCE_URL dentro de
 *      balance-barriles.html.
 *
 * Si se agregan columnas nuevas más adelante: siempre al FINAL del array
 * ENCABEZADOS_* correspondiente (nunca insertar en el medio), volver a
 * pegar el código, Implementar ▸ Gestionar implementaciones ▸ Editar ▸
 * Nueva versión (la URL /exec no cambia), y correr configurarHojas() de
 * nuevo para que la fila de encabezados se actualice sin tocar datos ya
 * guardados.
 *
 * 2026-09-10 — "Controles": el módulo (visible en el frontend como
 * "Controles", ver balance-barriles.html) creció de solo cerveza en barril
 * a 3 grupos: Cerveza Barril (sin cambios, todo lo de arriba sigue igual),
 * Cerveza Botella y Proteínas (nuevo, ver bloque al final del archivo). Se
 * agregaron 6 hojas nuevas — ninguna hoja ni columna existente de barril se
 * tocó, por eso no hace falta re-migrar nada de lo que ya está en producción.
 */

// ── CARPETA DE FOTOS ────────────────────────────────────────────────
// TODO: pegar acá el ID de la carpeta de Drive "Balance Barriles - Fotos".
const FOLDER_ID_BALANCE_BARRILES = 'TODO_PEGAR_ID_CARPETA_DRIVE';

// ── HOJAS ───────────────────────────────────────────────────────────

// Catálogo global de estilos de cerveza en barril.
const HOJA_ESTILOS = 'Estilos';
const ENCABEZADOS_ESTILOS = [
  'ID', 'Nombre', 'Peso Neto Nominal por Barril (g)', 'Tara Nominal (g)',
  'Nombre Estándar Compra', 'Barriles por Unidad de Factura',
  'Palabra Clave en Ventas Square', 'Densidad (g/ml)', 'Activo', 'Actualizado'
];

// Disponibilidad de cada estilo por kiosko (matriz). Upsert por Kiosko+EstiloID.
const HOJA_ESTILOS_KIOSKO = 'EstilosKiosko';
const ENCABEZADOS_ESTILOS_KIOSKO = ['Kiosko', 'EstiloID', 'Estilo', 'Disponible', 'Actualizado'];

// Configuración general: peso neto y tara nominales, ÚNICOS para todos los
// estilos (antes eran por estilo, pero en la práctica siempre era el mismo
// número — a pedido de Jorge, 2026-09-09). Una sola fila (fila 2 siempre).
// Al guardarse, se propaga a todas las filas de Estilos (ver
// guardarConfiguracionGeneral) para que el resto del módulo, que lee el
// peso/tara desde cada fila de Estilos, siga funcionando sin cambios.
// NOTA (2026-09-10): esta configuración general es SOLO de Cerveza Barril
// — Botella y Proteínas no tienen (ni necesitan) peso/tara/densidad nominal
// propios, ver bloque "CONTROLES: BOTELLA Y PROTEÍNAS" al final del archivo.
const HOJA_CONFIG_GENERAL = 'ConfiguracionGeneral';
const ENCABEZADOS_CONFIG_GENERAL = ['Peso Neto Nominal por Barril (g)', 'Tara Nominal (g)', 'Barriles por Unidad de Factura', 'Densidad (g/ml)', 'Actualizado'];

// Puntos de partida: el peso inicial (Tipo=Inicial) y cada reset posterior
// (Tipo=Reset) se guardan acá, por la misma vía — ver balance-barriles.html,
// pestaña "Punto de partida". El saldo esperado de cualquier fecha se
// calcula siempre desde el más reciente de estos anterior a esa fecha.
const HOJA_PUNTOS = 'PuntosDePartida';
const ENCABEZADOS_PUNTOS = [
  'ID', 'Fecha', 'Kiosko', 'EstiloID', 'Estilo', 'Tipo', 'Peso Bruto (g)',
  'Tara Usada (g)', 'Peso Neto (g)', 'Foto URL', 'Registrado por',
  'Registrado', 'Notas', 'Barriles Llenos en Bodega'
];

// Arqueos: pesada física comparada contra el saldo esperado que el cliente
// ya calculó al momento de guardar. Es puramente informativo/comparativo —
// nunca modifica el punto de partida ni el saldo hacia adelante. Esta misma
// hoja ES el log de resultados pedido.
const HOJA_ARQUEOS = 'Arqueos';
const ENCABEZADOS_ARQUEOS = [
  'ID', 'Fecha', 'Kiosko', 'EstiloID', 'Estilo', 'Peso Bruto (g)',
  'Tara Usada (g)', 'Peso Neto (g)', 'Saldo Esperado (g)', 'Diferencia (g)',
  'Diferencia (%)', 'Foto URL', 'Registrado por', 'Registrado', 'Notas',
  'Barriles Llenos en Bodega'
];

// ── CONTROLES: BOTELLA Y PROTEÍNAS (agregado 2026-09-10) ───────────
// Mismo patrón exacto que Barril arriba, pero:
//  - Botella: se cuenta por UNIDAD (no se pesa) — no hay peso/tara/densidad
//    nominal, ni "barriles en bodega": el punto de partida/arqueo es
//    directamente una cantidad de botellas contadas.
//  - Proteína: SÍ se pesa (báscula), igual que Barril, pero sin el concepto
//    de "bodega" (no vienen en unidades selladas de tamaño fijo como un
//    barril) — un solo peso bruto/tara/neto por punto de partida/arqueo.
//  - Ninguna de las dos usa "Peso/Barriles por Unidad de Factura" propio:
//    la conversión de unidad de compra → unidad de control se lee en vivo
//    del Maestro de Productos ('Unidad Receta' + 'Conversión Receta', ya
//    mantenido por Jorge para Recetas) desde el frontend — este backend no
//    la duplica.
//  - Ninguna de las dos resta merma prorrateada (Mermas solo mide pérdida
//    de barril) — su saldo esperado es punto de partida + compras − ventas.
//  - Proteína NO tiene "palabra clave en ventas Square": sus ventas se
//    calculan en el frontend a partir del módulo de Recetas (cuánta
//    proteína lleva cada plato vendido), no por nombre de producto.

const HOJA_ESTILOS_BOTELLA = 'EstilosBotella';
const ENCABEZADOS_ESTILOS_BOTELLA = [
  'ID', 'Nombre', 'Nombre Estándar Compra', 'Palabra Clave en Ventas Square',
  'Activo', 'Actualizado'
];

const HOJA_PROTEINAS = 'Proteinas';
const ENCABEZADOS_PROTEINAS = [
  'ID', 'Nombre', 'Nombre Estándar Compra', 'Activo', 'Actualizado'
];

const HOJA_PUNTOS_BOTELLA = 'PuntosDePartidaBotella';
const ENCABEZADOS_PUNTOS_BOTELLA = [
  'ID', 'Fecha', 'Kiosko', 'EstiloID', 'Estilo', 'Tipo', 'Cantidad (unidades)',
  'Foto URL', 'Registrado por', 'Registrado', 'Notas'
];

const HOJA_ARQUEOS_BOTELLA = 'ArqueosBotella';
const ENCABEZADOS_ARQUEOS_BOTELLA = [
  'ID', 'Fecha', 'Kiosko', 'EstiloID', 'Estilo', 'Cantidad (unidades)',
  'Saldo Esperado (unidades)', 'Diferencia (unidades)', 'Diferencia (%)',
  'Foto URL', 'Registrado por', 'Registrado', 'Notas'
];

const HOJA_PUNTOS_PROTEINA = 'PuntosDePartidaProteina';
const ENCABEZADOS_PUNTOS_PROTEINA = [
  'ID', 'Fecha', 'Kiosko', 'ProteinaID', 'Proteina', 'Tipo', 'Peso Bruto (g)',
  'Tara Usada (g)', 'Peso Neto (g)', 'Foto URL', 'Registrado por',
  'Registrado', 'Notas'
];

const HOJA_ARQUEOS_PROTEINA = 'ArqueosProteina';
const ENCABEZADOS_ARQUEOS_PROTEINA = [
  'ID', 'Fecha', 'Kiosko', 'ProteinaID', 'Proteina', 'Peso Bruto (g)',
  'Tara Usada (g)', 'Peso Neto (g)', 'Saldo Esperado (g)', 'Diferencia (g)',
  'Diferencia (%)', 'Foto URL', 'Registrado por', 'Registrado', 'Notas'
];

function configurarHojas() {
  prepararHoja(HOJA_ESTILOS, ENCABEZADOS_ESTILOS);
  prepararHoja(HOJA_ESTILOS_KIOSKO, ENCABEZADOS_ESTILOS_KIOSKO);
  prepararHoja(HOJA_CONFIG_GENERAL, ENCABEZADOS_CONFIG_GENERAL);
  prepararHoja(HOJA_PUNTOS, ENCABEZADOS_PUNTOS);
  prepararHoja(HOJA_ARQUEOS, ENCABEZADOS_ARQUEOS);
  prepararHoja(HOJA_ESTILOS_BOTELLA, ENCABEZADOS_ESTILOS_BOTELLA);
  prepararHoja(HOJA_PROTEINAS, ENCABEZADOS_PROTEINAS);
  prepararHoja(HOJA_PUNTOS_BOTELLA, ENCABEZADOS_PUNTOS_BOTELLA);
  prepararHoja(HOJA_ARQUEOS_BOTELLA, ENCABEZADOS_ARQUEOS_BOTELLA);
  prepararHoja(HOJA_PUNTOS_PROTEINA, ENCABEZADOS_PUNTOS_PROTEINA);
  prepararHoja(HOJA_ARQUEOS_PROTEINA, ENCABEZADOS_ARQUEOS_PROTEINA);
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

// ── doGet ───────────────────────────────────────────────────────────
// ?modulo=estilos (default) | estilos_kiosko | puntos_partida | arqueos |
//   configuracion_general | estilos_botella | proteinas |
//   puntos_partida_botella | arqueos_botella | puntos_partida_proteina |
//   arqueos_proteina
function doGet(e) {
  try {
    const modulo = (e && e.parameter && e.parameter.modulo) || 'estilos';
    const mapa = {
      'estilos':         [HOJA_ESTILOS, ENCABEZADOS_ESTILOS],
      'estilos_kiosko':  [HOJA_ESTILOS_KIOSKO, ENCABEZADOS_ESTILOS_KIOSKO],
      'puntos_partida':  [HOJA_PUNTOS, ENCABEZADOS_PUNTOS],
      'arqueos':         [HOJA_ARQUEOS, ENCABEZADOS_ARQUEOS],
      'configuracion_general': [HOJA_CONFIG_GENERAL, ENCABEZADOS_CONFIG_GENERAL],
      'estilos_botella':          [HOJA_ESTILOS_BOTELLA, ENCABEZADOS_ESTILOS_BOTELLA],
      'proteinas':                [HOJA_PROTEINAS, ENCABEZADOS_PROTEINAS],
      'puntos_partida_botella':   [HOJA_PUNTOS_BOTELLA, ENCABEZADOS_PUNTOS_BOTELLA],
      'arqueos_botella':          [HOJA_ARQUEOS_BOTELLA, ENCABEZADOS_ARQUEOS_BOTELLA],
      'puntos_partida_proteina':  [HOJA_PUNTOS_PROTEINA, ENCABEZADOS_PUNTOS_PROTEINA],
      'arqueos_proteina':         [HOJA_ARQUEOS_PROTEINA, ENCABEZADOS_ARQUEOS_PROTEINA]
    };
    const par = mapa[modulo] || mapa['estilos'];
    const hoja = prepararHoja(par[0], par[1]);
    return jsonOut({ ok: true, registros: filasComoObjetos(hoja) });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

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
      if (v instanceof Date) v = Utilities.formatDate(v, 'America/Costa_Rica', 'yyyy-MM-dd');
      obj[h] = v;
    });
    return obj;
  });
}

// ── doPost ──────────────────────────────────────────────────────────
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
      case 'estilo_guardar':         return jsonOut(guardarEstilo(payload));
      case 'disponibilidad_guardar': return jsonOut(guardarDisponibilidad(payload));
      case 'punto_partida_guardar':  return jsonOut(guardarPuntoPartida(payload));
      case 'arqueo_guardar':         return jsonOut(guardarArqueo(payload));
      case 'configuracion_general_guardar': return jsonOut(guardarConfiguracionGeneral(payload));
      case 'estilo_botella_guardar':           return jsonOut(guardarEstiloBotella(payload));
      case 'proteina_guardar':                 return jsonOut(guardarProteina(payload));
      case 'punto_partida_botella_guardar':    return jsonOut(guardarPuntoPartidaBotella(payload));
      case 'arqueo_botella_guardar':           return jsonOut(guardarArqueoBotella(payload));
      case 'punto_partida_proteina_guardar':   return jsonOut(guardarPuntoPartidaProteina(payload));
      case 'arqueo_proteina_guardar':          return jsonOut(guardarArqueoProteina(payload));
      default: throw new Error('Acción desconocida: ' + payload.accion);
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function escribirFilaPorEncabezado(hoja, fila, encabezados, valores) {
  const datos = encabezados.map(function (h) { return (h in valores) ? valores[h] : ''; });
  hoja.getRange(fila, 1, 1, encabezados.length).setValues([datos]);
}

// Busca fila 1-indexada por valor de una columna. -1 si no existe.
function filaPorValor(hoja, encabezados, nombreCol, valor) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const col = encabezados.indexOf(nombreCol) + 1;
  const valores = hoja.getRange(2, col, nFilas, 1).getValues();
  const buscado = String(valor);
  for (let i = 0; i < valores.length; i++) {
    if (String(valores[i][0]) === buscado) return i + 2;
  }
  return -1;
}

// ── ESTILOS (catálogo global) ──────────────────────────────────────
function guardarEstilo(p) {
  if (!p.nombre) throw new Error('Falta el nombre del estilo.');
  const hoja = prepararHoja(HOJA_ESTILOS, ENCABEZADOS_ESTILOS);
  const id = p.id || ('EST' + Date.now());
  const filaExistente = filaPorValor(hoja, ENCABEZADOS_ESTILOS, 'ID', id);
  const fila = filaExistente > 0 ? filaExistente : hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_ESTILOS, {
    'ID': id,
    'Nombre': p.nombre,
    'Peso Neto Nominal por Barril (g)': Number(p.pesoNetoNominal) || 0,
    'Tara Nominal (g)': Number(p.taraNominal) || 0,
    'Nombre Estándar Compra': p.nombreEstandarCompra || '',
    'Barriles por Unidad de Factura': Number(p.barrilesPorUnidadFactura) || 1,
    'Palabra Clave en Ventas Square': p.palabraClave || '',
    'Densidad (g/ml)': Number(p.densidad) || 1.005,
    'Activo': p.activo === false ? 'No' : 'Sí',
    'Actualizado': new Date().toISOString()
  });
  return { ok: true, id: id, fila: fila };
}

// ── ESTILOSKIOSKO (disponibilidad, upsert por Kiosko+EstiloID) ─────
function guardarDisponibilidad(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.estiloId) throw new Error('Falta el estilo.');
  const hoja = prepararHoja(HOJA_ESTILOS_KIOSKO, ENCABEZADOS_ESTILOS_KIOSKO);
  const nFilas = hoja.getLastRow() - 1;
  let filaExistente = -1;
  if (nFilas > 0) {
    const datos = hoja.getRange(2, 1, nFilas, 2).getValues(); // Kiosko, EstiloID
    for (let i = 0; i < datos.length; i++) {
      if (String(datos[i][0]) === String(p.kiosko) && String(datos[i][1]) === String(p.estiloId)) {
        filaExistente = i + 2; break;
      }
    }
  }
  const fila = filaExistente > 0 ? filaExistente : hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_ESTILOS_KIOSKO, {
    'Kiosko': p.kiosko,
    'EstiloID': p.estiloId,
    'Estilo': p.estilo || '',
    'Disponible': p.disponible === false ? 'No' : 'Sí',
    'Actualizado': new Date().toISOString()
  });
  return { ok: true, fila: fila };
}

// ── CONFIGURACIÓN GENERAL (peso neto y tara, únicos para todos los estilos) ─
// Guarda el valor único (fila 2 siempre) y lo propaga a TODAS las filas ya
// creadas en Estilos, para que los cálculos y formularios que leen el
// peso/tara desde cada estilo (arqueo, punto de partida, etc.) sigan
// funcionando exactamente igual, sin tocar esas rutas.
function guardarConfiguracionGeneral(p) {
  const pesoNeto = Number(p.pesoNetoNominal) || 0;
  if (pesoNeto <= 0) throw new Error('Falta el peso neto nominal por barril.');
  const tara = Number(p.taraNominal) || 0;
  const barrilesPorUnidadFactura = Number(p.barrilesPorUnidadFactura) || 1;
  const densidad = Number(p.densidad) || 1.005;
  const valoresGenerales = {
    'Peso Neto Nominal por Barril (g)': pesoNeto,
    'Tara Nominal (g)': tara,
    'Barriles por Unidad de Factura': barrilesPorUnidadFactura,
    'Densidad (g/ml)': densidad
  };
  const hoja = prepararHoja(HOJA_CONFIG_GENERAL, ENCABEZADOS_CONFIG_GENERAL);
  escribirFilaPorEncabezado(hoja, 2, ENCABEZADOS_CONFIG_GENERAL, Object.assign(
    {}, valoresGenerales, { 'Actualizado': new Date().toISOString() }
  ));
  // Propagar los 4 valores a TODAS las filas ya creadas en Estilos, para que
  // el resto del código (que lee cada campo desde la fila del estilo) siga
  // funcionando exactamente igual, sin tocar esa lógica.
  const hojaEstilos = prepararHoja(HOJA_ESTILOS, ENCABEZADOS_ESTILOS);
  const nFilas = hojaEstilos.getLastRow() - 1;
  if (nFilas > 0) {
    Object.keys(valoresGenerales).forEach(function (nombreCol) {
      const col = ENCABEZADOS_ESTILOS.indexOf(nombreCol) + 1;
      const valor = valoresGenerales[nombreCol];
      const filas = [];
      for (let i = 0; i < nFilas; i++) filas.push([valor]);
      hojaEstilos.getRange(2, col, nFilas, 1).setValues(filas);
    });
  }
  return { ok: true };
}

// ── PUNTOS DE PARTIDA (peso inicial + resets, misma tabla) ─────────
function guardarPuntoPartida(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.estiloId) throw new Error('Falta el estilo.');
  if (p.pesoBruto === undefined || p.pesoBruto === null || p.pesoBruto === '') {
    throw new Error('Falta el peso bruto.');
  }
  const hoja = prepararHoja(HOJA_PUNTOS, ENCABEZADOS_PUNTOS);
  const id = p.id || Date.now();
  const pesoBruto = Number(p.pesoBruto) || 0;
  const tara = Number(p.tara) || 0;
  const pesoNetoPesado = Math.max(0, pesoBruto - tara);
  // Barriles llenos en bodega al momento de este punto de partida: no se pesan
  // uno por uno, se cuentan y se suman con el peso neto nominal del estilo
  // (mismo criterio que usa el resto del módulo para compras — ver diseño).
  const barrilesBodega = Math.max(0, Math.round(Number(p.barrilesBodega) || 0));
  const pesoNetoNominalBarril = Number(p.pesoNetoNominalBarril) || 0;
  const pesoBodega = barrilesBodega * pesoNetoNominalBarril;
  const pesoNeto = pesoNetoPesado + pesoBodega;
  const fotoUrl = guardarFotoEnDrive(p, id, 'punto-partida');
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PUNTOS, {
    'ID': id,
    'Fecha': p.fecha || hoyCR(),
    'Kiosko': p.kiosko,
    'EstiloID': p.estiloId,
    'Estilo': p.estilo || '',
    'Tipo': p.tipo === 'Reset' ? 'Reset' : 'Inicial',
    'Peso Bruto (g)': pesoBruto,
    'Tara Usada (g)': tara,
    'Peso Neto (g)': pesoNeto,
    'Foto URL': fotoUrl,
    'Registrado por': p.registrado_por || '',
    'Registrado': p.registrado_en || new Date().toISOString(),
    'Notas': p.notas || '',
    'Barriles Llenos en Bodega': barrilesBodega
  });
  return { ok: true, fila: fila, pesoNeto: pesoNeto, pesoNetoPesado: pesoNetoPesado, pesoBodega: pesoBodega, barrilesBodega: barrilesBodega, fotoUrl: fotoUrl };
}

// ── ARQUEOS (comparación + log; NUNCA toca el punto de partida) ────
function guardarArqueo(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.estiloId) throw new Error('Falta el estilo.');
  if (p.pesoBruto === undefined || p.pesoBruto === null || p.pesoBruto === '') {
    throw new Error('Falta el peso bruto.');
  }
  const hoja = prepararHoja(HOJA_ARQUEOS, ENCABEZADOS_ARQUEOS);
  const id = p.id || Date.now();
  const pesoBruto = Number(p.pesoBruto) || 0;
  const tara = Number(p.tara) || 0;
  const pesoNetoPesado = Math.max(0, pesoBruto - tara);
  // Igual que en el punto de partida: los barriles llenos en bodega no se
  // pesan uno por uno, se cuentan y se suman con el peso neto nominal del
  // estilo, para comparar contra el saldo esperado (que también los incluye).
  const barrilesBodega = Math.max(0, Math.round(Number(p.barrilesBodega) || 0));
  const pesoNetoNominalBarril = Number(p.pesoNetoNominalBarril) || 0;
  const pesoBodega = barrilesBodega * pesoNetoNominalBarril;
  const pesoNeto = pesoNetoPesado + pesoBodega;
  const saldoEsperado = Number(p.saldoEsperado) || 0;
  const diferenciaG = pesoNeto - saldoEsperado;
  const diferenciaPct = saldoEsperado > 0 ? (diferenciaG / saldoEsperado) * 100 : null;
  const fotoUrl = guardarFotoEnDrive(p, id, 'arqueo');
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_ARQUEOS, {
    'ID': id,
    'Fecha': p.fecha || hoyCR(),
    'Kiosko': p.kiosko,
    'EstiloID': p.estiloId,
    'Estilo': p.estilo || '',
    'Peso Bruto (g)': pesoBruto,
    'Tara Usada (g)': tara,
    'Peso Neto (g)': pesoNeto,
    'Saldo Esperado (g)': saldoEsperado,
    'Diferencia (g)': diferenciaG,
    'Diferencia (%)': diferenciaPct === null ? '' : Math.round(diferenciaPct * 100) / 100,
    'Foto URL': fotoUrl,
    'Registrado por': p.registrado_por || '',
    'Registrado': p.registrado_en || new Date().toISOString(),
    'Notas': p.notas || '',
    'Barriles Llenos en Bodega': barrilesBodega
  });
  return { ok: true, fila: fila, pesoNeto: pesoNeto, pesoNetoPesado: pesoNetoPesado, pesoBodega: pesoBodega, diferenciaG: diferenciaG, diferenciaPct: diferenciaPct, fotoUrl: fotoUrl };
}

// ── ESTILOS BOTELLA (catálogo global, análogo a ESTILOS) ───────────
function guardarEstiloBotella(p) {
  if (!p.nombre) throw new Error('Falta el nombre del estilo de botella.');
  const hoja = prepararHoja(HOJA_ESTILOS_BOTELLA, ENCABEZADOS_ESTILOS_BOTELLA);
  const id = p.id || ('ESTB' + Date.now());
  const filaExistente = filaPorValor(hoja, ENCABEZADOS_ESTILOS_BOTELLA, 'ID', id);
  const fila = filaExistente > 0 ? filaExistente : hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_ESTILOS_BOTELLA, {
    'ID': id,
    'Nombre': p.nombre,
    'Nombre Estándar Compra': p.nombreEstandarCompra || p.nombre,
    'Palabra Clave en Ventas Square': p.palabraClave || '',
    'Activo': p.activo === false ? 'No' : 'Sí',
    'Actualizado': new Date().toISOString()
  });
  return { ok: true, id: id, fila: fila };
}

// ── PROTEÍNAS (catálogo global) ─────────────────────────────────────
function guardarProteina(p) {
  if (!p.nombre) throw new Error('Falta el nombre de la proteína.');
  const hoja = prepararHoja(HOJA_PROTEINAS, ENCABEZADOS_PROTEINAS);
  const id = p.id || ('PROT' + Date.now());
  const filaExistente = filaPorValor(hoja, ENCABEZADOS_PROTEINAS, 'ID', id);
  const fila = filaExistente > 0 ? filaExistente : hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PROTEINAS, {
    'ID': id,
    'Nombre': p.nombre,
    'Nombre Estándar Compra': p.nombreEstandarCompra || p.nombre,
    'Activo': p.activo === false ? 'No' : 'Sí',
    'Actualizado': new Date().toISOString()
  });
  return { ok: true, id: id, fila: fila };
}

// ── PUNTOS DE PARTIDA / ARQUEOS — BOTELLA (por unidad, sin bodega) ─
function guardarPuntoPartidaBotella(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.estiloId) throw new Error('Falta el estilo.');
  if (p.cantidad === undefined || p.cantidad === null || p.cantidad === '') {
    throw new Error('Falta la cantidad de botellas.');
  }
  const hoja = prepararHoja(HOJA_PUNTOS_BOTELLA, ENCABEZADOS_PUNTOS_BOTELLA);
  const id = p.id || Date.now();
  const cantidad = Math.max(0, Math.round(Number(p.cantidad) || 0));
  const fotoUrl = guardarFotoEnDrive(p, id, 'punto-partida-botella');
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PUNTOS_BOTELLA, {
    'ID': id,
    'Fecha': p.fecha || hoyCR(),
    'Kiosko': p.kiosko,
    'EstiloID': p.estiloId,
    'Estilo': p.estilo || '',
    'Tipo': p.tipo === 'Reset' ? 'Reset' : 'Inicial',
    'Cantidad (unidades)': cantidad,
    'Foto URL': fotoUrl,
    'Registrado por': p.registrado_por || '',
    'Registrado': p.registrado_en || new Date().toISOString(),
    'Notas': p.notas || ''
  });
  return { ok: true, fila: fila, cantidad: cantidad, fotoUrl: fotoUrl };
}

function guardarArqueoBotella(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.estiloId) throw new Error('Falta el estilo.');
  if (p.cantidad === undefined || p.cantidad === null || p.cantidad === '') {
    throw new Error('Falta la cantidad de botellas.');
  }
  const hoja = prepararHoja(HOJA_ARQUEOS_BOTELLA, ENCABEZADOS_ARQUEOS_BOTELLA);
  const id = p.id || Date.now();
  const cantidad = Math.max(0, Math.round(Number(p.cantidad) || 0));
  const saldoEsperado = Number(p.saldoEsperado) || 0;
  const diferencia = cantidad - saldoEsperado;
  const diferenciaPct = saldoEsperado > 0 ? (diferencia / saldoEsperado) * 100 : null;
  const fotoUrl = guardarFotoEnDrive(p, id, 'arqueo-botella');
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_ARQUEOS_BOTELLA, {
    'ID': id,
    'Fecha': p.fecha || hoyCR(),
    'Kiosko': p.kiosko,
    'EstiloID': p.estiloId,
    'Estilo': p.estilo || '',
    'Cantidad (unidades)': cantidad,
    'Saldo Esperado (unidades)': saldoEsperado,
    'Diferencia (unidades)': diferencia,
    'Diferencia (%)': diferenciaPct === null ? '' : Math.round(diferenciaPct * 100) / 100,
    'Foto URL': fotoUrl,
    'Registrado por': p.registrado_por || '',
    'Registrado': p.registrado_en || new Date().toISOString(),
    'Notas': p.notas || ''
  });
  return { ok: true, fila: fila, diferencia: diferencia, diferenciaPct: diferenciaPct, fotoUrl: fotoUrl };
}

// ── PUNTOS DE PARTIDA / ARQUEOS — PROTEÍNA (peso, sin bodega) ──────
function guardarPuntoPartidaProteina(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.proteinaId) throw new Error('Falta la proteína.');
  if (p.pesoBruto === undefined || p.pesoBruto === null || p.pesoBruto === '') {
    throw new Error('Falta el peso bruto.');
  }
  const hoja = prepararHoja(HOJA_PUNTOS_PROTEINA, ENCABEZADOS_PUNTOS_PROTEINA);
  const id = p.id || Date.now();
  const pesoBruto = Number(p.pesoBruto) || 0;
  const tara = Number(p.tara) || 0;
  const pesoNeto = Math.max(0, pesoBruto - tara);
  const fotoUrl = guardarFotoEnDrive(p, id, 'punto-partida-proteina');
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PUNTOS_PROTEINA, {
    'ID': id,
    'Fecha': p.fecha || hoyCR(),
    'Kiosko': p.kiosko,
    'ProteinaID': p.proteinaId,
    'Proteina': p.proteina || '',
    'Tipo': p.tipo === 'Reset' ? 'Reset' : 'Inicial',
    'Peso Bruto (g)': pesoBruto,
    'Tara Usada (g)': tara,
    'Peso Neto (g)': pesoNeto,
    'Foto URL': fotoUrl,
    'Registrado por': p.registrado_por || '',
    'Registrado': p.registrado_en || new Date().toISOString(),
    'Notas': p.notas || ''
  });
  return { ok: true, fila: fila, pesoNeto: pesoNeto, fotoUrl: fotoUrl };
}

function guardarArqueoProteina(p) {
  if (!p.kiosko) throw new Error('Falta el kiosko.');
  if (!p.proteinaId) throw new Error('Falta la proteína.');
  if (p.pesoBruto === undefined || p.pesoBruto === null || p.pesoBruto === '') {
    throw new Error('Falta el peso bruto.');
  }
  const hoja = prepararHoja(HOJA_ARQUEOS_PROTEINA, ENCABEZADOS_ARQUEOS_PROTEINA);
  const id = p.id || Date.now();
  const pesoBruto = Number(p.pesoBruto) || 0;
  const tara = Number(p.tara) || 0;
  const pesoNeto = Math.max(0, pesoBruto - tara);
  const saldoEsperado = Number(p.saldoEsperado) || 0;
  const diferenciaG = pesoNeto - saldoEsperado;
  const diferenciaPct = saldoEsperado > 0 ? (diferenciaG / saldoEsperado) * 100 : null;
  const fotoUrl = guardarFotoEnDrive(p, id, 'arqueo-proteina');
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_ARQUEOS_PROTEINA, {
    'ID': id,
    'Fecha': p.fecha || hoyCR(),
    'Kiosko': p.kiosko,
    'ProteinaID': p.proteinaId,
    'Proteina': p.proteina || '',
    'Peso Bruto (g)': pesoBruto,
    'Tara Usada (g)': tara,
    'Peso Neto (g)': pesoNeto,
    'Saldo Esperado (g)': saldoEsperado,
    'Diferencia (g)': diferenciaG,
    'Diferencia (%)': diferenciaPct === null ? '' : Math.round(diferenciaPct * 100) / 100,
    'Foto URL': fotoUrl,
    'Registrado por': p.registrado_por || '',
    'Registrado': p.registrado_en || new Date().toISOString(),
    'Notas': p.notas || ''
  });
  return { ok: true, fila: fila, diferenciaG: diferenciaG, diferenciaPct: diferenciaPct, fotoUrl: fotoUrl };
}

// ── FOTO → GOOGLE DRIVE (mismo patrón que Mermas) ──────────────────
function guardarFotoEnDrive(p, id, tipo) {
  if (!p.foto) return '';
  const datos = extraerBase64(p.foto);
  if (!datos) return '';
  const carpeta = getOrCreateCarpetaKiosko(p.kiosko);
  const nombre = `${p.fecha || hoyCR()}_${tipo}_${id}.jpg`;
  const bytes = Utilities.base64Decode(datos.base64);
  const blob = Utilities.newBlob(bytes, datos.mime, nombre);
  const file = carpeta.createFile(blob);
  return file.getUrl();
}

function getOrCreateCarpetaKiosko(kiosko) {
  const root = DriveApp.getFolderById(FOLDER_ID_BALANCE_BARRILES);
  const nombre = (kiosko || 'Sin kiosko').toString();
  const existing = root.getFoldersByName(nombre);
  return existing.hasNext() ? existing.next() : root.createFolder(nombre);
}

function extraerBase64(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}
