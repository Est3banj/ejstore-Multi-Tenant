const {
  getPublicAccount,
  createAccountWithProfiles,
  updateTicketCredentials,
  adminUpdateTicket,
} = require('../../functions/accounts');
const { getUserRoleHandler, createAdmin } = require('../../functions/auth');
const {
  loadCustomerBalance,
  createReseller,
  loadResellerBalance,
} = require('../../functions/admin');
const {
  extraerCodigo,
  saveEmailConfig,
  getEmailConfig,
  testEmailConnection,
  checkEmailStatus,
} = require('../../functions/email-imap');
const {
  getSmtpConfig,
  saveSmtpConfig,
  sendTestEmail,
} = require('../../functions/email');
const { sendOtpVerification, verifyOtpCode } = require('../../functions/otp');
const { createDiamondOrder, processDiamondOrder } = require('../../functions/diamondOrders');
const { verifyFreeFireId } = require('../../functions/verifyFreeFireId');
const { processPurchase, processBulkPurchase } = require('../../functions/purchases');
const { getPublicStats } = require('../../functions/publicStats');
const { getStockAvailability, getPurchaseCredentials } = require('../../functions/availability');
const {
  createRechargeRequest,
  processRecharge,
  checkRechargePayment,
  getRechargeHistory,
} = require('../../functions/recharges');
const { notifyPrizeWon, processSpin } = require('../../functions/roulette');
const { getWompiConfig, saveWompiConfig, getWompiAvailability, getWompiQuote, createWompiCheckout, reconcileWompiPayment } = require('../../functions/wompi');
const {
  generateTelegramToken,
  checkTelegramStatus,
  sendTestTelegram,
  telegramWebhook,
} = require('../../functions/telegram');
const {
  createSuperadminBootstrap,
  setTenantClaims,
  createTenant,
  verifyTenantAccess,
} = require('../../functions/tenants');
const {
  onUsuarioCreado,
  onNuevaRecarga,
  onTicketCreated,
  onTicketUpdated,
} = require('../../functions/services/notificationTriggers');

const EXCLUDED_ROUTES = {
  migrateCustomersTenantId: 'Operación no disponible',
  // P0-4: retirado — sin consumidores en el frontend y el handler no validaba
  // tenant/rol del destino. Si vuelve, exponer sólo con las guardas de admin.js.
  adminDeleteResellerByEmail: 'Operación no disponible',
};

const FN_REGISTRY = {
  getWompiConfig: { auth: 'bearer', handler: getWompiConfig },
  saveWompiConfig: { auth: 'bearer', handler: saveWompiConfig },
  getWompiAvailability: { auth: 'bearer', handler: getWompiAvailability },
  getWompiQuote: { auth: 'bearer', handler: getWompiQuote },
  createWompiCheckout: { auth: 'bearer', handler: createWompiCheckout },
  reconcileWompiPayment: { auth: 'bearer', handler: reconcileWompiPayment },
  getUserRole: { auth: 'bearer', handler: getUserRoleHandler },
  createAdmin: { auth: 'bearer', handler: createAdmin },
  getPublicAccount: { auth: 'none', handler: getPublicAccount },
  getPublicStats: { auth: 'none', handler: getPublicStats },
  getStockAvailability: { auth: 'none', handler: getStockAvailability },
  getPurchaseCredentials: { auth: 'bearer', handler: getPurchaseCredentials },
  createAccountWithProfiles: { auth: 'bearer', handler: createAccountWithProfiles },
  updateTicketCredentials: { auth: 'bearer', handler: updateTicketCredentials },
  adminUpdateTicket: { auth: 'bearer', handler: adminUpdateTicket },
  loadCustomerBalance: { auth: 'bearer', handler: loadCustomerBalance },
  createReseller: { auth: 'bearer', handler: createReseller },
  loadResellerBalance: { auth: 'bearer', handler: loadResellerBalance },
  extraerCodigo: { auth: 'bearer', handler: extraerCodigo },
  saveEmailConfig: { auth: 'bearer', handler: saveEmailConfig },
  getEmailConfig: { auth: 'bearer', handler: getEmailConfig },
  testEmailConnection: { auth: 'bearer', handler: testEmailConnection },
  checkEmailStatus: { auth: 'bearer', handler: checkEmailStatus },
  getSmtpConfig: { auth: 'bearer', handler: getSmtpConfig },
  saveSmtpConfig: { auth: 'bearer', handler: saveSmtpConfig },
  sendTestEmail: { auth: 'bearer', handler: sendTestEmail },
  sendOtpVerification: { auth: 'bearer', handler: sendOtpVerification },
  verifyOtpCode: { auth: 'bearer', handler: verifyOtpCode },
  processPurchase: { auth: 'bearer', handler: processPurchase },
  processBulkPurchase: { auth: 'bearer', handler: processBulkPurchase },
  createDiamondOrder: { auth: 'bearer', handler: createDiamondOrder },
  processDiamondOrder: { auth: 'bearer', handler: processDiamondOrder },
  verifyFreeFireId: { auth: 'bearer', handler: verifyFreeFireId },
  createRechargeRequest: { auth: 'bearer', handler: createRechargeRequest },
  processRecharge: { auth: 'bearer', handler: processRecharge },
  checkRechargePayment: { auth: 'bearer', handler: checkRechargePayment },
  getRechargeHistory: { auth: 'bearer', handler: getRechargeHistory },
  notifyPrizeWon: { auth: 'bearer', handler: notifyPrizeWon },
  processSpin: { auth: 'bearer', handler: processSpin },
  generateTelegramToken: { auth: 'bearer', handler: generateTelegramToken },
  checkTelegramStatus: { auth: 'bearer', handler: checkTelegramStatus },
  sendTestTelegram: { auth: 'bearer', handler: sendTestTelegram },
  createSuperadminBootstrap: { auth: 'bearer', handler: createSuperadminBootstrap },
  setTenantClaims: { auth: 'bearer', handler: setTenantClaims },
  createTenant: { auth: 'bearer', handler: createTenant },
  verifyTenantAccess: { auth: 'bearer', handler: verifyTenantAccess },
  onUsuarioCreado: { auth: 'bearer', handler: onUsuarioCreado },
  onNuevaRecarga: { auth: 'bearer', handler: onNuevaRecarga },
  onTicketCreated: { auth: 'bearer', handler: onTicketCreated },
  onTicketUpdated: { auth: 'bearer', handler: onTicketUpdated },
  telegramWebhook: { auth: 'none', raw: true, handler: telegramWebhook },
};

module.exports = { FN_REGISTRY, EXCLUDED_ROUTES };
