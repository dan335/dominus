// Method contracts: armies and army paths (Oct 2026).
//
// Each army method is called the way the browser calls it, over a real DDP
// connection as a logged-in player (server/lib/testRunnerDdp.js), in a real
// started game (server/lib/testRunnerWorld.js). For each method the tests pin
// down what a successful call changes, and that a refused call changes
// nothing. They describe what the code does today, so the Meteor upgrade can
// be checked against it. Where today's behaviour is a bug, the test says so
// in its name; fixing the bug means changing that test on purpose.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    // registered at startup so it runs after the suites registered at load time
    dTest.addSuite('method contracts: armies (server/armyContractTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;

      var w = await dTest.buildGameWorld({players: 3});
      var other = await dTest.buildGameWorld({players: 1});
      var clients = await dTest.mapAsync(w.users, function(user) { return dTest.ddp.connect(user._id); });
      var otherClient = await dTest.ddp.connect(other.users[0]._id);
      var loggedOut = await dTest.ddp.connect();


      // --- Helpers ---

      var expectError = dTest.expectError;
      var soldierCounts = dTest.soldierCounts;
      var setResources = w.setResources;
      var setCastleSoldiers = w.setCastleSoldiers;

      function soldiersOf(doc) {
        return _.pick(doc, _s.armies.types);
      }

      // hireArmy as player i: the client always sends every soldier type
      async function hire(i, soldiers, buildingId, buildingType) {
        return await clients[i].call('hireArmy', w.gameId, soldierCounts(soldiers), buildingId || w.castles[i]._id, buildingType || 'castle');
      }

      function freeHex(world, skip) {
        return (world || w).freeHex(skip);
      }

      function makeArmy(i, soldiers, at, world) {
        return (world || w).makeArmy(i, soldiers, at);
      }

      // path docs for an army, inserted directly the way addArmyPath makes them
      async function insertPaths(army, count) {
        var ids = [];
        for (var n = 0; n < count; n++) {
          ids.push(await Armypaths.insertAsync({gameId: army.gameId, x: 1000 + n, y: -1000 - n, index: n, armyId: army._id,
            user_id: army.user_id, createdAt: new Date(), paused: false, countryIds: ['c'], hexes: [{x: 0, y: 0}],
            distance: 1, time: 1, speed: 1, last_move_at: new Date(2026, 0, n + 1), dirtyMoveTotals: false}));
        }
        return ids;
      }

      async function pathsOf(armyId) {
        return await Armypaths.find({armyId: armyId}, {sort: {index: 1}}).fetchAsync();
      }

      var test = dTest.contractTest(run, async function() { await w.removeArmies(); });


      try {

        // --- Calls from outside the game ---

        await test('army methods: a logged out caller is refused before the method runs', async function() {
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() {
            return await loggedOut.call('hireArmy', w.gameId, {footmen: 1}, w.castles[0]._id, 'castle');
          }, 'not-authorized', null, 'logged out hireArmy');
          var army = await makeArmy(0);
          before = await dTest.snapshot(w.gameId);
          await expectError(async function() { return await loggedOut.call('disbandArmy', w.gameId, army._id); }, 'not-authorized', null, 'logged out disbandArmy');
          await expectError(async function() { return await loggedOut.call('addArmyPath', w.gameId, 0, 0, army._id); }, 'not-authorized', null, 'logged out addArmyPath');
          await dTest.assertUnchanged(w.gameId, before, 'logged out calls changed the game');
        });

        await test('army methods: a player of another game is refused', async function() {
          var army = await makeArmy(0);
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() {
            return await otherClient.call('hireArmy', w.gameId, {footmen: 1}, w.castles[0]._id, 'castle');
          }, 'not-authorized', null, 'hireArmy from another game');
          await expectError(async function() { return await otherClient.call('disbandArmy', w.gameId, army._id); }, 'not-authorized', null, 'disbandArmy from another game');
          await expectError(async function() { return await otherClient.call('armies.stopMoving', {armyId: army._id}); }, 'not-authorized', null, 'stopMoving from another game');
          // naming your own game doesn't help: the building belongs to the other one
          await expectError(async function() {
            return await otherClient.call('hireArmy', other.gameId, {footmen: 1}, w.castles[0]._id, 'castle');
          }, 'not-authorized', null, 'hireArmy naming the caller\'s own game');
          await dTest.assertUnchanged(w.gameId, before, 'calls from another game changed the game');
        });


        // --- hireArmy ---

        await test('hireArmy: hiring at your own castle takes the cost and adds the soldiers', async function() {
          await setResources(0, {gold: 1000, grain: 1000, lumber: 1000, ore: 1000, wool: 1000, clay: 1000, glass: 1000});
          await setCastleSoldiers(0, {footmen: 5});
          var result = await hire(0, {footmen: 2, archers: 1});
          equal(result, true, 'returns true');
          var castle = await w.castle(0);
          equal(castle.footmen, 7, 'castle footmen');
          equal(castle.archers, 1, 'castle archers');
          var p = await w.player(0);
          equal(p.grain, 1000 - 3 * 22, 'grain paid');
          equal(p.ore, 1000 - 2 * 100, 'ore paid');
          equal(p.lumber, 1000 - 100, 'lumber paid');
          equal(p.gold, 1000, 'no gold spent');
          equal(p.wool, 1000, 'wool untouched');
          equal(await Alerts.find({gameId: w.gameId, type: 'alert_receivedArmy'}).countAsync(), 0, 'no alert for your own castle');
        });

        await test('hireArmy: what you are short of is bought on the market with gold', async function() {
          await setResources(0, {gold: 100000, grain: 1000, ore: 40});
          await setCastleSoldiers(0, {footmen: 5});
          var orePrice = (await Market.findOneAsync({gameId: w.gameId, type: 'ore'})).price;
          await hire(0, {footmen: 1});
          var p = await w.player(0);
          equal(p.ore, 0, 'ore: had 40, bought 60, paid 100');
          equal(p.grain, 1000 - 22, 'grain paid');
          assert(p.gold < 100000, 'gold paid for the ore (gold ' + p.gold + ')');
          assert((await Market.findOneAsync({gameId: w.gameId, type: 'ore'})).price > orePrice, 'buying raised the ore price');
          equal((await w.castle(0)).footmen, 6, 'castle footmen');
        });

        await test('hireArmy: not enough gold to buy what is short is refused and changes nothing', async function() {
          await setResources(0, {gold: 0, grain: 1000, ore: 40});
          var before = await dTest.snapshot(w.gameId);
          await expectError(function() {
            return hire(0, {footmen: 1});
          }, 'Not enough resources.', null, 'short of ore with no gold');
          await dTest.assertUnchanged(w.gameId, before, 'a refused hire changed the game');
        });

        await test('hireArmy: another player\'s castle (not your vassal) is refused', async function() {
          await setResources(0, {gold: 1000, grain: 1000, ore: 1000});
          var before = await dTest.snapshot(w.gameId);
          await expectError(function() {
            return hire(0, {footmen: 1}, w.castles[1]._id);
          }, 'Error hiring.', null, 'hiring at someone else\'s castle');
          await expectError(function() {
            return hire(0, {footmen: 1}, w.castles[0]._id, 'tower');
          }, 'not-authorized', null, 'unknown building type');
          await dTest.assertUnchanged(w.gameId, before, 'a refused hire changed the game');
        });

        await test('hireArmy: hiring at a vassal\'s castle adds the vassal tax and alerts both', async function() {
          await setResources(0, {gold: 1000, grain: 1000, ore: 1000});
          await setResources(1, {gold: 1000, grain: 1000, ore: 1000});
          var castle1Footmen = (await w.castle(1)).footmen;
          await Players.updateAsync(w.players[0]._id, {$set: {allies_below: [w.players[1]._id]}});
          try {
            await hire(0, {footmen: 1}, w.castles[1]._id);
            var p = await w.player(0);
            equal(p.ore, 1000 - 100 * 1.2, 'ore paid with tax');
            equal(p.grain, 1000 - 22 * 1.2, 'grain paid with tax');
            equal((await w.player(1)).ore, 1000, 'the vassal pays nothing');
            equal((await w.castle(1)).footmen, castle1Footmen + 1, 'soldiers go to the vassal\'s castle');
            var alert = await Alerts.findOneAsync({gameId: w.gameId, type: 'alert_receivedArmy'});
            assert(alert, 'the vassal gets an alert');
            equal(alert.playerIds[0].playerId, w.players[1]._id, 'alert goes to the vassal');
            equal(alert.vars.fromPlayerId, w.players[0]._id, 'alert says who sent it');
            equal(await GlobalAlerts.find({gameId: w.gameId, type: 'ga_sentArmy'}).countAsync(), 1, 'one global alert');
          } finally {
            await Players.updateAsync(w.players[0]._id, {$set: {allies_below: []}});
            await Alerts.removeAsync({gameId: w.gameId});
            await GlobalAlerts.removeAsync({gameId: w.gameId});
          }
        });

        await test('hireArmy: a count that isn\'t a number is refused by check', async function() {
          await setResources(0, {gold: 1000, grain: 1000, ore: 1000});
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() {
            return await clients[0].call('hireArmy', w.gameId, _.extend(soldierCounts({}), {footmen: 'lots'}), w.castles[0]._id, 'castle');
          }, 400, null, 'string count');
          await dTest.assertUnchanged(w.gameId, before, 'a refused hire changed the game');
        });

        await test('hireArmy: leaving out a soldier type is refused by check', async function() {
          await setResources(0, {gold: 1000, grain: 1000, ore: 1000});
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() {
            return await clients[0].call('hireArmy', w.gameId, {footmen: 1}, w.castles[0]._id, 'castle');
          }, 400, null, 'only footmen given');
          await dTest.assertUnchanged(w.gameId, before, 'a refused hire changed the game');
        });

        await test('hireArmy: all negative counts succeed and change nothing', async function() {
          await setResources(0, {gold: 1000, grain: 1000, ore: 1000});
          var before = await dTest.snapshot(w.gameId);
          var result = await clients[0].call('hireArmy', w.gameId, {footmen: -5, archers: -5, pikemen: -5, cavalry: -5, catapults: -5}, w.castles[0]._id, 'castle');
          equal(result, true, 'returns true');
          await dTest.assertUnchanged(w.gameId, before, 'a negative hire changed the game');
        });

        await test('hireArmy: a negative count makes the rest cheaper (known bug, security audit)', async function() {
          await setResources(0, {gold: 1000, grain: 1000, ore: 1000, glass: 1000});
          await setCastleSoldiers(0, {footmen: 0, catapults: 2});
          await hire(0, {footmen: 1, catapults: -1});
          var p = await w.player(0);
          equal(p.ore, 900, 'footman ore is paid');
          equal(p.grain, 1000, 'grain cost (22 - 22) comes out free');
          equal(p.glass, 1000, 'the negative catapult cost is clamped, not refunded');
          equal((await w.castle(0)).footmen, 1, 'footman added');
          equal((await w.castle(0)).catapults, 2, 'negative catapults are not taken away');
        });

        await test('hireArmy: village level limits are never applied, since level isn\'t read (known bug)', async function() {
          await setResources(0, {gold: 1000, grain: 1000, ore: 1000, wool: 1000});
          var hex = await freeHex();
          var villageId = await Villages.insertAsync({gameId: w.gameId, x: hex.x, y: hex.y, playerId: w.players[0]._id, user_id: w.users[0]._id,
            level: 0, footmen: 0, archers: 0, pikemen: 0, cavalry: 0, catapults: 0, created_at: new Date()});
          try {
            var result = await hire(0, {cavalry: 1}, villageId, 'village');
            equal(result, true, 'cavalry hired at a level 0 village');
            equal((await Villages.findOneAsync(villageId)).cavalry, 1, 'village cavalry');
          } finally {
            await Villages.removeAsync(villageId);
          }
        });


        // --- disbandArmy ---

        await test('disbandArmy: your army is removed with its paths and markers', async function() {
          var army = await makeArmy(0);
          await insertPaths(army, 2);
          await Markers.insertAsync({gameId: w.gameId, user_id: w.users[0]._id, unitType: 'army', unitId: army._id});
          var result = await clients[0].call('disbandArmy', w.gameId, army._id);
          equal(result, undefined, 'returns nothing');
          equal(await Armies.find(army._id).countAsync(), 0, 'army removed');
          equal(await Armypaths.find({armyId: army._id}).countAsync(), 0, 'paths removed');
          equal(await Markers.find({unitId: army._id}).countAsync(), 0, 'markers removed');
        });

        await test('disbandArmy: someone else\'s army is refused', async function() {
          var army = await makeArmy(1);
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() { return await clients[0].call('disbandArmy', w.gameId, army._id); }, 'not-authorized', null, 'disband another player\'s army');
          await dTest.assertUnchanged(w.gameId, before, 'a refused disband changed the game');
        });


        // --- splitArmy ---

        await test('splitArmy: splits off a new army on the same hex', async function() {
          var army = await makeArmy(0, {footmen: 3, archers: 2});
          var newId = await clients[0].call('splitArmy', w.gameId, army._id, {footmen: 1, archers: 2});
          assert(typeof newId === 'string', 'returns the new army id');
          var a = await Armies.findOneAsync(army._id);
          var b = await Armies.findOneAsync(newId);
          assert(b, 'new army exists');
          equal(JSON.stringify(soldiersOf(a)), JSON.stringify(soldierCounts({footmen: 2})), 'old army keeps the rest');
          equal(JSON.stringify(soldiersOf(b)), JSON.stringify(soldierCounts({footmen: 1, archers: 2})), 'new army gets the split');
          equal(b.x + ',' + b.y, a.x + ',' + a.y, 'same hex');
          equal(b.last_move_at.getTime(), army.last_move_at.getTime(), 'new army keeps the old one\'s last_move_at');
          equal(a.speed, null, 'old army speed is reset');
        });

        await test('splitArmy: more soldiers than the army has, or all of it, is refused', async function() {
          var army = await makeArmy(0, {footmen: 3});
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() { return await clients[0].call('splitArmy', w.gameId, army._id, {footmen: 4}); }, 'Too many footmen.', null, 'too many');
          await expectError(async function() { return await clients[0].call('splitArmy', w.gameId, army._id, {footmen: -1}); }, 'Too few footmen.', null, 'negative');
          await expectError(async function() { return await clients[0].call('splitArmy', w.gameId, army._id, {footmen: 3}); }, 'Could not split army.', null, 'whole army');
          await expectError(async function() { return await clients[0].call('splitArmy', w.gameId, army._id, {}); }, 'Could not split army.', null, 'no soldiers');
          await dTest.assertUnchanged(w.gameId, before, 'a refused split changed the game');
        });

        await test('splitArmy: someone else\'s army is refused', async function() {
          var army = await makeArmy(1, {footmen: 3});
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() { return await clients[0].call('splitArmy', w.gameId, army._id, {footmen: 1}); }, 'not-authorized', null, 'split another player\'s army');
          await dTest.assertUnchanged(w.gameId, before, 'a refused split changed the game');
        });


        // --- createArmyFromBuilding ---

        await test('createArmyFromBuilding: soldiers leave the castle as an army on its hex', async function() {
          await setCastleSoldiers(0, {footmen: 5, archers: 1});
          var army = await clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 2, archers: 1}));
          assert(army && army._id, 'returns the army');
          var doc = await Armies.findOneAsync(army._id);
          equal(JSON.stringify(soldiersOf(doc)), JSON.stringify(soldierCounts({footmen: 2, archers: 1})), 'army soldiers');
          equal(doc.x + ',' + doc.y, (await w.castle(0)).x + ',' + (await w.castle(0)).y, 'army is on the castle hex');
          equal(doc.user_id, w.users[0]._id, 'army belongs to the caller');
          equal((await w.castle(0)).footmen, 3, 'castle footmen');
          equal((await w.castle(0)).archers, 0, 'castle archers');
        });

        await test('createArmyFromBuilding: more than the building has, or none, is refused', async function() {
          await setCastleSoldiers(0, {footmen: 2});
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() {
            return await clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 3}));
          }, 'not enough soldiers in building', null, 'too many');
          await expectError(async function() {
            return await clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 0}));
          }, 'no soldiers', null, 'none');
          await expectError(async function() {
            return await clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 1.5}));
          }, 400, null, 'fraction');
          await dTest.assertUnchanged(w.gameId, before, 'a refused create changed the game');
        });

        await test('createArmyFromBuilding: someone else\'s castle is refused', async function() {
          await setCastleSoldiers(1, {footmen: 5});
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() {
            return await clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[1]._id, soldierCounts({footmen: 1}));
          }, 'no building found', null, 'another player\'s castle');
          await dTest.assertUnchanged(w.gameId, before, 'a refused create changed the game');
        });

        await test('createArmyFromBuilding: a negative count adds to the castle and makes a negative army (known bug)', async function() {
          await setCastleSoldiers(0, {footmen: 2});
          var army = await clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 2, archers: -1}));
          equal((await w.castle(0)).footmen, 0, 'castle footmen');
          equal((await w.castle(0)).archers, 1, 'castle gains an archer');
          equal((await Armies.findOneAsync(army._id)).archers, -1, 'army has -1 archers');

          // when the counts add up to nothing the army isn't made and the castle is put back
          await setCastleSoldiers(0, {footmen: 2});
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() {
            return await clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 1, archers: -1}));
          }, 'could not create army', null, 'counts adding up to zero');
          await dTest.assertUnchanged(w.gameId, before, 'a refused create changed the game');
        });

        await test('createArmyFromBuilding: leaving out a soldier type sets it to NaN on the castle (known bug, the browser always sends all)', async function() {
          await setCastleSoldiers(0, {footmen: 2, pikemen: 4});
          await clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[0]._id, {footmen: 1});
          var castle = await w.castle(0);
          equal(castle.footmen, 1, 'castle footmen');
          assert(_.isNaN(castle.pikemen), 'castle pikemen is NaN (got ' + castle.pikemen + ')');
        });


        // --- armies.combineArmies ---

        await test('armies.combineArmies: your armies on the same hex join the one named', async function() {
          var a = await makeArmy(0, {footmen: 3});
          var b = await makeArmy(0, {archers: 2});
          var c = await makeArmy(0, {cavalry: 1});
          var later = new Date(Date.now() + 60000);
          await Armies.updateAsync(c._id, {$set: {last_move_at: later}});
          await insertPaths(a, 1);
          // inserted directly: a real one would start a battle on the hex
          var enemy = await Armies.findOneAsync(await Armies.insertAsync(_.extend(_.omit(await Armies.findOneAsync(a._id), '_id'),
            {playerId: w.players[1]._id, user_id: w.users[1]._id, footmen: 1})));
          await clients[0].call('armies.combineArmies', {gameId: w.gameId, armyId: a._id});
          var doc = await Armies.findOneAsync(a._id);
          equal(JSON.stringify(soldiersOf(doc)), JSON.stringify(soldierCounts({footmen: 3, archers: 2, cavalry: 1})), 'soldiers summed');
          equal(await Armies.find({_id: {$in: [b._id, c._id]}}).countAsync(), 0, 'the others are removed');
          equal(doc.last_move_at.getTime(), later.getTime(), 'keeps the latest last_move_at');
          equal(await (await pathsOf(a._id))[0].last_move_at.getTime(), later.getTime(), 'paths get it too');
          assert(await Armies.findOneAsync(enemy._id), 'another player\'s army on the hex is left alone');
        });

        await test('armies.combineArmies: someone else\'s army is refused', async function() {
          var army = await makeArmy(1, {footmen: 3});
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() {
            return await clients[0].call('armies.combineArmies', {gameId: w.gameId, armyId: army._id});
          }, 'Army not found.', null, 'combine another player\'s army');
          await dTest.assertUnchanged(w.gameId, before, 'a refused combine changed the game');
        });


        // --- armies.joinBuilding and armies.returnToCastle ---

        await test('armies.joinBuilding: an army on your castle joins it', async function() {
          await setCastleSoldiers(0, {footmen: 1});
          var army = await makeArmy(0, {footmen: 3, archers: 1});
          var result = await clients[0].call('armies.joinBuilding', {armyId: army._id});
          equal(JSON.stringify(result), JSON.stringify({buildingId: w.castles[0]._id, buildingType: 'castle'}), 'returns the building');
          equal(await Armies.find(army._id).countAsync(), 0, 'army removed');
          equal((await w.castle(0)).footmen, 4, 'castle footmen');
          equal((await w.castle(0)).archers, 1, 'castle archers');
        });

        await test('armies.joinBuilding: away from a building, or someone else\'s army, is refused', async function() {
          var away = await makeArmy(0, {footmen: 3}, await freeHex());
          var theirs = await makeArmy(1, {footmen: 3});
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() { return await clients[0].call('armies.joinBuilding', {armyId: away._id}); },
            'validation-error', 'Could not join building.', 'not on a building');
          await expectError(async function() { return await clients[0].call('armies.joinBuilding', {armyId: theirs._id}); },
            'validation-error', 'You do not own this army.', 'another player\'s army');
          await expectError(async function() { return await clients[0].call('armies.joinBuilding', {armyId: 5}); },
            400, null, 'bad argument (the gate checks it first)');
          await dTest.assertUnchanged(w.gameId, before, 'a refused join changed the game');
        });

        await test('armies.returnToCastle: on the castle it joins, elsewhere it gets one path home', async function() {
          await setCastleSoldiers(0, {});
          var home = await makeArmy(0, {footmen: 2});
          var result = await clients[0].call('armies.returnToCastle', {armyId: home._id});
          equal(result.buildingType, 'castle', 'joins the castle');
          equal((await w.castle(0)).footmen, 2, 'castle footmen');

          var away = await makeArmy(0, {footmen: 3}, await freeHex());
          await insertPaths(away, 3);
          result = await clients[0].call('armies.returnToCastle', {armyId: away._id});
          equal(JSON.stringify(result), JSON.stringify({buildingId: away._id, buildingType: 'army'}), 'returns the army');
          var paths = await pathsOf(away._id);
          equal(paths.length, 1, 'old paths replaced by one');
          equal(paths[0].x + ',' + paths[0].y, (await w.castle(0)).x + ',' + (await w.castle(0)).y, 'path goes to the castle');
          equal(paths[0].index, 0, 'path index');
        });

        await test('armies.returnToCastle: someone else\'s army is refused', async function() {
          var army = await makeArmy(1, {footmen: 3}, await freeHex());
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() { return await clients[0].call('armies.returnToCastle', {armyId: army._id}); },
            'validation-error', 'Could not find army.', 'another player\'s army');
          await dTest.assertUnchanged(w.gameId, before, 'a refused return changed the game');
        });


        // --- armies.stopMoving ---

        await test('armies.stopMoving: removes your army\'s paths, and only yours', async function() {
          var army = await makeArmy(0);
          await insertPaths(army, 3);
          var before = await dTest.snapshot(w.gameId);
          await clients[1].call('armies.stopMoving', {armyId: army._id});
          await dTest.assertUnchanged(w.gameId, before, 'another player stopped the army');
          await clients[0].call('armies.stopMoving', {armyId: army._id});
          equal(await Armypaths.find({armyId: army._id}).countAsync(), 0, 'paths removed');
          assert(await Armies.findOneAsync(army._id), 'army stays');
        });


        // --- addArmyPath ---

        await test('addArmyPath: paths get the next index and the army\'s speed', async function() {
          var army = await makeArmy(0);
          await Armies.updateAsync(army._id, {$set: {speed: 7}});
          var a = await freeHex();
          var b = await freeHex(w, [a]);
          var id1 = await clients[0].call('addArmyPath', w.gameId, a.x, a.y, army._id);
          var id2 = await clients[0].call('addArmyPath', w.gameId, b.x, b.y, army._id);
          var p1 = await Armypaths.findOneAsync(id1);
          var p2 = await Armypaths.findOneAsync(id2);
          equal(p1.index, 0, 'first index');
          equal(p2.index, 1, 'second index');
          equal(p1.x + ',' + p1.y, a.x + ',' + a.y, 'first destination');
          equal(p1.speed, 7, 'army speed');
          equal(p1.last_move_at.getTime(), army.last_move_at.getTime(), 'army last_move_at');
          equal(p1.user_id, w.users[0]._id, 'owner');
          equal(p1.paused, false, 'not paused');
          equal(p1.hexes, null, 'not pathfound yet');
        });

        await test('addArmyPath: a duplicate, a missing hex or a bad coordinate is refused', async function() {
          var army = await makeArmy(0);
          var a = await freeHex();
          await clients[0].call('addArmyPath', w.gameId, a.x, a.y, army._id);
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() { return await clients[0].call('addArmyPath', w.gameId, a.x, a.y, army._id); },
            'validation-error', 'Duplicate destination.', 'same as the last path');
          await expectError(async function() { return await clients[0].call('addArmyPath', w.gameId, 5000, 5000, army._id); },
            'validation-error', 'Hex does not exist.', 'missing hex');
          await expectError(async function() { return await clients[0].call('addArmyPath', w.gameId, 1.5, 0, army._id); },
            'validation-error', 'X and Y must be integers.', 'fraction');
          await dTest.assertUnchanged(w.gameId, before, 'a refused path changed the game');
        });

        await test('addArmyPath: refused once an army has 9 paths, one more than maxPaths (8)', async function() {
          equal(_s.armies.maxPaths, 8, 'maxPaths setting');
          var army = await makeArmy(0);
          await insertPaths(army, 8);
          var a = await freeHex();
          await clients[0].call('addArmyPath', w.gameId, a.x, a.y, army._id);
          equal(await Armypaths.find({armyId: army._id}).countAsync(), 9, 'a 9th path is allowed');
          var b = await freeHex(w, [a]);
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() { return await clients[0].call('addArmyPath', w.gameId, b.x, b.y, army._id); },
            'validation-error', 'At move limit. 8 moves max.', 'a 10th path');
          await dTest.assertUnchanged(w.gameId, before, 'a refused path changed the game');
        });

        await test('addArmyPath: someone else\'s army is refused', async function() {
          var army = await makeArmy(1);
          var a = await freeHex();
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() { return await clients[0].call('addArmyPath', w.gameId, a.x, a.y, army._id); },
            'not-authorized', null, 'another player\'s army');
          await dTest.assertUnchanged(w.gameId, before, 'a refused path changed the game');
        });


        // --- removeArmyPath, decreasePathIndex, increasePathIndex ---

        await test('removeArmyPath: the rest are renumbered and the paths around it re-pathfind', async function() {
          var army = await makeArmy(0);
          var ids = await insertPaths(army, 4);
          await clients[0].call('removeArmyPath', ids[1]);
          var paths = await pathsOf(army._id);
          equal(_.pluck(paths, '_id').join(','), [ids[0], ids[2], ids[3]].join(','), 'removed one, order kept');
          equal(_.pluck(paths, 'index').join(','), '0,1,2', 'renumbered');
          equal(paths[0].hexes, null, 'path before it re-pathfinds');
          equal(paths[1].hexes, null, 'path after it re-pathfinds');
          assert(paths[2].hexes !== null, 'other paths keep their route');
        });

        await test('removeArmyPath: removing the first path gives the next one its own last_move_at', async function() {
          var army = await makeArmy(0);
          var ids = await insertPaths(army, 2);
          var second = await Armypaths.findOneAsync(ids[1]);
          await clients[0].call('removeArmyPath', ids[0]);
          var paths = await pathsOf(army._id);
          equal(paths.length, 1, 'one left');
          equal(paths[0].index, 0, 'renumbered');
          equal(paths[0].last_move_at.getTime(), second.last_move_at.getTime(), 'keeps its last_move_at');
        });

        await test('removeArmyPath and reordering: someone else\'s path is left alone', async function() {
          var army = await makeArmy(1);
          var ids = await insertPaths(army, 3);
          var before = await dTest.snapshot(w.gameId);
          equal(await clients[0].call('removeArmyPath', ids[1]), undefined, 'remove returns nothing');
          await expectError(async function() { return await clients[0].call('decreasePathIndex', ids[1]); }, 'no path found in decreasePathIndex', null, 'decrease');
          await expectError(async function() { return await clients[0].call('increasePathIndex', ids[1]); }, 'no path found in increasePathIndex', null, 'increase');
          await clients[0].call('pauseMovement', army._id);
          await dTest.assertUnchanged(w.gameId, before, 'another player changed the paths');
        });

        await test('decreasePathIndex: swaps a path with the one before it', async function() {
          var army = await makeArmy(0);
          var ids = await insertPaths(army, 4);
          await clients[0].call('decreasePathIndex', ids[2]);
          var paths = await pathsOf(army._id);
          equal(_.pluck(paths, '_id').join(','), [ids[0], ids[2], ids[1], ids[3]].join(','), 'swapped');
          equal(_.pluck(paths, 'index').join(','), '0,1,2,3', 'indexes');
          equal(paths[1].last_move_at, null, 'moved path loses last_move_at (only the first path has one)');
          equal(_.filter(paths, function(p) { return p.hexes === null; }).length, 4, 'all within two of it re-pathfind');

          // the first path doesn't move
          var first = (await pathsOf(army._id))[0];
          equal(await clients[0].call('decreasePathIndex', first._id), undefined, 'first path: returns nothing');
          equal((await Armypaths.findOneAsync(first._id)).index, 0, 'first path stays first');
        });

        await test('decreasePathIndex: moving the second path first gives it the first path\'s last_move_at', async function() {
          var army = await makeArmy(0);
          var ids = await insertPaths(army, 2);
          var firstMove = (await Armypaths.findOneAsync(ids[0])).last_move_at;
          await clients[0].call('decreasePathIndex', ids[1]);
          var paths = await pathsOf(army._id);
          equal(_.pluck(paths, '_id').join(','), [ids[1], ids[0]].join(','), 'swapped');
          equal(paths[0].last_move_at.getTime(), firstMove.getTime(), 'new first path has the old first path\'s last_move_at');
        });

        await test('increasePathIndex: swaps a path with the one after it', async function() {
          var army = await makeArmy(0);
          var ids = await insertPaths(army, 4);
          var firstMove = (await Armypaths.findOneAsync(ids[0])).last_move_at;
          await clients[0].call('increasePathIndex', ids[0]);
          var paths = await pathsOf(army._id);
          equal(_.pluck(paths, '_id').join(','), [ids[1], ids[0], ids[2], ids[3]].join(','), 'swapped');
          equal(paths[0].last_move_at.getTime(), firstMove.getTime(), 'new first path has the old first path\'s last_move_at');
          equal(_.filter(paths, function(p) { return p.hexes === null; }).length, 3, 'paths within two of it re-pathfind');

          var last = _.last(await pathsOf(army._id));
          equal(await clients[0].call('increasePathIndex', last._id), undefined, 'last path: returns nothing');
          equal((await Armypaths.findOneAsync(last._id)).index, 3, 'last path stays last');
        });


        // --- pauseMovement, resumeMovement ---

        await test('pauseMovement and resumeMovement: set paused on all of the army\'s paths', async function() {
          var army = await makeArmy(0);
          await insertPaths(army, 3);
          await clients[0].call('pauseMovement', army._id);
          equal(await Armypaths.find({armyId: army._id, paused: true}).countAsync(), 3, 'all paused');
          await clients[0].call('resumeMovement', army._id);
          equal(await Armypaths.find({armyId: army._id, paused: false}).countAsync(), 3, 'all resumed');
        });


        // --- simulations (upgrade PR 13a) ---

        await test('army and path simulations: each is sync, and ends where the real calls do', async function() {
          var invocation = function(i) {
            return {userId: w.users[i]._id, isSimulation: true, connection: null, unblock: function() {}, setUserId: function() {}};
          };
          // as the current method call, since hireArmy and createArmyFromBuilding
          // ask Meteor.userId()
          var simulate = function(i, name, args) {
            // (kept out of withValue's return, which would wait for a promise)
            var inv = invocation(i);
            var returned;
            DDP._CurrentMethodInvocation.withValue(inv, function() {
              returned = Meteor.server.method_handlers[name].apply(inv, args);
            });
            assert(!dTest.isPromise(returned), name + ': the simulation is sync');
            return returned;
          };
          var real = async function(i, name, args) {
            dTest.ddp.resetRateLimits();
            return await clients[i].call.apply(null, [name].concat(args));
          };
          // what the simulations leave out: the army createArmyFromBuilding
          // makes, the armies combining removes, and the speed and
          // last_move_at addArmyPath copies from the army
          var paths = async function(armyId, omit) {
            return await (await pathsOf(armyId)).map(function(p) { return _.omit(p, ['_id', 'armyId', 'createdAt'].concat(omit || [])); });
          };
          var armyState = async function(armyId) {
            var a = await Armies.findOneAsync(armyId);
            return a && _.pick(a, _s.armies.types.concat(['x', 'y', 'speed', 'moveTime', 'last_move_at']));
          };
          var hex = await w.freeHex();
          var hexes = [await w.freeHex([hex])];
          hexes.push(await w.freeHex([hex, hexes[0]]));
          var fixed = new Date(2026, 9, 25, 12, 0, 0);

          var play = async function(call) {
            await w.removeArmies();
            dClock.set(fixed);
            await setResources(0, {gold: 1000, grain: 1000, lumber: 1000, ore: 1000, wool: 1000, clay: 1000, glass: 1000});
            await setCastleSoldiers(0, {footmen: 5, archers: 3});
            var steps = [];
            var step = function(name, value) {
              steps.push(name + ' ' + JSON.stringify(value));
            };

            step('hireArmy', [await call(0, 'hireArmy', [w.gameId, soldierCounts({footmen: 2, pikemen: 1}), w.castles[0]._id, 'castle']),
              soldiersOf(await w.castle(0)), _.pick(await w.player(0), _s.market.types_plus_gold)]);

            await call(0, 'createArmyFromBuilding', [w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 4, archers: 1})]);
            step('createArmyFromBuilding', soldiersOf(await w.castle(0)));

            var a = await makeArmy(0, {footmen: 3}, hex);
            var b = await makeArmy(0, {archers: 2}, hex);
            await Armies.updateAsync(b._id, {$set: {last_move_at: new Date(fixed.getTime() + 60000)}});
            await insertPaths(a, 2);
            step('armies.combineArmies', [await call(0, 'armies.combineArmies', [{gameId: w.gameId, armyId: a._id}]), await armyState(a._id), await paths(a._id)]);
            await Armies.removeAsync(b._id);

            step('addArmyPath', [(await Armypaths.findOneAsync(await call(0, 'addArmyPath', [w.gameId, hexes[0].x, hexes[0].y, a._id]))).index,
              (await Armypaths.findOneAsync(await call(0, 'addArmyPath', [w.gameId, hexes[1].x, hexes[1].y, a._id]))).index,
              await paths(a._id, ['speed', 'last_move_at'])]);

            step('armies.stopMoving', [await call(0, 'armies.stopMoving', [{armyId: a._id}]), await paths(a._id)]);

            var ids = await insertPaths(a, 5);
            step('removeArmyPath first', [await call(0, 'removeArmyPath', [ids[0]]), await paths(a._id)]);
            step('removeArmyPath middle', [await call(0, 'removeArmyPath', [ids[3]]), await paths(a._id)]);
            step('decreasePathIndex', [await call(0, 'decreasePathIndex', [ids[4]]), await paths(a._id)]);
            step('decreasePathIndex to first', [await call(0, 'decreasePathIndex', [ids[2]]), await paths(a._id)]);
            step('decreasePathIndex first', [await call(0, 'decreasePathIndex', [ids[2]]), await paths(a._id)]);
            step('increasePathIndex', [await call(0, 'increasePathIndex', [ids[2]]), await paths(a._id)]);
            step('increasePathIndex last', [await call(0, 'increasePathIndex', [_.last(await pathsOf(a._id))._id]), await paths(a._id)]);
            step('pauseMovement', [await call(0, 'pauseMovement', [a._id]), await paths(a._id)]);
            step('resumeMovement', [await call(0, 'resumeMovement', [a._id]), await paths(a._id)]);
            return steps;
          };

          try {
            var fromServer = await play(real);
            var fromSimulations = await play(simulate);
            equal(fromSimulations.length, fromServer.length, 'as many steps');
            fromServer.forEach(function(s, n) {
              equal(fromSimulations[n], s, 'step ' + n);
            });
            assert(/^hireArmy \[true,/.test(fromServer[0]), 'hireArmy returned true: ' + fromServer[0]);

            // a refused simulation throws, as the real call does
            await w.removeArmies();
            await setResources(0, {gold: 0, grain: 0, ore: 0});
            await setCastleSoldiers(0, {footmen: 2});
            var mine = await makeArmy(0, {footmen: 1}, hex);
            var mineIds = await insertPaths(mine, 1);
            await Armypaths.updateAsync(mineIds[0], {$set: {x: hexes[0].x, y: hexes[0].y}});
            var theirs = await makeArmy(1, {footmen: 1}, hexes[1]);
            var theirIds = await insertPaths(theirs, 2);
            var refusals = [
              [0, 'hireArmy', [w.gameId, soldierCounts({footmen: 1}), w.castles[0]._id, 'castle']],
              [0, 'hireArmy', [w.gameId, soldierCounts({footmen: 1}), w.castles[1]._id, 'castle']],
              [0, 'createArmyFromBuilding', [w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 3})]],
              [0, 'createArmyFromBuilding', [w.gameId, 'castle', w.castles[0]._id, soldierCounts({})]],
              [0, 'createArmyFromBuilding', [w.gameId, 'castle', w.castles[1]._id, soldierCounts({footmen: 1})]],
              [0, 'armies.combineArmies', [{gameId: w.gameId, armyId: theirs._id}]],
              [0, 'addArmyPath', [w.gameId, hexes[0].x, hexes[0].y, mine._id]],
              [0, 'addArmyPath', [w.gameId, 1.5, hexes[0].y, mine._id]],
              [0, 'decreasePathIndex', [theirIds[1]]],
              [0, 'increasePathIndex', [theirIds[0]]]
            ];
            var before = await dTest.snapshot(w.gameId);
            await dTest.eachAsync(refusals, async function(r) {
              var fromSimulation = await dTest.throws(function() { return simulate(r[0], r[1], r[2]); });
              var fromReal = await dTest.throws(function() { return real(r[0], r[1], r[2]); });
              var name = r[1] + ' ' + JSON.stringify(r[2]);
              assert(fromReal, name + ' is refused');
              equal(fromSimulation && fromSimulation.error, fromReal && fromReal.error, name + ': refused the same way');
              equal(JSON.stringify(fromSimulation && fromSimulation.details), JSON.stringify(fromReal && fromReal.details), name + ': with the same details');
            });
            await dTest.assertUnchanged(w.gameId, before, 'a refused call changed the game');

            // the server's part is a promise
            var server = _.extend(invocation(0), {isSimulation: false});
            var returned = Meteor.server.method_handlers.removeArmyPath.apply(server, ['noSuchPath']);
            assert(dTest.isPromise(returned), 'the server\'s part is a promise');
            equal(await returned, undefined, 'that finds nothing to remove');
          } finally {
            dClock.reset();
            await w.removeArmies();
          }
        });

        await test('hireArmy: a market buy that is refused stops the hire (as before Meteor 2.16)', async function() {
          await setResources(0, {gold: 100000, grain: 1000, ore: 40});
          await setCastleSoldiers(0, {footmen: 5});
          var buy = Meteor.server.method_handlers.buy_resource;
          Meteor.server.method_handlers.buy_resource = async function() {
            throw new Meteor.Error('Not enough gold.');
          };
          try {
            var before = await dTest.snapshot(w.gameId);
            await expectError(function() { return hire(0, {footmen: 1}); }, 'Not enough gold.', null, 'the buy is refused');
            await dTest.assertUnchanged(w.gameId, before, 'a refused hire changed the game');
          } finally {
            Meteor.server.method_handlers.buy_resource = buy;
          }
        });


        // --- rate limits ---

        await test('hireArmy: a 7th call within 5 seconds is refused with too-many-requests', async function() {
          var noop = {footmen: -1};
          for (var n = 0; n < 6; n++) {
            equal(await hire(0, noop), true, 'call ' + (n + 1));
          }
          await expectError(function() { return hire(0, noop); }, 'too-many-requests', null, '7th call');
          // the limit is per user
          equal(await hire(1, noop), true, 'another player is not limited');
        });

      } finally {
        clients.concat([otherClient, loggedOut]).forEach(function(client) { client.close(); });
        await dTest.waitForJobs();
        await w.cleanup();
        await other.cleanup();
        dTest.ddp.resetRateLimits();
      }
    });
  });
}
