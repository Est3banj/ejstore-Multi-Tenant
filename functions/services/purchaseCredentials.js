const { HttpsError } = require('./httpsError');
const { validId } = require('./stockAvailability');

// Historical single-profile purchases have no inline credential. Authorize the
// purchase AND its current assignment; never grant access to the whole parent.
function createPurchaseCredentialsHandler(db) {
  return async function getPurchaseCredentials(data, context) {
    if (!context?.auth?.uid) throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
    if (!data || !validId(data.purchaseId) || Object.keys(data).some(key => key !== 'purchaseId')) {
      throw new HttpsError('invalid-argument', 'purchaseId válido es requerido');
    }
    const denied = () => new HttpsError('not-found', 'Credenciales no disponibles');
    try {
      const purchaseDoc = await db.collection('purchases').doc(data.purchaseId).get();
      if (!purchaseDoc.exists) throw denied();
      const purchase = purchaseDoc.data();
      if (purchase.customerId !== context.auth.uid || !validId(purchase.serviceId)
          || !validId(purchase.accountId) || !validId(purchase.tenantId)) throw denied();
      const serviceRef = db.collection('services').doc(purchase.serviceId);
      const service = await serviceRef.get();
      if (!service.exists || service.data().tenantId !== purchase.tenantId) throw denied();
      const accountRef = serviceRef.collection('accounts').doc(purchase.accountId);
      const account = await accountRef.get();
      if (!account.exists) throw denied();
      let assignment = account.data();
      if (purchase.profileId) {
        if (!validId(purchase.profileId)) throw denied();
        const profile = await accountRef.collection('profiles').doc(purchase.profileId).get();
        if (!profile.exists) throw denied();
        assignment = profile.data();
      }
      if (assignment.status !== 'sold' || assignment.soldTo !== context.auth.uid
          || (purchase.profileId && assignment.purchaseId !== data.purchaseId)
          || (assignment.purchaseId && assignment.purchaseId !== data.purchaseId)) throw denied();
      const accountData = account.data();
      const credential = accountData.credential || accountData;
      const email = credential.email || credential.correo;
      const password = credential.password || credential.clave;
      if (typeof email !== 'string' || typeof password !== 'string') throw denied();
      return { credential: { email, password } };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('unavailable', 'No se pudieron recuperar las credenciales');
    }
  };
}

module.exports = { createPurchaseCredentialsHandler };
