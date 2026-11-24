const { admin, db } = require('./config');
const { HttpsError } = require('./services/httpsError');
const { sendTelegramAdminNotification } = require('./telegram');
const { sendEmail } = require('./email');

// ========== HELPERS ==========

function selectPrize(prizes) {
  const totalWeight = prizes.reduce((sum, p) => sum + p.probability, 0);
  let random = Math.random() * totalWeight;
  let cumulative = 0;
  for (const prize of prizes) {
    cumulative += prize.probability;
    if (random <= cumulative) {
      return prize;
    }
  }
  return prizes[prizes.length - 1];
}

function hasStock(prize) {
  return prize.stock === undefined || prize.stock === null || prize.stock > 0;
}

function decrementStock(prizes, prizeId) {
  return prizes.map(p => {
    if (p.id === prizeId && p.stock && p.stock > 0) {
      return { ...p, stock: p.stock - 1 };
    }
    return p;
  });
}

function selectPrizeWithStockCheck(prizes) {
  const totalWeight = prizes.reduce((sum, p) => sum + ((p.effectiveProbability ?? p.probability) || 0), 0);

  if (totalWeight <= 0) {
    return prizes.find(p => p.id === 'nothing') ||
      { id: 'nothing', name: 'Nada', type: 'nothing', cost: 0 };
  }

  let random = Math.random() * totalWeight;
  let cumulative = 0;

  for (const prize of prizes) {
    cumulative += prize.effectiveProbability ?? prize.probability ?? 0;
    if (random <= cumulative) {
      return prize;
    }
  }

  return prizes[prizes.length - 1];
}

// ========== EXPORTED FUNCTIONS ==========

