#!/usr/bin/env node
// ============================================================
// TEST: Validación de extracción de datos de emails Bancolombia
// ============================================================

// ─── Helpers copiadas de functions/index.js ──────────────────
function decodeContent(part, body) {
  if (part.includes('base64')) { try { return Buffer.from(body, 'base64').toString('utf-8'); } catch { return body; } }
  if (part.includes('quoted-printable')) { try { return body.replace(/=\r\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))); } catch { return body; } }
  return body;
}

function decodeHtmlEntities(text) {
  const entities = {
    '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú',
    '&Aacute;': 'Á', '&Eacute;': 'É', '&Iacute;': 'Í', '&Oacute;': 'Ó', '&Uacute;': 'Ú',
    '&ntilde;': 'ñ', '&Ntilde;': 'Ñ', '&iquest;': '¿', '&iexcl;': '¡',
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
    '&nbsp;': ' ', '&#160;': ' ', '&#39;': "'", '&#x27;': "'",
    '&dollar;': '$', '&excl;': '!', '&quest;': '?',
  };
  return text.replace(/&[a-zA-Z]+;|&#\d+;|&#x[0-9a-fA-F]+;/g, (match) => entities[match] || match);
}

function cleanHtmlBody(html) {
  return decodeHtmlEntities(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAllBodies(source) {
  const bodies = [];
  const b = source.match(/boundary="?([^"\s;]+)"?/);
  if (b) {
    const parts = source.split(`--${b[1]}`);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.includes('text/plain') || part.includes('text/html')) {
        const rawBody = part.replace(/^[\s\S]*?\n\n/, '').replace(/\n--[\s\S]*$/, '').trim();
        if (!rawBody) continue;
        const decoded = decodeContent(part, rawBody);
        if (!decoded || decoded.length < 10) continue;
        if (part.includes('text/html')) {
          bodies.push(cleanHtmlBody(decoded));
        } else {
          bodies.push(decodeHtmlEntities(decoded));
        }
      }
    }
  }
  if (bodies.length === 0) {
    const raw = source.replace(/^[\s\S]*?\n\n/, '').trim();
    if (raw) {
      const cleaned = raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned.length > 20) bodies.push(cleaned);
    }
  }
  return bodies;
}

function extractEmailBody(source) {
  const allBodies = extractAllBodies(source);
  const PAYMENT_KEYWORDS = ['bancolombia', 'recibiste un pago', 'pago de', 'por $'];
  let best = allBodies[0] || '';
  let bestScore = 0;
  for (const body of allBodies) {
    const lower = body.toLowerCase();
    let score = 0;
    for (const kw of PAYMENT_KEYWORDS) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) { bestScore = score; best = body; }
  }
  return best;
}

function matchPayment(body, customerName, amount) {
  const lowerBody = body.toLowerCase();
  const patterns = [
    { name: /recibiste un pago de\s+([^.]+?)\s+por\s+\$/i, amount: /por\s+\$?([0-9,]+\.?[0-9]*)/i },
    { name: /recibiste un pago de\s+([^.]+?)(?:\.|,|$)/i, amount: /\$?([0-9,]+\.?[0-9]*)/i },
    { name: /pago de\s+([^.]+?)\s+por\s+\$/i, amount: /por\s+\$?([0-9,]+\.?[0-9]*)/i },
  ];

  let matchResult = null;
  for (const p of patterns) {
    const nameMatch = lowerBody.match(p.name);
    if (!nameMatch) continue;
    const amountMatch = lowerBody.match(p.amount);
    if (!amountMatch) continue;
    matchResult = { name: nameMatch[1].trim(), amount: amountMatch[1] };
    break;
  }

  // Backup pattern
  if (!matchResult) {
    const backupName = lowerBody.match(/recibiste un pago de\s+(.+?)(?:por\s+\$|\.)/i);
    const backupAmount = lowerBody.match(/\$?\s*([0-9,]+\.?[0-9]*)\s*/);
    if (backupName && backupAmount) {
      matchResult = { name: backupName[1].trim(), amount: backupAmount[1] };
    }
  }

  if (!matchResult) return null;

  const emailName = matchResult.name.toLowerCase();
  const rawAmount = matchResult.amount.replace(/,/g, '');
  const emailAmount = parseFloat(rawAmount);

  const nameParts = customerName.toLowerCase().split(/\s+/).filter(Boolean);
  const emailNameParts = emailName.split(/\s+/).filter(Boolean);
  const nameOk = nameParts.some(p => emailNameParts.some(ep => ep.includes(p) || p.includes(ep)));
  const amountOk = !isNaN(emailAmount) && Math.abs(emailAmount - amount) <= 200;

  return { nameOk, amountOk, emailName, emailAmount, matchedName: matchResult.name };
}

