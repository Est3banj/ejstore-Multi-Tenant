const { db } = require('./config');
const { createStockAvailabilityHandler } = require('./services/stockAvailability');
const { createPurchaseCredentialsHandler } = require('./services/purchaseCredentials');

module.exports = {
  getStockAvailability: createStockAvailabilityHandler(db),
  getPurchaseCredentials: createPurchaseCredentialsHandler(db),
};
