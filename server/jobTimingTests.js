// Tests for Queues.runJob (packages/dominus-queue/queue.js, Oct 2026): every
// job handler's real work is timed, and since Bull 4 (upgrade PR 4) Bull waits
// for that work before it counts the job done.
//
// They run as part of runGameCreationTests (server/gameCreationTests.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  // created on first use and kept for the life of the process (Bull allows one
  // handler per queue)
  var timingQueueSleep = 0;
  var timingQueueDone = false;

  _jobTimingTests = async function(run, t) {
    var assert = t.assert;
    var equal = t.equal;
    var isWorker = process.env.DOMINUS_WORKER == 'true';

    async function waitFor(fn, ms) {
      var end = Date.now() + (ms || 10000);
      while (Date.now() < end) {
        if (await fn()) return true;
        await dTest.sleep(50);
      }
      return !!(await fn());
    }

    // calls fn the way Bull calls a handler: outside any fiber
    async function callOutsideFiber(fn) {
      var out = {returned: false, value: undefined};
      setTimeout(function() {
        out.value = fn();
        out.returned = true;
      }, 0);
      await waitFor(function() { return out.returned; }, 5000);
      return out;
    }

    function type() {
      return 'jobTimingTest_' + Random.id(6);
    }


    // catches what Meteor._debug logs while fn runs
    async function captureDebug(fn) {
      var logged = [];
      var debug = Meteor._debug;
      Meteor._debug = function() { logged.push(_.toArray(arguments).join(' ')); };
      try {
        await fn();
      } finally {
        Meteor._debug = debug;
      }
      return logged;
    }

    function settled(promise) {
      var state = {done: false};
      promise.then(function(value) { state.done = true; state.value = value; }, function(error) { state.done = true; state.error = error; });
      return state;
    }

    // A timer can fire a millisecond or two before Date.now() has moved on by
    // its whole delay, so a 600ms sleep can be timed as 599ms.
    var SLACK = 5;

    await run('job timing: a fiber-bound handler\'s promise resolves when its work is done, and the work is timed', async function() {
      var name = type();
      var finished = false;
      var wrapped = Queues.runJob(name, Meteor.bindEnvironment(async function(job) {
        await dTest.sleep(400);
        finished = true;
        return Promise.resolve();
      }));

      var out = await callOutsideFiber(function() { return wrapped({id: 'a', data: {}}); });
      assert(out.returned, 'returned');
      assert(out.value && typeof out.value.then === 'function', 'Bull gets a promise');
      var state = settled(out.value);
      equal(finished, false, 'the work is still running');
      await dTest.sleep(100);
      equal(state.done, false, 'and the promise waits for it');
      assert(Queues.isRunning(name, 'a'), 'the job is listed as running');

      assert(await waitFor(function() { return state.done; }, 5000), 'the promise resolves');
      assert(finished, 'after the work finished');
      assert(!state.error, 'without an error');
      assert(!Queues.isRunning(name, 'a'), 'no longer listed as running');
      var times = Queues.workTimes[name];
      equal(times.count, 1, 'timed once');
      assert(times.max >= 400 - SLACK && times.max < 5000, 'for as long as the work took (' + times.max + 'ms)');
      delete Queues.workTimes[name];
    });

    await run('job timing: called from inside a fiber, the handler runs in a fiber of its own and the promise waits for it', async function() {
      var name = type();
      var finished = false;
      var wrapped = Queues.runJob(name, Meteor.bindEnvironment(async function(job) {
        await dTest.sleep(200);
        finished = true;
      }));
      var promise = wrapped({id: 'b', data: {}});
      equal(finished, false, 'the caller is not held up');
      await promise;
      assert(finished, 'the work is done when the promise resolves');
      assert(Queues.workTimes[name] && Queues.workTimes[name].max >= 200 - SLACK, 'and timed');
      delete Queues.workTimes[name];
    });

    await run('job timing: a plain handler\'s promise is waited for; a rejection or a throw is logged and the job still completes', async function() {
      var name = type();
      var resolve;
      var pending = new Promise(function(r) { resolve = r; });
      var wrapped = Queues.runJob(name, function(job) { return pending; });

      var state = settled(wrapped({id: 'c', data: {}}));
      await dTest.sleep(200);
      equal(state.done, false, 'waits while the handler\'s promise is pending');
      assert(!Queues.workTimes[name], 'not timed yet');
      resolve('a result');
      assert(await waitFor(function() { return state.done; }, 5000), 'resolves once it resolves');
      equal(state.value, undefined, 'Bull stores no result');
      assert(Queues.workTimes[name].max >= 200 - SLACK, 'timed, including the time it was pending');
      delete Queues.workTimes[name];

      // a rejected promise and a thrown error: logged, and Bull counts the job
      // done (no retries, as before Bull 4)
      await dTest.eachAsync([function(job) { return Promise.reject(new Error('rejected')); },
       function(job) { throw new Error('thrown'); }], async function(handler, i) {
        var promise;
        var logged = await captureDebug(async function() {
          promise = Queues.runJob(name, handler)({id: 'd' + i, data: {}});
          await promise;
        });
        equal(logged.length, 1, 'logged once');
        assert(logged[0].indexOf('Exception in job ' + name) === 0, 'as an exception in the job: ' + logged[0]);
        assert(logged[0].indexOf(i ? 'thrown' : 'rejected') !== -1, 'with its error');
        assert(Queues.workTimes[name], 'still timed');
        delete Queues.workTimes[name];
      });

      // a fiber-bound handler that throws is logged by bindEnvironment, as before
      var logged = await captureDebug(async function() {
        await Queues.runJob(name, Meteor.bindEnvironment(function() { throw new Error('bound'); }))({id: 'e', data: {}});
      });
      equal(logged.length, 1, 'logged once');
      assert(logged[0].indexOf('Exception in callback of async function') === 0, 'by bindEnvironment: ' + logged[0]);
      delete Queues.workTimes[name];
    });

    await run('job timing: a job\'s uniqueId is released when its work ends, not before', async function() {
      var name = 'jobTimingIdQueue';
      if (!Queues[name]) Queues.create(name);
      await Queues.clearUniqueIdsForJob(name);
      try {
        assert(await Queues.addUniqueId(name, 'x'), 'id taken');
        var wrapped = Queues.runJob(name, Meteor.bindEnvironment(async function(job) {
          await dTest.sleep(300);
        }));
        var state = settled(wrapped({id: 'f', data: {jobName: name, uniqueId: 'x'}}));
        await dTest.sleep(100);
        equal(await Queues.addUniqueId(name, 'x'), false, 'held while the work runs');
        assert(await waitFor(function() { return state.done; }, 5000), 'work done');
        equal(await Queues.addUniqueId(name, 'x'), true, 'free once it ended');
      } finally {
        await Queues.clearUniqueIdsForJob(name);
        delete Queues.workTimes[name];
      }
    });

    await run('job timing: every queue times its handler, and a real job is timed to the end of its work', async function() {
      if (!isWorker) return 'skip';
      if (!Queues.jobTimingTestQueue) {
        Queues.create('jobTimingTestQueue');
        Queues.jobTimingTestQueue.process(Meteor.bindEnvironment(async function(job) {
          await dTest.sleep(timingQueueSleep);
          timingQueueDone = true;
          return Promise.resolve();
        }));
      }
      delete Queues.workTimes.jobTimingTestQueue;
      timingQueueSleep = 600;
      timingQueueDone = false;
      await Queues.jobTimingTestQueue.add({});
      assert(await waitFor(function() { return Queues.workTimes.jobTimingTestQueue; }, 10000), 'the job was timed');
      assert(timingQueueDone, 'after its work finished');
      assert(Queues.workTimes.jobTimingTestQueue.max >= 600 - SLACK, 'for the time its work took (' + Queues.workTimes.jobTimingTestQueue.max + 'ms)');
      delete Queues.workTimes.jobTimingTestQueue;
    });

    await run('job timing: the totals are added to JobWorkStats per day and cleared from memory', async function() {
      var name = type();
      var workDay = Queues.workDay;
      try {
        Queues.workDay = function() { return '2026-01-01'; };
        Queues.recordWork(name, 100);
        Queues.recordWork(name, 300);
        await Queues.flushWorkTimes();
        assert(!Queues.workTimes[name], 'cleared from memory');
        var stats = await JobWorkStats.findOneAsync({type: name, day: '2026-01-01'});
        assert(stats, 'a doc for the job and day');
        equal(stats.count, 2, 'count');
        equal(stats.total, 400, 'total');
        equal(stats.max, 300, 'max');
        equal(stats.last, 300, 'last');

        // a second flush on the same day adds to it, keeping the highest max
        Queues.recordWork(name, 50);
        await Queues.flushWorkTimes();
        stats = await JobWorkStats.findOneAsync({type: name, day: '2026-01-01'});
        equal(stats.count, 3, 'count adds up');
        equal(stats.total, 450, 'total adds up');
        equal(stats.max, 300, 'max kept');
        equal(stats.last, 50, 'last replaced');

        // the next day gets its own doc
        Queues.workDay = function() { return '2026-01-02'; };
        Queues.recordWork(name, 70);
        await Queues.flushWorkTimes();
        equal(await JobWorkStats.find({type: name}).countAsync(), 2, 'one doc per day');
        equal((await JobWorkStats.findOneAsync({type: name, day: '2026-01-02'})).max, 70, 'with that day\'s numbers');

        equal(workDay().length, 10, 'the real day is YYYY-MM-DD');
      } finally {
        Queues.workDay = workDay;
        await JobWorkStats.removeAsync({type: name});
      }
    });

    await run('job timing: the midnight stats reset leaves JobWorkStats alone', async function() {
      if (!isWorker) return 'skip';
      var name = type();
      try {
        await JobWorkStats.insertAsync({type: name, day: '2026-01-01', count: 1, total: 5, max: 5, last: 5});
        Queues.resetQueueStats.handler({data: {jobName: 'resetQueueStats'}});
        assert(await waitFor(async function() { return await KueStats.find().countAsync() === 0; }, 5000), 'KueStats is cleared');
        equal(await JobWorkStats.find({type: name}).countAsync(), 1, 'JobWorkStats is kept');
      } finally {
        await JobWorkStats.removeAsync({type: name});
      }
    });
  };
}
