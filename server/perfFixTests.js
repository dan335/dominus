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

  _perfFixTests = function(run, t) {
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

    function waitFor(fn, ms) {
      var end = Date.now() + (ms || 10000);
      while (Date.now() < end) {
        if (fn()) return true;
        Meteor._sleepForMs(100);
      }
      return !!fn();
    }

    // run a Bull/ioredis promise inside the fiber
    function awaitPromise(promise) {
      var Future = Npm.require('fibers/future');
      var future = new Future();
      promise.then(function(result) {
        future.return({result: result});
      }).catch(function(error) {
        future.return({error: error});
      });
      var out = future.wait();
      if (out.error) throw out.error;
      return out.result;
    }

    function storedIds(jobName) {
      return dTest.settle(Queues.getUniqueIds(jobName)).sort();
    }

    function fakeJob(jobName, uniqueId, isFailed) {
      return {
        data: {jobName: jobName, uniqueId: uniqueId},
        isFailed: function() { return isFailed(); }
      };
    }

    var isWorker = process.env.DOMINUS_WORKER == 'true';


    // --- #1 Job dedupe (Queues.removeUniqueId, Queues.onJobFailed) ---

    run('removeUniqueId removes only the given id and keeps the others', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
      try {
        assert(dTest.settle(Queues.addUniqueId(name, 'a')), 'a added');
        assert(dTest.settle(Queues.addUniqueId(name, 'b')), 'b added');
        assert(dTest.settle(Queues.addUniqueId(name, 'c')), 'c added');

        dTest.settle(Queues.removeUniqueId(name, 'b'));

        equal(JSON.stringify(storedIds(name)), JSON.stringify(['a', 'c']), 'a and c are still stored');
      } finally {
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('addUniqueId keeps the ids already stored (they used to be dropped on every add)', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
      try {
        dTest.settle(Queues.addUniqueId(name, 'a'));
        dTest.settle(Queues.addUniqueId(name, 'b'));
        dTest.settle(Queues.addUniqueId(name, 'c'));
        equal(JSON.stringify(storedIds(name)), JSON.stringify(['a', 'b', 'c']), 'all three stored');
        equal(dTest.settle(Queues.addUniqueId(name, 'a')), false, 'a is still deduped after later adds');
      } finally {
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('removeUniqueId of an id that is not stored changes nothing', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
      try {
        dTest.settle(Queues.addUniqueId(name, 'a'));
        dTest.settle(Queues.addUniqueId(name, 'b'));

        dTest.settle(Queues.removeUniqueId(name, 'zzz'));

        equal(JSON.stringify(storedIds(name)), JSON.stringify(['a', 'b']), 'a and b are still stored');
      } finally {
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('addUniqueId refuses a stored id and accepts it again once removed', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
      try {
        assert(dTest.settle(Queues.addUniqueId(name, 'a')), 'first add');
        dTest.settle(Queues.addUniqueId(name, 'b'));
        equal(dTest.settle(Queues.addUniqueId(name, 'a')), false, 'duplicate refused');

        dTest.settle(Queues.removeUniqueId(name, 'b'));
        equal(dTest.settle(Queues.addUniqueId(name, 'a')), false, 'removing another id does not release a');

        dTest.settle(Queues.removeUniqueId(name, 'a'));
        equal(dTest.settle(Queues.addUniqueId(name, 'a')), true, 'accepted after its own removal');
      } finally {
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('ids are scoped to their job type', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
      try {
        dTest.settle(Queues.addUniqueId(name, 'shared'));
        equal(dTest.settle(Queues.getUniqueIds('runBattle')).indexOf('shared'), -1, 'not visible under another job');
        equal(Queues.getKeyString(name, 'shared'), 'dominus:unique:perfFixTestQueue:shared', 'key layout');
      } finally {
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('a stored id expires after 20 minutes', function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
      try {
        dTest.settle(Queues.addUniqueId(name, 'a'));
        var ttl = awaitPromise(queue.client.pttl(Queues.getKeyString(name, 'a')));
        assert(ttl > 1000*60*19.5 && ttl <= 1000*60*20, 'ttl is 20 minutes, got ' + ttl);

        // an id whose key has expired can be added again
        awaitPromise(queue.client.set(Queues.getKeyString(name, 'b'), '1', 'PX', 50));
        Meteor._sleepForMs(150);
        equal(dTest.settle(Queues.addUniqueId(name, 'b')), true, 'expired id accepted');
      } finally {
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('concurrent adds and removes never lose or bring back an id', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      var Future = Npm.require('fibers/future');
      dTest.settle(Queues.clearUniqueIdsForJob(name));
      try {
        // keep0..keep29 are added; drop0..drop29 are added and removed, all interleaved
        var tasks = [];
        for (var i = 0; i < 30; i++) {
          (function(i) {
            tasks.push(Future.task(function() { dTest.settle(Queues.addUniqueId(name, 'keep' + i)); }));
            tasks.push(Future.task(function() {
              dTest.settle(Queues.addUniqueId(name, 'drop' + i));
              dTest.settle(Queues.removeUniqueId(name, 'drop' + i));
            }));
          })(i);
        }
        Future.wait(tasks);
        tasks.forEach(function(task) { task.get(); });

        var ids = storedIds(name);
        equal(ids.length, 30, 'exactly the 30 kept ids remain');
        assert(ids.every(function(id) { return id.indexOf('keep') === 0; }), 'no removed id came back');
      } finally {
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('addUniqueId lets the job through when Redis errors', function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      var restores = [
        stub(queue.client, 'set', function() { _.last(arguments)(new Error('redis down')); }),
        stub(console, 'error', function() {})
      ];
      try {
        equal(dTest.settle(Queues.addUniqueId(name, 'a')), true, 'job is queued rather than lost');
      } finally {
        restoreAll(restores);
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('clearUniqueIdsForJob removes every id and the old list key', function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      try {
        dTest.settle(Queues.addUniqueId(name, 'a'));
        dTest.settle(Queues.addUniqueId(name, 'b'));
        awaitPromise(queue.client.set(Queues.getKeyString(name), '["old$1"]'));

        dTest.settle(Queues.clearUniqueIdsForJob(name));

        equal(storedIds(name).length, 0, 'ids removed');
        equal(awaitPromise(queue.client.exists(Queues.getKeyString(name))), 0, 'old list key removed');
      } finally {
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('onJobFailed keeps the id while Bull will retry the job', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
      try {
        dTest.settle(Queues.addUniqueId(name, 'a'));
        dTest.settle(Queues.onJobFailed(fakeJob(name, 'a', function() { return Promise.resolve(false); })));
        equal(JSON.stringify(storedIds(name)), JSON.stringify(['a']), 'id kept');
      } finally {
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('onJobFailed releases the id after the final failure, and only that id', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
      try {
        dTest.settle(Queues.addUniqueId(name, 'a'));
        dTest.settle(Queues.addUniqueId(name, 'b'));
        dTest.settle(Queues.onJobFailed(fakeJob(name, 'a', function() { return Promise.resolve(true); })));
        equal(JSON.stringify(storedIds(name)), JSON.stringify(['b']), 'only a released');
      } finally {
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('onJobFailed releases the id when the job state cannot be read', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
      var restores = [stub(console, 'error', function() {})];
      try {
        dTest.settle(Queues.addUniqueId(name, 'a'));
        dTest.settle(Queues.onJobFailed(fakeJob(name, 'a', function() { return Promise.reject(new Error('redis down')); })));
        equal(storedIds(name).length, 0, 'id released');
      } finally {
        restoreAll(restores);
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('onJobFailed ignores a job without a uniqueId', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
      try {
        dTest.settle(Queues.addUniqueId(name, 'a'));
        var asked = false;
        dTest.settle(Queues.onJobFailed({data: {jobName: name}, isFailed: function() { asked = true; return Promise.resolve(true); }}));
        equal(asked, false, 'state not read');
        equal(JSON.stringify(storedIds(name)), JSON.stringify(['a']), 'other ids untouched');
      } finally {
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('a stalled job is failed, not run again, and nothing listens to stalled', function() {
      if (!isWorker) return 'skip';
      equal(testQueue().listeners('stalled').length, 0, 'no stalled listener');
      equal(Queues.runBattle.listeners('stalled').length, 0, 'none on a real queue either');
      equal(Queues.runBattle.settings.maxStalledCount, 0, 'a stalled job is failed (its failed event releases the id)');
    });

    run('onJobFailed keeps the id of a job whose work is still running here, or that timed out', function() {
      testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
      var asked = false;
      var job = {id: 'running1', data: {jobName: name, uniqueId: 'a'}, isFailed: function() { asked = true; return Promise.resolve(true); }};
      var key = Queues.runningKey(name, 'running1');
      try {
        dTest.settle(Queues.addUniqueId(name, 'a'));
        Queues.running[key] = {jobName: name};
        dTest.settle(Queues.onJobFailed(job, new Error('job stalled more than allowable limit')));
        delete Queues.running[key];
        equal(JSON.stringify(storedIds(name)), JSON.stringify(['a']), 'kept while its work runs');

        var timeout = new Error('Promise timed out after 300 milliseconds');
        timeout.name = 'TimeoutError';
        dTest.settle(Queues.onJobFailed(job, timeout));
        equal(JSON.stringify(storedIds(name)), JSON.stringify(['a']), 'kept after a timeout: the work is running somewhere here');
        equal(asked, false, 'without reading the job state');

        dTest.settle(Queues.onJobFailed(job, new Error('job stalled more than allowable limit')));
        equal(storedIds(name).length, 0, 'released for a job left behind by a worker that stopped');
      } finally {
        delete Queues.running[key];
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('Queues.addAsync never asks Bull for retries, and keeps the other options', function() {
      var calls = [];
      var queue = testQueue();
      var restore = stub(queue, 'add', function(data, options) { calls.push(options); return Promise.resolve(); });
      try {
        dTest.settle(Queues.addAsync('perfFixTestQueue', {}, {attempts: 10, backoff: {type: 'fixed', delay: 15000}, delay: 3000, timeout: 60000}, false));
        dTest.settle(Queues.addAsync('perfFixTestQueue', {}, {delay: 0}, false));
      } finally {
        restore();
      }
      equal(JSON.stringify(calls[0]), JSON.stringify({delay: 3000, timeout: 60000, attempts: 1}), 'attempts 1, no backoff, delay and timeout kept');
      equal(JSON.stringify(calls[1]), JSON.stringify({delay: 0, attempts: 1}), 'attempts 1 when none was given');
    });

    run('Queues.addAsyncOrLog logs a job Redis refuses, and releases its uniqueId', function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
      var logged = [];
      var restores = [
        stub(queue, 'add', function() { return Promise.reject(new Error('redis down')); }),
        stub(console, 'error', function() { logged.push(_.toArray(arguments).join(' ')); })
      ];
      try {
        equal(dTest.settle(Queues.addAsyncOrLog(name, {}, {delay: 0}, 'refused')), false, 'resolves with false');
        equal(storedIds(name).length, 0, 'id released');
        assert(logged.length === 1 && logged[0].indexOf('could not add job ' + name) === 0 && logged[0].indexOf('redis down') !== -1, 'logged: ' + logged.join(' | '));
      } finally {
        restoreAll(restores);
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('Queues.addAsync adds a job once Redis has it, and skips a duplicate', function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
      var calls = [];
      var restore = stub(queue, 'add', function(data, options) { calls.push({data: data, options: options}); return Promise.resolve(); });
      try {
        equal(dTest.settle(Queues.addAsync(name, {n: 1}, {attempts: 5, delay: 0}, 'async1')), true, 'added');
        equal(dTest.settle(Queues.addAsync(name, {n: 2}, {delay: 0}, 'async1')), false, 'duplicate skipped');
        equal(dTest.settle(Queues.addAsync(name, {n: 3}, {delay: 0}, false)), true, 'a job without an id is added');
        equal(calls.length, 2, 'two jobs reached Bull');
        equal(JSON.stringify(calls[0].data), JSON.stringify({n: 1, uniqueId: 'async1', jobName: name}), 'with its id and name');
        equal(calls[0].options.attempts, 1, 'and no retries');
        equal(JSON.stringify(storedIds(name)), JSON.stringify(['async1']), 'the id is stored');
      } finally {
        restore();
      }

      restore = stub(queue, 'add', function() { return Promise.reject(new Error('redis down')); });
      try {
        var e = dTest.throws(function() { return Queues.addAsync(name, {}, {delay: 0}, 'async2'); });
        equal(e && e.message, 'redis down', 'a refused job rejects');
        equal(JSON.stringify(storedIds(name)), JSON.stringify(['async1']), 'and its id is released');
      } finally {
        restore();
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('a queue error is logged, the same one at most once a minute', function() {
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

    run('the Bull 2 sets of finished jobs are deleted, with their jobs; Bull 4 keys are kept', function() {
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      var client = queue.client;
      var completed = queue.toKey('completed');
      var failed = queue.toKey('failed');
      var saved = {};
      // keep what Bull 4 has there now, to put it back afterwards
      [completed, failed].forEach(function(key) {
        saved[key] = awaitPromise(client.zrange(key, 0, -1, 'WITHSCORES'));
      });
      try {
        awaitPromise(client.del(completed, failed));
        awaitPromise(client.sadd(completed, 'old1', 'old2'));
        awaitPromise(client.hset(queue.toKey('old1'), 'data', '{}'));
        awaitPromise(client.hset(queue.toKey('old2'), 'data', '{}'));
        awaitPromise(client.zadd(failed, 1, 'new1'));
        awaitPromise(client.hset(queue.toKey('new1'), 'data', '{}'));

        var dropped = [];
        var restore = stub(console, 'log', function() {});
        try {
          dropped = dTest.settle(Queues.dropBull2Keys(name));
        } finally {
          restore();
        }
        equal(JSON.stringify(dropped), JSON.stringify(['completed']), 'only the Bull 2 set');
        equal(awaitPromise(client.exists(completed)), 0, 'the set is gone');
        equal(awaitPromise(client.exists(queue.toKey('old1'), queue.toKey('old2'))), 0, 'with its jobs');
        equal(awaitPromise(client.type(failed)), 'zset', 'the Bull 4 sorted set is kept');
        equal(awaitPromise(client.exists(queue.toKey('new1'))), 1, 'with its job');
        equal(JSON.stringify(dTest.settle(Queues.dropBull2Keys(name))), '[]', 'nothing to do the second time');
      } finally {
        awaitPromise(client.del(completed, failed, queue.toKey('old1'), queue.toKey('old2'), queue.toKey('new1')));
        [completed, failed].forEach(function(key) {
          if (saved[key].length) awaitPromise(client.zadd.apply(client, [key].concat(_.flatten(_.zip(_.filter(saved[key], function(v, i) { return i % 2; }), _.filter(saved[key], function(v, i) { return !(i % 2); }))))));
        });
      }
    });

    run('real Bull job: a handler that rejects is logged and not retried, even when attempts are asked for', function() {
      if (!isWorker) return 'skip';
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
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
        dTest.settle(Queues.addAsync(name, {test: 'retry'}, {attempts: 3, backoff: {type: 'fixed', delay: 200}, delay: 0}, 'retryJob'));
        assert(waitFor(function() { return completed; }, 10000), 'Bull counted the job done');
        assert(waitFor(function() { return storedIds(name).length === 0; }, 5000), 'id released');
        Meteor._sleepForMs(800);
        equal(attempts, 1, 'it ran once');
        assert(_.some(logged, function(line) { return line.indexOf('Exception in job perfFixTestQueue') === 0 && line.indexOf('planted failure') !== -1; }), 'the rejection was logged: ' + logged.join(' | '));
        equal(dTest.settle(Queues.addUniqueId(name, 'retryJob')), true, 'same id can be queued again');
      } finally {
        queue.removeListener('completed', listener);
        restore();
        testQueueBehavior = null;
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('real Bull job: Bull counts a job done only once its work is done', function() {
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
        dTest.settle(Queues.addAsync('perfFixTestQueue', {test: 'slow'}, {delay: 0}, false));
        assert(waitFor(function() { return doneAtCompletion !== null; }, 10000), 'job completed');
        equal(doneAtCompletion, true, 'its work had finished');
        assert(Date.now() - start >= 1500, 'not before 1.5 seconds');
      } finally {
        queue.removeListener('completed', listener);
        testQueueBehavior = null;
      }
    });

    run('real Bull job: a job past its timeout fails, keeps its uniqueId until its work ends, and no duplicate runs', function() {
      if (!isWorker) return 'skip';
      var queue = testQueue();
      var name = 'perfFixTestQueue';
      dTest.settle(Queues.clearUniqueIdsForJob(name));
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
        dTest.settle(Queues.addAsync(name, {test: 'timeout'}, {delay: 0, timeout: 300}, 'slowJob'));
        assert(waitFor(function() { return failedWith; }, 10000), 'Bull failed the job');
        equal(failedWith.name, 'TimeoutError', 'on its timeout');
        equal(workDone, false, 'while its work still ran');
        Meteor._sleepForMs(200);
        equal(JSON.stringify(storedIds(name)), JSON.stringify(['slowJob']), 'the id is still held');
        dTest.settle(Queues.addAsync(name, {test: 'timeout'}, {delay: 0, timeout: 300}, 'slowJob'));
        assert(waitFor(function() { return workDone; }, 5000), 'the work finished');
        assert(waitFor(function() { return storedIds(name).length === 0; }, 5000), 'and then the id was released');
        Meteor._sleepForMs(300);
        equal(runs, 1, 'the duplicate was never queued');
      } finally {
        queue.removeListener('failed', listener);
        testQueueBehavior = null;
        dTest.settle(Queues.clearUniqueIdsForJob(name));
      }
    });

    run('real Bull job: a queue runs one job at a time unless its handler asks for more', function() {
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
          dTest.settle(Queues.addAsync('perfFixTestQueue', {test: 'serial' + i}, {delay: 0}, false));
        }
        assert(waitFor(function() { return finished >= 3; }, 10000), 'all three ran');
        equal(most, 1, 'never two at once');
      } finally {
        testQueueBehavior = null;
      }
    });

    run('createPlayer jobs added at the same moment run one after another', function() {
      if (!isWorker) return 'skip';
      // Two players' new countries made at once claim the same hexes, so the
      // jobs that make players must not overlap. Before Bull 4 they did.
      var running = 0;
      var most = 0;
      var ran = 0;
      var restore = stub(dCastles, 'createPlayer', function() {
        running++;
        most = Math.max(most, running);
        Meteor._sleepForMs(300);
        running--;
        ran++;
        return false;
      });
      try {
        for (var i = 0; i < 3; i++) {
          dTest.settle(Queues.addAsync('createPlayer', {gameId: 'perfFixNoGame', userId: 'perfFixUser' + i, username: 'perfFix' + i, makePro: false}, {delay: 0, timeout: 1000*60}, false));
        }
        assert(waitFor(function() { return ran >= 3; }, 10000), 'all three ran');
        equal(most, 1, 'never two at once');
      } finally {
        restore();
      }
    });

    run('stopping the worker waits for running work, then the queues can resume', function() {
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
        dTest.settle(Queues.addAsync('perfFixTestQueue', {test: 'shutdown'}, {delay: 0}, false));
        assert(waitFor(function() { return started; }, 10000), 'job started');
        var idle = dTest.settle(Queues.stopWorker(5000));
        equal(idle, true, 'stopWorker reports all work done');
        equal(workDone, true, 'only after the job\'s work finished');
        assert(Queues.perfFixTestQueue.paused, 'the queue is paused on this worker');

        // with the work outliving the grace period, it gives up and says so
        workDone = false;
        Queues.queueNames.forEach(function(name) { dTest.settle(Queues[name].resume(true)); });
        var key = Queues.runningKey('perfFixTestQueue', 'stuck');
        Queues.running[key] = {jobName: 'perfFixTestQueue'};
        var start = Date.now();
        idle = dTest.settle(Queues.stopWorker(500));
        delete Queues.running[key];
        equal(idle, false, 'work still running after the grace period');
        assert(Date.now() - start < 3000, 'and it did not wait much longer (' + (Date.now() - start) + 'ms)');
      } finally {
        Queues.queueNames.forEach(function(name) { dTest.settle(Queues[name].resume(true)); });
        restore();
        testQueueBehavior = null;
      }
      // taking jobs again
      var ranAfter = false;
      testQueueBehavior = function() { ranAfter = true; return Promise.resolve(); };
      try {
        dTest.settle(Queues.addAsync('perfFixTestQueue', {test: 'after'}, {delay: 0}, false));
        assert(waitFor(function() { return ranAfter; }, 10000), 'a job runs after resuming');
      } finally {
        testQueueBehavior = null;
      }
    });



    // --- #2 Midnight rebuild can't freeze the game (Queues.pauseAll/resumeAll,
    //        Queues.resumeIfStuck, dInit.updateAllKingsAlliesJob) ---

    function pausedQueues() {
      return Queues.queueNames.filter(function(jobName) {
        var queue = Queues[jobName];
        return awaitPromise(queue.client.exists(queue.toKey('meta-paused'))) === 1;
      });
    }

    function settingsDoc() {
      return Settings.findOne({}) || {};
    }

    // every test in this section must leave the server running
    function ensureResumed() {
      try {
        dTest.settle(Queues.resumeAllAsync());
      } catch (e) {
        console.error('perfFixTests could not resume the queues', e);
      }
    }

    run('pauseAll pauses every queue and records when; resumeAll undoes both', function() {
      testQueue();
      // guard against a vacuous pass: the real queues must be in the list
      assert(Queues.queueNames.indexOf('runBattle') !== -1, 'queueNames lists runBattle');
      assert(Queues.queueNames.indexOf('updateAllKingsAllies') !== -1, 'queueNames lists updateAllKingsAllies');
      try {
        dTest.settle(Queues.pauseAllAsync(false));
        equal(pausedQueues().length, Queues.queueNames.length, 'every queue paused');
        var settings = settingsDoc();
        equal(settings.isPaused, true, 'isPaused');
        equal(settings.manualPause, false, 'server pause is not manual');
        assert(settings.pausedAt && Date.now() - settings.pausedAt.getTime() < 60000, 'pausedAt is now');

        dTest.settle(Queues.resumeAllAsync());
        equal(pausedQueues().length, 0, 'no queue paused');
        settings = settingsDoc();
        equal(settings.isPaused, false, 'isPaused cleared');
        equal(settings.pausedAt, undefined, 'pausedAt cleared');
        equal(settings.manualPause, undefined, 'manualPause cleared');
      } finally {
        ensureResumed();
      }
    });

    run('pauseJobQueue from the admin panel is a manual pause, from server code it is not', function() {
      var admin = t.createTestUser({admin: true});
      var player = t.createTestUser();
      function callAs(userId, method) {
        var inv = {userId: userId, connection: {id: 'perfFixTests'}, isSimulation: false, unblock: function() {}, setUserId: function() {}};
        return DDP._CurrentInvocation.withValue(inv, function() {
          return dTest.settle(Meteor.server.method_handlers[method].apply(inv, []));
        });
      }
      try {
        Meteor.call('pauseJobQueue');
        equal(settingsDoc().manualPause, false, 'server call is not manual');
        Meteor.call('resumeJobQueue');

        callAs(admin._id, 'pauseJobQueue');
        equal(settingsDoc().manualPause, true, 'admin panel call is manual');
        callAs(admin._id, 'resumeJobQueue');
        equal(settingsDoc().isPaused, false, 'admin resume works');

        var refused = false;
        try {
          callAs(player._id, 'pauseJobQueue');
        } catch (e) {
          refused = e.error == 'not-authorized';
        }
        assert(refused, 'a non-admin player is still refused');
        equal(pausedQueues().length, 0, 'refused call paused nothing');
      } finally {
        ensureResumed();
        t.cleanupUser(admin._id);
        t.cleanupUser(player._id);
      }
    });

    run('pauseAll that fails on one queue resumes everything and throws', function() {
      var queue = testQueue();
      var restores = [
        stub(queue, 'pause', function() { return Promise.reject(new Error('redis down')); }),
        stub(console, 'error', function() {})
      ];
      var threw = null;
      try {
        try {
          dTest.settle(Queues.pauseAllAsync(false));
        } catch (e) {
          threw = e;
        }
        restoreAll(restores);
        restores = [];
        assert(threw && threw.error === 'pause-failed', 'threw pause-failed, got ' + (threw && (threw.error || threw.message)));
        assert(threw.reason.indexOf('perfFixTestQueue') !== -1, 'names the failing queue');
        equal(pausedQueues().length, 0, 'nothing left paused');
        equal(settingsDoc().isPaused, false, 'isPaused cleared');
      } finally {
        restoreAll(restores);
        ensureResumed();
      }
    });

    run('resumeAll that fails on one queue still resumes the others, keeps isPaused and throws', function() {
      var queue = testQueue();
      var restores = [];
      var threw = null;
      try {
        dTest.settle(Queues.pauseAllAsync(false));
        restores.push(stub(queue, 'resume', function() { return Promise.reject(new Error('redis down')); }));
        restores.push(stub(console, 'error', function() {}));
        try {
          dTest.settle(Queues.resumeAllAsync());
        } catch (e) {
          threw = e;
        }
        assert(threw && threw.error === 'resume-failed', 'threw resume-failed, got ' + (threw && (threw.error || threw.message)));
        sameList(pausedQueues(), ['perfFixTestQueue'], 'only the failing queue is still paused');
        equal(settingsDoc().isPaused, true, 'isPaused kept so the safety net retries');

        restoreAll(restores);
        restores = [];
        dTest.settle(Queues.resumeAllAsync());
        equal(pausedQueues().length, 0, 'second resume clears it');
      } finally {
        restoreAll(restores);
        ensureResumed();
      }
    });

    function sameList(actual, expected, message) {
      equal(JSON.stringify(actual.slice().sort()), JSON.stringify(expected.slice().sort()), message);
    }

    run('resumeIfStuck leaves a running queue and a recent server pause alone', function() {
      var restores = [stub(console, 'error', function() {})];
      try {
        Settings.upsert({}, {$set: {isPaused: false}, $unset: {pausedAt: '', manualPause: ''}});
        equal(dTest.settle(Queues.resumeIfStuck()), false, 'not paused');

        dTest.settle(Queues.pauseAllAsync(false));
        var later = new Date(Date.now() + Queues.stuckPauseMaxMs - 60000);
        equal(dTest.settle(Queues.resumeIfStuck(later)), false, 'paused for less than the limit');
        equal(pausedQueues().length, Queues.queueNames.length, 'still paused');
      } finally {
        restoreAll(restores);
        ensureResumed();
      }
    });

    run('resumeIfStuck resumes a server pause older than the limit', function() {
      var restores = [stub(console, 'error', function() {})];
      try {
        dTest.settle(Queues.pauseAllAsync(false));
        var later = new Date(Date.now() + Queues.stuckPauseMaxMs + 60000);
        equal(dTest.settle(Queues.resumeIfStuck(later)), true, 'resumed');
        equal(pausedQueues().length, 0, 'no queue paused');
        equal(settingsDoc().isPaused, false, 'isPaused cleared');
      } finally {
        restoreAll(restores);
        ensureResumed();
      }
    });

    run('resumeIfStuck never resumes a pause made from the admin panel', function() {
      var restores = [stub(console, 'error', function() {})];
      try {
        dTest.settle(Queues.pauseAllAsync(true));
        var muchLater = new Date(Date.now() + 1000*60*60*24);
        equal(dTest.settle(Queues.resumeIfStuck(muchLater)), false, 'left alone');
        equal(pausedQueues().length, Queues.queueNames.length, 'still paused');
      } finally {
        restoreAll(restores);
        ensureResumed();
      }
    });

    run('resumeIfStuck resumes a pause with no pausedAt (left by the old code)', function() {
      var restores = [stub(console, 'error', function() {})];
      try {
        Settings.upsert({}, {$set: {isPaused: true}, $unset: {pausedAt: '', manualPause: ''}});
        equal(dTest.settle(Queues.resumeIfStuck()), true, 'resumed');
        equal(settingsDoc().isPaused, false, 'isPaused cleared');
      } finally {
        restoreAll(restores);
        ensureResumed();
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
        stub(dInit, 'rebuildRelationships', function(gameId) {
          log.pausedDuringRebuild.push(settingsDoc().isPaused === true);
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

    run('updateAllKingsAlliesJob pauses once for every running game and resumes', function() {
      var games = [0, 1, 2].map(function() { return t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()}); });
      var ids = games.map(function(g) { return g._id; });
      var log = stubRebuild();
      try {
        dTest.settle(dInit.updateAllKingsAlliesJob());
        log.restore();

        ids.forEach(function(id) {
          assert(log.rebuilt.indexOf(id) !== -1, 'rebuilt ' + id);
          assert(log.dominus.indexOf(id) !== -1, 'checkForDominus ' + id);
          assert(log.chatrooms.indexOf(id) !== -1, 'chatroom cleanup queued ' + id);
        });
        equal(log.pauses, 1, 'paused once');
        equal(log.resumes, 1, 'resumed once');
        assert(log.pausedDuringRebuild.every(function(p) { return p; }), 'every rebuild ran while paused');
        equal(pausedQueues().length, 0, 'nothing left paused');
      } finally {
        log.restore();
        ensureResumed();
        ids.forEach(function(id) { t.cleanup(id); });
      }
    });

    run('updateAllKingsAlliesJob skips ended and unstarted games', function() {
      var running = t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var ended = t.createTestGame({hasStarted: true, hasEnded: true, startedAt: new Date()});
      var notStarted = t.createTestGame({hasStarted: false, hasEnded: false});
      var log = stubRebuild();
      try {
        dTest.settle(dInit.updateAllKingsAlliesJob());
        log.restore();
        assert(log.rebuilt.indexOf(running._id) !== -1, 'running game rebuilt');
        equal(log.rebuilt.indexOf(ended._id), -1, 'ended game skipped');
        equal(log.rebuilt.indexOf(notStarted._id), -1, 'unstarted game skipped');
      } finally {
        log.restore();
        ensureResumed();
        [running, ended, notStarted].forEach(function(g) { t.cleanup(g._id); });
      }
    });

    run('updateAllKingsAlliesJob with a gameId rebuilds only that game', function() {
      var a = t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var b = t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var log = stubRebuild();
      try {
        dTest.settle(dInit.updateAllKingsAlliesJob(a._id));
        log.restore();
        sameList(log.rebuilt, [a._id], 'only game a');
        equal(log.pauses, 1, 'paused once');
        equal(log.resumes, 1, 'resumed once');
      } finally {
        log.restore();
        ensureResumed();
        t.cleanup(a._id);
        t.cleanup(b._id);
      }
    });

    run('updateAllKingsAlliesJob: one game failing does not stop the others or leave the queues paused', function() {
      var games = [0, 1, 2].map(function() { return t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()}); });
      var ids = games.map(function(g) { return g._id; });
      var log = stubRebuild([ids[1]]);
      try {
        dTest.settle(dInit.updateAllKingsAlliesJob());
        log.restore();
        assert(log.rebuilt.indexOf(ids[0]) !== -1, 'game before the failure rebuilt');
        assert(log.rebuilt.indexOf(ids[2]) !== -1, 'game after the failure rebuilt');
        equal(log.dominus.indexOf(ids[1]), -1, 'failed game skips checkForDominus');
        equal(log.resumes, 1, 'resumed');
        equal(pausedQueues().length, 0, 'nothing left paused');
        equal(settingsDoc().isPaused, false, 'isPaused cleared');
      } finally {
        log.restore();
        ensureResumed();
        ids.forEach(function(id) { t.cleanup(id); });
      }
    });

    run('updateAllKingsAlliesJob resumes the queues even when the job itself throws', function() {
      var game = t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var log = stubRebuild();
      var restoreSleep = stub(dInit, 'waitForRunningJobs', function() { return Promise.reject(new Error('boom')); });
      var threw = false;
      try {
        try {
          dTest.settle(dInit.updateAllKingsAlliesJob(game._id));
        } catch (e) {
          threw = true;
        }
        restoreSleep();
        log.restore();
        assert(threw, 'the error still reaches Bull');
        equal(log.resumes, 1, 'resumed');
        equal(pausedQueues().length, 0, 'nothing left paused');
      } finally {
        restoreSleep();
        log.restore();
        ensureResumed();
        t.cleanup(game._id);
      }
    });

    run('the midnight cron queues one updateAllKingsAllies job for all games', function() {
      if (!isWorker || !SyncedCron._entries || !SyncedCron._entries['midnight job']) return 'skip';
      var game = t.createTestGame({hasStarted: true, hasEnded: false, startedAt: new Date()});
      var calls = [];
      var restore = stub(Queues, 'addAsync', async function(jobName, data, options, uniqueId) {
        calls.push({jobName: jobName, data: data, options: options, uniqueId: uniqueId});
      });
      try {
        dTest.settle(SyncedCron._entries['midnight job'].job());
        restore();
        var rebuilds = calls.filter(function(c) { return c.jobName == 'updateAllKingsAllies'; });
        equal(rebuilds.length, 1, 'one job');
        equal(rebuilds[0].data.gameId, undefined, 'no gameId, so it covers every game');
        equal(rebuilds[0].uniqueId, 'allGames', 'deduped');
        equal(rebuilds[0].options.attempts, undefined, 'no retries');
        assert(calls.some(function(c) { return c.jobName == 'dailystatsNumVassalsEveryone' && c.data.gameId == game._id; }), 'per-game dailystats job still queued');
      } finally {
        restore();
        t.cleanup(game._id);
      }
    });

    run('Bull counts a fiber-wrapped job as done only once its work finishes', function() {
      // Before Bull 4 this was the other way round, which is why shutdown used
      // to wait a fixed time instead of waiting for the work.
      if (!isWorker) return 'skip';
      if (!Queues.perfFixFiberQueue) {
        Queues.create('perfFixFiberQueue');
        Queues.perfFixFiberQueue.process(Meteor.bindEnvironment(function(job) {
          Meteor._sleepForMs(1500);
          perfFixFiberDone = true;
          return Promise.resolve();
        }));
      }
      perfFixFiberDone = false;
      var doneAtCompletion = null;
      var listener = function() { doneAtCompletion = perfFixFiberDone; };
      Queues.perfFixFiberQueue.once('completed', listener);
      dTest.settle(Queues.perfFixFiberQueue.add({}));
      assert(waitFor(function() { return doneAtCompletion !== null; }, 10000), 'job completed');
      equal(doneAtCompletion, true, 'its work had finished when Bull reported completion');
    });


    // --- #3 Indexes (packages/dominus-collections/indexes.js) ---

    function indexNames(collection) {
      return awaitPromise(collection.rawCollection().indexes()).map(function(index) { return index.name; });
    }

    // stage names and index names of the winning plan
    function plan(collection, selector, options) {
      var cursor = collection.rawCollection().find(selector, options || {});
      var explain = awaitPromise(cursor.explain());
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

    run('index: the four new indexes exist', function() {
      assert(indexNames(Players).indexOf('userId_1') !== -1, 'Players userId_1');
      assert(indexNames(Alerts).indexOf('playerIds.playerId_1_created_at_-1') !== -1, 'Alerts playerId + created_at');
      assert(indexNames(Alerts).indexOf('playerIds.playerId_1_playerIds.read_1') !== -1, 'Alerts playerId + read');
      assert(indexNames(Markers).indexOf('unitId_1_unitType_1') !== -1, 'Markers unitId + unitType');
    });

    run('index: player lookups by userId use userId_1; by game and user still use gameId_1_userId_1', function() {
      var game = t.createTestGame();
      var userId = 'u_' + Random.id(5);
      try {
        Players.insert({gameId: game._id, userId: userId, gameIsClosed: false, gameIsOver: false});
        var topNav = plan(Players, {userId: userId, gameIsClosed: false}, {projection: {gameId: 1, gameName: 1}});
        assert(topNav.indexes.indexOf('userId_1') !== -1, 'top nav uses userId_1: ' + topNav.stages.join('>'));
        var profile = plan(Players, {userId: userId, gameIsOver: true});
        assert(profile.indexes.indexOf('userId_1') !== -1, 'profile uses userId_1: ' + profile.stages.join('>'));
        var settings = plan(Players, {userId: userId});
        assert(settings.indexes.indexOf('userId_1') !== -1, 'settings uses userId_1');
        var inGame = plan(Players, {gameId: game._id, userId: userId});
        assert(inGame.indexes.indexOf('gameId_1_userId_1') !== -1, 'in-game lookup keeps gameId_1_userId_1: ' + inGame.indexes.join(','));
      } finally {
        t.cleanup(game._id);
      }
    });

    run('index: myAlerts uses the new alerts index with no in-memory sort', function() {
      var game = t.createTestGame();
      var pid = 'p_' + Random.id(5);
      try {
        for (var i = 0; i < 5; i++) {
          Alerts.insert({gameId: game._id, created_at: new Date(Date.now() - i * 1000), type: 't' + i, vars: {},
            playerIds: [{playerId: pid, read: i % 2 == 0}, {playerId: 'other', read: false}]});
        }
        var p = plan(Alerts, {playerIds: {$elemMatch: {playerId: pid}}, type: {$nin: ['t1']}}, {sort: {created_at: -1}, limit: 150});
        assert(p.indexes.indexOf('playerIds.playerId_1_created_at_-1') !== -1, 'uses playerId + created_at: ' + p.indexes.join(','));
        equal(p.stages.indexOf('SORT'), -1, 'no SORT stage');

        var docs = Alerts.find({playerIds: {$elemMatch: {playerId: pid}}, type: {$nin: ['t1']}}, {sort: {created_at: -1}, limit: 150}).fetch();
        equal(docs.length, 4, 'four alerts, t1 hidden');
        assert(docs.every(function(d, i) { return i == 0 || docs[i - 1].created_at >= d.created_at; }), 'newest first');
      } finally {
        Alerts.remove({gameId: game._id});
        t.cleanup(game._id);
      }
    });

    run('index: unreadAlerts and the mark-read updates use an index', function() {
      var game = t.createTestGame();
      var pid = 'p_' + Random.id(5);
      try {
        Alerts.insert({gameId: game._id, created_at: new Date(), type: 't', vars: {}, playerIds: [{playerId: pid, read: false}]});
        var unread = plan(Alerts, {playerIds: {$elemMatch: {playerId: pid, read: false}}, type: {$nin: []}}, {projection: {_id: 1}});
        equal(unread.stages.indexOf('COLLSCAN'), -1, 'unreadAlerts: no COLLSCAN');
        var markAll = plan(Alerts, {'playerIds.playerId': pid});
        equal(markAll.stages.indexOf('COLLSCAN'), -1, 'markAllAlertsAsRead: no COLLSCAN');
      } finally {
        Alerts.remove({gameId: game._id});
        t.cleanup(game._id);
      }
    });

    run('index: army marker updates and removals use unitId_1_unitType_1', function() {
      var game = t.createTestGame();
      try {
        Markers.insert({gameId: game._id, unitType: 'army', unitId: 'army_' + Random.id(5), user_id: 'u', playerId: 'p'});
        var p = plan(Markers, {unitType: 'army', unitId: 'someArmy'});
        assert(p.indexes.indexOf('unitId_1_unitType_1') !== -1, 'uses unitId_1_unitType_1: ' + p.stages.join('>'));
        var withUser = plan(Markers, {unitType: 'army', unitId: 'someArmy', user_id: 'u'});
        equal(withUser.stages.indexOf('COLLSCAN'), -1, 'addMarker check: no COLLSCAN');
        var publish = plan(Markers, {playerId: 'p', user_id: 'u'});
        assert(publish.indexes.indexOf('playerId_1_user_id_1') !== -1, 'markers publication keeps playerId_1_user_id_1');
      } finally {
        Markers.remove({gameId: game._id});
        t.cleanup(game._id);
      }
    });


    // --- #4 Lookups by coordinates are scoped to the game (coords_to_id,
    //        dInit.attackCreatesLoop) ---

    function callMethod(userId, method, args) {
      var inv = {userId: userId, connection: {id: 'perfFixTests'}, isSimulation: false, unblock: function() {}, setUserId: function() {}};
      return DDP._CurrentInvocation.withValue(inv, function() {
        return dTest.settle(Meteor.server.method_handlers[method].apply(inv, args));
      });
    }

    function cleanupMap(gameId) {
      Hexes.remove({gameId: gameId});
      Castles.remove({gameId: gameId});
      Armies.remove({gameId: gameId});
      t.cleanup(gameId);
    }

    run('gameId: coords_to_id only finds hexes in the game it is asked about', function() {
      var a = t.createTestGame();
      var b = t.createTestGame();
      var user = t.createTestUser();
      try {
        var aHex = Hexes.insert({gameId: a._id, x: 1, y: 1});
        var bHex = Hexes.insert({gameId: b._id, x: 3, y: -5});
        var aShared = Hexes.insert({gameId: a._id, x: 7, y: 7});
        var bShared = Hexes.insert({gameId: b._id, x: 7, y: 7});

        equal(callMethod(user._id, 'coords_to_id', [a._id, 1, 1, 'hex']), aHex, 'own hex found');
        equal(callMethod(user._id, 'coords_to_id', [a._id, 3, -5, 'hex']), false, 'hex that only exists in another game is not found');
        equal(callMethod(user._id, 'coords_to_id', [b._id, 3, -5, 'hex']), bHex, 'found in its own game');
        equal(callMethod(user._id, 'coords_to_id', [a._id, 7, 7, 'hex']), aShared, 'shared coordinates: game a gets its own hex');
        equal(callMethod(user._id, 'coords_to_id', [b._id, 7, 7, 'hex']), bShared, 'shared coordinates: game b gets its own hex');
      } finally {
        cleanupMap(a._id);
        cleanupMap(b._id);
        t.cleanupUser(user._id);
      }
    });

    run('gameId: coords_to_id refuses the old call without a gameId; doesHexExist is gone', function() {
      var user = t.createTestUser();
      try {
        var refused = false;
        try {
          callMethod(user._id, 'coords_to_id', [3, -5, 'hex']);
        } catch (e) {
          refused = true;
        }
        assert(refused, 'old signature is refused');
        equal(Meteor.server.method_handlers['doesHexExist'], undefined, 'doesHexExist removed');
      } finally {
        t.cleanupUser(user._id);
      }
    });

    // a lord/vassal capture loop: castle owner A has an army on B's castle and
    // B has an army on A's castle
    function makeLoop(gameId, ax, ay, bx, by) {
      var a = 'pa_' + Random.id(5);
      var b = 'pb_' + Random.id(5);
      Castles.insert({gameId: gameId, playerId: a, x: ax, y: ay});
      Castles.insert({gameId: gameId, playerId: b, x: bx, y: by});
      Armies.insert({gameId: gameId, playerId: b, x: ax, y: ay, speed: 1});
      Armies.insert({gameId: gameId, playerId: a, x: bx, y: by, speed: 1});
      return {a: a, b: b};
    }

    run('gameId: attackCreatesLoop still finds a loop inside one game', function() {
      var game = t.createTestGame();
      try {
        makeLoop(game._id, 5, 5, 9, 9);
        equal(dTest.settle(dInit.attackCreatesLoop(game._id, 5, 5)), true, 'loop at the first castle');
        equal(dTest.settle(dInit.attackCreatesLoop(game._id, 9, 9)), true, 'loop at the second castle');
      } finally {
        cleanupMap(game._id);
      }
    });

    run('gameId: attackCreatesLoop is false when there is no loop', function() {
      var game = t.createTestGame();
      try {
        var a = 'pa_' + Random.id(5);
        var b = 'pb_' + Random.id(5);
        Castles.insert({gameId: game._id, playerId: a, x: 5, y: 5});
        Castles.insert({gameId: game._id, playerId: b, x: 9, y: 9});
        Armies.insert({gameId: game._id, playerId: b, x: 5, y: 5, speed: 1});
        equal(dTest.settle(dInit.attackCreatesLoop(game._id, 5, 5)), false, 'one-sided attack is not a loop');
        equal(dTest.settle(dInit.attackCreatesLoop(game._id, 1, 1)), false, 'no castle there');
      } finally {
        cleanupMap(game._id);
      }
    });

    run('gameId: a loop in another game at the same coordinates does not block this game', function() {
      var looped = t.createTestGame();
      var other = t.createTestGame();
      try {
        makeLoop(looped._id, 5, 5, 9, 9);
        // other game: a plain attack on a castle at the same coordinates
        var a = 'pa_' + Random.id(5);
        var b = 'pb_' + Random.id(5);
        Castles.insert({gameId: other._id, playerId: a, x: 5, y: 5});
        Castles.insert({gameId: other._id, playerId: b, x: 9, y: 9});
        Armies.insert({gameId: other._id, playerId: b, x: 5, y: 5, speed: 1});

        equal(dTest.settle(dInit.attackCreatesLoop(other._id, 5, 5)), false, 'the other game can attack');
        equal(dTest.settle(dInit.attackCreatesLoop(looped._id, 5, 5)), true, 'the looped game still sees its loop');
      } finally {
        cleanupMap(looped._id);
        cleanupMap(other._id);
      }
    });

    run('gameId: armies in another game do not create a loop in this one', function() {
      var game = t.createTestGame();
      var other = t.createTestGame();
      try {
        var a = 'pa_' + Random.id(5);
        Castles.insert({gameId: game._id, playerId: a, x: 5, y: 5});
        // the other game has a full loop through the same coordinates
        makeLoop(other._id, 5, 5, 9, 9);
        equal(dTest.settle(dInit.attackCreatesLoop(game._id, 5, 5)), false, 'no army of this game is here');
      } finally {
        cleanupMap(game._id);
        cleanupMap(other._id);
      }
    });

  };
}
