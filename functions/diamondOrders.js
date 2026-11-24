const { admin, db, createModuleLogger, setTenantContext, setUserContext } = require('./config');
const { HttpsError } = require('./services/httpsError');
const { getUserRole } = require('./auth');
const {
  sendEmail,
  buildDiamondOrderReceivedEmail,
  buildDiamondOrderCompletedEmail,
  buildDiamondOrderRejectedEmail,
} = require('./email');
const { sendTelegramAdminNotification } = require('./telegram');
const { withIdempotency, validateIdempotencyKey } = require('./services/idempotencyService');
const { requireVerifiedClient } = require('./services/authVerification');
const { FF_ID_REGEX } = require('./services/freefire');

const log = createModuleLogger('diamondOrders');

function buildDiamondOrderTelegramMessage({ serviceName, price, freeFireId, customerEmail, orderId }) {
  const fecha = new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return [
    '💎 <b>Nuevo Pedido de Diamantes</b>',
    '🎮 Juego: Free Fire',
    `🛒 Servicio: ${serviceName}`,
    `💵 Precio: $${Number(price).toLocaleString('es-CO')} COP`,
    `🆔 ID Jugador: ${freeFireId}`,
    `👤 Cliente: ${customerEmail}`,
    `📌 Pedido: ${orderId} (pending)`,
    `🕐 Fecha: ${fecha}`,
  ].join('\n');
}

async function dispatchSideEffects(childLog, tasks) {
  const outcomes = await Promise.allSettled(tasks.map((t) => t.run()));
  outcomes.forEach((outcome, i) => {
    const channel = tasks[i].channel;
    if (outcome.status === 'fulfilled') {
      const value = outcome.value;
      const ok = typeof value === 'object' && value !== null ? value.ok !== false : !!value;
      if (ok) {
        childLog.info({ channel }, 'diamond.order.notification.sent');
      } else {
        const error = typeof value === 'object' && value !== null ? value.error || 'UNKNOWN' : 'NOT_SENT';
        childLog.warn({ channel, error }, 'diamond.order.notification.failed');
      }
    } else {
      childLog.warn({ channel, err: outcome.reason }, 'diamond.order.notification.error');
    }
  });
}

