// Tests for Queues.timeWork (packages/dominus-queue/queue.js, Oct 2026): every
// job handler's real work is timed, without changing what Bull sees.
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


    run('job timing: a fiber-bound handler is timed to the end of its work, and Bull still gets undefined right away', function() {
      var name = type();
      var finished = false;
      var wrapped = Queues.timeWork(name, Meteor.bindEnvironment(function(job) {
        Meteor._sleepForMs(400);
        finished = true;
        return Promise.resolve();
      }));

      var out = callOutsideFiber(function() { return wrapped({data: {}}); });
      assert(out.returned, 'returned');
      equal(out.value, undefined, 'Bull gets undefined, as before');
      equal(finished, false, 'it returned before the work finished, as before');

      assert(waitFor(function() { return Queues.workTimes[name]; }, 5000), 'the work was timed');
      assert(finished, 'after the work finished');
      var times = Queues.workTimes[name];
      equal(times.count, 1, 'once');
      assert(times.max >= 400 && times.max < 5000, 'for as long as the work took (' + times.max + 'ms)');
      delete Queues.workTimes[name];
    });

    run('job timing: called from inside a fiber, the handler has finished when it returns', function() {
      var name = type();
      var finished = false;
      var wrapped = Queues.timeWork(name, Meteor.bindEnvironment(function(job) {
        Meteor._sleepForMs(200);
        finished = true;
      }));
      wrapped({data: {}});
      assert(finished, 'the work is done');
      assert(Queues.workTimes[name] && Queues.workTimes[name].max >= 200, 'and timed');
      delete Queues.workTimes[name];
    });

    run('job timing: a plain handler\'s promise reaches Bull unchanged and is timed until it settles', function() {
      var name = type();
      var resolve;
      var promise = new Promise(function(r) { resolve = r; });
      var wrapped = Queues.timeWork(name, function(job) { return promise; });

      var out = callOutsideFiber(function() { return wrapped({data: {}}); });
      assert(out.value === promise, 'Bull gets the same promise');
      Meteor._sleepForMs(200);
      assert(!Queues.workTimes[name], 'not timed while it is pending');
      resolve();
      assert(waitFor(function() { return Queues.workTimes[name]; }, 5000), 'timed once it resolves');
      assert(Queues.workTimes[name].max >= 200, 'including the time it was pending');
      delete Queues.workTimes[name];

      // a rejected promise is passed on too, and still timed
      var failing = Promise.reject(new Error('test'));
      failing.catch(function() {});
      wrapped = Queues.timeWork(name, function(job) { return failing; });
      out = callOutsideFiber(function() { return wrapped({data: {}}); });
      assert(out.value === failing, 'Bull gets the rejected promise');
      assert(waitFor(function() { return Queues.workTimes[name]; }, 5000), 'a failure is timed');
      delete Queues.workTimes[name];

      // a handler that throws throws to Bull
      wrapped = Queues.timeWork(name, function(job) { throw new Error('thrown'); });
      var error = null;
      try {
        wrapped({data: {}});
      } catch (e) {
        error = e;
      }
      equal(error && error.message, 'thrown', 'a thrown error reaches Bull');
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
