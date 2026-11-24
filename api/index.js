const { createApp } = require('./src/app');
const { getAdmin } = require('./src/firebaseAdmin');

getAdmin();

module.exports = createApp();
