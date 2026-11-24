const { HttpsError } = require('./httpsError');

// Single Firestore path segment. No arbitrary paths or unbounded list input.
const validId = value => typeof value === 'string' && value.length <= 1500
  && value.trim() === value && value.length > 0 && !value.includes('/')
  && value !== '.' && value !== '..';

function createStockAvailabilityHandler(db) {
  return async function getStockAvailability(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)
        || Object.keys(data).some(key => !['tenantId', 'serviceId'].includes(key))
        || !validId(data.tenantId) || !validId(data.serviceId)) {
      throw new HttpsError('invalid-argument', 'tenantId y serviceId válidos son requeridos');
    }
    try {
      const tenant = await db.collection('tenants').doc(data.tenantId).get();
      const serviceRef = db.collection('services').doc(data.serviceId);
      const service = await serviceRef.get();
      // Same response for absent tenant/service and mismatched tenant. Never query inventory.
      if (!tenant.exists || !service.exists || service.data().tenantId !== data.tenantId) {
        throw new HttpsError('not-found', 'Servicio no disponible');
      }
      if (service.data().serviceType === 'diamond') {
        throw new HttpsError('failed-precondition', 'Este servicio no utiliza inventario de cuentas');
      }
      // Projection prevents even the server query from materializing credentials.
      // Match the purchase inventory: positive profile counters regardless of parent
      // status, plus legacy available accounts without a counter.
      const accounts = serviceRef.collection('accounts');
      const [profiles, legacy] = await Promise.all([
        accounts.where('availableProfiles', '>', 0).select('availableProfiles').get(),
        accounts.where('status', '==', 'available').select('availableProfiles').get(),
      ]);
      let available = 0;
      for (const snapshot of profiles.docs) {
        const count = snapshot.data().availableProfiles;
        if (!Number.isSafeInteger(count) || count < 0) {
          throw new HttpsError('unavailable', 'No se pudo verificar la disponibilidad');
        }
        available += count;
      }
      for (const snapshot of legacy.docs) {
        const count = snapshot.data().availableProfiles;
        if (count === undefined) available += 1;
        else if (!Number.isSafeInteger(count) || count < 0) {
          throw new HttpsError('unavailable', 'No se pudo verificar la disponibilidad');
        }
      }
      if (!Number.isSafeInteger(available)) {
        throw new HttpsError('unavailable', 'No se pudo verificar la disponibilidad');
      }
      return { available }; // Explicit allowlist: no ids, profiles, credentials or counters of sales.
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('unavailable', 'No se pudo verificar la disponibilidad');
    }
  };
}

module.exports = { createStockAvailabilityHandler, validId };
