// Units: whole COP pesos and integer basis points (265 = 2.65%).
// Reference defaults are NOT an assertion about a merchant's contracted plan.
const DEFAULT_POLICY = Object.freeze({ payer: 'merchant', rateBps: 265, fixedFee: 700, vatBps: 1900 });
const invalid = () => new Error('Política de cargo Wompi inválida');
function normalizePolicy(value = DEFAULT_POLICY) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !Object.hasOwn(DEFAULT_POLICY, key)) ||
      !['merchant', 'customer'].includes(value.payer)) throw invalid();
  for (const key of ['rateBps', 'fixedFee', 'vatBps']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw invalid();
  }
  if (value.rateBps >= 10000 || value.vatBps > 10000 || value.fixedFee > 5000000 ||
      BigInt(value.rateBps) * BigInt(10000 + value.vatBps) >= 100000000n) throw invalid();
  return { payer: value.payer, rateBps: value.rateBps, fixedFee: value.fixedFee, vatBps: value.vatBps };
}
function normalizePolicies(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['test', 'prod'].includes(key))) throw invalid();
  return { test: normalizePolicy(value.test), prod: normalizePolicy(value.prod) };
}
function calculateQuote(baseAmount, policy, currency = 'COP') {
  if (currency !== 'COP' || !Number.isSafeInteger(baseAmount) || baseAmount < 1000 || baseAmount > 5000000) throw invalid();
  const normalized = normalizePolicy(policy);
  let total = BigInt(baseAmount);
  if (normalized.payer === 'customer') {
    const tax = BigInt(10000 + normalized.vatBps);
    const denominator = 100000000n - BigInt(normalized.rateBps) * tax;
    const numerator = BigInt(baseAmount) * 100000000n + BigInt(normalized.fixedFee) * tax * 10000n;
    // One upward rounding to a whole peso; do not assume provider fee rounding.
    total = (numerator + denominator - 1n) / denominator;
  }
  if (total * 100n > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
  const totalAmount = Number(total);
  return { version: 1, currency, baseAmount, processingFee: totalAmount - baseAmount, totalAmount };
}
function intentQuote(intent) {
  // Validate the frozen base independently of mutable public recharge metadata.
  const legacyQuote = calculateQuote(intent.amount, DEFAULT_POLICY, intent.currency);
  const quote = intent.feeQuote;
  if (!quote) {
    if (intent.amountInCents !== intent.amount * 100) throw invalid();
    return legacyQuote;
  }
  if (quote.version !== 1 || quote.currency !== 'COP' || quote.baseAmount !== intent.amount ||
      !Number.isSafeInteger(quote.totalAmount) || !Number.isSafeInteger(quote.processingFee) ||
      quote.processingFee < 0 || quote.totalAmount !== quote.baseAmount + quote.processingFee ||
      !Number.isSafeInteger(quote.totalAmount * 100) || intent.amountInCents !== quote.totalAmount * 100) throw invalid();
  return { version: 1, currency: 'COP', baseAmount: quote.baseAmount, processingFee: quote.processingFee, totalAmount: quote.totalAmount };
}
module.exports = { DEFAULT_POLICY, normalizePolicy, normalizePolicies, calculateQuote, intentQuote };
