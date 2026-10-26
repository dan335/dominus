// Regression tests for the server performance fixes (Oct 2026): job dedupe,
// the midnight relationship rebuild, the new indexes and the gameId lookups.
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  // test queues are created on first use and kept for the life of the process
  // (Bull allows one handler per queue)
  var testQueueBehavior = null;
  var perfFixFiberDone = false;

  function testQueue() {
    if (!Queues.perfFixTestQueue) {
      Queues.create('perfFixTestQueue');
      if (process.env.DOMINUS_WORKER == 'true') {
        // a plain handler (no fiber), so the promise it returns is what Bull sees
        Queues.perfFixTestQueue.process(function(job) {
          return testQueueBehavior ? testQueueBehavior(job) : Promise.resolve();
        });
      }
    }
    return Queues.perfFixTestQueue;
  }

  _perfFixTests = async function(run, t) {
    var assert = t.assert;
    var equal = t.equal;


    // --- Helpers ---

    function stub(obj, key, value) {
      var had = Object.prototype.hasOwnProperty.call(obj, key);
      var original = obj[key];
      obj[key] = value;
      return function() {
        if (had) {
          obj[key] = original;
        } else {
          delete obj[key];
        }
      };
    }

    function restoreAll(restores) {
      restores.reverse().forEach(function(restore) { restore(); });
    }

    async function waitFor(fn, ms) {
      var end = Date.now() + (ms || 10000);
      while (Date.now() < end) {
        if (await fn()) return true;
        await dTest.sleep(100);
      }
      return !!(await fn());
    }

    async function storedIds(jobName) {
      return (await Queues.getUniqueIds(jobName)).sort();
    }

    function fakeJob(jobName, uniqueId, isFailed) {
      return {
        data: {jobName: jobName, uniqueId: uniqueId},
        isFailed: function() { return isFailed(); }
      };
    }

    var isWorker = process.env.DOMINUS_WORKER == 'true';


    // --- #1 Job dedupe (Queues.removeUniqueId, Queues.onJobFailed) ---

    await run('removeUniqueId removes only the given id and keeps the others', async function() {
      testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      try {
        assert(await Queues.addUniqueId(name, 'a'), 'a added');
        assert(await Queues.addUniqueId(name, 'b'), 'b added');
        assert(await Queues.addUniqueId(name, 'c'), 'c added');

        await Queues.removeUniqueId(name, 'b');

        equal(JSON.stringify(await storedIds(name)), JSON.stringify(['a', 'c']), 'a and c are still stored');
      } finally {
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('addUniqueId keeps the ids already stored (they used to be dropped on every add)', async function() {
      testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      try {
        await Queues.addUniqueId(name, 'a');
        await Queues.addUniqueId(name, 'b');
        await Queues.addUniqueId(name, 'c');
        equal(JSON.stringify(await storedIds(name)), JSON.stringify(['a', 'b', 'c']), 'all three stored');
        equal(await Queues.addUniqueId(name, 'a'), false, 'a is still deduped after later adds');
      } finally {
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('removeUniqueId of an id that is not stored changes nothing', async function() {
      testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      try {
        await Queues.addUniqueId(name, 'a');
        await Queues.addUniqueId(name, 'b');

        await Queues.removeUniqueId(name, 'zzz');

        equal(JSON.stringify(await storedIds(name)), JSON.stringify(['a', 'b']), 'a and b are still stored');
      } finally {
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('addUniqueId refuses a stored id and accepts it again once removed', async function() {
      testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      try {
        assert(await Queues.addUniqueId(name, 'a'), 'first add');
        await Queues.addUniqueId(name, 'b');
        equal(await Queues.addUniqueId(name, 'a'), false, 'duplicate refused');

        await Queues.removeUniqueId(name, 'b');
        equal(await Queues.addUniqueId(name, 'a'), false, 'removing another id does not release a');

        await Queues.removeUniqueId(name, 'a');
        equal(await Queues.addUniqueId(name, 'a'), true, 'accepted after its own removal');
      } finally {
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('ids are scoped to their job type', async function() {
      testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      try {
        await Queues.addUniqueId(name, 'shared');
        equal((await Queues.getUniqueIds('runBattle')).indexOf('shared'), -1, 'not visible under another job');
        equal(Queues.getKeyString(name, 'shared'), 'dominus:unique:perfFixTestQueue:shared', 'key layout');
      } finally {
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('a stored id expires after 20 minutes', async function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      try {
        await Queues.addUniqueId(name, 'a');
        var ttl = await queue.client.pttl(Queues.getKeyString(name, 'a'));
        assert(ttl > 1000*60*19.5 && ttl <= 1000*60*20, 'ttl is 20 minutes, got ' + ttl);

        // an id whose key has expired can be added again
        await queue.client.set(Queues.getKeyString(name, 'b'), '1', 'PX', 50);
        await dTest.sleep(150);
        equal(await Queues.addUniqueId(name, 'b'), true, 'expired id accepted');
      } finally {
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('concurrent adds and removes never lose or bring back an id', async function() {
      testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      try {
        // keep0..keep29 are added; drop0..drop29 are added and removed, all interleaved
        var tasks = [];
        for (let i = 0; i < 30; i++) {
          tasks.push(await Queues.addUniqueId(name, 'keep' + i));
          tasks.push((async function() {
            await Queues.addUniqueId(name, 'drop' + i);
            await Queues.removeUniqueId(name, 'drop' + i);
          })());
        }
        await Promise.all(tasks);

        var ids = await storedIds(name);
        equal(ids.length, 30, 'exactly the 30 kept ids remain');
        assert(ids.every(function(id) { return id.indexOf('keep') === 0; }), 'no removed id came back');
      } finally {
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('addUniqueId lets the job through when Redis errors', async function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      var restores = [
        stub(queue.client, 'set', function() { _.last(arguments)(new Error('redis down')); }),
        stub(console, 'error', function() {})
      ];
      try {
        equal(await Queues.addUniqueId(name, 'a'), true, 'job is queued rather than lost');
      } finally {
        restoreAll(restores);
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('clearUniqueIdsForJob removes every id and the old list key', async function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      try {
        await Queues.addUniqueId(name, 'a');
        await Queues.addUniqueId(name, 'b');
        await queue.client.set(Queues.getKeyString(name), '["old$1"]');

        await Queues.clearUniqueIdsForJob(name);

        equal((await storedIds(name)).length, 0, 'ids removed');
        equal(await queue.client.exists(Queues.getKeyString(name)), 0, 'old list key removed');
      } finally {
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('onJobFailed keeps the id while Bull will retry the job', async function() {
      testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      try {
        await Queues.addUniqueId(name, 'a');
        await Queues.onJobFailed(fakeJob(name, 'a', function() { return Promise.resolve(false); }));
        equal(JSON.stringify(await storedIds(name)), JSON.stringify(['a']), 'id kept');
      } finally {
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('onJobFailed releases the id after the final failure, and only that id', async function() {
      testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      try {
        await Queues.addUniqueId(name, 'a');
        await Queues.addUniqueId(name, 'b');
        await Queues.onJobFailed(fakeJob(name, 'a', function() { return Promise.resolve(true); }));
        equal(JSON.stringify(await storedIds(name)), JSON.stringify(['b']), 'only a released');
      } finally {
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('onJobFailed releases the id when the job state cannot be read', async function() {
      testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      var restores = [stub(console, 'error', function() {})];
      try {
        await Queues.addUniqueId(name, 'a');
        await Queues.onJobFailed(fakeJob(name, 'a', function() { return Promise.reject(new Error('redis down')); }));
        equal((await storedIds(name)).length, 0, 'id released');
      } finally {
        restoreAll(restores);
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('onJobFailed ignores a job without a uniqueId', async function() {
      testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      try {
        await Queues.addUniqueId(name, 'a');
        var asked = false;
        await Queues.onJobFailed({data: {jobName: name}, isFailed: function() { asked = true; return Promise.resolve(true); }});
        equal(asked, false, 'state not read');
        equal(JSON.stringify(await storedIds(name)), JSON.stringify(['a']), 'other ids untouched');
      } finally {
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('a stalled job is failed, not run again, and nothing listens to stalled', function() {
      if (!isWorker) return 'skip';
      equal(testQueue().listeners('stalled').length, 0, 'no stalled listener');
      equal(Queues.runBattle.listeners('stalled').length, 0, 'none on a real queue either');
      equal(Queues.runBattle.settings.maxStalledCount, 0, 'a stalled job is failed (its failed event releases the id)');
    });

    await run('onJobFailed keeps the id of a job whose work is still running here, or that timed out', async function() {
      testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      var asked = false;
      var job = {id: 'running1', data: {jobName: name, uniqueId: 'a'}, isFailed: function() { asked = true; return Promise.resolve(true); }};
      var key = Queues.runningKey(name, 'running1');
      try {
        await Queues.addUniqueId(name, 'a');
        Queues.running[key] = {jobName: name};
        await Queues.onJobFailed(job, new Error('job stalled more than allowable limit'));
        delete Queues.running[key];
        equal(JSON.stringify(await storedIds(name)), JSON.stringify(['a']), 'kept while its work runs');

        var timeout = new Error('Promise timed out after 300 milliseconds');
        timeout.name = 'TimeoutError';
        await Queues.onJobFailed(job, timeout);
        equal(JSON.stringify(await storedIds(name)), JSON.stringify(['a']), 'kept after a timeout: the work is running somewhere here');
        equal(asked, false, 'without reading the job state');

        await Queues.onJobFailed(job, new Error('job stalled more than allowable limit'));
        equal((await storedIds(name)).length, 0, 'released for a job left behind by a worker that stopped');
      } finally {
        delete Queues.running[key];
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('Queues.addAsync never asks Bull for retries, and keeps the other options', async function() {
      var calls = [];
      var queue = testQueue();
      var restore = stub(queue, 'add', function(data, options) { calls.push(options); return Promise.resolve(); });
      try {
        await Queues.addAsync('perfFixTestQueue', {}, {attempts: 10, backoff: {type: 'fixed', delay: 15000}, delay: 3000, timeout: 60000}, false);
        await Queues.addAsync('perfFixTestQueue', {}, {delay: 0}, false);
      } finally {
        restore();
      }
      equal(JSON.stringify(calls[0]), JSON.stringify({delay: 3000, timeout: 60000, attempts: 1}), 'attempts 1, no backoff, delay and timeout kept');
      equal(JSON.stringify(calls[1]), JSON.stringify({delay: 0, attempts: 1}), 'attempts 1 when none was given');
    });

    await run('Queues.addAsyncOrLog logs a job Redis refuses, and releases its uniqueId', async function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      var logged = [];
      var restores = [
        stub(queue, 'add', function() { return Promise.reject(new Error('redis down')); }),
        stub(console, 'error', function() { logged.push(_.toArray(arguments).join(' ')); })
      ];
      try {
        equal(await Queues.addAsyncOrLog(name, {}, {delay: 0}, 'refused'), false, 'resolves with false');
        equal((await storedIds(name)).length, 0, 'id released');
        assert(logged.length === 1 && logged[0].indexOf('could not add job ' + name) === 0 && logged[0].indexOf('redis down') !== -1, 'logged: ' + logged.join(' | '));
      } finally {
        restoreAll(restores);
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('Queues.addAsync adds a job once Redis has it, and skips a duplicate', async function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      var calls = [];
      var restore = stub(queue, 'add', function(data, options) { calls.push({data: data, options: options}); return Promise.resolve(); });
      try {
        equal(await Queues.addAsync(name, {n: 1}, {attempts: 5, delay: 0}, 'async1'), true, 'added');
        equal(await Queues.addAsync(name, {n: 2}, {delay: 0}, 'async1'), false, 'duplicate skipped');
        equal(await Queues.addAsync(name, {n: 3}, {delay: 0}, false), true, 'a job without an id is added');
        equal(calls.length, 2, 'two jobs reached Bull');
        equal(JSON.stringify(calls[0].data), JSON.stringify({n: 1, uniqueId: 'async1', jobName: name}), 'with its id and name');
        equal(calls[0].options.attempts, 1, 'and no retries');
        equal(JSON.stringify(await storedIds(name)), JSON.stringify(['async1']), 'the id is stored');
      } finally {
        restore();
      }

      restore = stub(queue, 'add', function() { return Promise.reject(new Error('redis down')); });
      try {
        var e = await dTest.throws(function() { return Queues.addAsync(name, {}, {delay: 0}, 'async2'); });
        equal(e && e.message, 'redis down', 'a refused job rejects');
        equal(JSON.stringify(await storedIds(name)), JSON.stringify(['async1']), 'and its id is released');
      } finally {
        restore();
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('a queue error is logged, the same one at most once a minute', function() {
      var logged = [];
      var restore = stub(console, 'error', function() { logged.push(_.toArray(arguments).join(' ')); });
      var name = 'perfFixErrorTest' + Random.id(4);
      try {
        equal(Queues.onQueueError(name, new Error('connect ECONNREFUSED')), true, 'first one logged');
        equal(Queues.onQueueError(name, new Error('connect ECONNREFUSED')), false, 'the same again is not');
        equal(Queues.onQueueError(name, new Error('another')), true, 'a different one is');
        equal(logged.length, 2, 'two lines');
        assert(logged[0].indexOf('job queue ' + name + ' error:') === 0, 'naming the queue: ' + logged[0]);
        assert(testQueue().listeners('error').length >= 1, 'every queue has an error listener');
      } finally {
        restore();
        _.keys(Queues._lastErrors).forEach(function(k) { if (k.indexOf(name) === 0) delete Queues._lastErrors[k]; });
      }
    });

    await run('the Bull 2 sets of finished jobs are deleted, with their jobs; Bull 4 keys are kept', async function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      var client = queue.client;
      var completed = queue.toKey('completed');
      var failed = queue.toKey('failed');
      var saved = {};
      // keep what Bull 4 has there now, to put it back afterwards
      await dTest.eachAsync([completed, failed], async function(key) {
        saved[key] = await client.zrange(key, 0, -1, 'WITHSCORES');
      });
      try {
        await client.del(completed, failed);
        await client.sadd(completed, 'old1', 'old2');
        await client.hset(queue.toKey('old1'), 'data', '{}');
        await client.hset(queue.toKey('old2'), 'data', '{}');
        await client.zadd(failed, 1, 'new1');
        await client.hset(queue.toKey('new1'), 'data', '{}');

        var dropped = [];
        var restore = stub(console, 'log', function() {});
        try {
          dropped = await Queues.dropBull2Keys(name);
        } finally {
          restore();
        }
        equal(JSON.stringify(dropped), JSON.stringify(['completed']), 'only the Bull 2 set');
        equal(await client.exists(completed), 0, 'the set is gone');
        equal(await client.exists(queue.toKey('old1'), queue.toKey('old2')), 0, 'with its jobs');
        equal(await client.type(failed), 'zset', 'the Bull 4 sorted set is kept');
        equal(await client.exists(queue.toKey('new1')), 1, 'with its job');
        equal(JSON.stringify(await Queues.dropBull2Keys(name)), '[]', 'nothing to do the second time');
      } finally {
        await client.del(completed, failed, queue.toKey('old1'), queue.toKey('old2'), queue.toKey('new1'));
        await dTest.eachAsync([completed, failed], async function(key) {
          if (saved[key].length) await client.zadd.apply(client, [key].concat(_.flatten(_.zip(_.filter(saved[key], function(v, i) { return i % 2; }), _.filter(saved[key], function(v, i) { return !(i % 2); })))));
        });
      }
    });

    await run('real Bull job: a handler that rejects is logged and not retried, even when attempts are asked for', async function() {
      if (!isWorker) return 'skip';
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      var attempts = 0;
      testQueueBehavior = function(job) {
        attempts++;
        return Promise.reject(new Error('planted failure'));
      };
      var logged = [];
      var restore = stub(Meteor, '_debug', function() { logged.push(_.toArray(arguments).join(' ')); });
      var completed = null;
      var listener = function(job) { if (job.data.test == 'retry') completed = job; };
      queue.on('completed', listener);
      try {
        await Queues.addAsync(name, {test: 'retry'}, {attempts: 3, backoff: {type: 'fixed', delay: 200}, delay: 0}, 'retryJob');
        assert(await waitFor(function() { return completed; }, 10000), 'Bull counted the job done');
        assert(await waitFor(async function() { return (await storedIds(name)).length === 0; }, 5000), 'id released');
        await dTest.sleep(800);
        equal(attempts, 1, 'it ran once');
        assert(_.some(logged, function(line) { return line.indexOf('Exception in job perfFixTestQueue') === 0 && line.indexOf('planted failure') !== -1; }), 'the rejection was logged: ' + logged.join(' | '));
        equal(await Queues.addUniqueId(name, 'retryJob'), true, 'same id can be queued again');
      } finally {
        queue.removeListener('completed', listener);
        restore();
        testQueueBehavior = null;
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('real Bull job: Bull counts a job done only once its work is done', async function() {
      if (!isWorker) return 'skip';
      var queue = testQueue();
      var workDone = false;
      testQueueBehavior = function(job) {
        return new Promise(function(resolve) { setTimeout(function() { workDone = true; resolve(); }, 1500); });
      };
      var doneAtCompletion = null;
      var listener = function(job) { if (job.data.test == 'slow') doneAtCompletion = workDone; };
      queue.on('completed', listener);
      try {
        var start = Date.now();
        await Queues.addAsync('perfFixTestQueue', {test: 'slow'}, {delay: 0}, false);
        assert(await waitFor(function() { return doneAtCompletion !== null; }, 10000), 'job completed');
        equal(doneAtCompletion, true, 'its work had finished');
        assert(Date.now() - start >= 1500, 'not before 1.5 seconds');
      } finally {
        queue.removeListener('completed', listener);
        testQueueBehavior = null;
      }
    });

    await run('real Bull job: a job past its timeout fails, keeps its uniqueId until its work ends, and no duplicate runs', async function() {
      if (!isWorker) return 'skip';
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      await Queues.clearUniqueIdsForJob(name);
      var runs = 0;
      var workDone = false;
      testQueueBehavior = function(job) {
        runs++;
        return new Promise(function(resolve) { setTimeout(function() { workDone = true; resolve(); }, 1500); });
      };
      var failedWith = null;
      var listener = function(job, error) { if (job.data.test == 'timeout') failedWith = error; };
      queue.on('failed', listener);
      try {
        await Queues.addAsync(name, {test: 'timeout'}, {delay: 0, timeout: 300}, 'slowJob');
        assert(await waitFor(function() { return failedWith; }, 10000), 'Bull failed the job');
        equal(failedWith.name, 'TimeoutError', 'on its timeout');
        equal(workDone, false, 'while its work still ran');
        await dTest.sleep(200);
        equal(JSON.stringify(await storedIds(name)), JSON.stringify(['slowJob']), 'the id is still held');
        await Queues.addAsync(name, {test: 'timeout'}, {delay: 0, timeout: 300}, 'slowJob');
        assert(await waitFor(function() { return workDone; }, 5000), 'the work finished');
        assert(await waitFor(async function() { return (await storedIds(name)).length === 0; }, 5000), 'and then the id was released');
        await dTest.sleep(300);
        equal(runs, 1, 'the duplicate was never queued');
      } finally {
        queue.removeListener('failed', listener);
        testQueueBehavior = null;
        await Queues.clearUniqueIdsForJob(name);
      }
    });

    await run('real Bull job: a queue runs one job at a time unless its handler asks for more', async function() {
      if (!isWorker) return 'skip';
      testQueue();
      equal(Queues.perfFixTestQueue.concurrency, 1, 'concurrency 1 by default');
      equal(Queues.createPlayer.concurrency, 1, 'new players one at a time (two new countries at once overlap)');
      equal(Queues.moveArmiesJob.concurrency, 1, 'one army move tick at a time');
      equal(Queues.runBattle.concurrency, 5, 'a handler can ask for more');
      var running = 0;
      var most = 0;
      var finished = 0;
      testQueueBehavior = function(job) {
        running++;
        most = Math.max(most, running);
        return new Promise(function(resolve) {
          setTimeout(function() { running--; finished++; resolve(); }, 300);
        });
      };
      try {
        for (var i = 0; i < 3; i++) {
          await Queues.addAsync('perfFixTestQueue', {test: 'serial' + i}, {delay: 0}, false);
        }
        assert(await waitFor(function() { return finished >= 3; }, 10000), 'all three ran');
        equal(most, 1, 'never two at once');
      } finally {
        testQueueBehavior = null;
      }
    });

    await run('createPlayer jobs added at the same moment run one after another', async function() {
      if (!isWorker) return 'skip';
      // Two players' new countries made at once claim the same hexes, so the
      // jobs that make players must not overlap. Before Bull 4 they did.
      var running = 0;
      var most = 0;
      var ran = 0;
      var restore = stub(dCastles, 'createPlayer', async function() {
        running++;
        most = Math.max(most, running);
        await dTest.sleep(300);
        running--;
        ran++;
        return false;
      });
      try {
        for (var i = 0; i < 3; i++) {
          await Queues.addAsync('createPlayer', {gameId: 'perfFixNoGame', userId: 'perfFixUser' + i, username: 'perfFix' + i, makePro: false}, {delay: 0, timeout: 1000*60}, false);
        }
        assert(await waitFor(function() { return ran >= 3; }, 10000), 'all three ran');
        equal(most, 1, 'never two at once');
      } finally {
        restore();
      }
    });

    await run('stopping the worker waits for running work, then the queues can resume', async function() {
      if (!isWorker) return 'skip';
      var queue = testQueue();
      var workDone = false;
      var started = false;
      testQueueBehavior = function(job) {
        started = true;
        return new Promise(function(resolve) { setTimeout(function() { workDone = true; resolve(); }, 1200); });
      };
      var restore = stub(console, 'log', function() {});
      try {
        await Queues.addAsync('perfFixTestQueue', {test: 'shutdown'}, {delay: 0}, false);
        assert(await waitFor(function() { return started; }, 10000), 'job started');
        var idle = await Queues.stopWorker(5000);
        equal(idle, true, 'stopWorker reports all work done');
        equal(workDone, true, 'only after the job\'s work finished');
        assert(Queues.perfFixTestQueue.paused, 'the queue is paused on this worker');

        // with the work outliving the grace period, it gives up and says so
        workDone = false;
        await dTest.eachAsync(Queues.queueNames, async function(name) { await Queues[name].resume(true); });
        var key = Queues.runningKey('perfFixTestQueue', 'stuck');
        Queues.running[key] = {jobName: 'perfFixTestQueue'};
        var start = Date.now();
        idle = await Queues.stopWorker(500);
        delete Queues.running[key];
        equal(idle, false, 'work still running after the grace period');
        assert(Date.now() - start < 3000, 'and it did not wait much longer (' + (Date.now() - start) + 'ms)');
      } finally {
        await dTest.eachAsync(Queues.queueNames, async function(name) { await Queues[name].resume(true); });
        restore();
        testQueueBehavior = null;
      }
      // taking jobs again
      var ranAfter = false;
      testQueueBehavior = function() { ranAfter = true; return Promise.resolve(); };
      try {
        await Queues.addAsync('perfFixTestQueue', {test: 'after'}, {delay: 0}, false);
        assert(await waitFor(function() { return ranAfter; }, 10000), 'a job runs after resuming');
      } finally {
        testQueueBehavior = null;
      }
    });



    // --- #2 Midnight rebuild can't freeze the game (Queues.pauseAll/resumeAll,
    //        Queues.resumeIfStuck, dInit.updateAllKingsAlliesJob) ---

    async function pausedQueues() {
      return await dTest.filterAsync(Queues.queueNames, async function(jobName) {
        var queue = Queues[jobName];
        return await queue.client.exists(queue.toKey('meta-paused')) === 1;
      });
    }

    async function settingsDoc() {
      return await Settings.findOneAsync({}) || {};
    }

    // every test in this section must leave the server running
    async function ensureResumed() {
      try {
        await Queues.resumeAllAsync();
      } catch (e) {
        console.error('perfFixTests could not resume the queues', e);
      }
    }

    await run('pauseAll pauses every queue and records when; resumeAll undoes both', async function() {
      testQueue();
      // guard against a vacuous pass: the real queues must be in the list
      assert(Queues.queueNames.indexOf('runBattle') !== -1, 'queueNames lists runBattle');
      assert(Queues.queueNames.indexOf('updateAllKingsAllies') !== -1, 'queueNames lists updateAllKingsAllies');
      try {
        await Queues.pauseAllAsync(false);
        equal((await pausedQueues()).length, Queues.queueNames.length, 'every queue paused');
        var settings = await settingsDoc();
        equal(settings.isPaused, true, 'isPaused');
        equal(settings.manualPause, false, 'server pause is not manual');
        assert(settings.pausedAt && Date.now() - settings.pausedAt.getTime() < 60000, 'pausedAt is now');

        await Queues.resumeAllAsync();
        equal((await pausedQueues()).length, 0, 'no queue paused');
        settings = await settingsDoc();
        equal(settings.isPaused, false, 'isPaused cleared');
        equal(settings.pausedAt, undefined, 'pausedAt cleared');
        equal(settings.manualPause, undefined, 'manualPause cleared');
      } finally {
        await ensureResumed();
      }
    });

    await run('pauseJobQueue from the admin panel is a manual pause, from server code it is not', async function() {
      var admin = await t.createTestUser({admin: true});
      var player = await t.createTestUser();
      async function callAs(userId, method) {
        var inv = {userId: userId, connection: {id: 'perfFixTests'}, isSimulation: false, unblock: function() {}, setUserId: function() {}};
        return DDP._CurrentInvocation.withValue(inv, async function() {
          return await Meteor.server.method_handlers[method].apply(inv, []);
        });
      }
      try {
        await Meteor.callAsync('pauseJobQueue');
        equal((await settingsDoc()).manualPause, false, 'server call is not manual');
        await Meteor.callAsync('resumeJobQueue');

        await callAs(admin._id, 'pauseJobQueue');
        equal((await settingsDoc()).manualPause, true, 'admin panel call is manual');
        await callAs(admin._id, 'resumeJobQueue');
        equal((await settingsDoc()).isPaused, false, 'admin resume works');

        var refused = false;
        try {
          await callAs(player._id, 'pauseJobQueue');
        } catch (e) {
          refused = e.error == 'not-authorized';
        }
        assert(refused, 'a non-admin player is still refused');
        equal((await pausedQueues()).length, 0, 'refused call paused nothing');
      } finally {
        await ensureResumed();
        await t.cleanupUser(admin._id);
        await t.cleanupUser(player._id);
      }
    });

    await run('pauseAll that fails on one queue resumes everything and throws', async function() {
      var queue = testQueue();
      var restores = [
        stub(queue, 'pause', function() { return Promise.reject(new Error('redis down')); }),
        stub(console, 'error', function() {})
      ];
      var threw = null;
      try {
        try {
          await Queues.pauseAllAsync(false);
        } catch (e) {
          threw = e;
        }
        restoreAll(restores);
        restores = [];
        assert(threw && threw.error === 'pause-failed', 'threw pause-failed, got ' + (threw && (threw.error || threw.message)));
        assert(threw.reason.indexOf('perfFixTestQueue') !== -1, 'names the failing queue');
        equal((await pausedQueues()).length, 0, 'nothing left paused');
        equal((await settingsDoc()).isPaused, false, 'isPaused cleared');
      } finally {
        restoreAll(restores);
        await ensureResumed();
      }
    });

    await run('resumeAll that fails on one queue still resumes the others, keeps isPaused and throws', async function() {
      var queue = testQueue();
      var restores = [];
      var threw = null;
      try {
        await Queues.pauseAllAsync(false);
        restores.push(stub(queue, 'resume', function() { return Promise.reject(new Error('redis down')); }));
        restores.push(stub(console, 'error', function() {}));
        try {
          await Queues.resumeAllAsync();
        } catch (e) {
          threw = e;
        }
        assert(threw && threw.error === 'resume-failed', 'threw resume-failed, got ' + (threw && (threw.error || threw.message)));
        sameList(await pausedQueues(), ['perfFixTestQueue'], 'only the failing queue is still paused');
        equal((await settingsDoc()).isPaused, true, 'isPaused kept so the safety net retries');

        restoreAll(restores);
        restores = [];
        await Queues.resumeAllAsync();
        equal((await pausedQueues()).length, 0, 'second resume clears it');
      } finally {
        restoreAll(restores);
        await ensureResumed();
      }
    });

    function sameList(actual, expected, message) {
      equal(JSON.stringify(actual.slice().sort()), JSON.stringify(expected.slice().sort()), message);
    }

    await run('resumeIfStuck leaves a running queue and a recent server pause alone', async function() {
      var restores = [stub(console, 'error', function() {})];
      try {
        await Settings.upsertAsync({}, {$set: {isPaused: false}, $unset: {pausedAt: '', manualPause: ''}});
        equal(await Queues.resumeIfStuck(), false, 'not paused');

        await Queues.pauseAllAsync(false);
        var later = new Date(Date.now() + Queues.stuckPauseMaxMs - 60000);
        equal(await Queues.resumeIfStuck(later), false, 'paused for less than the limit');
        equal((await pausedQueues()).length, Queues.queueNames.length, 'still paused');
      } finally {
        restoreAll(restores);
        await ensureResumed();
      }
    });

    await run('resumeIfStuck resumes a server pause older than the limit', async function() {
      var restores = [stub(console, 'error', function() {})];
      try {
        await Queues.pauseAllAsync(false);
        var later = new Date(Date.now() + Queues.stuckPauseMaxMs + 60000);
        equal(await Queues.resumeIfStuck(later), true, 'resumed');
        equal((await pausedQueues()).length, 0, 'no queue paused');
        equal((await settingsDoc()).isPaused, false, 'isPaused cleared');
      } finally {
        restoreAll(restores);
        await ensureResumed();
      }
    });

    await run('resumeIfStuck never resumes a pause made from the admin panel', async function() {
      var restores = [stub(console, 'error', function() {})];
      try {
        await Queues.pauseAllAsync(true);
        var muchLater = new Date(Date.now() + 1000*60*60*24);
        equal(await Queues.resumeIfStuck(muchLater), false, 'left alone');
        equal((await pausedQueues()).length, Queues.queueNames.length, 'still paused');
      } finally {
        restoreAll(restores);
        await ensureResumed();
      }
    });

    await run('resumeIfStuck resumes a pause with no pausedAt (left by the old code)', async function() {
      var restores = [stub(console, 'error', function() {})];
      try {
        await Settings.upsertAsync({}, {$set: {isPaused: true}, $unset: {pausedAt: '', manualPause: ''}});
        equal(await Queues.resumeIfStuck(), true, 'resumed');
        equal((await settingsDoc()).isPaused, false, 'isPaused cleared');
      } finally {
        restoreAll(restores);
        await ensureResumed();
      }
    });

    // stubs for dInit.updateAllKingsAlliesJob; records what ran and whether the
    // queues were paused at that moment
    function stubRebuild(failFor) {
      var log = {rebuilt: [], dominus: [], chatrooms: [], pausedDuringRebuild: [], pauses: 0, resumes: 0};
      var realPause = Queues.pauseAllAsync;
      var realResume = Queues.resumeAllAsync;
      var restores = [
        stub(dInit, 'updateAllKingsAlliesWaitMs', 0),
        stub(Queues, 'pauseAllAsync', function(isManual) { log.pauses++; return realPause(isManual); }),
        stub(Queues, 'resumeAllAsync', function() { log.resumes++; return realResume(); }),
        stub(dInit, 'rebuildRelationships', async function(gameId) {
          log.pausedDuringRebuild.push((await settingsDoc()).isPaused === true);
          if (failFor && failFor.indexOf(gameId) !== -1) {
            throw new Error('rebuild failed for ' + gameId);
          }
          log.rebuilt.push(gameId);
        }),
        stub(dManager, 'checkForDominus', function(gameId) { log.dominus.push(gameId); }),
        stub(Queues, 'addAsync', async function(jobName, data) {
          if (jobName == 'cleanupAllKingChatrooms') log.chatrooms.push(data.gameId);
        }),
        stub(console, 'error', function() {})
      ];
      log.restore = function() { restoreAll(restores); };
      return log;
    }

    await run('updateAllKingsAlliesJob pauses once for every running game and resumes', async function() {
      var games = await dTest.mapAsync([0, 1, 2], async function() { return await t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()}); });
      var ids = games.map(function(g) { return g._id; });
      var log = stubRebuild();
      try {
        await dInit.updateAllKingsAlliesJob();
        log.restore();

        ids.forEach(function(id) {
          assert(log.rebuilt.indexOf(id) !== -1, 'rebuilt ' + id);
          assert(log.dominus.indexOf(id) !== -1, 'checkForDominus ' + id);
          assert(log.chatrooms.indexOf(id) !== -1, 'chatroom cleanup queued ' + id);
        });
        equal(log.pauses, 1, 'paused once');
        equal(log.resumes, 1, 'resumed once');
        assert(log.pausedDuringRebuild.every(function(p) { return p; }), 'every rebuild ran while paused');
        equal((await pausedQueues()).length, 0, 'nothing left paused');
      } finally {
        log.restore();
        await ensureResumed();
        await dTest.eachAsync(ids, async function(id) { await t.cleanup(id); });
      }
    });

    await run('updateAllKingsAlliesJob skips ended and unstarted games', async function() {
      var running = await t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var ended = await t.createTestGame({hasStarted: true, hasEnded: true, startedAt: new Date()});
      var notStarted = await t.createTestGame({hasStarted: false, hasEnded: false});
      var log = stubRebuild();
      try {
        await dInit.updateAllKingsAlliesJob();
        log.restore();
        assert(log.rebuilt.indexOf(running._id) !== -1, 'running game rebuilt');
        equal(log.rebuilt.indexOf(ended._id), -1, 'ended game skipped');
        equal(log.rebuilt.indexOf(notStarted._id), -1, 'unstarted game skipped');
      } finally {
        log.restore();
        await ensureResumed();
        await dTest.eachAsync([running, ended, notStarted], async function(g) { await t.cleanup(g._id); });
      }
    });

    await run('updateAllKingsAlliesJob with a gameId rebuilds only that game', async function() {
      var a = await t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var b = await t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var log = stubRebuild();
      try {
        await dInit.updateAllKingsAlliesJob(a._id);
        log.restore();
        sameList(log.rebuilt, [a._id], 'only game a');
        equal(log.pauses, 1, 'paused once');
        equal(log.resumes, 1, 'resumed once');
      } finally {
        log.restore();
        await ensureResumed();
        await t.cleanup(a._id);
        await t.cleanup(b._id);
      }
    });

    await run('updateAllKingsAlliesJob: one game failing does not stop the others or leave the queues paused', async function() {
      var games = await dTest.mapAsync([0, 1, 2], async function() { return await t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()}); });
      var ids = games.map(function(g) { return g._id; });
      var log = stubRebuild([ids[1]]);
      try {
        await dInit.updateAllKingsAlliesJob();
        log.restore();
        assert(log.rebuilt.indexOf(ids[0]) !== -1, 'game before the failure rebuilt');
        assert(log.rebuilt.indexOf(ids[2]) !== -1, 'game after the failure rebuilt');
        equal(log.dominus.indexOf(ids[1]), -1, 'failed game skips checkForDominus');
        equal(log.resumes, 1, 'resumed');
        equal((await pausedQueues()).length, 0, 'nothing left paused');
        equal((await settingsDoc()).isPaused, false, 'isPaused cleared');
      } finally {
        log.restore();
        await ensureResumed();
        await dTest.eachAsync(ids, async function(id) { await t.cleanup(id); });
      }
    });

    await run('updateAllKingsAlliesJob resumes the queues even when the job itself throws', async function() {
      var game = await t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var log = stubRebuild();
      var restoreSleep = stub(dInit, 'waitForRunningJobs', function() { return Promise.reject(new Error('boom')); });
      var threw = false;
      try {
        try {
          await dInit.updateAllKingsAlliesJob(game._id);
        } catch (e) {
          threw = true;
        }
        restoreSleep();
        log.restore();
        assert(threw, 'the error still reaches Bull');
        equal(log.resumes, 1, 'resumed');
        equal((await pausedQueues()).length, 0, 'nothing left paused');
      } finally {
        restoreSleep();
        log.restore();
        await ensureResumed();
        await t.cleanup(game._id);
      }
    });

    await run('the midnight cron queues one updateAllKingsAllies job for all games', async function() {
      if (!isWorker || !SyncedCron._entries || !SyncedCron._entries['midnight job']) return 'skip';
      var game = await t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var calls = [];
      var restore = stub(Queues, 'addAsync', async function(jobName, data, options, uniqueId) {
        calls.push({jobName: jobName, data: data, options: options, uniqueId: uniqueId});
      });
      try {
        await SyncedCron._entries['midnight job'].job();
        restore();
        var rebuilds = calls.filter(function(c) { return c.jobName == 'updateAllKingsAllies'; });
        equal(rebuilds.length, 1, 'one job');
        equal(rebuilds[0].data.gameId, undefined, 'no gameId, so it covers every game');
        equal(rebuilds[0].uniqueId, 'allGames', 'deduped');
        equal(rebuilds[0].options.attempts, undefined, 'no retries');
        assert(calls.some(function(c) { return c.jobName == 'dailystatsNumVassalsEveryone' && c.data.gameId == game._id; }), 'per-game dailystats job still queued');
      } finally {
        restore();
        await t.cleanup(game._id);
      }
    });

    await run('Bull counts a fiber-wrapped job as done only once its work finishes', async function() {
      // Before Bull 4 this was the other way round, which is why shutdown used
      // to wait a fixed time instead of waiting for the work.
      if (!isWorker) return 'skip';
      if (!Queues.perfFixFiberQueue) {
        Queues.create('perfFixFiberQueue');
        Queues.perfFixFiberQueue.process(Meteor.bindEnvironment(async function(job) {
          await dTest.sleep(1500);
          perfFixFiberDone = true;
          return Promise.resolve();
        }));
      }
      perfFixFiberDone = false;
      var doneAtCompletion = null;
      var listener = function() { doneAtCompletion = perfFixFiberDone; };
      Queues.perfFixFiberQueue.once('completed', listener);
      await Queues.perfFixFiberQueue.add({});
      assert(await waitFor(function() { return doneAtCompletion !== null; }, 10000), 'job completed');
      equal(doneAtCompletion, true, 'its work had finished when Bull reported completion');
    });


    // --- #3 Indexes (packages/dominus-collections/indexes.js) ---

    async function indexNames(collection) {
      return (await collection.rawCollection().indexes()).map(function(index) { return index.name; });
    }

    // stage names and index names of the winning plan
    async function plan(collection, selector, options) {
      var cursor = collection.rawCollection().find(selector, options || {});
      var explain = await cursor.explain();
      var winning = explain.queryPlanner.winningPlan;
      winning = winning.queryPlan || winning;  // MongoDB 7+ (SBE) nests it
      var stages = [];
      var indexes = [];
      (function walk(node) {
        if (!node) return;
        stages.push(node.stage);
        if (node.indexName) indexes.push(node.indexName);
        walk(node.inputStage);
        (node.inputStages || []).forEach(walk);
      })(winning);
      return {stages: stages, indexes: indexes};
    }

    await run('index: the four new indexes exist', async function() {
      assert(await (await indexNames(Players)).indexOf('userId_1') !== -1, 'Players userId_1');
      assert(await (await indexNames(Alerts)).indexOf('playerIds.playerId_1_created_at_-1') !== -1, 'Alerts playerId + created_at');
      assert(await (await indexNames(Alerts)).indexOf('playerIds.playerId_1_playerIds.read_1') !== -1, 'Alerts playerId + read');
      assert(await (await indexNames(Markers)).indexOf('unitId_1_unitType_1') !== -1, 'Markers unitId + unitType');
    });

    await run('index: player lookups by userId use userId_1; by game and user still use gameId_1_userId_1', async function() {
      var game = await t.createTestGame();
      var userId = 'u_' + Random.id(5);
      try {
        await Players.insertAsync({gameId: game._id, userId: userId, gameIsClosed: false, gameIsOver: false});
        var topNav = await plan(Players, {userId: userId, gameIsClosed: false}, {projection: {gameId: 1, gameName: 1}});
        assert(topNav.indexes.indexOf('userId_1') !== -1, 'top nav uses userId_1: ' + topNav.stages.join('>'));
        var profile = await plan(Players, {userId: userId, gameIsOver: true});
        assert(profile.indexes.indexOf('userId_1') !== -1, 'profile uses userId_1: ' + profile.stages.join('>'));
        var settings = await plan(Players, {userId: userId});
        assert(settings.indexes.indexOf('userId_1') !== -1, 'settings uses userId_1');
        var inGame = await plan(Players, {gameId: game._id, userId: userId});
        assert(inGame.indexes.indexOf('gameId_1_userId_1') !== -1, 'in-game lookup keeps gameId_1_userId_1: ' + inGame.indexes.join(','));
      } finally {
        await t.cleanup(game._id);
      }
    });

    await run('index: myAlerts uses the new alerts index with no in-memory sort', async function() {
      var game = await t.createTestGame();
      var pid = 'p_' + Random.id(5);
      try {
        for (var i = 0; i < 5; i++) {
          await Alerts.insertAsync({gameId: game._id, created_at: new Date(Date.now() - i * 1000), type: 't' + i, vars: {},
            playerIds: [{playerId: pid, read: i % 2 == 0}, {playerId: 'other', read: false}]});
        }
        var p = await plan(Alerts, {playerIds: {$elemMatch: {playerId: pid}}, type: {$nin: ['t1']}}, {sort: {created_at: -1}, limit: 150});
        assert(p.indexes.indexOf('playerIds.playerId_1_created_at_-1') !== -1, 'uses playerId + created_at: ' + p.indexes.join(','));
        equal(p.stages.indexOf('SORT'), -1, 'no SORT stage');

        var docs = await Alerts.find({playerIds: {$elemMatch: {playerId: pid}}, type: {$nin: ['t1']}}, {sort: {created_at: -1}, limit: 150}).fetchAsync();
        equal(docs.length, 4, 'four alerts, t1 hidden');
        assert(docs.every(function(d, i) { return i == 0 || docs[i - 1].created_at >= d.created_at; }), 'newest first');
      } finally {
        await Alerts.removeAsync({gameId: game._id});
        await t.cleanup(game._id);
      }
    });

    await run('index: unreadAlerts and the mark-read updates use an index', async function() {
      var game = await t.createTestGame();
      var pid = 'p_' + Random.id(5);
      try {
        await Alerts.insertAsync({gameId: game._id, created_at: new Date(), type: 't', vars: {}, playerIds: [{playerId: pid, read: false}]});
        var unread = await plan(Alerts, {playerIds: {$elemMatch: {playerId: pid, read: false}}, type: {$nin: []}}, {projection: {_id: 1}});
        equal(unread.stages.indexOf('COLLSCAN'), -1, 'unreadAlerts: no COLLSCAN');
        var markAll = await plan(Alerts, {'playerIds.playerId': pid});
        equal(markAll.stages.indexOf('COLLSCAN'), -1, 'markAllAlertsAsRead: no COLLSCAN');
      } finally {
        await Alerts.removeAsync({gameId: game._id});
        await t.cleanup(game._id);
      }
    });

    await run('index: army marker updates and removals use unitId_1_unitType_1', async function() {
      var game = await t.createTestGame();
      try {
        await Markers.insertAsync({gameId: game._id, unitType: 'army', unitId: 'army_' + Random.id(5), user_id: 'u', playerId: 'p'});
        var p = await plan(Markers, {unitType: 'army', unitId: 'someArmy'});
        assert(p.indexes.indexOf('unitId_1_unitType_1') !== -1, 'uses unitId_1_unitType_1: ' + p.stages.join('>'));
        var withUser = await plan(Markers, {unitType: 'army', unitId: 'someArmy', user_id: 'u'});
        equal(withUser.stages.indexOf('COLLSCAN'), -1, 'addMarker check: no COLLSCAN');
        var publish = await plan(Markers, {playerId: 'p', user_id: 'u'});
        assert(publish.indexes.indexOf('playerId_1_user_id_1') !== -1, 'markers publication keeps playerId_1_user_id_1');
      } finally {
        await Markers.removeAsync({gameId: game._id});
        await t.cleanup(game._id);
      }
    });


    // --- #4 Lookups by coordinates are scoped to the game (coords_to_id,
    //        dInit.attackCreatesLoop) ---

    async function callMethod(userId, method, args) {
      var inv = {userId: userId, connection: {id: 'perfFixTests'}, isSimulation: false, unblock: function() {}, setUserId: function() {}};
      return DDP._CurrentInvocation.withValue(inv, async function() {
        return await Meteor.server.method_handlers[method].apply(inv, args);
      });
    }

    async function cleanupMap(gameId) {
      await Hexes.removeAsync({gameId: gameId});
      await Castles.removeAsync({gameId: gameId});
      await Armies.removeAsync({gameId: gameId});
      await t.cleanup(gameId);
    }

    await run('gameId: coords_to_id only finds hexes in the game it is asked about', async function() {
      var a = await t.createTestGame();
      var b = await t.createTestGame();
      var user = await t.createTestUser();
      try {
        var aHex = await Hexes.insertAsync({gameId: a._id, x: 1, y: 1});
        var bHex = await Hexes.insertAsync({gameId: b._id, x: 3, y: -5});
        var aShared = await Hexes.insertAsync({gameId: a._id, x: 7, y: 7});
        var bShared = await Hexes.insertAsync({gameId: b._id, x: 7, y: 7});

        equal(await callMethod(user._id, 'coords_to_id', [a._id, 1, 1, 'hex']), aHex, 'own hex found');
        equal(await callMethod(user._id, 'coords_to_id', [a._id, 3, -5, 'hex']), false, 'hex that only exists in another game is not found');
        equal(await callMethod(user._id, 'coords_to_id', [b._id, 3, -5, 'hex']), bHex, 'found in its own game');
        equal(await callMethod(user._id, 'coords_to_id', [a._id, 7, 7, 'hex']), aShared, 'shared coordinates: game a gets its own hex');
        equal(await callMethod(user._id, 'coords_to_id', [b._id, 7, 7, 'hex']), bShared, 'shared coordinates: game b gets its own hex');
      } finally {
        await cleanupMap(a._id);
        await cleanupMap(b._id);
        await t.cleanupUser(user._id);
      }
    });

    await run('gameId: coords_to_id refuses the old call without a gameId; doesHexExist is gone', async function() {
      var user = await t.createTestUser();
      try {
        var refused = false;
        try {
          await callMethod(user._id, 'coords_to_id', [3, -5, 'hex']);
        } catch (e) {
          refused = true;
        }
        assert(refused, 'old signature is refused');
        equal(Meteor.server.method_handlers['doesHexExist'], undefined, 'doesHexExist removed');
      } finally {
        await t.cleanupUser(user._id);
      }
    });

    // a lord/vassal capture loop: castle owner A has an army on B's castle and
    // B has an army on A's castle
    async function makeLoop(gameId, ax, ay, bx, by) {
      var a = 'pa_' + Random.id(5);
      var b = 'pb_' + Random.id(5);
      await Castles.insertAsync({gameId: gameId, playerId: a, x: ax, y: ay});
      await Castles.insertAsync({gameId: gameId, playerId: b, x: bx, y: by});
      await Armies.insertAsync({gameId: gameId, playerId: b, x: ax, y: ay, speed: 1});
      await Armies.insertAsync({gameId: gameId, playerId: a, x: bx, y: by, speed: 1});
      return {a: a, b: b};
    }

    await run('gameId: attackCreatesLoop still finds a loop inside one game', async function() {
      var game = await t.createTestGame();
      try {
        await makeLoop(game._id, 5, 5, 9, 9);
        equal(await dInit.attackCreatesLoop(game._id, 5, 5), true, 'loop at the first castle');
        equal(await dInit.attackCreatesLoop(game._id, 9, 9), true, 'loop at the second castle');
      } finally {
        await cleanupMap(game._id);
      }
    });

    await run('gameId: attackCreatesLoop is false when there is no loop', async function() {
      var game = await t.createTestGame();
      try {
        var a = 'pa_' + Random.id(5);
        var b = 'pb_' + Random.id(5);
        await Castles.insertAsync({gameId: game._id, playerId: a, x: 5, y: 5});
        await Castles.insertAsync({gameId: game._id, playerId: b, x: 9, y: 9});
        await Armies.insertAsync({gameId: game._id, playerId: b, x: 5, y: 5, speed: 1});
        equal(await dInit.attackCreatesLoop(game._id, 5, 5), false, 'one-sided attack is not a loop');
        equal(await dInit.attackCreatesLoop(game._id, 1, 1), false, 'no castle there');
      } finally {
        await cleanupMap(game._id);
      }
    });

    await run('gameId: a loop in another game at the same coordinates does not block this game', async function() {
      var looped = await t.createTestGame();
      var other = await t.createTestGame();
      try {
        await makeLoop(looped._id, 5, 5, 9, 9);
        // other game: a plain attack on a castle at the same coordinates
        var a = 'pa_' + Random.id(5);
        var b = 'pb_' + Random.id(5);
        await Castles.insertAsync({gameId: other._id, playerId: a, x: 5, y: 5});
        await Castles.insertAsync({gameId: other._id, playerId: b, x: 9, y: 9});
        await Armies.insertAsync({gameId: other._id, playerId: b, x: 5, y: 5, speed: 1});

        equal(await dInit.attackCreatesLoop(other._id, 5, 5), false, 'the other game can attack');
        equal(await dInit.attackCreatesLoop(looped._id, 5, 5), true, 'the looped game still sees its loop');
      } finally {
        await cleanupMap(looped._id);
        await cleanupMap(other._id);
      }
    });

    await run('gameId: armies in another game do not create a loop in this one', async function() {
      var game = await t.createTestGame();
      var other = await t.createTestGame();
      try {
        var a = 'pa_' + Random.id(5);
        await Castles.insertAsync({gameId: game._id, playerId: a, x: 5, y: 5});
        // the other game has a full loop through the same coordinates
        await makeLoop(other._id, 5, 5, 9, 9);
        equal(await dInit.attackCreatesLoop(game._id, 5, 5), false, 'no army of this game is here');
      } finally {
        await cleanupMap(game._id);
        await cleanupMap(other._id);
      }
    });

  };
}
