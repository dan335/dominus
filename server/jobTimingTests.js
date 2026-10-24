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

  _jobTimingTests = function(run, t) {
    var assert = t.assert;
    var equal = t.equal;
    var isWorker = process.env.DOMINUS_WORKER == 'true';

    function waitFor(fn, ms) {
      var end = Date.now() + (ms || 10000);
      while (Date.now() < end) {
        if (fn()) return true;
        Meteor._sleepForMs(50);
      }
      return !!fn();
    }

    // calls fn the way Bull calls a handler: outside any fiber
    function callOutsideFiber(fn) {
      var out = {returned: false, value: undefined};
      setTimeout(function() {
        out.value = fn();
        out.returned = true;
      }, 0);
      waitFor(function() { return out.returned; }, 5000);
      return out;
    }

    function type() {
      return 'jobTimingTest_' + Random.id(6);
    }


    // catches what Meteor._debug logs while fn runs
    function captureDebug(fn) {
      var logged = [];
      var debug = Meteor._debug;
      Meteor._debug = function() { logged.push(_.toArray(arguments).join(' ')); };
      try {
        fn();
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

    run('job timing: a fiber-bound handler\'s promise resolves when its work is done, and the work is timed', function() {
      var name = type();
      var finished = false;
      var wrapped = Queues.runJob(name, Meteor.bindEnvironment(function(job) {
        Meteor._sleepForMs(400);
        finished = true;
        return Promise.resolve();
      }));

      var out = callOutsideFiber(function() { return wrapped({id: 'a', data: {}}); });
      assert(out.returned, 'returned');
      assert(out.value && typeof out.value.then === 'function', 'Bull gets a promise');
      var state = settled(out.value);
      equal(finished, false, 'the work is still running');
      Meteor._sleepForMs(100);
      equal(state.done, false, 'and the promise waits for it');
      assert(Queues.isRunning(name, 'a'), 'the job is listed as running');

      assert(waitFor(function() { return state.done; }, 5000), 'the promise resolves');
      assert(finished, 'after the work finished');
      assert(!state.error, 'without an error');
      assert(!Queues.isRunning(name, 'a'), 'no longer listed as running');
      var times = Queues.workTimes[name];
      equal(times.count, 1, 'timed once');
      assert(times.max >= 400 && times.max < 5000, 'for as long as the work took (' + times.max + 'ms)');
      delete Queues.workTimes[name];
    });

    run('job timing: called from inside a fiber, the handler runs in a fiber of its own and the promise waits for it', function() {
      var name = type();
      var finished = false;
      var wrapped = Queues.runJob(name, Meteor.bindEnvironment(function(job) {
        Meteor._sleepForMs(200);
        finished = true;
      }));
      var promise = wrapped({id: 'b', data: {}});
      equal(finished, false, 'the caller is not held up');
      dTest.settle(promise);
      assert(finished, 'the work is done when the promise resolves');
      assert(Queues.workTimes[name] && Queues.workTimes[name].max >= 200, 'and timed');
      delete Queues.workTimes[name];
    });

    run('job timing: a plain handler\'s promise is waited for; a rejection or a throw is logged and the job still completes', function() {
      var name = type();
      var resolve;
      var pending = new Promise(function(r) { resolve = r; });
      var wrapped = Queues.runJob(name, function(job) { return pending; });

      var state = settled(wrapped({id: 'c', data: {}}));
      Meteor._sleepForMs(200);
      equal(state.done, false, 'waits while the handler\'s promise is pending');
      assert(!Queues.workTimes[name], 'not timed yet');
      resolve('a result');
      assert(waitFor(function() { return state.done; }, 5000), 'resolves once it resolves');
      equal(state.value, undefined, 'Bull stores no result');
      assert(Queues.workTimes[name].max >= 200, 'timed, including the time it was pending');
      delete Queues.workTimes[name];

      // a rejected promise and a thrown error: logged, and Bull counts the job
      // done (no retries, as before Bull 4)
      [function(job) { return Promise.reject(new Error('rejected')); },
       function(job) { throw new Error('thrown'); }].forEach(function(handler, i) {
        var promise;
        var logged = captureDebug(function() {
          promise = Queues.runJob(name, handler)({id: 'd' + i, data: {}});
          dTest.settle(promise);
        });
        equal(logged.length, 1, 'logged once');
        assert(logged[0].indexOf('Exception in job ' + name) === 0, 'as an exception in the job: ' + logged[0]);
        assert(logged[0].indexOf(i ? 'thrown' : 'rejected') !== -1, 'with its error');
        assert(Queues.workTimes[name], 'still timed');
        delete Queues.workTimes[name];
      });

      // a fiber-bound handler that throws is logged by bindEnvironment, as before
      var logged = captureDebug(function() {
        dTest.settle(Queues.runJob(name, Meteor.bindEnvironment(function() { throw new Error('bound'); }))({id: 'e', data: {}}));
      });
      equal(logged.length, 1, 'logged once');
      assert(logged[0].indexOf('Exception in callback of async function') === 0, 'by bindEnvironment: ' + logged[0]);
      delete Queues.workTimes[name];
    });

    run('job timing: a job\'s uniqueId is released when its work ends, not before', function() {
      var name = 'jobTimingIdQueue';
      if (!Queues[name]) Queues.create(name);
      Queues.clearUniqueIdsForJob(name);
      try {
        assert(Queues.addUniqueId(name, 'x'), 'id taken');
        var wrapped = Queues.runJob(name, Meteor.bindEnvironment(function(job) {
          Meteor._sleepForMs(300);
        }));
        var state = settled(wrapped({id: 'f', data: {jobName: name, uniqueId: 'x'}}));
        Meteor._sleepForMs(100);
        equal(Queues.addUniqueId(name, 'x'), false, 'held while the work runs');
        assert(waitFor(function() { return state.done; }, 5000), 'work done');
        equal(Queues.addUniqueId(name, 'x'), true, 'free once it ended');
      } finally {
        Queues.clearUniqueIdsForJob(name);
        delete Queues.workTimes[name];
      }
    });

    run('job timing: every queue times its handler, and a real job is timed to the end of its work', function() {
      if (!isWorker) return 'skip';
      if (!Queues.jobTimingTestQueue) {
        Queues.create('jobTimingTestQueue');
        Queues.jobTimingTestQueue.process(Meteor.bindEnvironment(function(job) {
          Meteor._sleepForMs(timingQueueSleep);
          timingQueueDone = true;
          return Promise.resolve();
        }));
      }
      delete Queues.workTimes.jobTimingTestQueue;
      timingQueueSleep = 600;
      timingQueueDone = false;
      Queues.jobTimingTestQueue.add({});
      assert(waitFor(function() { return Queues.workTimes.jobTimingTestQueue; }, 10000), 'the job was timed');
      assert(timingQueueDone, 'after its work finished');
      assert(Queues.workTimes.jobTimingTestQueue.max >= 600, 'for the time its work took (' + Queues.workTimes.jobTimingTestQueue.max + 'ms)');
      delete Queues.workTimes.jobTimingTestQueue;
    });

    run('job timing: the totals are added to JobWorkStats per day and cleared from memory', function() {
      var name = type();
      var workDay = Queues.workDay;
      try {
        Queues.workDay = function() { return '2026-01-01'; };
        Queues.recordWork(name, 100);
        Queues.recordWork(name, 300);
        Queues.flushWorkTimes();
        assert(!Queues.workTimes[name], 'cleared from memory');
        var stats = JobWorkStats.findOne({type: name, day: '2026-01-01'});
        assert(stats, 'a doc for the job and day');
        equal(stats.count, 2, 'count');
        equal(stats.total, 400, 'total');
        equal(stats.max, 300, 'max');
        equal(stats.last, 300, 'last');

        // a second flush on the same day adds to it, keeping the highest max
        Queues.recordWork(name, 50);
        Queues.flushWorkTimes();
        stats = JobWorkStats.findOne({type: name, day: '2026-01-01'});
        equal(stats.count, 3, 'count adds up');
        equal(stats.total, 450, 'total adds up');
        equal(stats.max, 300, 'max kept');
        equal(stats.last, 50, 'last replaced');

        // the next day gets its own doc
        Queues.workDay = function() { return '2026-01-02'; };
        Queues.recordWork(name, 70);
        Queues.flushWorkTimes();
        equal(JobWorkStats.find({type: name}).count(), 2, 'one doc per day');
        equal(JobWorkStats.findOne({type: name, day: '2026-01-02'}).max, 70, 'with that day\'s numbers');

        equal(workDay().length, 10, 'the real day is YYYY-MM-DD');
      } finally {
        Queues.workDay = workDay;
        JobWorkStats.remove({type: name});
      }
    });

    run('job timing: the midnight stats reset leaves JobWorkStats alone', function() {
      if (!isWorker) return 'skip';
      var name = type();
      try {
        JobWorkStats.insert({type: name, day: '2026-01-01', count: 1, total: 5, max: 5, last: 5});
        Queues.resetQueueStats.handler({data: {jobName: 'resetQueueStats'}});
        assert(waitFor(function() { return KueStats.find().count() === 0; }, 5000), 'KueStats is cleared');
        equal(JobWorkStats.find({type: name}).count(), 1, 'JobWorkStats is kept');
      } finally {
        JobWorkStats.remove({type: name});
      }
    });
  };
}
