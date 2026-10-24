// Cron tests: what each SyncedCron entry queues, and when (Oct 2026).
//
// Each cron's job function is called directly with Queues.add recorded
// (dTest.recordJobs), so nothing it queues runs. The schedules are read by
// handing each entry a parser that records what it asks for. The tests
// describe what the crons do today.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('crons (server/cronTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;

      if (process.env.DOMINUS_WORKER != 'true' || typeof SyncedCron === 'undefined') {
        run('crons: need the worker', function() { return 'skip'; });
        return;
      }

      var w = dTest.buildGameWorld({players: 2});
      var ended = t.createTestGame({name: 'Ended ' + Random.id(4), hasStarted: true, hasEnded: true, isStarting: true});
      var test = dTest.contractTest(run, function() {
        w.removeArmies();
        Armypaths.remove({gameId: {$in: [w.gameId, ended._id]}});
        Battles2.remove({gameId: {$in: [w.gameId, ended._id]}});
      });

      // the jobs a cron queues
      function runCron(name) {
        var entry = SyncedCron._entries[name];
        if (!entry) throw new Error('FAIL: no cron called ' + name);
        return dTest.recordJobs(function() { entry.job(); });
      }

      function names(jobs) {
        return _.pluck(jobs, 'name').sort();
      }

      // the jobs called name, for the world's game or about one of ids
      function forWorld(jobs, name) {
        return _.filter(dTest.jobsNamed(jobs, name), function(j) { return j.data.gameId == w.gameId; });
      }

      function minutesAgo(n) {
        return moment().subtract(n, 'minutes').toDate();
      }

      // an army for player i that runs none of its jobs
      function quietArmy(i, soldiers, at) {
        var army;
        dTest.recordJobs(function() { army = w.makeArmy(i, soldiers, at); });
        return army;
      }

      try {

        test('every cron and its schedule', function() {
          var parser = {cron: function(expression, hasSeconds) { return expression + (hasSeconds ? ' (with seconds)' : ''); }};
          var schedules = {};
          _.each(SyncedCron._entries, function(entry, name) { schedules[name] = entry.schedule(parser); });
          equal(JSON.stringify(schedules), JSON.stringify({
            'clean up old jobs': '* * * * *',
            'resume stuck job queue': '* * * * *',
            'army path speed jobs': '*/2 * * * * * (with seconds)',
            '5 sec job': '*/5 * * * * * (with seconds)',
            'battle job': '*/20 * * * * * (with seconds)',
            '1 min job': '* * * * *',
            '5 min job': '*/5 * * * *',
            '10 min job': '*/10 * * * *',
            '30 min job': '*/30 * * * *',
            'midnight job': '00 00 * * *'
          }), 'schedules');
        });

        test('army path speed jobs: queues the next step for each path and army that needs one', function() {
          var army = quietArmy(0, {footmen: 2});
          Armies.update(army._id, {$set: {speed: null}});
          var base = {gameId: w.gameId, armyId: army._id, user_id: army.user_id, x: army.x, y: army.y, paused: false};
          var unrouted = Armypaths.insert(_.extend({index: 0, countryIds: null, hexes: null, speed: 1, distance: null, time: null}, base));
          var noHexes = Armypaths.insert(_.extend({index: 1, countryIds: ['c'], hexes: null, speed: 1, distance: null, time: null}, base));
          var noTime = Armypaths.insert(_.extend({index: 2, countryIds: ['c'], hexes: [], speed: 2, distance: 3, time: null}, base));
          var dirty = Armypaths.insert(_.extend({index: 3, countryIds: ['c'], hexes: [], speed: 2, distance: 3, time: 6, dirtyMoveTotals: true}, base));
          var done = Armypaths.insert(_.extend({index: 4, countryIds: ['c'], hexes: [], speed: 2, distance: 3, time: 6, dirtyMoveTotals: false}, base));

          var jobs = runCron('army path speed jobs');
          var mine = _.filter(jobs, function(j) {
            var data = j.data;
            return (data.path && data.path.armyId == army._id) || data.armyId == army._id || (data.army && data.army._id == army._id);
          });
          var byName = _.groupBy(mine, 'name');
          equal(JSON.stringify(_.pluck(byName.findCountriesInPath, 'uniqueId')), JSON.stringify([unrouted]), 'findCountriesInPath for the unrouted path, unique by path');
          equal(JSON.stringify(_.pluck(byName.pathToHex, 'uniqueId')), JSON.stringify([noHexes]), 'pathToHex for the path with countries and no hexes');
          equal(JSON.stringify(_.map(byName.updatePathTime, function(j) { return j.data.path._id; })), JSON.stringify([noTime]), 'updatePathTime for the path with no time');
          equal(JSON.stringify(_.map(byName.updateArmyMoveTotals, function(j) { return j.data.armyId; })), JSON.stringify([army._id]), 'updateArmyMoveTotals for the dirty path\'s army');
          equal((byName.updateMoveSpeed || []).length, 1, 'updateMoveSpeed for the army with no speed');
          equal(byName.updateMoveSpeed[0].data.army.footmen, 2, 'with its soldiers');
          assert(!_.find(mine, function(j) { return j.data.path && j.data.path._id == done; }), 'nothing for a finished path');
        });

        test('5 sec job: moves armies and collects all three kinds of income', function() {
          var jobs = runCron('5 sec job');
          equal(JSON.stringify(names(jobs)), JSON.stringify(['collectCapitalIncome', 'collectCastleIncome', 'collectVillageIncome', 'moveArmiesJob']), 'jobs');
          assert(_.every(jobs, function(j) { return j.uniqueId === false; }), 'none unique');
        });

        test('battle job: re-runs each unfinished battle of a running game once its round interval has passed', function() {
          var interval = _gs.battles(w.gameId, 'battleInterval');
          var old = moment().subtract(interval + 1000, 'ms').toDate();
          Battles2.insert({gameId: w.gameId, x: 1, y: 1, isOver: false, updatedAt: old});
          Battles2.insert({gameId: w.gameId, x: 2, y: 2, isOver: false, updatedAt: new Date()});
          Battles2.insert({gameId: w.gameId, x: 3, y: 3, isOver: true, updatedAt: old});
          Battles2.insert({gameId: ended._id, x: 4, y: 4, isOver: false, updatedAt: old});

          var jobs = runCron('battle job');
          var battles = dTest.jobsNamed(jobs, 'runBattle');
          var ours = _.filter(battles, function(j) { return _.contains([w.gameId, ended._id], j.data.gameId); });
          equal(JSON.stringify(_.pluck(ours, 'uniqueId')), JSON.stringify([w.gameId + '_1_1']), 'only the due, unfinished battle of the running game, unique by hex');
        });

        test('1 min job: checks for games to close, end and start, and finishes villages in each running game', function() {
          var jobs = runCron('1 min job');
          ['checkForGameClose', 'checkForGameEnd', 'checkForGameStart'].forEach(function(name) {
            equal(dTest.jobsNamed(jobs, name).length, 1, name + ' once');
          });
          equal(forWorld(jobs, 'villageConstructionJob').length, 1, 'villageConstructionJob for the running game');
          assert(!_.find(dTest.jobsNamed(jobs, 'villageConstructionJob'), function(j) { return j.data.gameId == ended._id; }), 'not for an ended game');
        });

        test('5 min job: expires past moves', function() {
          equal(JSON.stringify(names(runCron('5 min job'))), JSON.stringify(['expirePastMoves']), 'jobs');
        });

        test('10 min job: game stats and both ranks for each running game, unique by game', function() {
          var jobs = runCron('10 min job');
          ['gamestats_job', 'updateIncomeRank', 'updateVassalRank'].forEach(function(name) {
            var mine = forWorld(jobs, name);
            equal(mine.length, 1, name + ' for the running game');
            equal(mine[0].uniqueId, w.gameId, name + ' unique by game');
            assert(!_.find(dTest.jobsNamed(jobs, name), function(j) { return j.data.gameId == ended._id; }), name + ' not for an ended game');
          });
        });

        test('30 min job: market history, taxes, tree and income stats for each running game, and removeStuckBattles once per game', function() {
          var jobs = runCron('30 min job');
          equal(forWorld(jobs, 'record_market_history')[0].data.quantity, 0, 'market history with no quantity');
          ['spendTaxes', 'generateTree', 'updateIncomeStats'].forEach(function(name) {
            equal(forWorld(jobs, name).length, 1, name + ' for the running game');
            equal(forWorld(jobs, name)[0].uniqueId, w.gameId, name + ' unique by game');
          });
          var running = Games.find({hasStarted: true, hasEnded: false}).count();
          equal(dTest.jobsNamed(jobs, 'removeStuckBattles').length, running, 'removeStuckBattles, which covers every game, queued once per running game');
          assert(!_.find(jobs, function(j) { return j.data.gameId == ended._id; }), 'nothing for an ended game');
        });

        test('midnight job: resets queue stats, records vassal counts per game and rebuilds every game\'s allies in one job', function() {
          var jobs = runCron('midnight job');
          equal(dTest.jobsNamed(jobs, 'resetQueueStats').length, 1, 'resetQueueStats');
          equal(forWorld(jobs, 'dailystatsNumVassalsEveryone')[0].uniqueId, w.gameId, 'dailystatsNumVassalsEveryone for the running game');
          var allies = dTest.jobsNamed(jobs, 'updateAllKingsAllies');
          equal(allies.length, 1, 'one updateAllKingsAllies');
          equal(allies[0].uniqueId, 'allGames', 'for every game');
          equal(allies[0].data.gameId, undefined, 'with no gameId');
        });

        test('clean up old jobs: cleans every queue\'s failed, completed, waiting and active jobs by age', function() {
          var cleaned = [];
          var originals = {};
          Queues.queueNames.forEach(function(name) {
            originals[name] = Queues[name].clean;
            Queues[name].clean = function(grace, state) { cleaned.push(name + ' ' + state + ' ' + grace); return Promise.resolve([]); };
          });
          try {
            SyncedCron._entries['clean up old jobs'].job();
          } finally {
            Queues.queueNames.forEach(function(name) { Queues[name].clean = originals[name]; });
          }
          equal(cleaned.length, Queues.queueNames.length * 4, 'four cleans per queue');
          var first = Queues.queueNames[0];
          equal(JSON.stringify(cleaned.slice(0, 4)), JSON.stringify([first + ' failed ' + 1000 * 60 * 60 * 6, first + ' completed ' + 1000 * 60 * 5,
            first + ' wait ' + 1000 * 60 * 60, first + ' active ' + 1000 * 60 * 60]), 'failed after 6 hours, completed after 5 minutes, waiting and active after an hour');
        });

        test('resume stuck job queue: calls Queues.resumeIfStuck', function() {
          var calls = 0;
          var resume = Queues.resumeIfStuck;
          Queues.resumeIfStuck = function() { calls++; return false; };
          try {
            SyncedCron._entries['resume stuck job queue'].job();
          } finally {
            Queues.resumeIfStuck = resume;
          }
          equal(calls, 1, 'called once');
        });

        // when each cron next runs, as SyncedCron schedules it
        test('every cron next runs on its own boundary, within one interval', function() {
          var now = Date.now();
          var seconds = {'army path speed jobs': 2, '5 sec job': 5, 'battle job': 20, 'clean up old jobs': 60,
            'resume stuck job queue': 60, '1 min job': 60, '5 min job': 300, '10 min job': 600, '30 min job': 1800};
          _.each(seconds, function(interval, name) {
            var next = SyncedCron.nextScheduledAtDate(name);
            assert(next instanceof Date, name + ': has a next run');
            // later.js keeps the milliseconds of the time it was asked at;
            // SyncedCron cuts them off the tick's intendedAt
            next.setMilliseconds(0);
            assert(next.getTime() > now - 2000 && next.getTime() <= now + interval * 1000, name + ': next run ' + next.toISOString() + ' is within ' + interval + 's');
            // the boundaries are local time, and every zone is a whole number of minutes from UTC
            equal((next.getSeconds() + 60 * next.getMinutes()) % interval, 0, name + ': on a ' + interval + 's boundary');
          });
          var midnight = SyncedCron.nextScheduledAtDate('midnight job');
          midnight.setMilliseconds(0);
          equal(midnight.getHours() + ':' + midnight.getMinutes() + ':' + midnight.getSeconds(), '0:0:0', 'midnight job: at midnight, server time');
          assert(midnight.getTime() > now && midnight.getTime() <= now + 24 * 60 * 60 * 1000, 'midnight job: within a day');
        });

        // SyncedCron._entryWrapper is what the timer calls on each tick: it
        // claims the tick in cronHistory and then runs the job. Worker and
        // web share the database, and during a deploy two workers can run at
        // once, so a tick that is already claimed must not run again.
        test('a tick runs its job once, records it, and a second claim of the same tick is skipped', function() {
          var name = 'cronTests ' + Random.id(6);
          var runs = [];
          SyncedCron.add({name: name, schedule: function(parser) { return parser.cron('* * * * *'); }, job: function(intendedAt) {
            // a synchronous collection call, as every cron job makes
            runs.push({intendedAt: intendedAt, games: Games.find({_id: w.gameId}).count()});
            return 'ran';
          }});
          try {
            var entry = SyncedCron._entries[name];
            var tick = new Date(Date.now() - 1234);
            equal(dTest.throws(function() { return SyncedCron._entryWrapper(entry)(tick); }), null, 'first claim');
            equal(dTest.throws(function() { return SyncedCron._entryWrapper(entry)(tick); }), null, 'second claim of the same tick does not throw');
            equal(runs.length, 1, 'the job ran once');
            equal(runs[0].games, 1, 'and could read the database');
            equal(runs[0].intendedAt.getMilliseconds(), 0, 'intendedAt is cut to the second');
            var history = SyncedCron._collection.find({name: name}).fetch();
            equal(history.length, 1, 'one cronHistory record');
            equal(history[0].intendedAt.getTime(), runs[0].intendedAt.getTime(), 'for the tick');
            equal(history[0].result, 'ran', 'with the result');
            assert(history[0].finishedAt instanceof Date, 'and finishedAt');

            equal(dTest.throws(function() { return SyncedCron._entryWrapper(entry)(new Date(tick.getTime() + 60000)); }), null, 'the next tick');
            equal(runs.length, 2, 'runs again');
          } finally {
            delete SyncedCron._entries[name];
            SyncedCron._collection.remove({name: name});
          }
        });

        test('a job that throws is recorded with its error, and does not throw out of the tick', function() {
          var name = 'cronTests ' + Random.id(6);
          SyncedCron.add({name: name, schedule: function(parser) { return parser.cron('* * * * *'); }, job: function() {
            throw new Error('cron boom');
          }});
          try {
            equal(dTest.throws(function() { return SyncedCron._entryWrapper(SyncedCron._entries[name])(new Date()); }), null, 'the tick');
            var history = SyncedCron._collection.find({name: name}).fetch();
            equal(history.length, 1, 'one cronHistory record');
            assert(history[0].finishedAt instanceof Date, 'finished');
            assert(String(history[0].error).indexOf('cron boom') !== -1, 'with the error');
          } finally {
            delete SyncedCron._entries[name];
            SyncedCron._collection.remove({name: name});
          }
        });

      } finally {
        t.cleanup(ended._id);
        w.cleanup();
      }
    });
  });
}