// ─── TESTS ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ─── FIXTURE: Email Bancolombia REAL (formato que mostró el usuario) ───
// Este es el formato exacto que envía Bancolombia
const BANCOLOMBIA_EMAIL_HTML_QP = `From: Alertas y Notificaciones <alertasynotificaciones@an.notificacionesbancolombia.com>
To: usuario@email.com
Subject: Alertas y Notificaciones Recibidos
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="----=_Part_12345"

------=_Part_12345
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: base64

QWxlcnRhcyB5IE5vdGlmaWNhY2lvbmVzCgpCYW5jb2xvbWJpYTogRUogU1RPUkUsIHJlY2liaXN0ZSB1biBwYWdvIGRlIERyZWlkZXIgRXN0ZWJhbiBKdXJhZG8gTG9wZXogcG9yICQxLDAwMC4wMCBlbiB0dSBjdWVudGEgKjE4ODMKCgo=
------=_Part_12345
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

<!DOCTYPE html>
<html>
<body>
<table>
<tr><td>=A1Listo!</td></tr>
<tr><td>Todo sali=F3 bien con tus movimientos</td></tr>
<tr><td><b>Bancolombia: EJ STORE</b>, recibiste un pago de <b>Dreider Esteban Jurado Lopez</b> por <b>$1,000.00</b> en tu cuenta *1883 conectado a la llave 0091984544 el 25/07/2026 a las 10:55.</td></tr>
</table>
</body>
</html>
------=_Part_12345--`;

// Email con boundary SIN comillas (formato alternativo)
const BANCOLOMBIA_NO_QUOTES = `From: Alertas y Notificaciones <alertasynotificaciones@an.notificacionesbancolombia.com>
Subject: Recibiste un pago
Content-Type: multipart/alternative; boundary=----=_NextPart_67890

------=_NextPart_67890
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: 7bit

<p>Bancolombia: EJ STORE, recibiste un pago de Maria Perez por $50,000.00</p>
------=_NextPart_67890--`;

// Email simple sin MIME (fallback)
const SIMPLE_EMAIL = `From: notificaciones@bancolombia.com
Subject: Pago recibido

Bancolombia: recibiste un pago de Carlos Gomez por $25,000.00`;

// Email con HTML entities (acentos)
const EMAIL_WITH_ENTITIES = `From: Alertas <alertasynotificaciones@an.notificacionesbancolombia.com>
Subject: Pago
Content-Type: multipart/alternative; boundary="----=_Part_999"

------=_Part_999
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: 7bit

<p>Bancolombia: &Eacute;xito!, recibiste un pago de Jos&eacute; Mart&iacute;nez por &dollar;15,000.00</p>
------=_Part_999--`;

// ─── TEST 1: decodeHtmlEntities ───────────────────────────────
console.log('\n📋 decodeHtmlEntities:');
test('decodifica &aacute; → á', () => assert(decodeHtmlEntities('M&aacute;ximo') === 'Máximo'));
test('decodifica &eacute; → é', () => assert(decodeHtmlEntities('Jos&eacute;') === 'José'));
test('decodifica &ntilde; → ñ', () => assert(decodeHtmlEntities('Mu&ntilde;oz') === 'Muñoz'));
test('decodifica &iquest; → ¿', () => assert(decodeHtmlEntities('&iquest;Hola?') === '¿Hola?'));
test('decodifica &amp; → &', () => assert(decodeHtmlEntities('Uno &amp; Dos') === 'Uno & Dos'));

// ─── TEST 2: extractAllBodies con boundary con comillas ──────
console.log('\n📋 extractAllBodies (boundary con comillas):');
const bodies1 = extractAllBodies(BANCOLOMBIA_EMAIL_HTML_QP);
test('debe encontrar al menos 1 body', () => assert(bodies1.length >= 1));
test('debe contener "bancolombia"', () => assert(bodies1[0].toLowerCase().includes('bancolombia')));
test('debe contener "recibiste un pago"', () => assert(bodies1[0].toLowerCase().includes('recibiste un pago')));
test('body no debe tener tags HTML', () => assert(!bodies1[0].includes('<td>') && !bodies1[0].includes('</b>')));

// ─── TEST 3: extractAllBodies con boundary SIN comillas ──────
console.log('\n📋 extractAllBodies (boundary SIN comillas):');
const bodies2 = extractAllBodies(BANCOLOMBIA_NO_QUOTES);
test('debe encontrar al menos 1 body', () => assert(bodies2.length >= 1));
test('debe contener "bancolombia"', () => assert(bodies2[0].toLowerCase().includes('bancolombia')));
test('debe contener "maria perez"', () => assert(bodies2[0].toLowerCase().includes('maria perez')));

// ─── TEST 4: extractEmailBody (elige el mejor) ──────────────
console.log('\n📋 extractEmailBody (elige mejor body):');
const best = extractEmailBody(BANCOLOMBIA_EMAIL_HTML_QP);
test('debe contener "bancolombia"', () => assert(best.toLowerCase().includes('bancolombia')));
test('debe contener "dreider esteban"', () => assert(best.toLowerCase().includes('dreider esteban')));

