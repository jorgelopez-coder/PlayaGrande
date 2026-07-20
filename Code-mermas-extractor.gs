/**
 * Extractor de peso con IA para el módulo de Mermas de Cerveza
 * (mermas.html). Recibe la foto de la báscula digital pesando el barril y le
 * pide a Claude (API de Anthropic, con visión) que lea únicamente el número
 * que marca la pantalla, devuelto siempre en gramos.
 *
 * Es un proyecto de Apps Script INDEPENDIENTE del Sheet "Operaciones -
 * Kioskos" — no necesita Sheet propio, solo se despliega como Web App.
 * Mismo patrón que el "cierre-extractor" de Ecosistema Lorito (ver nota en
 * README.md, sección "Extracción con IA").
 *
 * Cómo desplegarlo:
 * 1. https://script.google.com/ → Proyecto nuevo (o reutilizá uno standalone
 *    si ya tenés otro extractor de Lorito y preferís separarlos igual, cada
 *    Web App es independiente).
 * 2. Pegá este código completo (reemplazando el contenido del archivo).
 * 3. ⚙️ Configuración del proyecto (ícono de engranaje, panel izquierdo) →
 *    Propiedades del script → Agregar propiedad del script:
 *      Propiedad: ANTHROPIC_API_KEY
 *      Valor: tu API key de Anthropic (console.anthropic.com/settings/keys)
 * 4. Implementar → Nueva implementación → Tipo: Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquiera
 * 5. Copiá la URL /exec resultante y pegala en mermas.html, constante
 *    EXTRACTOR_URL (arriba del todo en el <script>).
 *
 * Costo: cada foto extraída es una llamada a la API de Anthropic (se cobra
 * por uso, ver anthropic.com/pricing) — no hay llamadas automáticas, solo
 * cuando alguien aprieta "Extraer peso con IA" en mermas.html.
 */

const ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022';

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) throw new Error('No se recibieron datos.');
    const payload = JSON.parse(e.postData.contents);
    if (!payload.foto) throw new Error('No se recibió ninguna foto.');
    const peso = extraerPesoDeImagen(payload.foto);
    return jsonOut({ ok: true, peso: peso });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Separa una data URL ("data:image/jpeg;base64,/9j/4AAQ...") en mime + base64.
function extraerBase64(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

function extraerPesoDeImagen(dataUrl) {
  const datos = extraerBase64(dataUrl);
  if (!datos) throw new Error('Formato de imagen inválido.');

  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('Falta configurar ANTHROPIC_API_KEY en Propiedades del script (ver encabezado de este archivo).');

  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 50,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: datos.mime, data: datos.base64 } },
        {
          type: 'text',
          text: 'Esta es una foto de una báscula digital pesando un barril de cerveza (contenedor + lo que sobró dentro). ' +
                'Respondé ÚNICAMENTE con el número que marca la pantalla de la báscula, convertido a GRAMOS ' +
                '(si la báscula muestra kg, multiplicá por 1000; si muestra lb, multiplicá por 453.592), ' +
                'sin unidades, sin explicación, sin texto adicional — solo el número. ' +
                'Si no podés leer el número con certeza, respondé exactamente "0".'
        }
      ]
    }]
  };

  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  const data = JSON.parse(resp.getContentText());
  if (data.error) throw new Error(data.error.message || 'Error de la API de Anthropic.');

  const texto = ((data.content && data.content[0] && data.content[0].text) || '').trim();
  const numero = parseFloat(texto.replace(/[^\d.,]/g, '').replace(',', '.'));
  if (isNaN(numero)) throw new Error('No se pudo interpretar el peso devuelto: "' + texto + '"');
  if (numero === 0) throw new Error('No se pudo leer el peso en la foto con certeza — probá con otra foto o ingresalo a mano.');
  return numero;
}
