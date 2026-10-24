// The soak test's monitor (T8 of the Meteor upgrade plan, Oct 2026).
//
// Does nothing unless DOMINUS_SOAK_MONITOR is set, and only tests/soak/run.sh
// sets it. Then every DOMINUS_SOAK_MONITOR seconds the process prints one line,
// SOAK_SAMPLE {json}, which tests/soak/report.js reads:
// - every process: its memory, event loop delay and DDP sessions;
// - the worker as well: the job queues' counts, every failed attempt since the
//   last sample, the cron ticks recorded since the last sample, and the
//   invariants of each running game (dTest.gameInvariants in
//   server/lib/testRunnerSimulation.js).
// Every unhandled promise rejection is printed as SOAK_UNHANDLED_REJECTION.

if (Meteor.isServer && process.env.DOMINUS_SOAK_MONITOR) {

  Meteor.startup(function() {
    var seconds = Number(process.env.DOMINUS_SOAK_MONITOR) || 60;
    var isWorker = process.env.DOMINUS_WORKER == 'true';
    var loopDelay = Npm.require('perf_hooks').monitorEventLoopDelay({resolution: 20});
    loopDelay.enable();

    var rejections = 0;
    process.on('unhandledRejection', function(reason) {
      rejections++;
      console.error('SOAK_UNHANDLED_REJECTION', reason && reason.stack ? reason.stack : reason);
    });

    // every failed attempt, retried or not, by queue
    var failedAttempts = {};
    var failedReasons = [];
    if (isWorker) {
      Queues.queueNames.forEach(function(name) {
        Queues[name].on('failed', function(job, error) {
          failedAttempts[name] = (failedAttempts[name] || 0) + 1;
          if (failedReasons.length < 20) {
            failedReasons.push({queue: name, attempt: job && job.attemptsMade, error: String(error && error.message || error).slice(0, 300)});
          }
        });
      });
    }

    // the cron ticks SyncedCron recorded in cronHistory since the last sample.
    // A tick is read 10 seconds after it was due, once its record is surely in.
    var CRON_LAG_MS = 10000;
    var cronFrom = new Date(Date.now() - CRON_LAG_MS);
    var cronLast = {};
    var cronTicks = function() {
      var to = new Date(Date.now() - CRON_LAG_MS);
      var crons = {};
      SyncedCron._collection.find({intendedAt: {$gte: cronFrom, $lt: to}}, {
        fields: {name: 1, intendedAt: 1, finishedAt: 1, error: 1},
        sort: {intendedAt: 1}
      }).forEach(function(tick) {
        var c = crons[tick.name] || (crons[tick.name] = {ticks: 0, errors: 0, unfinished: 0, minGapMs: null, maxGapMs: 0});
        c.ticks++;
        if (tick.error) c.errors++;
        if (!tick.finishedAt) c.unfinished++;
        var at = tick.intendedAt.getTime();
        if (cronLast[tick.name] !== undefined) {
          var gap = at - cronLast[tick.name];
          c.minGapMs = c.minGapMs === null ? gap : Math.min(c.minGapMs, gap);
          c.maxGapMs = Math.max(c.maxGapMs, gap);
        }
        cronLast[tick.name] = at;
      });
      cronFrom = to;
      return {readTo: to.toISOString(), crons: crons, lastTick: _.clone(cronLast)};
    };

    var ms = function(ns) { return Math.round(ns / 1e4) / 100; };

    var sample = function() {
      var memory = process.memoryUsage();
      var sessions = Meteor.server.sessions;
      var out = {
        t: new Date().toISOString(),
        role: isWorker ? 'worker' : 'web',
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
        loopDelayMs: {mean: ms(loopDelay.mean), p99: ms(loopDelay.percentile(99)), max: ms(loopDelay.max)},
        sessions: sessions && typeof sessions.size == 'number' ? sessions.size : _.size(sessions),
        unhandledRejections: rejections
      };
      loopDelay.reset();

      if (isWorker) {
        out.queues = {};
        Queues.queueNames.forEach(function(name) {
          var counts = Promise.await(Queues[name].getJobCounts());
          if (_.some(counts)) out.queues[name] = counts;
        });
        out.failedAttempts = failedAttempts;
        out.failedReasons = failedReasons;
        failedAttempts = {};
        failedReasons = [];
        out.cron = cronTicks();

        out.games = Games.find({hasStarted: true, hasClosed: {$ne: true}}, {fields: {_id: 1, name: 1, hasEnded: 1, dominusAchieved: 1}}).map(function(game) {
          return {
            _id: game._id,
            name: game.name,
            hasEnded: !!game.hasEnded,
            dominusAchieved: !!game.dominusAchieved,
            players: Players.find({gameId: game._id}).count(),
            castles: Castles.find({gameId: game._id}).count(),
            villages: Villages.find({gameId: game._id}).count(),
            armies: Armies.find({gameId: game._id}).count(),
            moves: Armypaths.find({gameId: game._id}).count(),
            battles: Battles2.find({gameId: game._id, isOver: false}).count(),
            battlesOver: Battles2.find({gameId: game._id, isOver: true}).count(),
            kings: Players.find({gameId: game._id, is_king: true}).count(),
            problems: dTest.gameInvariants(game._id)
          };
        });
      }

      console.log('SOAK_SAMPLE ' + JSON.stringify(out));
    };

    Meteor.setInterval(function() {
      try {
        sample();
      } catch (e) {
        console.error('SOAK_MONITOR_ERROR', e && e.stack ? e.stack : e);
      }
    }, seconds * 1000);
    console.log('SOAK_MONITOR started, a sample every ' + seconds + ' seconds');
  });
}
