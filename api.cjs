// Vercel serverless entry (legacy `builds` in vercel.json).
// Lives at repo ROOT on purpose: the @vercel/node builder installs the
// NEAREST package.json to the builds entry. Root entry => root package.json
// install => functions/*.js and api/*.js both resolve runtime deps from the
// lambda-root node_modules (nft resolution). See design D4 deviation (B8 Gate A).
module.exports = require('./api/index.js');
