// Test-only interleaving: both real transactions read the target, then the
// second reader continues when the first commit is dispatched. No fake errors,
// sleeps, retries, serialization or SDK retry/timeout changes.
const assert = require('node:assert/strict');
module.exports = function transactionSchedule(db) {
  const request = db.request;
  assert.equal(typeof request, 'function', 'Pinned Firestore SDK commit boundary changed');
  let schedule = null;
  db.request = function (...args) {
    const current = schedule;
    const result = request.apply(this, args);
    if (args[0] === 'commit' && current) setImmediate(() => current.onCommit(args[1]));
    return result;
  };
  return {
    wrap(callback) {
      const operation = {};
      let attempt = 0;
      return async transaction => {
        const current = schedule;
        if (!current) return callback(transaction);
        const get = transaction.get;
        const number = ++attempt;
        transaction.get = async function (...args) {
          const result = await get.apply(this, args);
          await current.afterRead(args[0], operation, number);
          return result;
        };
        try { return await callback(transaction); }
        finally { transaction.get = get; }
      };
    },
    contendOnRead(path) {
      assert.equal(schedule, null, 'Nested transaction schedules are unsupported');
      let first, releaseFirst, releaseSecond;
      const secondRead = new Promise(resolve => { releaseFirst = resolve; });
      const committing = new Promise(resolve => { releaseSecond = resolve; });
      schedule = {
        async afterRead(ref, operation, attempt) {
          if (ref.path !== path || attempt !== 1) return;
          if (!first) { first = operation; await secondRead; }
          else if (operation !== first) { releaseFirst(); await committing; }
        },
        onCommit(rpc) {
          if (rpc.writes.some(write => write.update?.name.endsWith('/' + path))) releaseSecond();
        },
      };
      return () => { schedule = null; releaseFirst(); releaseSecond(); };
    },
  };
};