async function createDiamondOrder(data, context) {
  if (!context.auth) {
    log.warn('Unauthenticated createDiamondOrder attempt');
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  requireVerifiedClient(context);

  const uid = context.auth.uid;
  const token = context.auth.token || {};
  const payload = data || {};
  const { serviceId, tenantId, freeFireId, idempotencyKey } = payload;
  const childLog = log.child({ uid, operation: 'createDiamondOrder' });
  setUserContext(uid);

  if (typeof serviceId !== 'string' || !serviceId.trim() || typeof tenantId !== 'string' || !tenantId.trim()) {
    childLog.warn('Missing serviceId/tenantId');
    throw new HttpsError('invalid-argument', 'serviceId y tenantId son requeridos');
  }

  if (typeof idempotencyKey !== 'string' || !idempotencyKey) {
    childLog.warn('Missing idempotencyKey');
    throw new HttpsError('invalid-argument', 'La clave de idempotencia es requerida', { code: 'IDEMPOTENCIA_REQUERIDA' });
  }
  const keyValidation = validateIdempotencyKey(idempotencyKey);
  if (!keyValidation.valid) {
    childLog.warn('Invalid idempotency key');
    throw new HttpsError('invalid-argument', 'La clave de idempotencia es inválida', { code: 'IDEMPOTENCIA_INVALIDA' });
  }

  // spec:diamond-orders#server-side-gate — ANTES de cualquier transacción.
  if (typeof freeFireId !== 'string' || !FF_ID_REGEX.test(freeFireId)) {
    childLog.warn({ freeFireId }, 'Invalid Free Fire ID');
    throw new HttpsError(
      'failed-precondition',
      'El ID de jugador de Free Fire no es válido (debe tener entre 8 y 12 dígitos)',
      { code: 'FF_ID_INVALIDO' }
    );
  }

  setTenantContext(tenantId);

  const orderRef = db.collection('diamondOrders').doc(`${tenantId}_${idempotencyKey}`);
  const customerRef = db.collection('customers').doc(uid);
  const serviceRef = db.collection('services').doc(serviceId);

  let txResult;
  try {
    txResult = await withIdempotency(idempotencyKey, tenantId, () =>
      db.runTransaction(async (transaction) => {
        // Todas las lecturas ANTES de cualquier escritura (regla de Firestore tx).
        const [serviceSnap, customerSnap, existingSnap] = await Promise.all([
          transaction.get(serviceRef),
          transaction.get(customerRef),
          transaction.get(orderRef),
        ]);

        if (!serviceSnap.exists) {
          throw new HttpsError('not-found', 'Servicio no encontrado', { code: 'SERVICIO_NO_ENCONTRADO' });
        }
        const service = serviceSnap.data();
        if (service.tenantId !== tenantId) {
          childLog.warn({ serviceTenantId: service.tenantId }, 'Foreign service rejected');
          throw new HttpsError('failed-precondition', 'No tenés acceso a este servicio', { code: 'SERVICIO_NO_DISPONIBLE' });
        }
        if (service.active === false) {
          childLog.warn('Inactive service rejected');
          throw new HttpsError('failed-precondition', 'Este servicio no está disponible por el momento', { code: 'SERVICIO_NO_DISPONIBLE' });
        }
        if ((service.serviceType || 'subscription') !== 'diamond') {
          childLog.warn({ serviceType: service.serviceType || null }, 'Non-diamond service rejected');
          throw new HttpsError('failed-precondition', 'Este servicio no está disponible para comprar diamantes', { code: 'SERVICIO_NO_DIAMANTE' });
        }
        const price = service.price;
        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
          childLog.warn({ price }, 'Invalid service price');
          throw new HttpsError('failed-precondition', 'El precio del servicio es inválido', { code: 'PRECIO_INVALIDO' });
        }

        if (!customerSnap.exists) {
          throw new HttpsError('not-found', 'Cliente no encontrado', { code: 'CLIENTE_NO_ENCONTRADO' });
        }
        const customer = customerSnap.data();
        if (customer.tenantId && customer.tenantId !== tenantId) {
          childLog.warn({ customerTenantId: customer.tenantId }, 'Cross-tenant customer rejected');
          throw new HttpsError('permission-denied', 'No tenés acceso a esta cuenta', { code: 'NO_AUTORIZADO' });
        }

        // Defensa en profundidad (design:DD7): doc-ID determinista — si ya
        // existe (retry post-commit con la Redis key liberada) NO se descuenta.
        if (existingSnap.exists) {
          const existing = existingSnap.data();
          childLog.info({ orderId: orderRef.id }, 'Order doc already exists: returning without deduction');
          const rawBalance = customer.balance ?? 0;
          return {
            created: false,
            orderId: orderRef.id,
            status: existing.status || 'pending',
            price: existing.price ?? price,
            newBalance: typeof rawBalance === 'number' && Number.isFinite(rawBalance) ? rawBalance : 0,
          };
        }

        const rawBalance = customer.balance ?? 0;
        if (typeof rawBalance !== 'number' || !Number.isFinite(rawBalance) || rawBalance < 0) {
          childLog.warn({ balance: rawBalance }, 'Invalid customer balance');
          throw new HttpsError('failed-precondition', 'El saldo de la cuenta es inválido; contactá al soporte', { code: 'SALDO_INVALIDO' });
        }
        if (rawBalance < price) {
          childLog.warn({ balance: rawBalance, price }, 'Insufficient balance');
          throw new HttpsError('failed-precondition', 'Saldo insuficiente', { code: 'SALDO_INSUFICIENTE' });
        }

        const now = admin.firestore.FieldValue.serverTimestamp();
        const customerEmail = String(token.email || customer.email || '').trim();
        const serviceName = service.name || '';

        transaction.update(customerRef, { balance: rawBalance - price });
        transaction.set(orderRef, {
          tenantId,
          customerId: uid,
          customerEmail,
          serviceId,
          serviceName,
          price,
          freeFireId,
          status: 'pending',
          idempotencyKey,
          createdAt: now,
        });
        transaction.set(db.collection('balanceTransactions').doc(orderRef.id), {
          customerId: uid,
          amount: -price,
          type: 'diamond_purchase',
          serviceId,
          serviceName,
          diamondOrderId: orderRef.id,
          tenantId,
          createdAt: now,
        });

        return {
          created: true,
          orderId: orderRef.id,
          status: 'pending',
          price,
          serviceName,
          newBalance: rawBalance - price,
        };
      })
    );
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    const message = String(err && err.message);
    if (message.startsWith('IDEMPOTENCY_TIMEOUT')) {
      childLog.error({ err }, 'Idempotency timeout');
      throw new HttpsError('internal', 'La operación tardó demasiado. Intentá de nuevo.');
    }
    if (message.startsWith('IDEMPOTENCY_INVALID')) {
      childLog.warn({ err }, 'Idempotency validation failed');
      throw new HttpsError('invalid-argument', 'La clave de idempotencia es inválida', { code: 'IDEMPOTENCIA_INVALIDA' });
    }
    childLog.error({ err }, 'createDiamondOrder transaction failed');
    throw new HttpsError('internal', 'No se pudo procesar el pedido. Intentá de nuevo.');
  }

  const idempotent = txResult.idempotent === true || txResult.created === false;

  // spec:diamond-orders#notifications-creation — fuera de la transacción,
  // best-effort: un fallo de SMTP/Telegram NUNCA tumba el pedido.
  if (txResult.created === true && txResult.idempotent !== true) {
    const customerEmail = String(token.email || '').trim();
    const tasks = [];
    if (customerEmail) {
      tasks.push({
        channel: 'email',
        run: () =>
          sendEmail(
            tenantId,
            customerEmail,
            'Pedido de diamantes recibido',
            buildDiamondOrderReceivedEmail({
              serviceName: txResult.serviceName,
              price: txResult.price,
              freeFireId,
              orderId: txResult.orderId,
            })
          ),
      });
    }
    tasks.push({
      channel: 'telegram',
      run: () =>
        sendTelegramAdminNotification(
          tenantId,
          buildDiamondOrderTelegramMessage({
            serviceName: txResult.serviceName,
            price: txResult.price,
            freeFireId,
            customerEmail,
            orderId: txResult.orderId,
          })
        ),
    });
    await dispatchSideEffects(childLog, tasks);
  }

  childLog.info(
    { orderId: txResult.orderId, status: txResult.status, price: txResult.price, idempotent },
    'Diamond order resolved'
  );
  return {
    success: true,
    orderId: txResult.orderId,
    status: txResult.status,
    price: txResult.price,
    newBalance: txResult.newBalance,
    idempotent,
  };
}