async function notifyPrizeWon(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { transactionId } = data;

  if (!transactionId) {
    throw new HttpsError('invalid-argument', 'transactionId es requerido');
  }

  const txnRef = db.collection('spinTransactions').doc(transactionId);
  const txnDoc = await txnRef.get();

  if (!txnDoc.exists) {
    throw new HttpsError('not-found', 'Transacción no encontrada');
  }

  const txn = txnDoc.data();

  if (txn.customerId !== context.auth.uid) {
    throw new HttpsError('permission-denied', 'No tiene acceso a esta transacción');
  }

  if (txn.notified) {
    return { success: true, notified: true };
  }

  if (txn.prizeId === 'nothing') {
    await txnRef.update({
      notified: true,
      notifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true, notified: true };
  }

  let customerName = 'Desconocido';
  let customerPhone = 'Sin teléfono';
  try {
    const customerSnap = await db.collection('customers').doc(txn.customerId).get();
    if (customerSnap.exists) {
      const cust = customerSnap.data();
      customerName = `${cust.firstName || ''} ${cust.lastName || ''}`.trim() || cust.email || 'Desconocido';
      customerPhone = cust.phone || 'Sin teléfono';
    }
  } catch (e) {
    console.warn('Could not look up customer for notification:', e.message);
  }

  if (txn.tenantId) {
    const prizeName = txn.prizeName || txn.prizeId || 'Premio';
    const spinType = txn.spinType || '—';
    const customerEmail = txn.customerEmail || '—';
    const msg = `🎉 <b>Premio Reclamado</b>\n\n👤 <b>Cliente:</b> ${customerName}\n📞 <b>Teléfono:</b> ${customerPhone}\n📧 <b>Email:</b> ${customerEmail}\n🏆 <b>Premio:</b> ${prizeName}\n🎰 <b>Tipo giro:</b> ${spinType}\n🆔 <b>ID Transacción:</b> ${transactionId}`;
    sendTelegramAdminNotification(txn.tenantId, msg);

    // Notificar al cliente por email si tiene correo configurado
    if (customerEmail && customerEmail !== '—') {
      const emailHtml = `
<table style="width:100%;border-spacing:0">
<tr><td style="text-align:center;padding:0 0 5px">
<h2 style="margin:0;color:#16a34a;font-size:22px">Felicidades! Has ganado un premio</h2>
</td></tr>
<tr><td style="padding:15px 0;text-align:center">
<div style="display:inline-block;background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:20px 30px;margin:10px 0">
<p style="color:#166534;font-size:24px;font-weight:bold;margin:0">${prizeName}</p>
</div>
</td></tr>
<tr><td style="color:#6b7280;font-size:14px;text-align:center;line-height:1.6">
<p>Tu premio ser&#225; entregado en los pr&#243;ximos minutos v&#237;a WhatsApp.</p>
<p style="margin-top:10px">Si ten&#233;s alguna duda, respond&#233; este correo o contactanos por los canales habituales.</p>
</td></tr>
</table>`;
      sendEmail(txn.tenantId, customerEmail, 'Premio de Ruleta - ' + prizeName, emailHtml);
    }
  }

  await txnRef.update({
    notified: true,
    notifiedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true, notified: true };
}

async function processSpin(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const uid = context.auth.uid;
  const tenantId = data.tenantId || context.auth.token.tenantId;

  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId es requerido');
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      const customerRef = db.collection('customers').doc(uid);
      const spinDataRef = db.collection('customers').doc(uid).collection('spinData').doc('default');
      const configRef = db.collection('rouletteConfig').doc(tenantId);

      const [customerDoc, spinDataDoc, configDoc] = await Promise.all([
        transaction.get(customerRef),
        transaction.get(spinDataRef),
        transaction.get(configRef),
      ]);

      if (!customerDoc.exists) {
        throw new HttpsError('not-found', 'Cliente no encontrado');
      }

      const customer = customerDoc.data();

      if (customer.tenantId && customer.tenantId !== tenantId) {
        throw new HttpsError('permission-denied', 'Tenant no autorizado', { code: 'TENANT_INVALIDO' });
      }

      if (!configDoc.exists) {
        throw new HttpsError('failed-precondition', 'Ruleta no configurada para este tenant');
      }

      const config = configDoc.data();
      const spinData = spinDataDoc.exists ? spinDataDoc.data() : {};

      const lastUpdated = spinData.updatedAt;
      if (lastUpdated) {
        const elapsed = Date.now() - new Date(lastUpdated).getTime();
        if (elapsed < 3000) {
          throw new HttpsError('failed-precondition', 'Debe esperar antes de girar de nuevo');
        }
      }

      const spinTimestamps = spinData.spinTimestamps || [];
      const oneMinuteAgo = Date.now() - 60000;
      const recentTimestamps = spinTimestamps.filter(ts => ts > oneMinuteAgo);
      if (recentTimestamps.length >= 10) {
        throw new HttpsError('failed-precondition', 'Demasiados giros por minuto');
      }

      if (!config.isEnabled) {
        throw new HttpsError('failed-precondition', 'Ruleta deshabilitada');
      }

      const paidSpinsCount = spinData.paidSpinsCount || 0;
      const spinsNeeded = config.spinsForFreeSpin || 3;
      const spinType = paidSpinsCount >= spinsNeeded ? 'free' : 'paid';
      const price = spinType === 'free' ? 0 : (config.pricePerSpin ?? 1000);
      const newPaidSpinsCount = spinType === 'free' ? 0 : paidSpinsCount + 1;

      const balance = Number.isFinite(customer.balance) ? customer.balance : 0;
      if (balance < price) {
        throw new HttpsError('failed-precondition', 'Saldo insuficiente');
      }

      const balanceBefore = balance;
      const balanceAfter = balanceBefore - price;
      transaction.update(customerRef, { balance: admin.firestore.FieldValue.increment(-price) });

      const today = new Date().toISOString().split('T')[0];
      const lastSpinDate = spinData.lastSpinDate || '';
      const isNewDay = lastSpinDate !== today;

      const spinsPaidToday = isNewDay ? 0 : (spinData.spinsPaidToday || 0);
      const spinsFreeToday = isNewDay ? 0 : (spinData.spinsFreeToday || 0);

      const dailySpendingLimit = config.dailySpendingLimit || Infinity;
      if (spinType === 'paid' && dailySpendingLimit !== Infinity) {
        const spentToday = spinsPaidToday * price;
        if (spentToday + price > dailySpendingLimit) {
          throw new HttpsError('failed-precondition', 'Límite diario de gasto alcanzado');
        }
      }

      const totalGastado = spinData.totalGastadoEnRuleta || 0;
      const updatedTotalGastado = totalGastado + price;

      let prizes = (config.prizes || []).filter(p => p.isActive !== false);

      if (prizes.length === 0) {
        throw new HttpsError('failed-precondition', 'No hay premios activos');
      }

      prizes = prizes.map(p => ({ ...p }));
      let selectedPrize;
      let pityMode = 'none';
      let gastadoDeduction = 0;

      selectedPrize = prizes.find(p =>
        p.cost > 0 &&
        updatedTotalGastado >= p.cost * 2 &&
        hasStock(p)
      );

      if (selectedPrize) {
        pityMode = 'garantizado';
        gastadoDeduction = selectedPrize.cost * 2;
        prizes = decrementStock(prizes, selectedPrize.id);
      }

      if (!selectedPrize) {
        const filteredPrizes = prizes.map(p => ({
          ...p,
          effectiveProbability: (p.cost > 0 && updatedTotalGastado < p.cost) ? 0 : p.probability,
        }));

        selectedPrize = selectPrizeWithStockCheck(filteredPrizes);

        if (selectedPrize.id !== 'nothing' && selectedPrize.cost > 0) {
          if (!hasStock(selectedPrize)) {
            selectedPrize = prizes.find(p => p.id === 'nothing') ||
              { id: 'nothing', name: 'Nada', type: 'nothing', cost: 0 };
            gastadoDeduction = 0;
          } else {
            pityMode = 'azar';
            gastadoDeduction = selectedPrize.cost;
            prizes = decrementStock(prizes, selectedPrize.id);
          }
        }
      }

      transaction.update(configRef, { prizes });

      const updatedTimestamps = [...recentTimestamps, Date.now()];
      transaction.set(spinDataRef, {
        spinsPaidToday: spinType === 'paid' ? spinsPaidToday + 1 : spinsPaidToday,
        spinsFreeToday: spinType === 'free' ? spinsFreeToday + 1 : spinsFreeToday,
        lastSpinDate: today,
        totalSpinsPaid: (spinData.totalSpinsPaid || 0) + (spinType === 'paid' ? 1 : 0),
        totalSpinsFree: (spinData.totalSpinsFree || 0) + (spinType === 'free' ? 1 : 0),
        totalGastadoEnRuleta: Math.max(0, updatedTotalGastado - gastadoDeduction),
        paidSpinsCount: newPaidSpinsCount,
        spinTimestamps: updatedTimestamps,
        updatedAt: new Date().toISOString()
      });

      const transactionRef = db.collection('spinTransactions').doc();
      transaction.set(transactionRef, {
        customerId: uid,
        customerEmail: customer.email || '',
        tenantId,
        prizeId: selectedPrize.id,
        prizeName: selectedPrize.name,
        prizeType: selectedPrize.type || null,
        price,
        spinType,
        balanceBefore,
        balanceAfter,
        pityMode,
        notified: false,
        createdAt: new Date().toISOString()
      });

      return {
        transactionId: transactionRef.id,
        prize: selectedPrize,
        newBalance: balanceAfter,
        spinType,
        pityMode
      };
    });

    return {
      success: true,
      transactionId: result.transactionId,
      prize: {
        id: result.prize.id,
        name: result.prize.name,
        type: result.prize.type || 'nothing'
      },
      newBalance: result.newBalance,
      spinType: result.spinType,
      pityMode: result.pityMode
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('Error in processSpin:', error);
    throw new HttpsError('internal', 'Error al procesar el giro');
  }
}

module.exports = { processSpin, notifyPrizeWon };
