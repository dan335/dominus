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
    dTest.addSuite('method contracts: armies (server/armyContractTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;

      var w = dTest.buildGameWorld({players: 3});
      var other = dTest.buildGameWorld({players: 1});
      var clients = w.users.map(function(user) { return dTest.ddp.connect(user._id); });
      var otherClient = dTest.ddp.connect(other.users[0]._id);
      var loggedOut = dTest.ddp.connect();


      // --- Helpers ---

      var expectError = dTest.expectError;
      var soldierCounts = dTest.soldierCounts;
      var setResources = w.setResources;
      var setCastleSoldiers = w.setCastleSoldiers;

      function soldiersOf(doc) {
        return _.pick(doc, _s.armies.types);
      }

      // hireArmy as player i: the client always sends every soldier type
      function hire(i, soldiers, buildingId, buildingType) {
        return clients[i].call('hireArmy', w.gameId, soldierCounts(soldiers), buildingId || w.castles[i]._id, buildingType || 'castle');
      }

      function freeHex(world, skip) {
        return (world || w).freeHex(skip);
      }

      function makeArmy(i, soldiers, at, world) {
        return (world || w).makeArmy(i, soldiers, at);
      }

      // path docs for an army, inserted directly the way addArmyPath makes them
      function insertPaths(army, count) {
        var ids = [];
        for (var n = 0; n < count; n++) {
          ids.push(Armypaths.insert({gameId: army.gameId, x: 1000 + n, y: -1000 - n, index: n, armyId: army._id,
            user_id: army.user_id, createdAt: new Date(), paused: false, countryIds: ['c'], hexes: [{x: 0, y: 0}],
            distance: 1, time: 1, speed: 1, last_move_at: new Date(2026, 0, n + 1), dirtyMoveTotals: false}));
        }
        return ids;
      }

      function pathsOf(armyId) {
        return Armypaths.find({armyId: armyId}, {sort: {index: 1}}).fetch();
      }

      var test = dTest.contractTest(run, function() { w.removeArmies(); });


      try {

        // --- Calls from outside the game ---

        test('army methods: a logged out caller is refused before the method runs', function() {
          var before = dTest.snapshot(w.gameId);
          expectError(function() {
            return loggedOut.call('hireArmy', w.gameId, {footmen: 1}, w.castles[0]._id, 'castle');
          }, 'not-authorized', null, 'logged out hireArmy');
          var army = makeArmy(0);
          before = dTest.snapshot(w.gameId);
          expectError(function() { return loggedOut.call('disbandArmy', w.gameId, army._id); }, 'not-authorized', null, 'logged out disbandArmy');
          expectError(function() { return loggedOut.call('addArmyPath', w.gameId, 0, 0, army._id); }, 'not-authorized', null, 'logged out addArmyPath');
          dTest.assertUnchanged(w.gameId, before, 'logged out calls changed the game');
        });

        test('army methods: a player of another game is refused', function() {
          var army = makeArmy(0);
          var before = dTest.snapshot(w.gameId);
          expectError(function() {
            return otherClient.call('hireArmy', w.gameId, {footmen: 1}, w.castles[0]._id, 'castle');
          }, 'not-authorized', null, 'hireArmy from another game');
          expectError(function() { return otherClient.call('disbandArmy', w.gameId, army._id); }, 'not-authorized', null, 'disbandArmy from another game');
          expectError(function() { return otherClient.call('armies.stopMoving', {armyId: army._id}); }, 'not-authorized', null, 'stopMoving from another game');
          // naming your own game doesn't help: the building belongs to the other one
          expectError(function() {
            return otherClient.call('hireArmy', other.gameId, {footmen: 1}, w.castles[0]._id, 'castle');
          }, 'not-authorized', null, 'hireArmy naming the caller\'s own game');
          dTest.assertUnchanged(w.gameId, before, 'calls from another game changed the game');
        });


        // --- hireArmy ---

        test('hireArmy: hiring at your own castle takes the cost and adds the soldiers', function() {
          setResources(0, {gold: 1000, grain: 1000, lumber: 1000, ore: 1000, wool: 1000, clay: 1000, glass: 1000});
          setCastleSoldiers(0, {footmen: 5});
          var result = hire(0, {footmen: 2, archers: 1});
          equal(result, true, 'returns true');
          var castle = w.castle(0);
          equal(castle.footmen, 7, 'castle footmen');
          equal(castle.archers, 1, 'castle archers');
          var p = w.player(0);
          equal(p.grain, 1000 - 3 * 22, 'grain paid');
          equal(p.ore, 1000 - 2 * 100, 'ore paid');
          equal(p.lumber, 1000 - 100, 'lumber paid');
          equal(p.gold, 1000, 'no gold spent');
          equal(p.wool, 1000, 'wool untouched');
          equal(Alerts.find({gameId: w.gameId, type: 'alert_receivedArmy'}).count(), 0, 'no alert for your own castle');
        });

        test('hireArmy: what you are short of is bought on the market with gold', function() {
          setResources(0, {gold: 100000, grain: 1000, ore: 40});
          setCastleSoldiers(0, {footmen: 5});
          var orePrice = Market.findOne({gameId: w.gameId, type: 'ore'}).price;
          hire(0, {footmen: 1});
          var p = w.player(0);
          equal(p.ore, 0, 'ore: had 40, bought 60, paid 100');
          equal(p.grain, 1000 - 22, 'grain paid');
          assert(p.gold < 100000, 'gold paid for the ore (gold ' + p.gold + ')');
          assert(Market.findOne({gameId: w.gameId, type: 'ore'}).price > orePrice, 'buying raised the ore price');
          equal(w.castle(0).footmen, 6, 'castle footmen');
        });

        test('hireArmy: not enough gold to buy what is short is refused and changes nothing', function() {
          setResources(0, {gold: 0, grain: 1000, ore: 40});
          var before = dTest.snapshot(w.gameId);
          expectError(function() {
            return hire(0, {footmen: 1});
          }, 'Not enough resources.', null, 'short of ore with no gold');
          dTest.assertUnchanged(w.gameId, before, 'a refused hire changed the game');
        });

        test('hireArmy: another player\'s castle (not your vassal) is refused', function() {
          setResources(0, {gold: 1000, grain: 1000, ore: 1000});
          var before = dTest.snapshot(w.gameId);
          expectError(function() {
            return hire(0, {footmen: 1}, w.castles[1]._id);
          }, 'Error hiring.', null, 'hiring at someone else\'s castle');
          expectError(function() {
            return hire(0, {footmen: 1}, w.castles[0]._id, 'tower');
          }, 'not-authorized', null, 'unknown building type');
          dTest.assertUnchanged(w.gameId, before, 'a refused hire changed the game');
        });

        test('hireArmy: hiring at a vassal\'s castle adds the vassal tax and alerts both', function() {
          setResources(0, {gold: 1000, grain: 1000, ore: 1000});
          setResources(1, {gold: 1000, grain: 1000, ore: 1000});
          var castle1Footmen = w.castle(1).footmen;
          Players.update(w.players[0]._id, {$set: {allies_below: [w.players[1]._id]}});
          try {
            hire(0, {footmen: 1}, w.castles[1]._id);
            var p = w.player(0);
            equal(p.ore, 1000 - 100 * 1.2, 'ore paid with tax');
            equal(p.grain, 1000 - 22 * 1.2, 'grain paid with tax');
            equal(w.player(1).ore, 1000, 'the vassal pays nothing');
            equal(w.castle(1).footmen, castle1Footmen + 1, 'soldiers go to the vassal\'s castle');
            var alert = Alerts.findOne({gameId: w.gameId, type: 'alert_receivedArmy'});
            assert(alert, 'the vassal gets an alert');
            equal(alert.playerIds[0].playerId, w.players[1]._id, 'alert goes to the vassal');
            equal(alert.vars.fromPlayerId, w.players[0]._id, 'alert says who sent it');
            equal(GlobalAlerts.find({gameId: w.gameId, type: 'ga_sentArmy'}).count(), 1, 'one global alert');
          } finally {
            Players.update(w.players[0]._id, {$set: {allies_below: []}});
            Alerts.remove({gameId: w.gameId});
            GlobalAlerts.remove({gameId: w.gameId});
          }
        });

        test('hireArmy: a count that isn\'t a number is refused by check', function() {
          setResources(0, {gold: 1000, grain: 1000, ore: 1000});
          var before = dTest.snapshot(w.gameId);
          expectError(function() {
            return clients[0].call('hireArmy', w.gameId, _.extend(soldierCounts({}), {footmen: 'lots'}), w.castles[0]._id, 'castle');
          }, 400, null, 'string count');
          dTest.assertUnchanged(w.gameId, before, 'a refused hire changed the game');
        });

        test('hireArmy: leaving out a soldier type is refused by check', function() {
          setResources(0, {gold: 1000, grain: 1000, ore: 1000});
          var before = dTest.snapshot(w.gameId);
          expectError(function() {
            return clients[0].call('hireArmy', w.gameId, {footmen: 1}, w.castles[0]._id, 'castle');
          }, 400, null, 'only footmen given');
          dTest.assertUnchanged(w.gameId, before, 'a refused hire changed the game');
        });

        test('hireArmy: all negative counts succeed and change nothing', function() {
          setResources(0, {gold: 1000, grain: 1000, ore: 1000});
          var before = dTest.snapshot(w.gameId);
          var result = clients[0].call('hireArmy', w.gameId, {footmen: -5, archers: -5, pikemen: -5, cavalry: -5, catapults: -5}, w.castles[0]._id, 'castle');
          equal(result, true, 'returns true');
          dTest.assertUnchanged(w.gameId, before, 'a negative hire changed the game');
        });

        test('hireArmy: a negative count makes the rest cheaper (known bug, security audit)', function() {
          setResources(0, {gold: 1000, grain: 1000, ore: 1000, glass: 1000});
          setCastleSoldiers(0, {footmen: 0, catapults: 2});
          hire(0, {footmen: 1, catapults: -1});
          var p = w.player(0);
          equal(p.ore, 900, 'footman ore is paid');
          equal(p.grain, 1000, 'grain cost (22 - 22) comes out free');
          equal(p.glass, 1000, 'the negative catapult cost is clamped, not refunded');
          equal(w.castle(0).footmen, 1, 'footman added');
          equal(w.castle(0).catapults, 2, 'negative catapults are not taken away');
        });

        test('hireArmy: village level limits are never applied, since level isn\'t read (known bug)', function() {
          setResources(0, {gold: 1000, grain: 1000, ore: 1000, wool: 1000});
          var hex = freeHex();
          var villageId = Villages.insert({gameId: w.gameId, x: hex.x, y: hex.y, playerId: w.players[0]._id, user_id: w.users[0]._id,
            level: 0, footmen: 0, archers: 0, pikemen: 0, cavalry: 0, catapults: 0, created_at: new Date()});
          try {
            var result = hire(0, {cavalry: 1}, villageId, 'village');
            equal(result, true, 'cavalry hired at a level 0 village');
            equal(Villages.findOne(villageId).cavalry, 1, 'village cavalry');
          } finally {
            Villages.remove(villageId);
          }
        });


        // --- disbandArmy ---

        test('disbandArmy: your army is removed with its paths and markers', function() {
          var army = makeArmy(0);
          insertPaths(army, 2);
          Markers.insert({gameId: w.gameId, user_id: w.users[0]._id, unitType: 'army', unitId: army._id});
          var result = clients[0].call('disbandArmy', w.gameId, army._id);
          equal(result, undefined, 'returns nothing');
          equal(Armies.find(army._id).count(), 0, 'army removed');
          equal(Armypaths.find({armyId: army._id}).count(), 0, 'paths removed');
          equal(Markers.find({unitId: army._id}).count(), 0, 'markers removed');
        });

        test('disbandArmy: someone else\'s army is refused', function() {
          var army = makeArmy(1);
          var before = dTest.snapshot(w.gameId);
          expectError(function() { return clients[0].call('disbandArmy', w.gameId, army._id); }, 'not-authorized', null, 'disband another player\'s army');
          dTest.assertUnchanged(w.gameId, before, 'a refused disband changed the game');
        });


        // --- splitArmy ---

        test('splitArmy: splits off a new army on the same hex', function() {
          var army = makeArmy(0, {footmen: 3, archers: 2});
          var newId = clients[0].call('splitArmy', w.gameId, army._id, {footmen: 1, archers: 2});
          assert(typeof newId === 'string', 'returns the new army id');
          var a = Armies.findOne(army._id);
          var b = Armies.findOne(newId);
          assert(b, 'new army exists');
          equal(JSON.stringify(soldiersOf(a)), JSON.stringify(soldierCounts({footmen: 2})), 'old army keeps the rest');
          equal(JSON.stringify(soldiersOf(b)), JSON.stringify(soldierCounts({footmen: 1, archers: 2})), 'new army gets the split');
          equal(b.x + ',' + b.y, a.x + ',' + a.y, 'same hex');
          equal(b.last_move_at.getTime(), army.last_move_at.getTime(), 'new army keeps the old one\'s last_move_at');
          equal(a.speed, null, 'old army speed is reset');
        });

        test('splitArmy: more soldiers than the army has, or all of it, is refused', function() {
          var army = makeArmy(0, {footmen: 3});
          var before = dTest.snapshot(w.gameId);
          expectError(function() { return clients[0].call('splitArmy', w.gameId, army._id, {footmen: 4}); }, 'Too many footmen.', null, 'too many');
          expectError(function() { return clients[0].call('splitArmy', w.gameId, army._id, {footmen: -1}); }, 'Too few footmen.', null, 'negative');
          expectError(function() { return clients[0].call('splitArmy', w.gameId, army._id, {footmen: 3}); }, 'Could not split army.', null, 'whole army');
          expectError(function() { return clients[0].call('splitArmy', w.gameId, army._id, {}); }, 'Could not split army.', null, 'no soldiers');
          dTest.assertUnchanged(w.gameId, before, 'a refused split changed the game');
        });

        test('splitArmy: someone else\'s army is refused', function() {
          var army = makeArmy(1, {footmen: 3});
          var before = dTest.snapshot(w.gameId);
          expectError(function() { return clients[0].call('splitArmy', w.gameId, army._id, {footmen: 1}); }, 'not-authorized', null, 'split another player\'s army');
          dTest.assertUnchanged(w.gameId, before, 'a refused split changed the game');
        });


        // --- createArmyFromBuilding ---

        test('createArmyFromBuilding: soldiers leave the castle as an army on its hex', function() {
          setCastleSoldiers(0, {footmen: 5, archers: 1});
          var army = clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 2, archers: 1}));
          assert(army && army._id, 'returns the army');
          var doc = Armies.findOne(army._id);
          equal(JSON.stringify(soldiersOf(doc)), JSON.stringify(soldierCounts({footmen: 2, archers: 1})), 'army soldiers');
          equal(doc.x + ',' + doc.y, w.castle(0).x + ',' + w.castle(0).y, 'army is on the castle hex');
          equal(doc.user_id, w.users[0]._id, 'army belongs to the caller');
          equal(w.castle(0).footmen, 3, 'castle footmen');
          equal(w.castle(0).archers, 0, 'castle archers');
        });

        test('createArmyFromBuilding: more than the building has, or none, is refused', function() {
          setCastleSoldiers(0, {footmen: 2});
          var before = dTest.snapshot(w.gameId);
          expectError(function() {
            return clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 3}));
          }, 'not enough soldiers in building', null, 'too many');
          expectError(function() {
            return clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 0}));
          }, 'no soldiers', null, 'none');
          expectError(function() {
            return clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 1.5}));
          }, 400, null, 'fraction');
          dTest.assertUnchanged(w.gameId, before, 'a refused create changed the game');
        });

        test('createArmyFromBuilding: someone else\'s castle is refused', function() {
          setCastleSoldiers(1, {footmen: 5});
          var before = dTest.snapshot(w.gameId);
          expectError(function() {
            return clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[1]._id, soldierCounts({footmen: 1}));
          }, 'no building found', null, 'another player\'s castle');
          dTest.assertUnchanged(w.gameId, before, 'a refused create changed the game');
        });

        test('createArmyFromBuilding: a negative count adds to the castle and makes a negative army (known bug)', function() {
          setCastleSoldiers(0, {footmen: 2});
          var army = clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 2, archers: -1}));
          equal(w.castle(0).footmen, 0, 'castle footmen');
          equal(w.castle(0).archers, 1, 'castle gains an archer');
          equal(Armies.findOne(army._id).archers, -1, 'army has -1 archers');

          // when the counts add up to nothing the army isn't made and the castle is put back
          setCastleSoldiers(0, {footmen: 2});
          var before = dTest.snapshot(w.gameId);
          expectError(function() {
            return clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 1, archers: -1}));
          }, 'could not create army', null, 'counts adding up to zero');
          dTest.assertUnchanged(w.gameId, before, 'a refused create changed the game');
        });

        test('createArmyFromBuilding: leaving out a soldier type sets it to NaN on the castle (known bug, the browser always sends all)', function() {
          setCastleSoldiers(0, {footmen: 2, pikemen: 4});
          clients[0].call('createArmyFromBuilding', w.gameId, 'castle', w.castles[0]._id, {footmen: 1});
          var castle = w.castle(0);
          equal(castle.footmen, 1, 'castle footmen');
          assert(_.isNaN(castle.pikemen), 'castle pikemen is NaN (got ' + castle.pikemen + ')');
        });


        // --- armies.combineArmies ---

        test('armies.combineArmies: your armies on the same hex join the one named', function() {
          var a = makeArmy(0, {footmen: 3});
          var b = makeArmy(0, {archers: 2});
          var c = makeArmy(0, {cavalry: 1});
          var later = new Date(Date.now() + 60000);
          Armies.update(c._id, {$set: {last_move_at: later}});
          insertPaths(a, 1);
          // inserted directly: a real one would start a battle on the hex
          var enemy = Armies.findOne(Armies.insert(_.extend(_.omit(Armies.findOne(a._id), '_id'),
            {playerId: w.players[1]._id, user_id: w.users[1]._id, footmen: 1})));
          clients[0].call('armies.combineArmies', {gameId: w.gameId, armyId: a._id});
          var doc = Armies.findOne(a._id);
          equal(JSON.stringify(soldiersOf(doc)), JSON.stringify(soldierCounts({footmen: 3, archers: 2, cavalry: 1})), 'soldiers summed');
          equal(Armies.find({_id: {$in: [b._id, c._id]}}).count(), 0, 'the others are removed');
          equal(doc.last_move_at.getTime(), later.getTime(), 'keeps the latest last_move_at');
          equal(pathsOf(a._id)[0].last_move_at.getTime(), later.getTime(), 'paths get it too');
          assert(Armies.findOne(enemy._id), 'another player\'s army on the hex is left alone');
        });

        test('armies.combineArmies: someone else\'s army is refused', function() {
          var army = makeArmy(1, {footmen: 3});
          var before = dTest.snapshot(w.gameId);
          expectError(function() {
            return clients[0].call('armies.combineArmies', {gameId: w.gameId, armyId: army._id});
          }, 'Army not found.', null, 'combine another player\'s army');
          dTest.assertUnchanged(w.gameId, before, 'a refused combine changed the game');
        });


        // --- armies.joinBuilding and armies.returnToCastle ---

        test('armies.joinBuilding: an army on your castle joins it', function() {
          setCastleSoldiers(0, {footmen: 1});
          var army = makeArmy(0, {footmen: 3, archers: 1});
          var result = clients[0].call('armies.joinBuilding', {armyId: army._id});
          equal(JSON.stringify(result), JSON.stringify({buildingId: w.castles[0]._id, buildingType: 'castle'}), 'returns the building');
          equal(Armies.find(army._id).count(), 0, 'army removed');
          equal(w.castle(0).footmen, 4, 'castle footmen');
          equal(w.castle(0).archers, 1, 'castle archers');
        });

        test('armies.joinBuilding: away from a building, or someone else\'s army, is refused', function() {
          var away = makeArmy(0, {footmen: 3}, freeHex());
          var theirs = makeArmy(1, {footmen: 3});
          var before = dTest.snapshot(w.gameId);
          expectError(function() { return clients[0].call('armies.joinBuilding', {armyId: away._id}); },
            'validation-error', 'Could not join building.', 'not on a building');
          expectError(function() { return clients[0].call('armies.joinBuilding', {armyId: theirs._id}); },
            'validation-error', 'You do not own this army.', 'another player\'s army');
          expectError(function() { return clients[0].call('armies.joinBuilding', {armyId: 5}); },
            400, null, 'bad argument (the gate checks it first)');
          dTest.assertUnchanged(w.gameId, before, 'a refused join changed the game');
        });

        test('armies.returnToCastle: on the castle it joins, elsewhere it gets one path home', function() {
          setCastleSoldiers(0, {});
          var home = makeArmy(0, {footmen: 2});
          var result = clients[0].call('armies.returnToCastle', {armyId: home._id});
          equal(result.buildingType, 'castle', 'joins the castle');
          equal(w.castle(0).footmen, 2, 'castle footmen');

          var away = makeArmy(0, {footmen: 3}, freeHex());
          insertPaths(away, 3);
          result = clients[0].call('armies.returnToCastle', {armyId: away._id});
          equal(JSON.stringify(result), JSON.stringify({buildingId: away._id, buildingType: 'army'}), 'returns the army');
          var paths = pathsOf(away._id);
          equal(paths.length, 1, 'old paths replaced by one');
          equal(paths[0].x + ',' + paths[0].y, w.castle(0).x + ',' + w.castle(0).y, 'path goes to the castle');
          equal(paths[0].index, 0, 'path index');
        });

        test('armies.returnToCastle: someone else\'s army is refused', function() {
          var army = makeArmy(1, {footmen: 3}, freeHex());
          var before = dTest.snapshot(w.gameId);
          expectError(function() { return clients[0].call('armies.returnToCastle', {armyId: army._id}); },
            'validation-error', 'Could not find army.', 'another player\'s army');
          dTest.assertUnchanged(w.gameId, before, 'a refused return changed the game');
        });


        // --- armies.stopMoving ---

        test('armies.stopMoving: removes your army\'s paths, and only yours', function() {
          var army = makeArmy(0);
          insertPaths(army, 3);
          var before = dTest.snapshot(w.gameId);
          clients[1].call('armies.stopMoving', {armyId: army._id});
          dTest.assertUnchanged(w.gameId, before, 'another player stopped the army');
          clients[0].call('armies.stopMoving', {armyId: army._id});
          equal(Armypaths.find({armyId: army._id}).count(), 0, 'paths removed');
          assert(Armies.findOne(army._id), 'army stays');
        });


        // --- addArmyPath ---

        test('addArmyPath: paths get the next index and the army\'s speed', function() {
          var army = makeArmy(0);
          Armies.update(army._id, {$set: {speed: 7}});
          var a = freeHex();
          var b = freeHex(w, [a]);
          var id1 = clients[0].call('addArmyPath', w.gameId, a.x, a.y, army._id);
          var id2 = clients[0].call('addArmyPath', w.gameId, b.x, b.y, army._id);
          var p1 = Armypaths.findOne(id1);
          var p2 = Armypaths.findOne(id2);
          equal(p1.index, 0, 'first index');
          equal(p2.index, 1, 'second index');
          equal(p1.x + ',' + p1.y, a.x + ',' + a.y, 'first destination');
          equal(p1.speed, 7, 'army speed');
          equal(p1.last_move_at.getTime(), army.last_move_at.getTime(), 'army last_move_at');
          equal(p1.user_id, w.users[0]._id, 'owner');
          equal(p1.paused, false, 'not paused');
          equal(p1.hexes, null, 'not pathfound yet');
        });

        test('addArmyPath: a duplicate, a missing hex or a bad coordinate is refused', function() {
          var army = makeArmy(0);
          var a = freeHex();
          clients[0].call('addArmyPath', w.gameId, a.x, a.y, army._id);
          var before = dTest.snapshot(w.gameId);
          expectError(function() { return clients[0].call('addArmyPath', w.gameId, a.x, a.y, army._id); },
            'validation-error', 'Duplicate destination.', 'same as the last path');
          expectError(function() { return clients[0].call('addArmyPath', w.gameId, 5000, 5000, army._id); },
            'validation-error', 'Hex does not exist.', 'missing hex');
          expectError(function() { return clients[0].call('addArmyPath', w.gameId, 1.5, 0, army._id); },
            'validation-error', 'X and Y must be integers.', 'fraction');
          dTest.assertUnchanged(w.gameId, before, 'a refused path changed the game');
        });

        test('addArmyPath: refused once an army has 9 paths, one more than maxPaths (8)', function() {
          equal(_s.armies.maxPaths, 8, 'maxPaths setting');
          var army = makeArmy(0);
          insertPaths(army, 8);
          var a = freeHex();
          clients[0].call('addArmyPath', w.gameId, a.x, a.y, army._id);
          equal(Armypaths.find({armyId: army._id}).count(), 9, 'a 9th path is allowed');
          var b = freeHex(w, [a]);
          var before = dTest.snapshot(w.gameId);
          expectError(function() { return clients[0].call('addArmyPath', w.gameId, b.x, b.y, army._id); },
            'validation-error', 'At move limit. 8 moves max.', 'a 10th path');
          dTest.assertUnchanged(w.gameId, before, 'a refused path changed the game');
        });

        test('addArmyPath: someone else\'s army is refused', function() {
          var army = makeArmy(1);
          var a = freeHex();
          var before = dTest.snapshot(w.gameId);
          expectError(function() { return clients[0].call('addArmyPath', w.gameId, a.x, a.y, army._id); },
            'not-authorized', null, 'another player\'s army');
          dTest.assertUnchanged(w.gameId, before, 'a refused path changed the game');
        });


        // --- removeArmyPath, decreasePathIndex, increasePathIndex ---

        test('removeArmyPath: the rest are renumbered and the paths around it re-pathfind', function() {
          var army = makeArmy(0);
          var ids = insertPaths(army, 4);
          clients[0].call('removeArmyPath', ids[1]);
          var paths = pathsOf(army._id);
          equal(_.pluck(paths, '_id').join(','), [ids[0], ids[2], ids[3]].join(','), 'removed one, order kept');
          equal(_.pluck(paths, 'index').join(','), '0,1,2', 'renumbered');
          equal(paths[0].hexes, null, 'path before it re-pathfinds');
          equal(paths[1].hexes, null, 'path after it re-pathfinds');
          assert(paths[2].hexes !== null, 'other paths keep their route');
        });

        test('removeArmyPath: removing the first path gives the next one its own last_move_at', function() {
          var army = makeArmy(0);
          var ids = insertPaths(army, 2);
          var second = Armypaths.findOne(ids[1]);
          clients[0].call('removeArmyPath', ids[0]);
          var paths = pathsOf(army._id);
          equal(paths.length, 1, 'one left');
          equal(paths[0].index, 0, 'renumbered');
          equal(paths[0].last_move_at.getTime(), second.last_move_at.getTime(), 'keeps its last_move_at');
        });

        test('removeArmyPath and reordering: someone else\'s path is left alone', function() {
          var army = makeArmy(1);
          var ids = insertPaths(army, 3);
          var before = dTest.snapshot(w.gameId);
          equal(clients[0].call('removeArmyPath', ids[1]), undefined, 'remove returns nothing');
          expectError(function() { return clients[0].call('decreasePathIndex', ids[1]); }, 'no path found in decreasePathIndex', null, 'decrease');
          expectError(function() { return clients[0].call('increasePathIndex', ids[1]); }, 'no path found in increasePathIndex', null, 'increase');
          clients[0].call('pauseMovement', army._id);
          dTest.assertUnchanged(w.gameId, before, 'another player changed the paths');
        });

        test('decreasePathIndex: swaps a path with the one before it', function() {
          var army = makeArmy(0);
          var ids = insertPaths(army, 4);
          clients[0].call('decreasePathIndex', ids[2]);
          var paths = pathsOf(army._id);
          equal(_.pluck(paths, '_id').join(','), [ids[0], ids[2], ids[1], ids[3]].join(','), 'swapped');
          equal(_.pluck(paths, 'index').join(','), '0,1,2,3', 'indexes');
          equal(paths[1].last_move_at, null, 'moved path loses last_move_at (only the first path has one)');
          equal(_.filter(paths, function(p) { return p.hexes === null; }).length, 4, 'all within two of it re-pathfind');

          // the first path doesn't move
          var first = pathsOf(army._id)[0];
          equal(clients[0].call('decreasePathIndex', first._id), undefined, 'first path: returns nothing');
          equal(Armypaths.findOne(first._id).index, 0, 'first path stays first');
        });

        test('decreasePathIndex: moving the second path first gives it the first path\'s last_move_at', function() {
          var army = makeArmy(0);
          var ids = insertPaths(army, 2);
          var firstMove = Armypaths.findOne(ids[0]).last_move_at;
          clients[0].call('decreasePathIndex', ids[1]);
          var paths = pathsOf(army._id);
          equal(_.pluck(paths, '_id').join(','), [ids[1], ids[0]].join(','), 'swapped');
          equal(paths[0].last_move_at.getTime(), firstMove.getTime(), 'new first path has the old first path\'s last_move_at');
        });

        test('increasePathIndex: swaps a path with the one after it', function() {
          var army = makeArmy(0);
          var ids = insertPaths(army, 4);
          var firstMove = Armypaths.findOne(ids[0]).last_move_at;
          clients[0].call('increasePathIndex', ids[0]);
          var paths = pathsOf(army._id);
          equal(_.pluck(paths, '_id').join(','), [ids[1], ids[0], ids[2], ids[3]].join(','), 'swapped');
          equal(paths[0].last_move_at.getTime(), firstMove.getTime(), 'new first path has the old first path\'s last_move_at');
          equal(_.filter(paths, function(p) { return p.hexes === null; }).length, 3, 'paths within two of it re-pathfind');

          var last = _.last(pathsOf(army._id));
          equal(clients[0].call('increasePathIndex', last._id), undefined, 'last path: returns nothing');
          equal(Armypaths.findOne(last._id).index, 3, 'last path stays last');
        });


        // --- pauseMovement, resumeMovement ---

        test('pauseMovement and resumeMovement: set paused on all of the army\'s paths', function() {
          var army = makeArmy(0);
          insertPaths(army, 3);
          clients[0].call('pauseMovement', army._id);
          equal(Armypaths.find({armyId: army._id, paused: true}).count(), 3, 'all paused');
          clients[0].call('resumeMovement', army._id);
          equal(Armypaths.find({armyId: army._id, paused: false}).count(), 3, 'all resumed');
        });


        // --- simulations (upgrade PR 13a) ---

        test('army and path simulations: each is sync, and ends where the real calls do', function() {
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
          var real = function(i, name, args) {
            dTest.ddp.resetRateLimits();
            return clients[i].call.apply(null, [name].concat(args));
          };
          // what the simulations leave out: the army createArmyFromBuilding
          // makes, the armies combining removes, and the speed and
          // last_move_at addArmyPath copies from the army
          var paths = function(armyId, omit) {
            return pathsOf(armyId).map(function(p) { return _.omit(p, ['_id', 'armyId', 'createdAt'].concat(omit || [])); });
          };
          var armyState = function(armyId) {
            var a = Armies.findOne(armyId);
            return a && _.pick(a, _s.armies.types.concat(['x', 'y', 'speed', 'moveTime', 'last_move_at']));
          };
          var hex = w.freeHex();
          var hexes = [w.freeHex([hex])];
          hexes.push(w.freeHex([hex, hexes[0]]));
          var fixed = new Date(2026, 9, 25, 12, 0, 0);

          var play = function(call) {
            w.removeArmies();
            dClock.set(fixed);
            setResources(0, {gold: 1000, grain: 1000, lumber: 1000, ore: 1000, wool: 1000, clay: 1000, glass: 1000});
            setCastleSoldiers(0, {footmen: 5, archers: 3});
            var steps = [];
            var step = function(name, value) {
              steps.push(name + ' ' + JSON.stringify(value));
            };

            step('hireArmy', [call(0, 'hireArmy', [w.gameId, soldierCounts({footmen: 2, pikemen: 1}), w.castles[0]._id, 'castle']),
              soldiersOf(w.castle(0)), _.pick(w.player(0), _s.market.types_plus_gold)]);

            call(0, 'createArmyFromBuilding', [w.gameId, 'castle', w.castles[0]._id, soldierCounts({footmen: 4, archers: 1})]);
            step('createArmyFromBuilding', soldiersOf(w.castle(0)));

            var a = makeArmy(0, {footmen: 3}, hex);
            var b = makeArmy(0, {archers: 2}, hex);
            Armies.update(b._id, {$set: {last_move_at: new Date(fixed.getTime() + 60000)}});
            insertPaths(a, 2);
            step('armies.combineArmies', [call(0, 'armies.combineArmies', [{gameId: w.gameId, armyId: a._id}]), armyState(a._id), paths(a._id)]);
            Armies.remove(b._id);

            step('addArmyPath', [Armypaths.findOne(call(0, 'addArmyPath', [w.gameId, hexes[0].x, hexes[0].y, a._id])).index,
              Armypaths.findOne(call(0, 'addArmyPath', [w.gameId, hexes[1].x, hexes[1].y, a._id])).index,
              paths(a._id, ['speed', 'last_move_at'])]);

            step('armies.stopMoving', [call(0, 'armies.stopMoving', [{armyId: a._id}]), paths(a._id)]);

            var ids = insertPaths(a, 5);
            step('removeArmyPath first', [call(0, 'removeArmyPath', [ids[0]]), paths(a._id)]);
            step('removeArmyPath middle', [call(0, 'removeArmyPath', [ids[3]]), paths(a._id)]);
            step('decreasePathIndex', [call(0, 'decreasePathIndex', [ids[4]]), paths(a._id)]);
            step('decreasePathIndex to first', [call(0, 'decreasePathIndex', [ids[2]]), paths(a._id)]);
            step('decreasePathIndex first', [call(0, 'decreasePathIndex', [ids[2]]), paths(a._id)]);
            step('increasePathIndex', [call(0, 'increasePathIndex', [ids[2]]), paths(a._id)]);
            step('increasePathIndex last', [call(0, 'increasePathIndex', [_.last(pathsOf(a._id))._id]), paths(a._id)]);
            step('pauseMovement', [call(0, 'pauseMovement', [a._id]), paths(a._id)]);
            step('resumeMovement', [call(0, 'resumeMovement', [a._id]), paths(a._id)]);
            return steps;
          };

          try {
            var fromServer = play(real);
            var fromSimulations = play(simulate);
            equal(fromSimulations.length, fromServer.length, 'as many steps');
            fromServer.forEach(function(s, n) {
              equal(fromSimulations[n], s, 'step ' + n);
            });
            assert(/^hireArmy \[true,/.test(fromServer[0]), 'hireArmy returned true: ' + fromServer[0]);

            // a refused simulation throws, as the real call does
            w.removeArmies();
            setResources(0, {gold: 0, grain: 0, ore: 0});
            setCastleSoldiers(0, {footmen: 2});
            var mine = makeArmy(0, {footmen: 1}, hex);
            var mineIds = insertPaths(mine, 1);
            Armypaths.update(mineIds[0], {$set: {x: hexes[0].x, y: hexes[0].y}});
            var theirs = makeArmy(1, {footmen: 1}, hexes[1]);
            var theirIds = insertPaths(theirs, 2);
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
            var before = dTest.snapshot(w.gameId);
            refusals.forEach(function(r) {
              var fromSimulation = dTest.throws(function() { return simulate(r[0], r[1], r[2]); });
              var fromReal = dTest.throws(function() { return real(r[0], r[1], r[2]); });
              var name = r[1] + ' ' + JSON.stringify(r[2]);
              assert(fromReal, name + ' is refused');
              equal(fromSimulation && fromSimulation.error, fromReal && fromReal.error, name + ': refused the same way');
              equal(JSON.stringify(fromSimulation && fromSimulation.details), JSON.stringify(fromReal && fromReal.details), name + ': with the same details');
            });
            dTest.assertUnchanged(w.gameId, before, 'a refused call changed the game');

            // the server's part is a promise
            var server = _.extend(invocation(0), {isSimulation: false});
            var returned = Meteor.server.method_handlers.removeArmyPath.apply(server, ['noSuchPath']);
            assert(dTest.isPromise(returned), 'the server\'s part is a promise');
            equal(dTest.settle(returned), undefined, 'that finds nothing to remove');
          } finally {
            dClock.reset();
            w.removeArmies();
          }
        });

        test('hireArmy: a market buy that is refused stops the hire (as before Meteor 2.16)', function() {
          setResources(0, {gold: 100000, grain: 1000, ore: 40});
          setCastleSoldiers(0, {footmen: 5});
          var buy = Meteor.server.method_handlers.buy_resource;
          Meteor.server.method_handlers.buy_resource = async function() {
            throw new Meteor.Error('Not enough gold.');
          };
          try {
            var before = dTest.snapshot(w.gameId);
            expectError(function() { return hire(0, {footmen: 1}); }, 'Not enough gold.', null, 'the buy is refused');
            dTest.assertUnchanged(w.gameId, before, 'a refused hire changed the game');
          } finally {
            Meteor.server.method_handlers.buy_resource = buy;
          }
        });


        // --- rate limits ---

        test('hireArmy: a 7th call within 5 seconds is refused with too-many-requests', function() {
          var noop = {footmen: -1};
          for (var n = 0; n < 6; n++) {
            equal(hire(0, noop), true, 'call ' + (n + 1));
          }
          expectError(function() { return hire(0, noop); }, 'too-many-requests', null, '7th call');
          // the limit is per user
          equal(hire(1, noop), true, 'another player is not limited');
        });

      } finally {
        clients.concat([otherClient, loggedOut]).forEach(function(client) { client.close(); });
        dTest.waitForJobs();
        w.cleanup();
        other.cleanup();
        dTest.ddp.resetRateLimits();
      }
    });
  });
}
