// Clean emulator data: delete all documents from Firestore
const admin = require('firebase-admin');
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

const app = admin.initializeApp({ projectId: 'ejstore-web' });
const db = admin.firestore();
const auth = admin.auth();

async function deleteCollection(collectionPath, batchSize = 50) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve, reject);
  });
}

async function deleteQueryBatch(query, resolve, reject) {
  try {
    const snapshot = await query.get();
    if (snapshot.size === 0) {
      resolve();
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      // Also delete subcollections for services/accounts
      if (doc.ref.path.includes('services')) {
        // Delete accounts subcollection
        deleteCollection(doc.ref.path + '/accounts');
      }
      batch.delete(doc.ref);
    });

    await batch.commit();
    process.nextTick(() => deleteQueryBatch(query, resolve, reject));
  } catch (error) {
    reject(error);
  }
}

async function clean() {
  console.log('🧹 Limpiando emuladores...\n');

  const collections = ['users', 'customers', 'services', 'tenants', 'recharges', 
    'rouletteConfig', 'spinTransactions', 'notifications', 'purchases', 'tickets',
    'balanceTransactions'];

  for (const col of collections) {
    try {
      await deleteCollection(col);
      console.log(`✅ Colección ${col} limpiada`);
    } catch (e) {
      console.log(`⚠️  Error limpiando ${col}: ${e.message}`);
    }
  }

  // Delete auth users
  try {
    const users = await auth.listUsers();
    for (const user of users.users) {
      await auth.deleteUser(user.uid);
      console.log(`✅ Auth user deleted: ${user.email}`);
    }
  } catch (e) {
    console.log(`⚠️  Error limpiando auth: ${e.message}`);
  }

  console.log('\n✅✅✅ EMULADORES LIMPIOS');
  
  app.delete();
}

clean().catch(console.error);
