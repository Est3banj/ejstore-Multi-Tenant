// spec:diamond-orders#ff-id-gate — 8–12 dígitos (Free Fire UID range).
// Fuente ÚNICA server-side del regex (frontend espejo: src/utils/freefire.ts,
// paridad testeada en src/utils/freefire.test.ts).
const FF_ID_REGEX = /^\d{8,12}$/;

function isValidFreeFireId(value) {
  return typeof value === 'string' && FF_ID_REGEX.test(value);
}

module.exports = { FF_ID_REGEX, isValidFreeFireId };
