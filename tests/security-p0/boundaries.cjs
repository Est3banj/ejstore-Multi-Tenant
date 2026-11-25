// Only infrastructure boundaries are replaced. Authorization, settlement,
// parsing, inventory and idempotency use the actual committed modules.
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const admin = require('firebase-admin');

assert.equal(process.env.GCLOUD_PROJECT, 'demo-ejstore-p0');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8088');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9098');
admin.initializeApp({ projectId: 'demo-ejstore-p0' });
const db = admin.firestore();
const auth = admin.auth();
const root = resolve(__dirname, '../..');
const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return this; } };
let wompiGet = async () => { throw new Error('Outbound Wompi is not configured in this fixture'); };
function boundary(path, exports) {
  const filename = resolve(root, 'functions', path);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
boundary('config.js', {
  admin, db, auth, axios: { get: (...args) => wompiGet(...args) }, logger, createModuleLogger: () => logger,
  setTenantContext() {}, setUserContext() {}, wrapWithCorrelationId: fn => fn,
});
boundary('utils/logger.js', { logger, createModuleLogger: () => logger });
boundary('services/monitoring.js', {
  recordPurchaseLatency() {}, recordPurchaseSuccess() {}, recordPurchaseError() {},
});
const noop = async () => ({ ok: true });
boundary('telegram.js', { sendTelegramAdminNotification: noop, sendTelegramResellerNotification: noop });
boundary('email.js', {
  sendEmail: noop, buildRechargeApprovedEmail: () => '',
  buildRechargeRejectedEmail: () => '', buildPurchaseEmail: () => '',
});
boundary('services/notificationTriggers.js', { notifyNewRechargeOnce: noop });
let imapCalls = 0;
let emails = [];
const imapPool = {
  getPoolKey: tenantId => `imap-${tenantId}`,
  async getConnection() {
    imapCalls++;
    return {
      getMailboxLock: async () => ({ release() {} }),
      search: async () => emails.map(email => email.uid),
      fetchOne: async uid => {
        const email = emails.find(item => item.uid === uid);
        return { source: Buffer.from(`From: ${email.from}\r\nSubject: Recibo de pago\r\n\r\n${email.body}`) };
      },
      mailbox: { uidValidity: 777 },
    };
  },
  releaseConnection: noop,
};
boundary('services/connectionPool.js', { imapPool });
module.exports = {
  admin, db, auth, root,
  setEmails(value) { emails = value; imapCalls = 0; },
  imapCalls: () => imapCalls,
  setWompiGet(fn) { wompiGet = fn; },
  async close() { await db.terminate(); await admin.app().delete(); },
};
