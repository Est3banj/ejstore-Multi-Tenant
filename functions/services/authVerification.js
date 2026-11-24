const { HttpsError } = require('./httpsError');

const EXEMPT_ROLES = ['admin', 'reseller', 'superadmin'];

function requireVerifiedClient(context) {
  if (!context || !context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const token = context.auth.token || {};

  if (EXEMPT_ROLES.includes(token.role)) {
    return;
  }

  if (token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Email no verificado');
  }
}

module.exports = { EXEMPT_ROLES, requireVerifiedClient };
