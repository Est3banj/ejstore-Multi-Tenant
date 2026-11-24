const { createModuleLogger, setTenantContext, setUserContext } = require('./config');
const { HttpsError } = require('./services/httpsError');
const { processPurchase, processBulkPurchase } = require('./services/purchaseService');
const { requireVerifiedClient } = require('./services/authVerification');

const log = createModuleLogger('purchases');

async function processPurchaseHandler(data, context) {
  if (!context.auth) {
    log.warn('Unauthenticated purchase attempt');
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  requireVerifiedClient(context);

  const { serviceId, tenantId, idempotencyKey } = data;
  const uid = context.auth.uid;

  const childLog = log.child({ uid, serviceId, tenantId, operation: 'processPurchase' });
  setTenantContext(tenantId);
  setUserContext(uid);

  if (!serviceId || !tenantId) {
    childLog.warn('Missing required parameters');
    throw new HttpsError('invalid-argument', 'serviceId y tenantId son requeridos');
  }

  try {
    childLog.info('Processing purchase');
    const startTime = Date.now();
    
    const result = await processPurchase({
      serviceId,
      tenantId,
      customerId: uid,
      customerEmail: context.auth.token.email,
      idempotencyKey,
    });

    const latencyMs = Date.now() - startTime;
    childLog.info({ 
      purchaseId: result.purchaseId, 
      serviceName: result.serviceName,
      latencyMs,
      hasCodeExtraction: result.hasCodeExtraction 
    }, 'Purchase completed successfully');

    return {
      success: true,
      purchaseId: result.purchaseId,
      account: {
        credential: result.credential,
        serviceName: result.serviceName,
        profileName: result.profileName,
        profilePin: result.profilePin,
      },
      newBalance: result.newBalance,
      hasCodeExtraction: result.hasCodeExtraction,
      linkToken: result.linkTokens?.[0] || null,
      message: result.hasCodeExtraction
        ? `✅ Compra exitosa. Accedé al link público para compartir o extraer el código.`
        : `✅ Compra exitosa. ¡Disfrutá ${result.serviceName}!`,
    };
  } catch (error) {
    const errorMap = {
      'SERVICE_EXHAUSTED': { code: 'failed-precondition', msg: 'Servicio agotado, contacta al administrador' },
      'CUSTOMER_NOT_FOUND': { code: 'not-found', msg: 'Cliente no encontrado' },
      'PERMISSION_DENIED': { code: 'permission-denied', msg: 'No tiene acceso a este servicio' },
      'SERVICE_NOT_FOUND': { code: 'not-found', msg: 'Servicio no encontrado' },
      'INSUFFICIENT_BALANCE': { code: 'failed-precondition', msg: 'Saldo insuficiente', details: { code: 'SALDO_INSUFICIENTE' } },
      'BALANCE_INVALID': { code: 'failed-precondition', msg: 'El saldo de la cuenta es inválido; contactá al soporte', details: { code: 'SALDO_INVALIDO' } },
      'DIAMOND_NOT_PURCHASABLE': { code: 'failed-precondition', msg: 'Este servicio no está disponible para esta compra', details: { code: 'DIAMOND_NOT_PURCHASABLE' } },
    };
    const mapped = errorMap[error.message] || { code: 'internal', msg: 'Error al procesar la compra. Intentalo de nuevo.' };
    
    childLog.error({ err: error, errorCode: error.message }, `Purchase failed: ${mapped.msg}`);
    throw new HttpsError(mapped.code, mapped.msg, mapped.details);
  }
}

async function processBulkPurchaseHandler(data, context) {
  if (!context.auth) {
    log.warn('Unauthenticated bulk purchase attempt');
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const claims = context.auth.token;
  if (claims.role !== 'reseller') {
    log.warn({ uid: context.auth.uid, role: claims.role }, 'Non-reseller attempted bulk purchase');
    throw new HttpsError('permission-denied', 'Solo disponible para subdistribuidores');
  }

  const { serviceId, tenantId, quantity, customerName, idempotencyKey } = data;
  const uid = context.auth.uid;

  const childLog = log.child({ uid, serviceId, tenantId, quantity, operation: 'processBulkPurchase' });
  setTenantContext(tenantId);
  setUserContext(uid);

  if (!serviceId || !tenantId || !quantity) {
    childLog.warn('Missing required parameters');
    throw new HttpsError('invalid-argument', 'serviceId, tenantId y quantity son requeridos');
  }

  try {
    childLog.info('Processing bulk purchase');
    const startTime = Date.now();

    const resellerDoc = await require('./config').db.collection('resellers').doc(uid).get();
    const resellerData = resellerDoc.data();

    const result = await processBulkPurchase({
      serviceId,
      tenantId,
      resellerId: uid,
      resellerEmail: claims.email || resellerData.email,
      resellerName: resellerData.name || resellerData.email || context.auth.token.email || 'Distribuidor',
      quantity,
      customerName,
      resellerCommissionPercent: resellerData.commissionPercent,
      idempotencyKey,
    });

    const latencyMs = Date.now() - startTime;
    childLog.info({ 
      purchaseId: result.purchaseId, 
      serviceName: result.serviceName,
      quantity: result.quantity,
      latencyMs,
      hasCodeExtraction: result.hasCodeExtraction 
    }, 'Bulk purchase completed successfully');

    return {
      success: true,
      purchaseId: result.purchaseId,
      credentials: result.credentials,
      profiles: result.profiles,
      serviceName: result.serviceName,
      quantity: result.quantity,
      newBalance: result.newBalance,
      hasCodeExtraction: result.hasCodeExtraction || false,
      linkTokens: result.linkTokens,
      message: (result.hasCodeExtraction || false)
        ? `✅ Compra exitosa. Recibiste ${result.quantity} link(s) de acceso para compartir con tus clientes.`
        : `✅ Compra exitosa. Recibiste ${result.quantity} cuenta(s) de ${result.serviceName}.`,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const errorMap = {
      'INVALID_QUANTITY': { code: 'invalid-argument', msg: 'La cantidad debe ser entre 1 y 50' },
      'SERVICE_NOT_FOUND': { code: 'not-found', msg: 'Servicio no encontrado' },
      'PERMISSION_DENIED': { code: 'permission-denied', msg: 'No tiene acceso a este servicio' },
      'RESELLER_NOT_FOUND': { code: 'not-found', msg: 'Subdistribuidor no encontrado' },
      'RESELLER_INACTIVE': { code: 'permission-denied', msg: 'Subdistribuidor inactivo' },
      'INSUFFICIENT_BALANCE': { code: 'failed-precondition', msg: 'Saldo insuficiente', details: { code: 'SALDO_INSUFICIENTE' } },
      'BALANCE_INVALID': { code: 'failed-precondition', msg: 'El saldo de la cuenta es inválido; contactá al soporte', details: { code: 'SALDO_INVALIDO' } },
      'DIAMOND_NOT_PURCHASABLE': { code: 'failed-precondition', msg: 'Este servicio no está disponible para esta compra', details: { code: 'DIAMOND_NOT_PURCHASABLE' } },
    };
    if (error.message.startsWith('STOCK_INSUFFICIENT:')) {
      const [, available, requested] = error.message.match(/STOCK_INSUFFICIENT: (\d+)\/(\d+)/) || [];
      childLog.warn({ available: parseInt(available), requested: parseInt(requested) }, 'Stock insufficient for bulk purchase');
      throw new HttpsError('failed-precondition', `Stock insuficiente. Hay ${available} perfil(es) disponible(s), pediste ${requested}`);
    }
    const mapped = errorMap[error.message] || { code: 'internal', msg: 'Error al procesar la compra' };
    childLog.error({ err: error, errorCode: error.message }, `Bulk purchase failed: ${mapped.msg}`);
    throw new HttpsError(mapped.code, mapped.msg, mapped.details);
  }
}

module.exports = { processPurchase: processPurchaseHandler, processBulkPurchase: processBulkPurchaseHandler };