// ─── TEST 5: Match payment con nombre y monto ────────────────
console.log('\n📋 matchPayment:');
const body = extractEmailBody(BANCOLOMBIA_EMAIL_HTML_QP);
const result = matchPayment(body, 'Dreider Esteban Jurado Lopez', 1000);
test('debe encontrar match', () => assert(result !== null, 'result is null'));
test('nameOk debe ser true', () => assert(result && result.nameOk));
test('amountOk debe ser true', () => assert(result && result.amountOk));
test('monto extraído debe ser 1000', () => assert(result && result.emailAmount === 1000));

// ─── TEST 6: Match payment sin comillas ─────────────────────
console.log('\n📋 matchPayment (boundary sin comillas):');
const body2 = extractEmailBody(BANCOLOMBIA_NO_QUOTES);
const result2 = matchPayment(body2, 'Maria Perez', 50000);
test('debe encontrar match', () => assert(result2 !== null));
test('nameOk debe ser true', () => assert(result2 && result2.nameOk));
test('amountOk debe ser true', () => assert(result2 && result2.amountOk));

// ─── TEST 7: Match payment email simple ─────────────────────
console.log('\n📋 matchPayment (email simple sin MIME):');
const body3 = extractEmailBody(SIMPLE_EMAIL);
const result3 = matchPayment(body3, 'Carlos Gomez', 25000);
test('debe encontrar match', () => assert(result3 !== null));
test('nameOk debe ser true', () => assert(result3 && result3.nameOk));
test('amountOk debe ser true', () => assert(result3 && result3.amountOk));

// ─── TEST 8: Match con HTML entities ─────────────────────────
console.log('\n📋 matchPayment (HTML entities):');
const body4 = extractEmailBody(EMAIL_WITH_ENTITIES);
test('body debe tener "josé" (decodificado)', () => assert(body4.toLowerCase().includes('josé')));
const result4 = matchPayment(body4, 'José Martínez', 15000);
test('debe encontrar match', () => assert(result4 !== null, `result is null, body="${body4.substring(0,200)}"`));
test('nameOk debe ser true', () => assert(result4 && result4.nameOk));
test('amountOk debe ser true', () => assert(result4 && result4.amountOk));

// ─── TEST 9: Coincidencia parcial de nombre ──────────────────
console.log('\n📋 matchPayment (coincidencia parcial de nombre):');
const partialBody = 'recibiste un pago de Dreider Esteban Jurado Lopez por $1,000.00';
const result5 = matchPayment(partialBody, 'DREIDER ESTEBAN', 1000);
test('match con nombre parcial (solo primer nombre)', () => assert(result5 && result5.nameOk));
const result6 = matchPayment(partialBody, 'Jurado Lopez', 1000);
test('match con nombre parcial (solo apellidos)', () => assert(result6 && result6.nameOk));
const result7 = matchPayment(partialBody, 'Otro Nombre', 1000);
test('NO debe matchear con nombre diferente', () => assert(result7 && !result7.nameOk));

// ─── TEST 10: Tolerancia de monto ─────────────────────────────
console.log('\n📋 matchPayment (tolerancia de monto):');
const montoBody = 'recibiste un pago de Juan Perez por $10,150.00';
const result8 = matchPayment(montoBody, 'Juan Perez', 10000);
test('$10,150 vs $10,000 debe matchear (tolera $200)', () => assert(result8 && result8.amountOk));
const result9 = matchPayment(montoBody, 'Juan Perez', 10500);
test('$10,150 vs $10,500 debe matchear (diferencia $350 > $200)', () => assert(result9 && result9.amountOk === false));

// ─── TEST 11: Email de Bancolombia con formato exacto ────────
console.log('\n📋 Simulación completa (email real Bancolombia):');
const fullBody = extractEmailBody(BANCOLOMBIA_EMAIL_HTML_QP);
test('body extraído contiene "bancolombia"', () => assert(fullBody.toLowerCase().includes('bancolombia')));
test('body extraído contiene "recibiste un pago de"', () => assert(fullBody.toLowerCase().includes('recibiste un pago')));
test('body extraído contiene "dreider"', () => assert(fullBody.toLowerCase().includes('dreider')));
test('body extraído contiene "1,000.00"', () => assert(fullBody.includes('1,000.00')));

// ─── TEST 12: Remitente Bancolombia ──────────────────────────
console.log('\n📋 Detección de remitente:');
test('email de Bancolombia contiene dominio', () => assert(
  BANCOLOMBIA_EMAIL_HTML_QP.toLowerCase().includes('notificacionesbancolombia.com')
));

// ─── RESULTADOS ───────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`Resultados: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
