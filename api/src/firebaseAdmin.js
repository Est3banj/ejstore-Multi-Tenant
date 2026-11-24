const { initAdmin } = require('../../functions/services/adminInit');

function getAdmin() {
  return initAdmin(require('firebase-admin'), process.env);
}

function db() {
  return getAdmin().firestore();
}

function auth() {
  return getAdmin().auth();
}

module.exports = { initAdmin, getAdmin, db, auth };
