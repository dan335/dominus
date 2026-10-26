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
    dTest.addSuite('jobs: armies and battles (server/armyJobTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var runJob = dTest.runJob;

      if (process.env.DOMINUS_WORKER != 'true') {
        await run('army jobs: need the worker', function() { return 'skip'; });
        return;
      }

      var w = await dTest.buildGameWorld({players: 2});

      var test = dTest.contractTest(run, async function() {
        await w.removeArmies();
        await Armypaths.removeAsync({gameId: w.gameId});
        await Battles2.removeAsync({gameId: w.gameId});
      });

      // a path doc for army, inserted the way addArmyPath and its jobs leave it
      async function insertPath(army, fields) {
        return await Armypaths.insertAsync(_.extend({gameId: army.gameId, x: army.x, y: army.y, index: 0, armyId: army._id,
          user_id: army.user_id, createdAt: new Date(), paused: false, countryIds: null, hexes: null,
          distance: null, time: null, speed: 1, last_move_at: new Date(), dirtyMoveTotals: false}, fields || {}));
      }

      function minutesAgo(n) {
        return moment().subtract(n, 'minutes').toDate();
      }

      // free hexes next to each other in the same country, walking from a free
      // hex. A walk can end in a corner of the random map, so it tries the
      // next free hex, and the next.
      async function freeLine(count) {
        var tried = [];
        for (var attempt = 0; attempt < 50; attempt++) {
          var start = await w.freeHex(tried);
          tried.push(start);
          var line = await walkFrom(start, count);
          if (line) return line;
        }
        throw new Error('FAIL: no line of ' + count + ' free hexes');
      }

      async function walkFrom(start, count) {
        var line = [await Hexes.findOneAsync({gameId: w.gameId, x: start.x, y: start.y})];
        var taken = {};
        await Castles.find({gameId: w.gameId}).forEachAsync(function(c) { taken[c.x + '_' + c.y] = true; });
        await Villages.find({gameId: w.gameId}).forEachAsync(function(v) { taken[v.x + '_' + v.y] = true; });
        taken[start.x + '_' + start.y] = true;
        while (line.length < count) {
          var last = line[line.length - 1];
          var candidates = await Hexes.find({gameId: w.gameId, countryId: last.countryId, hasBuilding: false,
            x: {$gte: last.x - 1, $lte: last.x + 1}, y: {$gte: last.y - 1, $lte: last.y + 1}}).fetchAsync();
          // the six neighbours of an axial hex coordinate
          var next = _.find(candidates, function(h) {
            return !taken[h.x + '_' + h.y] && Math.abs((h.x - last.x) + (h.y - last.y)) <= 1 && !(h.x == last.x && h.y == last.y);
          });
          if (!next) return null;
          taken[next.x + '_' + next.y] = true;
          line.push(next);
        }
        return line.map(function(h) { return {x: h.x, y: h.y, countryId: h.countryId}; });
      }


      try {

        // --- updatePathTime, updateArmyMoveTotals, updateMoveSpeed ---

        await test('updatePathTime: sets a path\'s time from its speed and distance, in ms', async function() {
          var army = await w.makeArmy(0);
          var pathId = await insertPath(army);
          await runJob('updatePathTime', {path: {_id: pathId, armyId: army._id, speed: 2, distance: 3}});
          var path = await Armypaths.findOneAsync(pathId);
          equal(path.time, 2 * 3 * 60 * 1000, 'time');
          equal(path.dirtyMoveTotals, true, 'marks the army\'s totals dirty');

          // a path without a number for speed is refused and changes nothing
          var res = await runJob('updatePathTime', {path: {_id: pathId, armyId: army._id, speed: 'fast', distance: 3}}, {allowError: true});
          assert(res.error, 'a bad speed throws');
          equal((await Armypaths.findOneAsync(pathId)).time, 2 * 3 * 60 * 1000, 'time unchanged');
        });

        await test('updateArmyMoveTotals: sums the army\'s path times and distances and clears the dirty flags', async function() {
          var army = await w.makeArmy(0);
          var a = await insertPath(army, {index: 0, time: 1000, distance: 1, dirtyMoveTotals: true});
          var b = await insertPath(army, {index: 1, time: 2000, distance: 2, dirtyMoveTotals: true});
          var c = await insertPath(army, {index: 2, time: null, distance: null, dirtyMoveTotals: true});
          await runJob('updateArmyMoveTotals', {armyId: army._id});
          var after = await Armies.findOneAsync(army._id);
          equal(after.moveTime, 3000, 'moveTime');
          equal(after.moveDistance, 3, 'moveDistance');
          await dTest.eachAsync([a, b, c], async function(id) {
            equal((await Armypaths.findOneAsync(id)).dirtyMoveTotals, false, 'path ' + id + ' no longer dirty');
          });
        });

        await test('updateMoveSpeed: sets the army\'s speed from its slowest soldier and clears its path times', async function() {
          var army = await w.makeArmy(0, {footmen: 2, catapults: 1});
          var pathId = await insertPath(army, {speed: 99, time: 12345});
          await runJob('updateMoveSpeed', {army: army});
          // speed is minutes per hex: 60 / the slowest soldier's hexes per hour
          var slowest = Math.min(_gs.armies(w.gameId, 'stats.footmen.speed'), _gs.armies(w.gameId, 'stats.catapults.speed'));
          var speed = dArmies.speed(w.gameId, army);
          equal(speed, (60 / slowest) * _gs.armies(w.gameId, 'armyTravelMultiplier'), 'the slowest soldier\'s speed');
          assert(speed > (60 / _gs.armies(w.gameId, 'stats.footmen.speed')) * _gs.armies(w.gameId, 'armyTravelMultiplier'), 'slower than footmen alone');
          equal((await Armies.findOneAsync(army._id)).speed, speed, 'army speed');
          var path = await Armypaths.findOneAsync(pathId);
          equal(path.speed, speed, 'path speed');
          equal(path.time, null, 'path time cleared');
        });


        // --- fixPathIndexes, expirePastMoves ---

        await test('fixPathIndexes: renumbers an army\'s paths from 0 in order and clears their routes', async function() {
          var army = await w.makeArmy(0);
          var ids = await dTest.mapAsync([5, 0, 9], function(index) {
            return insertPath(army, {index: index, countryIds: ['c'], hexes: [{x: 0, y: 0}]});
          });
          await runJob('fixPathIndexes', {armyId: army._id});
          equal((await Armypaths.findOneAsync(ids[1])).index, 0, 'index 0 stays first');
          equal((await Armypaths.findOneAsync(ids[0])).index, 1, 'index 5 becomes 1');
          equal((await Armypaths.findOneAsync(ids[2])).index, 2, 'index 9 becomes 2');
          await dTest.eachAsync(ids, async function(id) {
            var path = await Armypaths.findOneAsync(id);
            equal(path.countryIds, null, 'countryIds cleared');
            equal(path.hexes, null, 'hexes cleared');
          });
        });

        await test('expirePastMoves: drops past moves older than the limit and keeps the rest', async function() {
          var army = await w.makeArmy(0);
          var old = moment().subtract(_s.armies.pastMovesMsLimit + 60000, 'ms').toDate();
          var recent = new Date();
          await Armies.updateAsync(army._id, {$set: {pastMoves: [{x: 1, y: 1, moveDate: old}, {x: 2, y: 2, moveDate: recent}]}});
          var other = await w.makeArmy(1);
          await Armies.updateAsync(other._id, {$set: {pastMoves: [{x: 3, y: 3, moveDate: recent}]}});

          await runJob('expirePastMoves', {});
          var moves = (await Armies.findOneAsync(army._id)).pastMoves;
          equal(moves.length, 1, 'one move left');
          equal(moves[0].x, 2, 'the recent one');
          equal((await Armies.findOneAsync(other._id)).pastMoves.length, 1, 'an army with only recent moves keeps them');
        });


        // --- findCountriesInPath, pathToHex, moveArmiesJob ---

        await test('findCountriesInPath and pathToHex: route a new path through its countries, then hex by hex', async function() {
          var line = await freeLine(3);
          var army = await w.makeArmy(0, {footmen: 1}, line[0]);
          var pathId = await insertPath(army, {x: line[2].x, y: line[2].y});

          await runJob('findCountriesInPath', {path: await Armypaths.findOneAsync(pathId)});
          var path = await Armypaths.findOneAsync(pathId);
          equal(JSON.stringify(path.countryIds), JSON.stringify([line[0].countryId]), 'the one country it crosses');

          await runJob('pathToHex', {path: path});
          path = await Armypaths.findOneAsync(pathId);
          assert(path.hexes && path.hexes.length >= 1, 'a route of hexes (' + (path.hexes && path.hexes.length) + ')');
          var end = _.last(path.hexes);
          equal(end.x + ',' + end.y, line[2].x + ',' + line[2].y, 'ending at the destination');
          equal(path.distance, path.hexes.length, 'distance is the number of hexes');
          equal(path.dirtyMoveTotals, true, 'army totals marked dirty');
        });

        await test('findCountriesInPath: a path whose army is gone is removed, and a gap in the indexes queues fixPathIndexes', async function() {
          var army = await w.makeArmy(0);
          var gap = await insertPath(army, {index: 2});
          var jobs = await dTest.recordJobs(async function() {
            await runJob('findCountriesInPath', {path: await Armypaths.findOneAsync(gap)});
          });
          equal(dTest.jobsNamed(jobs, 'fixPathIndexes').length, 1, 'fixPathIndexes queued');
          equal(dTest.jobsNamed(jobs, 'fixPathIndexes')[0].data.armyId, army._id, 'for the army');
          equal((await Armypaths.findOneAsync(gap)).countryIds, null, 'path left unrouted');

          var orphan = await insertPath(army, {index: 0});
          await Armies.removeAsync(army._id);
          await runJob('findCountriesInPath', {path: await Armypaths.findOneAsync(orphan)});
          equal(await Armypaths.find({armyId: army._id}).countAsync(), 0, 'every path of the missing army is removed');
        });

        await test('moveArmiesJob: moves an army one hex when its time is up, and finishes the path at the destination', async function() {
          var line = await freeLine(3);
          var army = await w.makeArmy(0, {footmen: 1}, line[0]);
          var pathId = await insertPath(army, {x: line[2].x, y: line[2].y, countryIds: [line[0].countryId],
            hexes: [line[1], line[2]], distance: 2, speed: 1, last_move_at: minutesAgo(5)});
          var later = await insertPath(army, {index: 1, x: line[0].x, y: line[0].y, last_move_at: minutesAgo(5)});
          var marker = await Markers.insertAsync({gameId: w.gameId, user_id: army.user_id, unitType: 'army', unitId: army._id, x: line[0].x, y: line[0].y});

          await runJob('moveArmiesJob', {});
          var moved = await Armies.findOneAsync(army._id);
          equal(moved.x + ',' + moved.y, line[1].x + ',' + line[1].y, 'army on the next hex');
          assert(moment(moved.last_move_at).isAfter(minutesAgo(1)), 'last_move_at is now');
          var path = await Armypaths.findOneAsync(pathId);
          equal(path.hexes.length, 1, 'that hex taken off the route');
          equal(path.distance, 1, 'distance left');
          equal(path.time, 60 * 1000, 'time left at speed 1');
          assert(moment((await Armypaths.findOneAsync(later)).last_move_at).isAfter(minutesAgo(1)), 'every path of the army gets the new last_move_at');
          var m = await Markers.findOneAsync(marker);
          equal(m.x + ',' + m.y, line[1].x + ',' + line[1].y, 'its markers follow');

          // not due yet: nothing moves
          await runJob('moveArmiesJob', {});
          equal((await Armies.findOneAsync(army._id)).x, line[1].x, 'not moved again before its time');

          // due again: reaches the destination, the path is removed and the next one becomes index 0
          await Armypaths.updateAsync(pathId, {$set: {last_move_at: minutesAgo(5)}});
          await runJob('moveArmiesJob', {});
          moved = await Armies.findOneAsync(army._id);
          equal(moved.x + ',' + moved.y, line[2].x + ',' + line[2].y, 'army at the destination');
          assert(!await Armypaths.findOneAsync(pathId), 'finished path removed');
          equal((await Armypaths.findOneAsync(later)).index, 0, 'the next path is now first');
          await Markers.removeAsync(marker);
        });

        await test('moveArmiesJob: a paused path, or one with no speed or route yet, doesn\'t move', async function() {
          var line = await freeLine(2);
          var army = await w.makeArmy(0, {footmen: 1}, line[0]);
          var pathId = await insertPath(army, {x: line[1].x, y: line[1].y, hexes: [line[1]], distance: 1, last_move_at: minutesAgo(5), paused: true});
          await runJob('moveArmiesJob', {});
          equal((await Armies.findOneAsync(army._id)).x + ',' + (await Armies.findOneAsync(army._id)).y, line[0].x + ',' + line[0].y, 'paused: not moved');

          await Armypaths.updateAsync(pathId, {$set: {paused: false, speed: null}});
          await runJob('moveArmiesJob', {});
          equal((await Armies.findOneAsync(army._id)).x, line[0].x, 'no speed: not moved');

          await Armypaths.updateAsync(pathId, {$set: {speed: 1, hexes: null}});
          await runJob('moveArmiesJob', {});
          equal((await Armies.findOneAsync(army._id)).x, line[0].x, 'no route: not moved');
        });

        await test('moveArmiesJob: known bug: an empty route is removed but the army\'s next path keeps index 1, so the army stops', async function() {
          var army = await w.makeArmy(0);
          var empty = await insertPath(army, {index: 0, hexes: [], last_move_at: minutesAgo(5)});
          var next = await insertPath(army, {index: 1, hexes: [{x: army.x + 1, y: army.y}], distance: 1, last_move_at: minutesAgo(5)});
          await runJob('moveArmiesJob', {});
          assert(!await Armypaths.findOneAsync(empty), 'empty path removed');
          // the renumbering reads the paths before the delete runs, so it gives the
          // removed path index 0 and the next one index 1 again
          equal((await Armypaths.findOneAsync(next)).index, 1, 'next path not renumbered');
          await runJob('moveArmiesJob', {});
          var after = await Armies.findOneAsync(army._id);
          equal(after.x + ',' + after.y, army.x + ',' + army.y, 'and the job never moves it, since it only moves index 0');
        });


        // --- enterNewHexCheck ---

        await test('enterNewHexCheck: a stopped army on its own castle joins the castle', async function() {
          var castle = await w.castle(0);
          var army = await w.makeArmy(0, {footmen: 4}, {x: castle.x + 1, y: castle.y});
          // put it on the castle without its own jobs running
          await Armies.updateAsync(army._id, {$set: {x: castle.x, y: castle.y}});
          await runJob('enterNewHexCheck', {gameId: w.gameId, armyId: army._id, checkForMerge: true});
          assert(!await Armies.findOneAsync(army._id), 'army merged away');
          equal((await w.castle(0)).footmen, castle.footmen + 4, 'castle has its footmen');
        });

        await test('enterNewHexCheck: with checkForMerge false, an army on its own castle stays an army', async function() {
          var castle = await w.castle(0);
          var army = await w.makeArmy(0, {footmen: 4}, {x: castle.x + 1, y: castle.y});
          await Armies.updateAsync(army._id, {$set: {x: castle.x, y: castle.y}});
          await runJob('enterNewHexCheck', {gameId: w.gameId, armyId: army._id, checkForMerge: false});
          assert(await Armies.findOneAsync(army._id), 'army still there');
          equal((await w.castle(0)).footmen, castle.footmen, 'castle unchanged');
        });


        // --- runBattle, removeStuckBattles ---

        await test('runBattle: enemy armies on one hex fight a round, and a second run too soon does nothing', async function() {
          var hex = await w.freeHex();
          // made without their jobs running, so the battle is only run here
          var a, b;
          var created = await dTest.recordJobs(async function() {
            a = await w.makeArmy(0, {footmen: 20}, hex);
            b = await w.makeArmy(1, {footmen: 20}, hex);
          });
          var before = (await Armies.findOneAsync(a._id)).footmen + (await Armies.findOneAsync(b._id)).footmen;

          // the new army's enterNewHexCheck sees an enemy and queues the hex's battle
          var check = dTest.jobsNamed(created, 'enterNewHexCheck');
          equal(check.length, 2, 'an enterNewHexCheck per new army');
          var queued = await dTest.recordJobs(async function() {
            await runJob('enterNewHexCheck', check[1].data);
          });
          var battles = dTest.jobsNamed(queued, 'runBattle');
          equal(battles.length, 1, 'runBattle queued');
          equal(battles[0].uniqueId, w.gameId + '_' + hex.x + '_' + hex.y, 'once per hex');

          await runJob('runBattle', {gameId: w.gameId, x: hex.x, y: hex.y});
          var battle = await Battles2.findOneAsync({gameId: w.gameId, x: hex.x, y: hex.y});
          assert(battle, 'a battle doc for the hex');
          equal(battle.roundNumber, 1, 'round 1');
          equal(battle.isRunning, false, 'not left running');
          var left = 0;
          for (const army of [a, b]) {
            var doc = await Armies.findOneAsync(army._id);
            left += doc ? doc.footmen : 0;
          }
          assert(left < before, 'soldiers were lost (' + before + ' -> ' + left + ')');

          // the next round waits for the battle interval
          await runJob('runBattle', {gameId: w.gameId, x: hex.x, y: hex.y});
          equal((await Battles2.findOneAsync(battle._id)).roundNumber, 1, 'still round 1');

          if (!battle.isOver) {
            await Battles2.updateAsync(battle._id, {$set: {updatedAt: moment().subtract(_gs.battles(w.gameId, 'battleInterval') + 1000, 'ms').toDate()}});
            await runJob('runBattle', {gameId: w.gameId, x: hex.x, y: hex.y});
            equal((await Battles2.findOneAsync(battle._id)).roundNumber, 2, 'round 2 after the interval');
          }
        });

        await test('runBattle: a battle already running on the hex is left alone', async function() {
          var hex = await w.freeHex();
          var a, b;
          await dTest.recordJobs(async function() {
            a = await w.makeArmy(0, {footmen: 20}, hex);
            b = await w.makeArmy(1, {footmen: 20}, hex);
          });
          var id = await Battles2.insertAsync({gameId: w.gameId, x: hex.x, y: hex.y, isRunning: true, isOver: false, roundNumber: 3,
            createdAt: minutesAgo(10), updatedAt: minutesAgo(10), loses: [], showBattle: false, unitsFromPreviousRounds: []});
          await runJob('runBattle', {gameId: w.gameId, x: hex.x, y: hex.y});
          equal((await Battles2.findOneAsync(id)).roundNumber, 3, 'no new round');
          equal((await Armies.findOneAsync(a._id)).footmen, 20, 'no losses');
          equal((await Armies.findOneAsync(b._id)).footmen, 20, 'no losses');
        });

        // the job is async since upgrade PR 14, so two runs on one hex can
        // now interleave at every database call, not only where a fiber yields
        await test('runBattle: two runs at once on a battle that is due fight one round between them', async function() {
          var hex = await w.freeHex();
          var a, b;
          await dTest.recordJobs(async function() {
            a = await w.makeArmy(0, {footmen: 200}, hex);
            b = await w.makeArmy(1, {footmen: 200}, hex);
          });
          var due = moment().subtract(_gs.battles(w.gameId, 'battleInterval') + 1000, 'ms').toDate();
          var id = await Battles2.insertAsync({gameId: w.gameId, x: hex.x, y: hex.y, isRunning: false, isOver: false, roundNumber: 1,
            createdAt: due, updatedAt: due, loses: [], showBattle: false, unitsFromPreviousRounds: [a._id, b._id]});
          var job = function() {
            return {id: 'test-' + Random.id(), data: {jobName: 'runBattle', gameId: w.gameId, x: hex.x, y: hex.y}, progress: function() { return Promise.resolve(); }};
          };
          await dTest.recordJobs(async function() {
            await Promise.all([Queues.runBattle.handler(job()), Queues.runBattle.handler(job())]);
          });
          var battle = await Battles2.findOneAsync(id);
          equal(battle.roundNumber, 2, 'one more round');
          equal(battle.isRunning, false, 'not left running');
          equal(await Rounds.find({battle_id: id}).countAsync(), 1, 'one round saved');
          equal(await Battles2.find({gameId: w.gameId, x: hex.x, y: hex.y}).countAsync(), 1, 'no second battle');
          var footmen = async function(army) { var doc = await Armies.findOneAsync(army._id); return doc ? doc.footmen : 0; };
          var lost = 400 - await footmen(a) - await footmen(b);
          var saved = await Rounds.findOneAsync({battle_id: id});
          var roundLost = _.reduce(saved.armies, function(sum, army) { return sum + army.loses.footmen; }, 0);
          equal(lost, roundLost, 'the soldiers lost are the round\'s, once');
          await Rounds.removeAsync({battle_id: id});
        });

        // The calculator panel runs a round in the browser with run(), which
        // reads each player from Calcplayers; the battle job runs it with
        // runAsync(), which reads them from Players with await (upgrade PR 14).
        await test('battle rounds: runAsync, as the battle job runs a round, gives what run gives', async function() {
          var ids = {lord: 'battletest_lord', vassal: 'battletest_vassal', enemy: 'battletest_enemy'};
          var players = [
            {_id: ids.lord, user_id: 'u_lord', allies_below: [ids.vassal], allies_above: [], team: [ids.vassal], king: ids.lord, lord: null, vassals: [ids.vassal], is_dominus: false},
            {_id: ids.vassal, user_id: 'u_vassal', allies_below: [], allies_above: [ids.lord], team: [ids.lord], king: ids.lord, lord: ids.lord, vassals: [], is_dominus: false},
            {_id: ids.enemy, user_id: 'u_enemy', allies_below: [], allies_above: [], team: [], king: null, lord: null, vassals: [], is_dominus: false}
          ];
          var unit = function(type, playerId, values, arrival) {
            var army = new BattleArmy();
            army.unitType = type;
            army._id = type + '_' + playerId;
            army.playerId = playerId;
            army.user_id = 'u_' + playerId;
            army.isRealArmy = true;
            army.units = _.extend(dTest.soldierCounts({}), values);
            army.last_move_at = new Date(Date.UTC(2026, 0, 1, 0, arrival));
            return army;
          };
          var round = function() {
            var r = new BattleRound();
            var castle = unit('castle', ids.vassal, {footmen: 10, archers: 5}, 0);
            r.armies = [castle, unit('army', ids.lord, {footmen: 30, pikemen: 10}, 1), unit('army', ids.enemy, {footmen: 50, cavalry: 10}, 2)];
            r.castle = castle;
            r.armies.forEach(function(army, n) { army.orderOfArrival = n; });
            return r;
          };
          var result = function(r) {
            return JSON.stringify({
              battleIsOver: r.battleIsOver,
              armies: _.map(r.armies, function(army) {
                return _.extend(_.pick(army, '_id', 'lord', 'team', 'allies_above', 'allies_below', 'king', 'vassals', 'loses', 'destroyed',
                  'tookCastle', 'tookCapital', 'isAttacker', 'basePower', 'finalPower', 'teamFinalPower', 'enemyFinalPower', 'powerToLose', 'dif', 'becameVassalOfPlayerId'),
                  {allies: _.pluck(army.allies, '_id'), enemies: _.pluck(army.enemies, '_id')});
              })
            });
          };
          try {
            await dTest.eachAsync(players, async function(p) { await Players.insertAsync(p); });
            var sync = round();
            sync.run();
            var async = round();
            var returned = async.runAsync();
            assert(returned instanceof Promise, 'runAsync returns a promise');
            await returned;
            equal(result(async), result(sync), 'the same round');
            var lordArmy = _.findWhere(async.armies, {_id: 'army_' + ids.lord});
            equal(lordArmy.lord, null, 'the lord\'s player was read');
            equal(JSON.stringify(_.findWhere(async.armies, {_id: 'castle_' + ids.vassal}).allies_above), JSON.stringify([ids.lord]), 'and the vassal\'s');
            equal(JSON.stringify(_.pluck(lordArmy.allies, '_id')), JSON.stringify(['castle_' + ids.vassal]), 'so the lord\'s army defends the castle');
            assert(_.pluck(lordArmy.enemies, '_id').indexOf('army_' + ids.enemy) != -1, 'against the enemy');
          } finally {
            await Players.removeAsync({_id: {$in: _.values(ids)}});
          }
        });

        await test('removeStuckBattles: a battle running for over 3 hours is released, a newer one is not', async function() {
          var stuck = await Battles2.insertAsync({gameId: w.gameId, x: 1, y: 1, isRunning: true, isOver: false, updatedAt: moment().subtract(4, 'hours').toDate()});
          var busy = await Battles2.insertAsync({gameId: w.gameId, x: 2, y: 2, isRunning: true, isOver: false, updatedAt: moment().subtract(1, 'hours').toDate()});
          await runJob('removeStuckBattles', {});
          equal((await Battles2.findOneAsync(stuck)).isRunning, false, 'stuck battle released');
          equal((await Battles2.findOneAsync(busy)).isRunning, true, 'recent battle still running');
        });

      } finally {
        await w.cleanup();
      }
    });
  });
}
