// Tests for the test runner itself (server/lib/testRunner.js), Oct 2026.
// The runner has to report async mistakes as failures before any server code
// is converted to async, or a converted function that rejects would pass.
//
// They run as part of runAllTests, so the same rule applies: only against a
// local development database.

if (Meteor.isServer) {

  dTest.addSuite('test runner (server/lib/testRunner.js)', function(run, t) {
    var assert = t.assert;
    var equal = t.equal;

    function later(ms, fn) {
      return new Promise(function(resolve, reject) {
        setTimeout(function() {
          try { resolve(fn()); } catch (e) { reject(e); }
        }, ms);
      });
    }

    // a run of one suite, separate from the run these tests are part of
    function runInner(fn) {
      return dTest.runSuites([{name: 'inner', fn: fn}], t);
    }

    function find(out, name) {
      return _.findWhere(out.results, {name: name});
    }

    run('runner: a failing test fails the run', function() {
      var runner = dTest.createRunner();
      runner.run('fails', function() { throw new Error('FAIL: planted'); });
      runner.run('passes', function() {});
      equal(runner.failed, 1, 'one failure');
      equal(runner.passed, 1, 'one pass');
      equal(runner.results[0].error, 'FAIL: planted', 'error message kept');
    });

    run('runner: a test whose promise rejects fails, and is waited for', function() {
      var runner = dTest.createRunner();
      runner.run('rejects now', function() { return Promise.reject(new Error('boom')); });
      runner.run('rejects later', function() { return later(30, function() { throw new Error('late boom'); }); });
      equal(runner.failed, 2, 'both fail');
      equal(runner.results[0].error, 'boom', 'first error');
      equal(runner.results[1].error, 'late boom', 'second error');
    });

    run('runner: an async test that resolves passes only after it finishes', function() {
      var runner = dTest.createRunner();
      var finished = false;
      runner.run('resolves later', function() { return later(30, function() { finished = true; }); });
      runner.run('skips later', function() { return later(10, function() { return 'skip'; }); });
      assert(finished, 'the run waited for the promise');
      equal(runner.passed, 1, 'resolved test passes');
      equal(runner.skipped, 1, 'a promise of skip is a skip');
    });

    run('runner: throws() reports a rejected promise and a rejecting async method', function() {
      var error = new Error('rejected');
      equal(dTest.throws(function() { return Promise.reject(error); }), error, 'rejection returned');
      equal(dTest.throws(function() { return later(10, function() { return 1; }); }), null, 'resolved promise is not a throw');
      equal(dTest.throws(function() { return 1; }), null, 'plain return is not a throw');

      var name = 'testRunnerAsync_' + Random.id(4);
      Meteor.server.method_handlers[name] = function() {
        return later(10, function() { throw new Meteor.Error('async-refused'); });
      };
      try {
        var inv = {userId: null, isSimulation: false, connection: null, unblock: function() {}, setUserId: function() {}};
        var e = dTest.throws(function() {
          return DDP._CurrentInvocation.withValue(inv, function() {
            return dTest.settle(Meteor.server.method_handlers[name].apply(inv, []));
          });
        });
        assert(e && e.error === 'async-refused', 'rejecting method reported');
      } finally {
        delete Meteor.server.method_handlers[name];
      }
    });

    run('runner: an unhandled rejection fails the run and names the test', function() {
      var out = runInner(function(run) {
        run('leaks a rejection', function() {
          Promise.reject(new Error('leaked rejection'));
        });
      });
      equal(find(out, 'leaks a rejection').status, 'PASS', 'the leaking test itself returned normally');
      var check = find(out, 'no unhandled rejections or uncaught exceptions during the run');
      equal(check.status, 'FAIL', 'the run fails');
      assert(check.error.indexOf('leaked rejection') !== -1, 'error is reported');
      assert(check.error.indexOf('during "leaks a rejection"') !== -1, 'test is named: ' + check.error);
      equal(out.failed, 1, 'one failure');
    });

    run('runner: an uncaught exception fails the run', function() {
      var out = runInner(function(run) {
        run('throws from a timer', function() {
          setTimeout(function() { throw new Error('timer threw'); }, 0);
        });
      });
      var check = find(out, 'no unhandled rejections or uncaught exceptions during the run');
      equal(check.status, 'FAIL', 'the run fails');
      assert(check.error.indexOf('uncaught exception') !== -1 && check.error.indexOf('timer threw') !== -1, 'reported: ' + check.error);
    });

    run('runner: a clean run passes its process check', function() {
      var out = runInner(function(run) {
        run('fine', function() { return later(5, function() {}); });
      });
      equal(out.failed, 0, 'no failures');
      equal(out.passed, 2, 'the test and the process check pass');
    });

    run('runner: a suite that throws outside run() is reported, and later suites still run', function() {
      var out = dTest.runSuites([
        {name: 'broken', fn: function() { throw new Error('suite setup failed'); }},
        {name: 'fine', fn: function(run) { run('still runs', function() {}); }}
      ], t);
      equal(find(out, 'suite broken finished').status, 'FAIL', 'broken suite reported');
      equal(find(out, 'still runs').status, 'PASS', 'next suite ran');
    });

    run('runner: cron is paused during a run and resumed after', function() {
      var calls = [];
      var cron = {running: true, pause: function() { calls.push('pause'); this.running = false; }, start: function() { calls.push('start'); this.running = true; }};
      var resume = dTest.pauseBackground(cron);
      equal(cron.running, false, 'paused');
      resume();
      equal(calls.join(','), 'pause,start', 'paused then started');

      var stopped = {running: false, pause: function() { calls.push('pause2'); }, start: function() { calls.push('start2'); }};
      dTest.pauseBackground(stopped)();
      equal(calls.join(','), 'pause,start', 'a cron that was not running is left alone');

      if (typeof SyncedCron !== 'undefined' && process.env.DOMINUS_WORKER == 'true') {
        equal(SyncedCron.running, false, 'SyncedCron is paused during this run');
      }
    });

    run('runner: refuses to run in production', function() {
      var restore = Meteor.isProduction;
      Meteor.isProduction = true;
      try {
        ['runAllTests', 'runGameCreationTests'].forEach(function(method) {
          var inv = {userId: null, isSimulation: false, connection: null, unblock: function() {}, setUserId: function() {}};
          var e = dTest.throws(function() {
            return DDP._CurrentInvocation.withValue(inv, function() {
              return Meteor.server.method_handlers[method].apply(inv, []);
            });
          });
          assert(e && e.error === 'not-allowed' && /production/.test(e.reason), method + ' refused in production');
        });
      } finally {
        Meteor.isProduction = restore;
      }
    });

    run('runner: a run never starts while another is in progress', function() {
      var inv = {userId: null, isSimulation: false, connection: null, unblock: function() {}, setUserId: function() {}};
      var e = dTest.throws(function() {
        return DDP._CurrentInvocation.withValue(inv, function() {
          return Meteor.server.method_handlers.runAllTests.apply(inv, []);
        });
      });
      assert(e && e.error === 'already-running', 'nested run refused');
    });
  });
}
