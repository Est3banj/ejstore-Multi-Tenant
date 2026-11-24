const { randomBytes } = require('crypto');

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const HEX = '0123456789abcdef';

function generateSecureToken(bytes) {
  if (bytes <= 0) {
    throw new Error('bytes must be positive');
  }
  const buffer = randomBytes(bytes);
  let result = '';
  for (let i = 0; i < bytes; i++) {
    result += ALPHANUMERIC[buffer[i] % ALPHANUMERIC.length];
  }
  return result;
}

function generateSecureHex(bytes) {
  if (bytes <= 0) {
    throw new Error('bytes must be positive');
  }
  const buffer = randomBytes(bytes);
  let result = '';
  for (let i = 0; i < bytes; i++) {
    result += HEX[buffer[i] % HEX.length];
  }
  return result;
}

function generateVerificationCode(length = 6) {
  return generateSecureToken(length).toUpperCase();
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return require('crypto').timingSafeEqual(bufA, bufB);
}

function computeHmacSha256(key, message) {
  const crypto = require('crypto');
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}

module.exports = { generateSecureToken, generateSecureHex, generateVerificationCode, timingSafeEqual, computeHmacSha256 };