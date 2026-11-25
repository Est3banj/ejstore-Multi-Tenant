const { createHash, timingSafeEqual } = require('node:crypto');

const API_BASES = Object.freeze({ test: 'https://sandbox.wompi.co/v1', prod: 'https://production.wompi.co/v1' });
const hash = value => createHash('sha256').update(value).digest('hex');
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

function completeConfig(config) {
  if (!config || !Object.hasOwn(API_BASES, config.environment)) return false;
  const env = config.environment;
  return [['publicKey', `pub_${env}_`], ['privateKey', `prv_${env}_`],
    ['integritySecret', `${env}_integrity_`], ['eventsSecret', `${env}_events_`]]
    .every(([field, prefix]) => typeof config[field] === 'string' &&
      config[field].startsWith(prefix) && /^[A-Za-z0-9_]+$/.test(config[field]) &&
      config[field].length > prefix.length && config[field].length <= 256);
}

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

function checkoutUrl(intent, config) {
  const signature = hash(`${intent.reference}${intent.amountInCents}COP${config.integritySecret}`);
  const params = new URLSearchParams({ 'public-key': config.publicKey, currency: 'COP',
    'amount-in-cents': String(intent.amountInCents), reference: intent.reference, 'signature:integrity': signature });
  return `https://checkout.wompi.co/p/?${params}`;
}

module.exports = { API_BASES, hash, validId, completeConfig, verifyEvent, checkoutUrl };