async function processDiamondOrder(data, context) {
  if (!context.auth) {
    log.warn('Unauthenticated processDiamondOrder attempt');
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const uid = context.auth.uid;
  const { role, tenantId: userTenantId } = await getUserRole(uid);
  const childLog = log.child({ uid, role, operation: 'processDiamondOrder' });
  setUserContext(uid);

  if (role !== 'superadmin' && role !== 'admin') {
    childLog.warn({ role }, 'Non-admin attempted to process diamond order');
    throw new HttpsError('permission-denied', 'No tiene permisos de admin');
  }

  const payload = data || {};
  const { orderId, action, reason } = payload;

  if (typeof orderId !== 'string' || !orderId.trim() || !action) {
    childLog.warn('Missing orderId/action');
    throw new HttpsError('invalid-argument', 'orderId y action son requeridos');
  }
  if (action !== 'confirm' && action !== 'reject') {
    childLog.warn({ action }, 'Invalid diamond order action');
    throw new HttpsError('invalid-argument', 'Acción no válida', { code: 'ACCION_INVALIDA' });
  }

  const orderRef = db.collection('diamondOrders').doc(orderId);

  let txResult;
  try {
    txResult = await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        childLog.warn('Diamond order not found');
        throw new HttpsError('not-found', 'Pedido no encontrado', { code: 'PEDIDO_NO_ENCONTRADO' });
      }
      const order = orderSnap.data();

      if (role !== 'superadmin' && (!userTenantId || userTenantId !== order.tenantId)) {
        childLog.warn({ orderTenantId: order.tenantId, userTenantId }, 'Cross-tenant processing denied');
        throw new HttpsError('permission-denied', 'No tiene acceso a este pedido', { code: 'NO_AUTORIZADO' });
      }

      // Guard ÚNICO check-and-set (design:DD8): estados terminales inmutables.
      if (order.status !== 'pending') {
        childLog.warn({ status: order.status }, 'Order already processed');
        throw new HttpsError('failed-precondition', 'Este pedido ya fue procesado', { code: 'PEDIDO_YA_PROCESADO' });
      }

      // Lecturas antes de escrituras: en reject, leer el customer ANTES de tocar nada.
      let customerSnap = null;
      if (action === 'reject') {
        customerSnap = await transaction.get(db.collection('customers').doc(order.customerId));
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const newStatus = action === 'confirm' ? 'completed' : 'rejected';
      const orderUpdate = {
        status: newStatus,
        processedAt: now,
        processedBy: uid,
      };
      if (action === 'reject' && reason) {
        orderUpdate.rejectReason = String(reason);
      }
      transaction.update(orderRef, orderUpdate);

      let newBalance;
      if (action === 'reject') {
        const price = typeof order.price === 'number' && Number.isFinite(order.price) ? order.price : 0;
        if (customerSnap && customerSnap.exists) {
          const customer = customerSnap.data();
          transaction.update(db.collection('customers').doc(order.customerId), {
            balance: admin.firestore.FieldValue.increment(price),
          });
          transaction.set(db.collection('balanceTransactions').doc(`${orderId}_refund`), {
            customerId: order.customerId,
            amount: price,
            type: 'diamond_refund',
            serviceId: order.serviceId,
            serviceName: order.serviceName,
            diamondOrderId: orderId,
            tenantId: order.tenantId,
            createdAt: now,
          });
          const current = typeof customer.balance === 'number' && Number.isFinite(customer.balance) ? customer.balance : 0;
          newBalance = current + price;
        } else {
          childLog.warn({ customerId: order.customerId }, 'Customer doc missing on reject: refund skipped');
        }
      }

      return { orderId, status: newStatus, newBalance, order };
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    childLog.error({ err }, 'processDiamondOrder transaction failed');
    throw new HttpsError('internal', 'No se pudo procesar el pedido. Intentá de nuevo.');
  }

  // spec:diamond-orders#order-lifecycle — email fuera de la tx, allSettled.
  const order = txResult.order;
  const customerEmail = String(order.customerEmail || '').trim();
  if (customerEmail) {
    const tasks = [];
    if (txResult.status === 'completed') {
      tasks.push({
        channel: 'email',
        run: () =>
          sendEmail(
            order.tenantId,
            customerEmail,
            'Pedido de diamantes completado',
            buildDiamondOrderCompletedEmail({
              serviceName: order.serviceName,
              price: order.price,
              freeFireId: order.freeFireId,
              orderId,
            })
          ),
      });
    } else {
      tasks.push({
        channel: 'email',
        run: () =>
          sendEmail(
            order.tenantId,
            customerEmail,
            'Pedido de diamantes rechazado',
            buildDiamondOrderRejectedEmail({
              serviceName: order.serviceName,
              price: order.price,
              orderId,
              reason: order.rejectReason || reason || '',
            })
          ),
      });
    }
    await dispatchSideEffects(childLog, tasks);
  } else {
    childLog.warn({ orderId }, 'No customerEmail on order: skipping processing email');
  }

  childLog.info({ orderId, status: txResult.status, action }, 'Diamond order processed');
  const response = { success: true, orderId, status: txResult.status };
  if (typeof txResult.newBalance === 'number') {
    response.newBalance = txResult.newBalance;
  }
  return response;
}

module.exports = { createDiamondOrder, processDiamondOrder };
