const { createHash, timingSafeEqual } = require('node:crypto');

const API_BASES = Object.freeze({ test: 'https://sandbox.wompi.co/v1', prod: 'https://production.wompi.co/v1' });
const hash = value => createHash('sha256').update(value).digest('hex');
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

const CONFIG_FIELDS = Object.freeze({ publicKey: 'Llave pública', privateKey: 'Llave privada',
  integritySecret: 'Secreto de integridad', eventsSecret: 'Secreto de eventos' });

// Return only field names and expected formats, never submitted credentials.
function configError(config) {
  if (!config || !Object.hasOwn(API_BASES, config.environment)) return 'Ambiente Wompi inválido. Elegí Sandbox o Producción.';
  const env = config.environment;
  for (const [field, prefix] of [['publicKey', `pub_${env}_`], ['privateKey', `prv_${env}_`],
    ['integritySecret', `${env}_integrity_`], ['eventsSecret', `${env}_events_`]]) {
    const value = config[field];
    const label = CONFIG_FIELDS[field];
    if (value === '' || value === undefined || value === null) return `Falta ${label}. Ingresá las cuatro credenciales al configurar Wompi por primera vez.`;
    if (typeof value !== 'string' || !value.startsWith(prefix) || !/^[A-Za-z0-9_]+$/.test(value) ||
        value.length <= prefix.length || value.length > 256) {
      return `${label} inválido para ${env === 'test' ? 'Sandbox' : 'Producción'}. Debe comenzar con ${prefix} y contener sólo la credencial, sin etiquetas ni espacios internos. Al cambiar de ambiente, ingresá las cuatro credenciales de ese ambiente.`;
    }
  }
  return null;
}

function completeConfig(config) { return configError(config) === null; }

function propertyValue(data, path) {
  if (typeof path !== 'string' || !/^transaction(?:\.[A-Za-z0-9_]+){1,5}$/.test(path)) throw new Error('Invalid property');
  let value = data;
  for (const key of path.split('.')) {
    if (['__proto__', 'prototype', 'constructor'].includes(key) ||
        value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('Invalid property');
    value = value[key];
  }
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isSafeInteger(value))) throw new Error('Invalid value');
  return String(value);
}

function verifyEvent(event, secret) {
  try {
    const { properties, checksum } = event.signature;
    if (event.event !== 'transaction.updated' || !Number.isSafeInteger(event.timestamp) || event.timestamp < 0 ||
        !Array.isArray(properties) || properties.length > 32 || new Set(properties).size !== properties.length ||
        !['transaction.id', 'transaction.status', 'transaction.amount_in_cents'].every(key => properties.includes(key)) ||
        typeof checksum !== 'string' || !/^[a-fA-F0-9]{64}$/.test(checksum)) return false;
    const calculated = hash(properties.map(path => propertyValue(event.data, path)).join('') + event.timestamp + secret);
    return timingSafeEqual(Buffer.from(calculated, 'hex'), Buffer.from(checksum, 'hex'));
  } catch { return false; }
}

function widgetConfig(intent, config) {
  if (!completeConfig(config) || intent.environment !== config.environment || intent.publicKey !== config.publicKey ||
      intent.currency !== 'COP' || !Number.isSafeInteger(intent.amountInCents) || intent.amountInCents <= 0) {
    throw new Error('Invalid frozen Wompi configuration');
  }
  return { publicKey: intent.publicKey, currency: intent.currency, amountInCents: intent.amountInCents,
    reference: intent.reference,
    signature: { integrity: hash(`${intent.reference}${intent.amountInCents}${intent.currency}${config.integritySecret}`) } };
}

function checkoutUrl(intent, config) {
  const widget = widgetConfig(intent, config);
  const params = new URLSearchParams({ 'public-key': widget.publicKey, currency: widget.currency,
    'amount-in-cents': String(widget.amountInCents), reference: widget.reference, 'signature:integrity': widget.signature.integrity });
  return `https://checkout.wompi.co/p/?${params}`;
}

module.exports = { API_BASES, CONFIG_FIELDS, hash, validId, configError, completeConfig, verifyEvent, checkoutUrl, widgetConfig };
