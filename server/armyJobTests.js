// Job tests: army movement and battles (Oct 2026).
//
// Each queue job is run by calling its handler directly (dTest.runJob,
// server/lib/testRunnerJobs.js), so its work has finished when the test looks
// at the result, in a real started game (server/lib/testRunnerWorld.js). The
// jobs a handler adds are recorded rather than run (dTest.recordJobs). The
// tests describe what the jobs do today, so the Meteor upgrade can be checked
// against them. Where today's behaviour is a bug, the test says so in its
// name; fixing the bug means changing that test on purpose.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('jobs: armies and battles (server/armyJobTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var runJob = dTest.runJob;

      if (process.env.DOMINUS_WORKER != 'true') {
        run('army jobs: need the worker', function() { return 'skip'; });
        return;
      }

      var w = dTest.buildGameWorld({players: 2});

      var test = dTest.contractTest(run, function() {
        w.removeArmies();
        Armypaths.remove({gameId: w.gameId});
        Battles2.remove({gameId: w.gameId});
      });

      // a path doc for army, inserted the way addArmyPath and its jobs leave it
      function insertPath(army, fields) {
        return Armypaths.insert(_.extend({gameId: army.gameId, x: army.x, y: army.y, index: 0, armyId: army._id,
          user_id: army.user_id, createdAt: new Date(), paused: false, countryIds: null, hexes: null,
          distance: null, time: null, speed: 1, last_move_at: new Date(), dirtyMoveTotals: false}, fields || {}));
      }

      function minutesAgo(n) {
        return moment().subtract(n, 'minutes').toDate();
      }

      // free hexes next to each other in the same country, walking from a free hex
      function freeLine(count) {
        var start = w.freeHex();
        var line = [Hexes.findOne({gameId: w.gameId, x: start.x, y: start.y})];
        var taken = {};
        Castles.find({gameId: w.gameId}).forEach(function(c) { taken[c.x + '_' + c.y] = true; });
        Villages.find({gameId: w.gameId}).forEach(function(v) { taken[v.x + '_' + v.y] = true; });
        taken[start.x + '_' + start.y] = true;
        while (line.length < count) {
          var last = line[line.length - 1];
          var candidates = Hexes.find({gameId: w.gameId, countryId: last.countryId, hasBuilding: false,
            x: {$gte: last.x - 1, $lte: last.x + 1}, y: {$gte: last.y - 1, $lte: last.y + 1}}).fetch();
          // the six neighbours of an axial hex coordinate
          var next = _.find(candidates, function(h) {
            return !taken[h.x + '_' + h.y] && Math.abs((h.x - last.x) + (h.y - last.y)) <= 1 && !(h.x == last.x && h.y == last.y);
          });
          if (!next) throw new Error('FAIL: no line of ' + count + ' free hexes');
          taken[next.x + '_' + next.y] = true;
          line.push(next);
        }
        return line.map(function(h) { return {x: h.x, y: h.y, countryId: h.countryId}; });
      }


      try {

        // --- updatePathTime, updateArmyMoveTotals, updateMoveSpeed ---

        test('updatePathTime: sets a path\'s time from its speed and distance, in ms', function() {
          var army = w.makeArmy(0);
          var pathId = insertPath(army);
          runJob('updatePathTime', {path: {_id: pathId, armyId: army._id, speed: 2, distance: 3}});
          var path = Armypaths.findOne(pathId);
          equal(path.time, 2 * 3 * 60 * 1000, 'time');
          equal(path.dirtyMoveTotals, true, 'marks the army\'s totals dirty');

          // a path without a number for speed is refused and changes nothing
          var res = runJob('updatePathTime', {path: {_id: pathId, armyId: army._id, speed: 'fast', distance: 3}}, {allowError: true});
          assert(res.error, 'a bad speed throws');
          equal(Armypaths.findOne(pathId).time, 2 * 3 * 60 * 1000, 'time unchanged');
        });

        test('updateArmyMoveTotals: sums the army\'s path times and distances and clears the dirty flags', function() {
          var army = w.makeArmy(0);
          var a = insertPath(army, {index: 0, time: 1000, distance: 1, dirtyMoveTotals: true});
          var b = insertPath(army, {index: 1, time: 2000, distance: 2, dirtyMoveTotals: true});
          var c = insertPath(army, {index: 2, time: null, distance: null, dirtyMoveTotals: true});
          runJob('updateArmyMoveTotals', {armyId: army._id});
          var after = Armies.findOne(army._id);
          equal(after.moveTime, 3000, 'moveTime');
          equal(after.moveDistance, 3, 'moveDistance');
          [a, b, c].forEach(function(id) {
            equal(Armypaths.findOne(id).dirtyMoveTotals, false, 'path ' + id + ' no longer dirty');
          });
        });

        test('updateMoveSpeed: sets the army\'s speed from its slowest soldier and clears its path times', function() {
          var army = w.makeArmy(0, {footmen: 2, catapults: 1});
          var pathId = insertPath(army, {speed: 99, time: 12345});
          runJob('updateMoveSpeed', {army: army});
          // speed is minutes per hex: 60 / the slowest soldier's hexes per hour
          var slowest = Math.min(_gs.armies(w.gameId, 'stats.footmen.speed'), _gs.armies(w.gameId, 'stats.catapults.speed'));
          var speed = dArmies.speed(w.gameId, army);
          equal(speed, (60 / slowest) * _gs.armies(w.gameId, 'armyTravelMultiplier'), 'the slowest soldier\'s speed');
          assert(speed > (60 / _gs.armies(w.gameId, 'stats.footmen.speed')) * _gs.armies(w.gameId, 'armyTravelMultiplier'), 'slower than footmen alone');
          equal(Armies.findOne(army._id).speed, speed, 'army speed');
          var path = Armypaths.findOne(pathId);
          equal(path.speed, speed, 'path speed');
          equal(path.time, null, 'path time cleared');
        });


        // --- fixPathIndexes, expirePastMoves ---

        test('fixPathIndexes: renumbers an army\'s paths from 0 in order and clears their routes', function() {
          var army = w.makeArmy(0);
          var ids = [5, 0, 9].map(function(index) {
            return insertPath(army, {index: index, countryIds: ['c'], hexes: [{x: 0, y: 0}]});
          });
          runJob('fixPathIndexes', {armyId: army._id});
          equal(Armypaths.findOne(ids[1]).index, 0, 'index 0 stays first');
          equal(Armypaths.findOne(ids[0]).index, 1, 'index 5 becomes 1');
          equal(Armypaths.findOne(ids[2]).index, 2, 'index 9 becomes 2');
          ids.forEach(function(id) {
            var path = Armypaths.findOne(id);
            equal(path.countryIds, null, 'countryIds cleared');
            equal(path.hexes, null, 'hexes cleared');
          });
        });

        test('expirePastMoves: drops past moves older than the limit and keeps the rest', function() {
          var army = w.makeArmy(0);
          var old = moment().subtract(_s.armies.pastMovesMsLimit + 60000, 'ms').toDate();
          var recent = new Date();
          Armies.update(army._id, {$set: {pastMoves: [{x: 1, y: 1, moveDate: old}, {x: 2, y: 2, moveDate: recent}]}});
          var other = w.makeArmy(1);
          Armies.update(other._id, {$set: {pastMoves: [{x: 3, y: 3, moveDate: recent}]}});

          runJob('expirePastMoves', {});
          var moves = Armies.findOne(army._id).pastMoves;
          equal(moves.length, 1, 'one move left');
          equal(moves[0].x, 2, 'the recent one');
          equal(Armies.findOne(other._id).pastMoves.length, 1, 'an army with only recent moves keeps them');
        });


        // --- findCountriesInPath, pathToHex, moveArmiesJob ---

        test('findCountriesInPath and pathToHex: route a new path through its countries, then hex by hex', function() {
          var line = freeLine(3);
          var army = w.makeArmy(0, {footmen: 1}, line[0]);
          var pathId = insertPath(army, {x: line[2].x, y: line[2].y});

          runJob('findCountriesInPath', {path: Armypaths.findOne(pathId)});
          var path = Armypaths.findOne(pathId);
          equal(JSON.stringify(path.countryIds), JSON.stringify([line[0].countryId]), 'the one country it crosses');

          runJob('pathToHex', {path: path});
          path = Armypaths.findOne(pathId);
          assert(path.hexes && path.hexes.length >= 1, 'a route of hexes (' + (path.hexes && path.hexes.length) + ')');
          var end = _.last(path.hexes);
          equal(end.x + ',' + end.y, line[2].x + ',' + line[2].y, 'ending at the destination');
          equal(path.distance, path.hexes.length, 'distance is the number of hexes');
          equal(path.dirtyMoveTotals, true, 'army totals marked dirty');
        });

        test('findCountriesInPath: a path whose army is gone is removed, and a gap in the indexes queues fixPathIndexes', function() {
          var army = w.makeArmy(0);
          var gap = insertPath(army, {index: 2});
          var jobs = dTest.recordJobs(function() {
            runJob('findCountriesInPath', {path: Armypaths.findOne(gap)});
          });
          equal(dTest.jobsNamed(jobs, 'fixPathIndexes').length, 1, 'fixPathIndexes queued');
          equal(dTest.jobsNamed(jobs, 'fixPathIndexes')[0].data.armyId, army._id, 'for the army');
          equal(Armypaths.findOne(gap).countryIds, null, 'path left unrouted');

          var orphan = insertPath(army, {index: 0});
          Armies.remove(army._id);
          runJob('findCountriesInPath', {path: Armypaths.findOne(orphan)});
          equal(Armypaths.find({armyId: army._id}).count(), 0, 'every path of the missing army is removed');
        });

        test('moveArmiesJob: moves an army one hex when its time is up, and finishes the path at the destination', function() {
          var line = freeLine(3);
          var army = w.makeArmy(0, {footmen: 1}, line[0]);
          var pathId = insertPath(army, {x: line[2].x, y: line[2].y, countryIds: [line[0].countryId],
            hexes: [line[1], line[2]], distance: 2, speed: 1, last_move_at: minutesAgo(5)});
          var later = insertPath(army, {index: 1, x: line[0].x, y: line[0].y, last_move_at: minutesAgo(5)});
          var marker = Markers.insert({gameId: w.gameId, user_id: army.user_id, unitType: 'army', unitId: army._id, x: line[0].x, y: line[0].y});

          runJob('moveArmiesJob', {});
          var moved = Armies.findOne(army._id);
          equal(moved.x + ',' + moved.y, line[1].x + ',' + line[1].y, 'army on the next hex');
          assert(moment(moved.last_move_at).isAfter(minutesAgo(1)), 'last_move_at is now');
          var path = Armypaths.findOne(pathId);
          equal(path.hexes.length, 1, 'that hex taken off the route');
          equal(path.distance, 1, 'distance left');
          equal(path.time, 60 * 1000, 'time left at speed 1');
          assert(moment(Armypaths.findOne(later).last_move_at).isAfter(minutesAgo(1)), 'every path of the army gets the new last_move_at');
          var m = Markers.findOne(marker);
          equal(m.x + ',' + m.y, line[1].x + ',' + line[1].y, 'its markers follow');

          // not due yet: nothing moves
          runJob('moveArmiesJob', {});
          equal(Armies.findOne(army._id).x, line[1].x, 'not moved again before its time');

          // due again: reaches the destination, the path is removed and the next one becomes index 0
          Armypaths.update(pathId, {$set: {last_move_at: minutesAgo(5)}});
          runJob('moveArmiesJob', {});
          moved = Armies.findOne(army._id);
          equal(moved.x + ',' + moved.y, line[2].x + ',' + line[2].y, 'army at the destination');
          assert(!Armypaths.findOne(pathId), 'finished path removed');
          equal(Armypaths.findOne(later).index, 0, 'the next path is now first');
          Markers.remove(marker);
        });

        test('moveArmiesJob: a paused path, or one with no speed or route yet, doesn\'t move', function() {
          var line = freeLine(2);
          var army = w.makeArmy(0, {footmen: 1}, line[0]);
          var pathId = insertPath(army, {x: line[1].x, y: line[1].y, hexes: [line[1]], distance: 1, last_move_at: minutesAgo(5), paused: true});
          runJob('moveArmiesJob', {});
          equal(Armies.findOne(army._id).x + ',' + Armies.findOne(army._id).y, line[0].x + ',' + line[0].y, 'paused: not moved');

          Armypaths.update(pathId, {$set: {paused: false, speed: null}});
          runJob('moveArmiesJob', {});
          equal(Armies.findOne(army._id).x, line[0].x, 'no speed: not moved');

          Armypaths.update(pathId, {$set: {speed: 1, hexes: null}});
          runJob('moveArmiesJob', {});
          equal(Armies.findOne(army._id).x, line[0].x, 'no route: not moved');
        });

        test('moveArmiesJob: known bug: an empty route is removed but the army\'s next path keeps index 1, so the army stops', function() {
          var army = w.makeArmy(0);
          var empty = insertPath(army, {index: 0, hexes: [], last_move_at: minutesAgo(5)});
          var next = insertPath(army, {index: 1, hexes: [{x: army.x + 1, y: army.y}], distance: 1, last_move_at: minutesAgo(5)});
          runJob('moveArmiesJob', {});
          assert(!Armypaths.findOne(empty), 'empty path removed');
          // the renumbering reads the paths before the delete runs, so it gives the
          // removed path index 0 and the next one index 1 again
          equal(Armypaths.findOne(next).index, 1, 'next path not renumbered');
          runJob('moveArmiesJob', {});
          var after = Armies.findOne(army._id);
          equal(after.x + ',' + after.y, army.x + ',' + army.y, 'and the job never moves it, since it only moves index 0');
        });


        // --- enterNewHexCheck ---

        test('enterNewHexCheck: a stopped army on its own castle joins the castle', function() {
          var castle = w.castle(0);
          var army = w.makeArmy(0, {footmen: 4}, {x: castle.x + 1, y: castle.y});
          // put it on the castle without its own jobs running
          Armies.update(army._id, {$set: {x: castle.x, y: castle.y}});
          runJob('enterNewHexCheck', {gameId: w.gameId, armyId: army._id, checkForMerge: true});
          assert(!Armies.findOne(army._id), 'army merged away');
          equal(w.castle(0).footmen, castle.footmen + 4, 'castle has its footmen');
        });

        test('enterNewHexCheck: with checkForMerge false, an army on its own castle stays an army', function() {
          var castle = w.castle(0);
          var army = w.makeArmy(0, {footmen: 4}, {x: castle.x + 1, y: castle.y});
          Armies.update(army._id, {$set: {x: castle.x, y: castle.y}});
          runJob('enterNewHexCheck', {gameId: w.gameId, armyId: army._id, checkForMerge: false});
          assert(Armies.findOne(army._id), 'army still there');
          equal(w.castle(0).footmen, castle.footmen, 'castle unchanged');
        });


        // --- runBattle, removeStuckBattles ---

        test('runBattle: enemy armies on one hex fight a round, and a second run too soon does nothing', function() {
          var hex = w.freeHex();
          // made without their jobs running, so the battle is only run here
          var a, b;
          var created = dTest.recordJobs(function() {
            a = w.makeArmy(0, {footmen: 20}, hex);
            b = w.makeArmy(1, {footmen: 20}, hex);
          });
          var before = Armies.findOne(a._id).footmen + Armies.findOne(b._id).footmen;

          // the new army's enterNewHexCheck sees an enemy and queues the hex's battle
          var check = dTest.jobsNamed(created, 'enterNewHexCheck');
          equal(check.length, 2, 'an enterNewHexCheck per new army');
          var queued = dTest.recordJobs(function() {
            runJob('enterNewHexCheck', check[1].data);
          });
          var battles = dTest.jobsNamed(queued, 'runBattle');
          equal(battles.length, 1, 'runBattle queued');
          equal(battles[0].uniqueId, w.gameId + '_' + hex.x + '_' + hex.y, 'once per hex');

          runJob('runBattle', {gameId: w.gameId, x: hex.x, y: hex.y});
          var battle = Battles2.findOne({gameId: w.gameId, x: hex.x, y: hex.y});
          assert(battle, 'a battle doc for the hex');
          equal(battle.roundNumber, 1, 'round 1');
          equal(battle.isRunning, false, 'not left running');
          var left = _.reduce([a, b], function(sum, army) {
            var doc = Armies.findOne(army._id);
            return sum + (doc ? doc.footmen : 0);
          }, 0);
          assert(left < before, 'soldiers were lost (' + before + ' -> ' + left + ')');

          // the next round waits for the battle interval
          runJob('runBattle', {gameId: w.gameId, x: hex.x, y: hex.y});
          equal(Battles2.findOne(battle._id).roundNumber, 1, 'still round 1');

          if (!battle.isOver) {
            Battles2.update(battle._id, {$set: {updatedAt: moment().subtract(_gs.battles(w.gameId, 'battleInterval') + 1000, 'ms').toDate()}});
            runJob('runBattle', {gameId: w.gameId, x: hex.x, y: hex.y});
            equal(Battles2.findOne(battle._id).roundNumber, 2, 'round 2 after the interval');
          }
        });

        test('runBattle: a battle already running on the hex is left alone', function() {
          var hex = w.freeHex();
          var a, b;
          dTest.recordJobs(function() {
            a = w.makeArmy(0, {footmen: 20}, hex);
            b = w.makeArmy(1, {footmen: 20}, hex);
          });
          var id = Battles2.insert({gameId: w.gameId, x: hex.x, y: hex.y, isRunning: true, isOver: false, roundNumber: 3,
            createdAt: minutesAgo(10), updatedAt: minutesAgo(10), loses: [], showBattle: false, unitsFromPreviousRounds: []});
          runJob('runBattle', {gameId: w.gameId, x: hex.x, y: hex.y});
          equal(Battles2.findOne(id).roundNumber, 3, 'no new round');
          equal(Armies.findOne(a._id).footmen, 20, 'no losses');
          equal(Armies.findOne(b._id).footmen, 20, 'no losses');
        });

        test('removeStuckBattles: a battle running for over 3 hours is released, a newer one is not', function() {
          var stuck = Battles2.insert({gameId: w.gameId, x: 1, y: 1, isRunning: true, isOver: false, updatedAt: moment().subtract(4, 'hours').toDate()});
          var busy = Battles2.insert({gameId: w.gameId, x: 2, y: 2, isRunning: true, isOver: false, updatedAt: moment().subtract(1, 'hours').toDate()});
          runJob('removeStuckBattles', {});
          equal(Battles2.findOne(stuck).isRunning, false, 'stuck battle released');
          equal(Battles2.findOne(busy).isRunning, true, 'recent battle still running');
        });

      } finally {
        w.cleanup();
      }
    });
  });
}
