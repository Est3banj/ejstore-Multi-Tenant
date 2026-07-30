const { admin, db } = require('./config');

async function getUserRole(uid) {
  try {
    const user = await admin.auth().getUser(uid);
    if (user.customClaims && user.customClaims.role) {
      return { role: user.customClaims.role, tenantId: user.customClaims.tenantId };
    }
  } catch (e) {
    // fall through to Firestore
  }

  const userDoc = await db.collection('users').doc(uid).get();
  if (userDoc.exists) {
    const data = userDoc.data();
    return { role: data.role, tenantId: data.tenantId };
  }

  return { role: null, tenantId: null };
}

module.exports = { getUserRole };
