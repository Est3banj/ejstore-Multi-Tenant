function initAdmin(admin, env = process.env) {
  if (!admin.apps.length) {
    const isEmulator = env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST;
    if (isEmulator) {
      admin.initializeApp({ projectId: env.GOOGLE_CLOUD_PROJECT || 'demo-ejstore' });
    } else {
      const raw = env.FIREBASE_SERVICE_ACCOUNT;
      if (!raw) {
        throw new Error(
          'FIREBASE_SERVICE_ACCOUNT no configurada (ni FIRESTORE_EMULATOR_HOST ni FIREBASE_AUTH_EMULATOR_HOST activos)'
        );
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error('FIREBASE_SERVICE_ACCOUNT no es un JSON válido');
      }
      admin.initializeApp({ credential: admin.credential.cert(parsed) });
    }
  }
  return admin;
}

module.exports = { initAdmin };
