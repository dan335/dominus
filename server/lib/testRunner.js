// Server test runner (Oct 2026).
// Run from meteor shell:   Meteor.call('runAllTests')
//                      or   Meteor.call('runAllTests', 'spectator')  (suites whose name contains it)
// runGameCreationTests is the same thing under its old name.
//
// Every server suite (server/*Tests.js) registers itself with dTest.addSuite and
// runs here. Like the suites, this only runs against a local development
// database: the suites wipe whole collections. The method refuses client calls
// and production builds.
//
// The runner is async-aware, so suites keep working as server code moves to
// async/await: a test that returns a promise is waited on, and a rejected
// promise fails the test. An unhandled rejection or uncaught exception anywhere
// in the process during a run fails the run, since those are what a missing
// await looks like.

if (Meteor.isServer) {

  dTest = {};

  var suites = [];

  // fn(run, t) is called once per run, in the order suites were added
  dTest.addSuite = function(name, fn) {
    suites.push({name: name, fn: fn});
  };

  dTest.isPromise = function(value) {
    return !!value && typeof value.then === 'function';
  };

  // waits for a promise inside the current fiber, passes anything else through
  dTest.settle = function(value) {
    return dTest.isPromise(value) ? Promise.await(value) : value;
  };

  // returns the error thrown or the promise rejection, or null
  dTest.throws = function(fn) {
    try {
      dTest.settle(fn());
      return null;
    } catch (e) {
      return e || new Error('threw ' + e);
    }
  };

  dTest.sleep = function(ms) {
    Promise.await(new Promise(function(resolve) { setTimeout(resolve, ms); }));
  };

  // A run(name, fn) and its results. A test can return 'skip' when it doesn't
  // apply to this process, or a promise of either.
  dTest.createRunner = function() {
    var runner = {results: [], passed: 0, failed: 0, skipped: 0, current: null};

    runner.run = function(name, fn) {
      runner.current = name;
      dTest.current = name;  // readable from a second meteor shell when a run hangs
      try {
        if (dTest.settle(fn()) === 'skip') {
          runner.results.push({name: name, status: 'SKIP'});
          runner.skipped++;
          return;
        }
        runner.results.push({name: name, status: 'PASS'});
        runner.passed++;
      } catch (e) {
        runner.results.push({name: name, status: 'FAIL', error: (e && e.message) || String(e)});
        runner.failed++;
      } finally {
        // Node reports an unhandled rejection after the current tick, so wait
        // one turn of the event loop to blame it on the test that caused it
        dTest.sleep(0);
        runner.current = null;
      }
    };

    return runner;
  };

  // Records unhandled rejections and uncaught exceptions until stop() is called,
  // with the test that was running when each happened. Watchers nest: only the
  // innermost one records, so the runner's own tests can make a run fail
  // without failing the run they are part of.
  var watchers = [];
  var listeners = {
    unhandledRejection: function(error) { record('unhandled rejection', error); },
    uncaughtException: function(error) { record('uncaught exception', error); }
  };
  function record(kind, error) {
    var watcher = watchers[watchers.length - 1];
    if (watcher) {
      watcher.events.push({kind: kind, test: watcher.runner.current, error: (error && (error.stack || error.message)) || String(error)});
    }
  }

  var removeListeners = null;
  function addListeners() {
    _.each(listeners, function(fn, name) { process.on(name, fn); });
    return function() {
      _.each(listeners, function(fn, name) { process.removeListener(name, fn); });
    };
  }

  dTest.watchProcess = function(runner) {
    var watcher = {runner: runner, events: []};
    if (!watchers.length) removeListeners = addListeners();
    watchers.push(watcher);
    return {
      events: watcher.events,
      stop: function() {
        watchers = _.without(watchers, watcher);
        if (!watchers.length) {
          removeListeners();
          removeListeners = null;
        }
      }
    };
  };

  // Background work that writes to the game collections on its own timer and
  // would show up as changes made by whatever test happens to be running.
  // SyncedCron only runs in the worker; a job that is already running finishes.
  dTest.pauseBackground = function(cron) {
    cron = cron || (typeof SyncedCron !== 'undefined' ? SyncedCron : null);
    var cronWasRunning = !!(cron && cron.running);
    if (cronWasRunning) cron.pause();
    return function resume() {
      if (cronWasRunning) cron.start();
    };
  };

  dTest.runSuites = function(list, t) {
    var runner = dTest.createRunner();
    dTest.lastRunner = runner;
    var watcher = dTest.watchProcess(runner);
    var resume = dTest.pauseBackground();
    try {
      list.forEach(function(suite) {
        try {
          dTest.settle(suite.fn(runner.run, t));
        } catch (e) {
          // a suite that throws outside run() would otherwise hide its remaining tests
          runner.run('suite ' + suite.name + ' finished', function() { throw e; });
        }
      });
      // let rejections from the last test surface; Node reports them a tick later
      dTest.sleep(100);
    } finally {
      watcher.stop();
      resume();
    }

    runner.run('no unhandled rejections or uncaught exceptions during the run', function() {
      if (watcher.events.length) {
        throw new Error('FAIL: ' + watcher.events.map(function(e) {
          return e.kind + (e.test ? ' during "' + e.test + '"' : '') + ': ' + e.error.split('\n').slice(0, 3).join(' ');
        }).join(' | '));
      }
    });

    return {passed: runner.passed, failed: runner.failed, skipped: runner.skipped, results: runner.results, processEvents: watcher.events};
  };

  dTest.print = function(title, out) {
    console.log('\n========================================');
    console.log('  ' + title + ': ' + out.passed + ' passed, ' + out.failed + ' failed, ' + out.skipped + ' skipped');
    console.log('========================================');
    out.results.forEach(function(r) {
      var icon = r.status === 'PASS' ? '+' : (r.status === 'SKIP' ? '-' : 'X');
      console.log('  [' + icon + '] ' + r.name + (r.error ? ' -- ' + r.error : ''));
    });
    console.log('');
  };

  dTest.guard = function(invocation) {
    // Never reachable from a client: the tests remove every document in several collections.
    if (invocation.connection) throw new Meteor.Error('not-allowed');
    if (Meteor.isProduction) throw new Meteor.Error('not-allowed', 'never run the tests against production');
  };

  // Under meteor shell, code runs inside the REPL's domain, and the domain
  // stays entered for the whole event loop while the call waits. Node refuses
  // uncaughtException listeners there (meteor shell then hangs), and the REPL
  // ends the shell call on the first uncaught exception from a timer the code
  // started. So the run leaves the domain until it is done.
  dTest.outsideDomain = function(fn) {
    var domains = [];
    while (process.domain && domains.length < 10) {
      domains.push(process.domain);
      process.domain.exit();
    }
    try {
      return fn();
    } finally {
      domains.reverse().forEach(function(domain) { domain.enter(); });
    }
  };

  // With NODE_V8_COVERAGE set (tests/run-server-tests.sh COVERAGE=1), write
  // out and reset V8's counters before and after a run, so the run's coverage
  // leaves out whatever the worker did outside it. The files written are
  // listed in <list>.txt, which tests/coverage-report.py reads.
  dTest.takeCoverage = function(list) {
    var dir = process.env.NODE_V8_COVERAGE;
    var v8 = Npm.require('v8');
    if (!dir || !v8.takeCoverage) return;
    var fs = Npm.require('fs');
    var before = fs.readdirSync(dir);
    v8.takeCoverage();
    var written = _.difference(fs.readdirSync(dir), before);
    if (written.length) {
      fs.appendFileSync(Npm.require('path').join(dir, list + '.txt'), written.join('\n') + '\n');
    }
  };

  var inProgress = false;

  // filter: only run suites whose name contains it, e.g. 'method contracts'
  function runAllTests(filter) {
    dTest.guard(this);
    check(filter, Match.Optional(String));
    // the runner's own tests call this method; never let it start a second run
    if (inProgress) throw new Meteor.Error('already-running', 'a test run is already in progress');
    inProgress = true;
    try {
      dTest.takeCoverage('before-runs');
      var list = filter ? _.filter(suites, function(suite) { return suite.name.indexOf(filter) !== -1; }) : suites;
      var out = dTest.outsideDomain(function() {
        return dTest.runSuites(list, dTest.helpers);
      });
      dTest.takeCoverage('test-runs');
    } finally {
      inProgress = false;
    }
    dTest.print('Server Tests', out);
    return out;
  }

  Meteor.methods({
    'runAllTests': runAllTests,
    'runGameCreationTests': runAllTests
  });
}
