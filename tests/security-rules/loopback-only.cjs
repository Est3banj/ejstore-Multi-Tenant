// Transport guard, not a Firestore mock: real SDK/CLI sockets may only use loopback.
const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const options = normalized[0];
  const host = typeof options === 'object'
    ? (options.host ?? 'localhost')
    : (typeof normalized[1] === 'string' ? normalized[1] : 'localhost');
  if ((typeof options === 'object' && options.path) || typeof options === 'string'
      || !['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error('Security rules harness: non-loopback socket blocked');
  }
  return connect.apply(this, args);
};
