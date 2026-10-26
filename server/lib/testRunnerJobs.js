// Running queue jobs in tests (Oct 2026). Loaded after server/lib/testRunner.js
// (same folder, sorts after it).
//
// A job's handler is called directly, inside the test's fiber, so its work has
// finished when dTest.runJob returns, and nothing else runs in between.

if (Meteor.isServer) {

  // Runs job name's handler with data, the way Bull would hand it a job, and
  // returns what it returned. A handler is wrapped in Meteor.bindEnvironment,
  // which logs an exception instead of throwing it: runJob throws it instead,
  // unless opts.allowError, when it is returned as {error}. opts.job(job), when
  // given, sees the job first; job.progressed lists what it passed to progress().
  dTest.runJob = function(name, data, opts) {
    opts = opts || {};
    var queue = Queues[name];
    if (!queue || !queue.handler) {
      throw new Error('FAIL: no handler for job ' + name + ' (handlers only exist on the worker)');
    }
    var job = {id: 'test-' + Random.id(), data: _.extend({jobName: name}, data || {}), progressed: []};
    // a promise, as Bull 4's job.progress returns
    job.progress = function(percent) { job.progressed.push(percent); return Promise.resolve(); };
    if (opts.job) opts.job(job);

    var logged = [];
    var debug = Meteor._debug;
    Meteor._debug = function() {
      var error = _.find(_.toArray(arguments), function(a) { return a instanceof Error; });
      if (error) {
        logged.push(error);
      } else {
        debug.apply(this, arguments);
      }
    };
    var result;
    try {
      // an async handler rejects instead (Queues.runJob logs that as
      // "Exception in job <name>")
      result = dTest.settle(queue.handler(job));
    } catch (error) {
      logged.push(error instanceof Error ? error : new Error(String(error)));
    } finally {
      Meteor._debug = debug;
    }

    if (logged.length) {
      if (opts.allowError) {
        return {error: logged[0]};
      }
      throw new Error('FAIL: job ' + name + ' threw: ' + (logged[0].stack || logged[0].message));
    }
    return opts.allowError ? {result: result} : result;
  };

  // Replaces Queues.addAsync while fn runs (and the promise it returns
  // settles), so the jobs it adds are recorded and not run; each resolves with
  // true. Returns the jobs: [{name, data, options, uniqueId}].
  dTest.recordJobs = function(fn) {
    var jobs = [];
    var original = Queues.addAsync;
    Queues.addAsync = async function(jobName, data, options, uniqueId) {
      jobs.push({name: jobName, data: data, options: options, uniqueId: uniqueId});
      return true;
    };
    try {
      dTest.settle(fn(jobs));
    } finally {
      Queues.addAsync = original;
    }
    return jobs;
  };

  // the recorded jobs called name
  dTest.jobsNamed = function(jobs, name) {
    return _.filter(jobs, function(j) { return j.name == name; });
  };
}
