// Firestore-backed mail configuration (source of truth post Secret-Manager
// dead-end: secretmanager.googleapis.com está deshabilitado en ejstore-web y
// en Vercel no existe metadata server — ver apply-progress.md post-cutover).
//
// Docs soportados (whitelist — docId llega del payload del cliente):
//   tenants/{tenantId}/secrets/emailConfig           → IMAP códigos {email,password,host,port}
//   tenants/{tenantId}/secrets/emailConfigPayments   → IMAP pagos    {email,password,host,port}
//   tenants/{tenantId}/secrets/smtp                  → SMTP nativo   {host,port,user,pass,from}
//
// Cache en memoria por TTL (serverless: por instancia/lamba). Los writes
// (saveEmailConfig/saveSmtpConfig) deben llamar invalidateMailConfigCache.

const MAIL_SECRET_DOCS = Object.freeze(['emailConfig', 'emailConfigPayments', 'smtp']);
const CACHE_TTL_MS = 60 * 1000;

const configCache = new Map();

// Lazy require: rompe el ciclo CJS config.js → connectionPool → mailConfig →
// config (mismo patrón que secretManager↔connectionPool, B3). El destructure
// top-level recibiría `db` undefined mientras config.js aún está cargando.
function getDb() {
  return require('../config').db;
}

function isValidMailDocId(docId) {
  return typeof docId === 'string' && MAIL_SECRET_DOCS.includes(docId);
}

function assertMailDocId(docId) {
  if (!isValidMailDocId(docId)) {
    const err = new Error('docId de configuración de correo inválido');
    err.code = 'invalid-argument';
    throw err;
  }
  return docId;
}

async function getMailConfig(tenantId, docId, { bypassCache = false } = {}) {
  if (!tenantId || typeof tenantId !== 'string') {
    const err = new Error('tenantId es requerido');
    err.code = 'invalid-argument';
    throw err;
  }
  assertMailDocId(docId);

  const cacheKey = `${tenantId}/${docId}`;
  if (!bypassCache) {
    const hit = configCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }
  }

  try {
    const snap = await getDb().collection('tenants').doc(tenantId).collection('secrets').doc(docId).get();
    const value = snap && snap.exists ? snap.data() || null : null;
    configCache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    // Log hygiene: solo path + mensaje de error — NUNCA el contenido del config.
    console.error(`[mailConfig] Error leyendo tenants/${tenantId}/secrets/${docId}: ${error.message}`);
    return null;
  }
}

function invalidateMailConfigCache(tenantId, docId) {
  if (!tenantId) {
    configCache.clear();
    return;
  }
  if (docId) {
    configCache.delete(`${tenantId}/${docId}`);
    return;
  }
  for (const key of configCache.keys()) {
    if (key.startsWith(`${tenantId}/`)) configCache.delete(key);
  }
}

// Mapping documentado (apply-progress.md post-cutover):
// - SMTP nativo vive en tenants/{t}/secrets/smtp {host,port,user,pass,from}
//   (escrito por saveSmtpConfig — el mismo patrón Firestore-first que saveEmailConfig).
// - Fallback: si no hay doc smtp, se deriva desde emailConfig (códigos):
//   {user: email, pass: password, host: imap.X → smtp.X (si aplica), port: 465, from: ''}.
//   Puerto 993 de IMAP NO sirve para SMTP; 465 = implicit TLS (nodemailer secure: port===465).
function smtpHostFromImapHost(imapHost) {
  return typeof imapHost === 'string' && /^imap\./i.test(imapHost)
    ? imapHost.replace(/^imap\./i, 'smtp.')
    : imapHost;
}

async function resolveSmtpConfig(tenantId, opts) {
  const smtpDoc = await getMailConfig(tenantId, 'smtp', opts);
  if (smtpDoc && smtpDoc.host && smtpDoc.user && smtpDoc.pass) {
    return smtpDoc;
  }

  const emailCfg = await getMailConfig(tenantId, 'emailConfig', opts);
  if (emailCfg && emailCfg.host && emailCfg.email && emailCfg.password) {
    return {
      host: smtpHostFromImapHost(emailCfg.host),
      port: 465,
      user: emailCfg.email,
      pass: emailCfg.password,
      from: '',
      derivedFrom: 'emailConfig',
    };
  }

  return null;
}

module.exports = {
  MAIL_SECRET_DOCS,
  isValidMailDocId,
  assertMailDocId,
  getMailConfig,
  invalidateMailConfigCache,
  resolveSmtpConfig,
  smtpHostFromImapHost,
};
