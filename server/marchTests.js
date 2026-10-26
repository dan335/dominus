// An army's march, move by move (upgrade PR 13b, Oct 2026).
//
// One army marches to three hexes, has its moves reordered and delayed, and
// comes home, on the fixed game clock of the game simulation
// (server/lib/testRunnerSimulation.js): the path jobs, the move job and the
// crons that drive them run as the clock passes their time. The test checks
// the march itself (one hex at a time, the destinations in order, nothing
// while paused, no move before it is due) and compares where the army was
// at each moment with tests/golden/march.json, which was recorded from the
// code before the move jobs became async. A change meant to change how
// armies move needs that file recorded again: each run writes what it got to
// .test-results/march/actual.json.
//
// It runs as part of runAllTests (server/lib/testRunner.js), so the same rule
// applies: only against a local development database.

if (Meteor.isServer) {

  var fs = Npm.require('fs');
  var path = Npm.require('path');

  var SEED = 'dominus march';
  var START_AT = new Date(Date.UTC(2026, 0, 12, 9, 0, 0));
  var GOLDEN = 'tests/golden/march.json';

  var hexDistance = function(x1, y1, x2, y2) {
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs((x1 + y1) - (x2 + y2)));
  };

  var repoPath = function(file) {
    return path.join(dTest.appDir(), file);
  };

  Meteor.startup(function() {
    dTest.addSuite('army march (server/marchTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;

      if (process.env.DOMINUS_WORKER != 'true') {
        await run('army march: needs the worker', function() { return 'skip'; });
        return;
      }

      await run('army march: one hex at a time, to each destination in order, on time, and home', async function() {
        var sim = await dTest.simulation({seed: SEED, startAt: START_AT});
        try {
          await dTest.eachAsync(['marcher', 'neighbour'], async function(name) {
            await sim.addUser(name, {emails: [{address: 'sim_' + name + '@example.com', verified: true}]});
          });
          var game = await dTest.helpers.createTestGame({name: 'March', startAt: dClock.now(), createdAt: dClock.now()});
          sim.gameId = game._id;
          await dTest.eachAsync(sim.users, async function(user) {
            await Gamesignups.insertAsync({gameId: game._id, userId: user._id, username: user.username, createdAt: dClock.now(), usedToken: false});
          });
          await sim.advance(2 * 60 * 1000);

          var castle = await sim.castle('marcher');
          await Players.updateAsync((await sim.player('marcher'))._id, {$inc: {gold: 2000, grain: 2000, lumber: 2000, ore: 2000, wool: 2000, clay: 2000, glass: 500}});
          var hired = dTest.soldierCounts({footmen: 6, cavalry: 4});
          await sim.call('marcher', 'hireArmy', sim.gameId, hired, castle._id, 'castle');
          var soldiersBefore = _.pick(await sim.castle('marcher'), _s.armies.types);
          await sim.call('marcher', 'createArmyFromBuilding', sim.gameId, 'castle', castle._id, hired);
          var army = await Armies.findOneAsync({gameId: sim.gameId, user_id: sim.users.marcher._id});
          assert(army, 'the army was made');

          // three destinations, chosen the same way every time
          var hexes = await Hexes.find({gameId: sim.gameId, hasBuilding: {$ne: true}}, {sort: {x: 1, y: 1}}).fetchAsync();
          hexes = await dTest.filterAsync(hexes, async function(h) { return await Mapmaker.coordsToCountryId(sim.gameId, h.x, h.y); });
          var near = function(from, d, not) {
            var hex = _.find(hexes, function(h) {
              return hexDistance(from.x, from.y, h.x, h.y) == d && hexDistance(castle.x, castle.y, h.x, h.y) >= 2 &&
                !_.some(not, function(n) { return n.x == h.x && n.y == h.y; });
            });
            if (!hex) throw new Error('FAIL: no hex ' + d + ' from ' + from.x + ',' + from.y);
            return {x: hex.x, y: hex.y};
          };
          var a = near(castle, 3, []);
          var b = near(a, 3, [a]);
          var c = near(b, 2, [a, b]);

          // the moves, as the army made them, in seconds from now
          var marchStart = dClock.nowMs();
          var log = [{at: 0, x: army.x, y: army.y}];
          var record = async function() {
            var now = await Armies.findOneAsync(army._id);
            var last = _.last(log);
            if (!now) {
              if (!last.gone) log.push({at: (dClock.nowMs() - marchStart) / 1000, gone: true});
            } else if (now.x != last.x || now.y != last.y) {
              log.push({at: (dClock.nowMs() - marchStart) / 1000, x: now.x, y: now.y});
            }
          };
          var moves = function() { return _.filter(log, function(l) { return !l.gone; }).length - 1; };
          var paths = async function() { return await Armypaths.find({armyId: army._id}).countAsync(); };

          // to a, b and c, then c moved before b
          await dTest.eachAsync([a, b, c], async function(h) { await sim.call('marcher', 'addArmyPath', sim.gameId, h.x, h.y, army._id); });
          var cPath = await Armypaths.findOneAsync({armyId: army._id, x: c.x, y: c.y});
          await sim.call('marcher', 'decreasePathIndex', cPath._id);
          equal(JSON.stringify(await Armypaths.find({armyId: army._id}, {sort: {index: 1}}).mapAsync(function(p) { return [p.x, p.y]; })),
            JSON.stringify([[a.x, a.y], [c.x, c.y], [b.x, b.y]]), 'the order is a, c, b');

          await sim.advance(4 * 60 * 60 * 1000, {waitingFor: 'two moves', until: async function() { await record(); return moves() >= 2; }});

          // delayed for ten minutes: no move
          await sim.call('marcher', 'pauseMovement', army._id);
          var pausedAt = log.length;
          var pausedArmy = await Armies.findOneAsync(army._id);
          await sim.advance(10 * 60 * 1000);
          await record();
          equal(log.length, pausedAt, 'no move while paused');
          equal((await Armies.findOneAsync(army._id)).last_move_at.getTime(), pausedArmy.last_move_at.getTime(), 'and no move in between');
          await sim.call('marcher', 'resumeMovement', army._id);

          await sim.advance(8 * 60 * 60 * 1000, {waitingFor: 'the last destination', until: async function() { await record(); return !await paths(); }});

          // home: it joins the castle when it gets there
          await sim.call('marcher', 'addArmyPath', sim.gameId, castle.x, castle.y, army._id);
          await sim.advance(8 * 60 * 60 * 1000, {waitingFor: 'the army getting home', until: async function() { await record(); return !await Armies.findOneAsync(army._id); }});

          var minutesPerHex = dArmies.speed(sim.gameId, hired);
          var actual = {destinations: {a: a, c: c, b: b, castle: _.pick(castle, 'x', 'y')}, minutesPerHex: minutesPerHex, log: log};
          var out = repoPath('.test-results/march');
          if (!fs.existsSync(out)) fs.mkdirSync(out, {recursive: true});
          fs.writeFileSync(path.join(out, 'actual.json'), JSON.stringify(actual, null, 1) + '\n');

          // one hex at a time; it joins the castle as it steps onto it, so the
          // last step is where it was gone
          assert(_.last(log).gone, 'the army joined the castle');
          var steps = _.filter(log, function(l) { return !l.gone; }).concat([{at: _.last(log).at, x: castle.x, y: castle.y}]);
          for (var n = 1; n < steps.length; n++) {
            equal(hexDistance(steps[n - 1].x, steps[n - 1].y, steps[n].x, steps[n].y), 1, 'move ' + n + ' is to the next hex');
          }

          // to each destination in order, and home (it starts at the castle)
          var visited = [];
          steps.slice(1).forEach(function(s) {
            [a, c, b, castle].forEach(function(h, i) {
              if (s.x == h.x && s.y == h.y && _.last(visited) !== i) visited.push(i);
            });
          });
          var order = _.filter(visited, function(i, n) { return visited.indexOf(i) == n; });
          equal(JSON.stringify(order), JSON.stringify([0, 1, 2, 3]), 'a, then c, then b, then home');
          equal(JSON.stringify(_.pick(await sim.castle('marcher'), _s.armies.types)), JSON.stringify(soldiersBefore), 'with every soldier');

          // never before its time: the slowest soldier sets the pace
          for (var m = 2; m < steps.length; m++) {
            assert(steps[m].at - steps[m - 1].at >= minutesPerHex * 60, 'move ' + m + ' came ' + (steps[m].at - steps[m - 1].at) +
              ' s after the last, sooner than ' + minutesPerHex + ' minutes');
          }

          // where the army was at each moment, against the march recorded before
          var goldenFile = repoPath(GOLDEN);
          if (!fs.existsSync(goldenFile)) {
            throw new Error('FAIL: no ' + GOLDEN + ' to compare with (record it from .test-results/march/actual.json)');
          }
          var golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'));
          equal(JSON.stringify(actual.destinations), JSON.stringify(golden.destinations), 'the same destinations');
          equal(log.length, golden.log.length, 'as many moves as before');
          golden.log.forEach(function(g, n) {
            equal(JSON.stringify(log[n]), JSON.stringify(g), 'move ' + n);
          });
        } finally {
          await sim.finish();
        }
      });
    });
  });
}
