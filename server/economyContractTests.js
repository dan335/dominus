// Method contracts: villages, gold, market, store images and pro tokens (Oct 2026).
//
// Same approach as server/armyContractTests.js: each method is called over a
// real DDP connection as a player in a real started game, and the tests pin
// down what a successful call changes and that a refused call changes
// nothing. A test named "known bug" describes a bug in today's code.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('method contracts: villages, gold and market (server/economyContractTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var expectError = dTest.expectError;

      var w = await dTest.buildGameWorld({players: 3});
      var clients = await dTest.mapAsync(w.users, function(user) { return dTest.ddp.connect(user._id); });


      // --- Helpers ---

      // close enough for prices, which go through Math.pow
      function near(actual, expected, message) {
        assert(Math.abs(actual - expected) <= Math.abs(expected) * 1e-9 + 1e-9,
          message + ' (expected ' + expected + ', got ' + actual + ')');
      }

      async function price(type) {
        return (await Market.findOneAsync({gameId: w.gameId, type: type})).price;
      }

      async function taxes() {
        return (await Games.findOneAsync(w.gameId)).taxesCollected || 0;
      }

      async function grainHex(skip) {
        return await w.freeHex(skip, function(h) { return h.type == 'grain'; });
      }

      function allResources(amount) {
        var out = {};
        _s.market.types.forEach(function(type) { out[type] = amount; });
        return out;
      }

      // a village doc for player i, inserted directly
      async function insertVillage(i, fields) {
        var hex = fields && _.has(fields, 'x') ? {x: fields.x, y: fields.y} : await w.freeHex();
        var id = await Villages.insertAsync(_.extend({gameId: w.gameId, x: hex.x, y: hex.y, playerId: w.players[i]._id,
          user_id: w.users[i]._id, username: w.players[i].username, name: 'Testville', level: 1,
          under_construction: false, created_at: new Date()}, dTest.soldierCounts({}), fields || {}));
        await Mapmaker.buildingAdded(w.gameId, hex.x, hex.y);
        return await Villages.findOneAsync(id);
      }

      async function hexAt(at) {
        return await Hexes.findOneAsync({gameId: w.gameId, x: at.x, y: at.y});
      }

      var test = dTest.contractTest(run, async function() {
        await w.removeArmies();
        await Villages.find({gameId: w.gameId}).forEachAsync(async function(v) {
          await Villages.removeAsync(v._id);
          await Mapmaker.buildingRemoved(w.gameId, v.x, v.y);
        });
        await Players.updateAsync({gameId: w.gameId}, {$set: {allies_below: [], pro: false}}, {multi: true});
        await Alerts.removeAsync({gameId: w.gameId});
        await GlobalAlerts.removeAsync({gameId: w.gameId});
      });


      try {

        // --- buildVillage ---

        await test('buildVillage: an army on a free grain hex becomes a village under construction', async function() {
          await w.setResources(0, allResources(250));
          var at = await grainHex();
          var army = await w.makeArmy(0, {footmen: 4}, at);
          var villageId = await clients[0].call('buildVillage', w.gameId, at.x, at.y);
          var village = await Villages.findOneAsync(villageId);
          assert(village, 'returns the new village id');
          equal(village.level, 0, 'level 0 until built');
          equal(village.under_construction, true, 'under construction');
          equal(village.playerId, w.players[0]._id, 'owner');
          equal(village.footmen, 4, 'the army joins the village');
          equal(await Armies.find(army._id).countAsync(), 0, 'army removed');
          equal((await hexAt(at)).hasBuilding, true, 'hex marked as having a building');
          var p = await w.player(0);
          _s.market.types.forEach(function(type) {
            equal(p[type], 250 - _s.villages.cost.level1[type], type + ' paid');
          });
        });

        await test('buildVillage: no army, not enough resources, or the wrong hex is refused', async function() {
          var at = await grainHex();
          await w.setResources(0, allResources(1000));
          var before = await dTest.snapshot(w.gameId, [Players, Villages, Armies, Hexes]);
          await expectError(async function() { return await clients[0].call('buildVillage', w.gameId, at.x, at.y); }, 'No army on hex.', null, 'no army');
          await dTest.assertUnchanged(w.gameId, before, 'a build with no army changed the game', [Players, Villages, Armies, Hexes]);

          await w.makeArmy(0, {footmen: 1}, at);
          await w.setResources(0, allResources(199));
          before = await dTest.snapshot(w.gameId, [Players, Villages, Armies, Hexes]);
          await expectError(async function() { return await clients[0].call('buildVillage', w.gameId, at.x, at.y); }, 'Not enough resources.', null, 'too poor');
          await dTest.assertUnchanged(w.gameId, before, 'a build without the resources changed the game', [Players, Villages, Armies, Hexes]);

          await w.setResources(0, allResources(1000));
          var notGrain = await w.freeHex([], function(h) { return h.type != 'grain'; });
          await w.makeArmy(0, {footmen: 1}, notGrain);
          before = await dTest.snapshot(w.gameId, [Players, Villages, Armies, Hexes]);
          await expectError(async function() { return await clients[0].call('buildVillage', w.gameId, notGrain.x, notGrain.y); }, 'Must be a grain hex.', null, 'not grain');
          await expectError(async function() { return await clients[0].call('buildVillage', w.gameId, at.x + 0.5, at.y); }, 400, null, 'fraction');
          await dTest.assertUnchanged(w.gameId, before, 'a refused build changed the game', [Players, Villages, Armies, Hexes]);
        });

        await test('buildVillage: a hex with a building or an enemy army is refused', async function() {
          await w.setResources(0, allResources(1000));
          var at = await grainHex();
          var army = await w.makeArmy(0, {footmen: 1}, at);
          await Hexes.updateAsync({gameId: w.gameId, x: at.x, y: at.y}, {$set: {hasBuilding: true}});
          try {
            await expectError(async function() { return await clients[0].call('buildVillage', w.gameId, at.x, at.y); }, 'Already a building on hex.', null, 'building');
          } finally {
            await Hexes.updateAsync({gameId: w.gameId, x: at.x, y: at.y}, {$set: {hasBuilding: false}});
          }
          // inserted directly: a real one would start a battle on the hex
          await Armies.insertAsync(_.extend(_.omit(army, '_id'), {playerId: w.players[1]._id, user_id: w.users[1]._id}));
          var before = await dTest.snapshot(w.gameId, [Players, Villages, Armies, Hexes]);
          await expectError(async function() { return await clients[0].call('buildVillage', w.gameId, at.x, at.y); },
            'Cannot build a village on an enemy occupied hex.', null, 'enemy army');
          await dTest.assertUnchanged(w.gameId, before, 'a refused build changed the game', [Players, Villages, Armies, Hexes]);
        });

        await test('buildVillage: refused once a player has the most villages allowed', async function() {
          var max = _gs.villages(w.gameId, 'max_can_have');
          for (var n = 0; n < max; n++) await insertVillage(0);
          await w.setResources(0, allResources(1000));
          var at = await grainHex();
          await w.makeArmy(0, {footmen: 1}, at);
          var before = await dTest.snapshot(w.gameId, [Players, Villages, Armies, Hexes]);
          await expectError(async function() { return await clients[0].call('buildVillage', w.gameId, at.x, at.y); }, 'Already have max villages.', null, max + ' villages');
          await dTest.assertUnchanged(w.gameId, before, 'a refused build changed the game', [Players, Villages, Armies, Hexes]);
        });


        // --- upgradeVillage ---

        await test('upgradeVillage: takes the next level\'s cost and starts construction', async function() {
          var village = await insertVillage(0, {level: 1});
          await w.setResources(0, allResources(100));
          equal(await clients[0].call('upgradeVillage', w.gameId, village._id), true, 'returns true');
          var doc = await Villages.findOneAsync(village._id);
          equal(doc.under_construction, true, 'under construction');
          equal(doc.level, 1, 'level goes up later, when construction finishes');
          var p = await w.player(0);
          _s.market.types.forEach(function(type) {
            equal(p[type], 100 - _gs.villages(w.gameId, 'cost.level2.' + type), type + ' paid');
          });
        });

        await test('upgradeVillage: under construction, max level, too poor or someone else\'s village is refused', async function() {
          var building = await insertVillage(0, {level: 1, under_construction: true});
          var maxed = await insertVillage(0, {level: _s.villages.maxLevel});
          var ready = await insertVillage(0, {level: 1});
          var theirs = await insertVillage(1, {level: 1});
          await w.setResources(0, allResources(_gs.villages(w.gameId, 'cost.level2.grain') - 1));
          await w.setResources(1, allResources(1000));
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() { return await clients[0].call('upgradeVillage', w.gameId, building._id); },
            'Cannot upgrade village while under construction.', null, 'under construction');
          await expectError(async function() { return await clients[0].call('upgradeVillage', w.gameId, maxed._id); }, 'Village at max level.', null, 'max level');
          await expectError(async function() { return await clients[0].call('upgradeVillage', w.gameId, ready._id); }, 'Not enough resources.', null, 'too poor');
          await expectError(async function() { return await clients[0].call('upgradeVillage', w.gameId, theirs._id); }, 'No village found.', null, 'someone else\'s');
          await dTest.assertUnchanged(w.gameId, before, 'a refused upgrade changed the game');
        });


        // --- destroyVillage ---

        await test('destroyVillage: the village is removed and its soldiers come out as an army', async function() {
          var village = await insertVillage(0, {footmen: 4, archers: 1});
          equal(await clients[0].call('destroyVillage', village._id), undefined, 'returns nothing');
          // the job is added without waiting, so wait for its effect
          assert(await dTest.waitFor(async function() { return !await Villages.findOneAsync(village._id); }, 15000), 'village removed');
          await dTest.waitForJobs();
          var army = await Armies.findOneAsync({gameId: w.gameId, playerId: w.players[0]._id, x: village.x, y: village.y});
          assert(army, 'an army is left on the hex');
          equal(army.footmen + ',' + army.archers, '4,1', 'with the village\'s soldiers');
          equal((await hexAt(village)).hasBuilding, false, 'hex no longer has a building');
        });

        await test('destroyVillage: someone else\'s village is refused', async function() {
          var village = await insertVillage(1, {footmen: 4});
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() { return await clients[0].call('destroyVillage', village._id); }, 'villageNotFound', null, 'someone else\'s');
          await dTest.waitForJobs();
          await dTest.assertUnchanged(w.gameId, before, 'a refused destroy changed the game');
        });


        // --- send_gold_to ---

        await test('send_gold_to: a vassal gets the gold less the tax, and both are alerted', async function() {
          await Players.updateAsync(w.players[0]._id, {$set: {allies_below: [w.players[1]._id]}});
          await w.setResources(0, {gold: 1000});
          await w.setResources(1, {gold: 10});
          var taxesBefore = await taxes();
          var received = await clients[0].call('send_gold_to', w.gameId, w.players[1]._id, 100);
          var tax = 100 * _s.income.sendToVassalTax;
          equal(received, 100 - tax, 'returns what the vassal got');
          equal((await w.player(0)).gold, 900, 'sender pays the full amount');
          equal((await w.player(1)).gold, 10 + 100 - tax, 'vassal gets it less the tax');
          equal(await taxes(), taxesBefore + tax, 'tax goes to the game');
          var alert = await Alerts.findOneAsync({gameId: w.gameId, type: 'alert_receivedGoldFrom'});
          assert(alert && alert.playerIds[0].playerId == w.players[1]._id, 'the vassal is alerted');
          equal(await GlobalAlerts.find({gameId: w.gameId, type: 'ga_sentGold'}).countAsync(), 1, 'one global alert');

          // a number as a string works too
          equal(await clients[0].call('send_gold_to', w.gameId, w.players[1]._id, '50'), 50 - 50 * _s.income.sendToVassalTax, 'string amount');
        });

        await test('send_gold_to: not a vassal, too much, or not a positive number is refused', async function() {
          await Players.updateAsync(w.players[0]._id, {$set: {allies_below: [w.players[1]._id]}});
          await w.setResources(0, {gold: 1000});
          var before = await dTest.snapshot(w.gameId, [Players, Games]);
          var send = function(to, amount) {
            return async function() { return await clients[0].call('send_gold_to', w.gameId, w.players[to]._id, amount); };
          };
          await expectError(send(2, 10), 'Can only send gold to vassals.', null, 'not a vassal');
          await expectError(send(1, 1001), 'You do not have enough gold.', null, 'too much');
          await expectError(send(1, 0), 'Number must be greater than 0.', null, 'zero');
          await expectError(send(1, -5), 'Number must be greater than 0.', null, 'negative');
          dTest.ddp.resetRateLimits();
          await expectError(send(1, 'lots'), 'Enter a number.', null, 'not a number');
          await dTest.assertUnchanged(w.gameId, before, 'a refused send changed the game', [Players, Games]);
        });


        // --- buy_resource and sell_resource ---

        await test('buy_resource: gold buys the resource, the price goes up and the game gets the tax', async function() {
          await w.setResources(0, {gold: 100000, ore: 5});
          var oldPrice = await price('ore');
          var taxesBefore = await taxes();
          var expectedCost = dMarket.total_of_buy(w.gameId, 'ore', 10);
          var cost = await clients[0].call('buy_resource', w.gameId, 'ore', 10);
          near(cost, expectedCost, 'returns the cost');
          near((await w.player(0)).gold, 100000 - expectedCost, 'gold paid');
          equal((await w.player(0)).ore, 15, 'ore bought');
          var newPrice = await price('ore');
          near(newPrice, oldPrice * Math.pow(1 + _s.market.increment, 10), 'price goes up');
          // the tax is the cost less what the ore would sell for at the new price
          var sellAtNewPrice = newPrice * (1 - Math.pow(1 - _s.market.increment, 10)) / _s.market.increment;
          near(await taxes(), taxesBefore + expectedCost - sellAtNewPrice, 'tax collected');
          await dTest.waitForJobs();
          assert(await Markethistory.find({gameId: w.gameId}).countAsync() > 0, 'market history recorded');
        });

        await test('sell_resource: the resource sells for gold and the price goes down', async function() {
          await w.setResources(0, {gold: 0, wool: 50});
          var oldPrice = await price('wool');
          var expected = dMarket.total_of_sell(w.gameId, 'wool', 10);
          var total = await clients[0].call('sell_resource', w.gameId, 'wool', 10);
          near(total, expected, 'returns the gold made');
          near((await w.player(0)).gold, expected, 'gold received');
          equal((await w.player(0)).wool, 40, 'wool sold');
          near(await price('wool'), oldPrice * Math.pow(1 + _s.market.increment, -10), 'price goes down');
        });

        await test('buy_resource and sell_resource: fractional quantities are accepted', async function() {
          await w.setResources(0, {gold: 100000, clay: 1});
          await clients[0].call('buy_resource', w.gameId, 'clay', 0.5);
          equal((await w.player(0)).clay, 1.5, 'bought half a clay');
          await clients[0].call('sell_resource', w.gameId, 'clay', 1.25);
          equal((await w.player(0)).clay, 0.25, 'sold one and a quarter');
        });

        await test('buy_resource and sell_resource: bad quantities, unknown resources and too little are refused', async function() {
          await w.setResources(0, {gold: 1, wool: 5});
          var before = await dTest.snapshot(w.gameId, [Players, Market, Games]);
          await expectError(async function() { return await clients[0].call('buy_resource', w.gameId, 'ore', 0); }, 'Quantity must be above 0.', null, 'buy 0');
          await expectError(async function() { return await clients[0].call('buy_resource', w.gameId, 'gold', 1); }, 'Resource not found.', null, 'buy gold');
          await expectError(async function() { return await clients[0].call('buy_resource', w.gameId, 'ore', 100); }, 'Not enough gold.', null, 'buy too much');
          await expectError(async function() { return await clients[0].call('buy_resource', w.gameId, 'ore', 'some'); }, 400, null, 'buy a word');
          await expectError(async function() { return await clients[0].call('sell_resource', w.gameId, 'wool', 6); }, 'Not enough resources.', null, 'sell too much');
          await expectError(async function() { return await clients[0].call('sell_resource', w.gameId, 'wool', -1); }, 'Quantity must be above 0.', null, 'sell negative');
          await dTest.assertUnchanged(w.gameId, before, 'a refused trade changed the game', [Players, Market, Games]);
        });

        await test('buy_resource: an 11th call within 5 seconds is refused with too-many-requests', async function() {
          await w.setResources(0, {gold: 1000000});
          for (var n = 0; n < 10; n++) {
            await clients[0].call('buy_resource', w.gameId, 'grain', 1);
          }
          await expectError(async function() { return await clients[0].call('buy_resource', w.gameId, 'grain', 1); }, 'too-many-requests', null, '11th call');
        });


        // --- set_unit_image ---

        await test('set_unit_image: a castle image you own is set on your castle', async function() {
          await Meteor.users.updateAsync(w.users[0]._id, {$set: {purchases: {castles: ['castle_02_keep']}}});
          try {
            equal(await clients[0].call('set_unit_image', w.castles[0]._id, 'castles', 'castle_02_keep', w.gameId), true, 'returns true');
            equal((await w.castle(0)).image, 'castle_02_keep', 'castle image');

            // someone else's castle: says yes, changes nothing (the update is scoped to the caller)
            var theirImage = (await w.castle(1)).image;
            equal(await clients[0].call('set_unit_image', w.castles[1]._id, 'castles', 'castle_02_keep', w.gameId), true, 'returns true for someone else\'s castle');
            equal((await w.castle(1)).image, theirImage, 'their castle is unchanged');
          } finally {
            await Meteor.users.updateAsync(w.users[0]._id, {$unset: {purchases: 1}});
          }
        });

        await test('set_unit_image: an image you don\'t own, or that doesn\'t exist, is refused', async function() {
          await Meteor.users.updateAsync(w.users[0]._id, {$set: {purchases: {castles: ['castle_02_keep']}}});
          try {
            var before = await dTest.snapshot(w.gameId);
            var set = function(type, id) {
              return async function() { return await clients[0].call('set_unit_image', w.castles[0]._id, type, id, w.gameId); };
            };
            await expectError(set('castles', 'castle_03_skull'), 'Player does not own image.', null, 'not bought');
            await expectError(set('castles', 'castle_99'), 'Image id not found.', null, 'no such image');
            await expectError(set('banners', 'castle_02_keep'), 'Image type not found.', null, 'no such type');
            await dTest.assertUnchanged(w.gameId, before, 'a refused image changed the game');
          } finally {
            await Meteor.users.updateAsync(w.users[0]._id, {$unset: {purchases: 1}});
          }
        });


        // --- activateProToken ---

        await test('activateProToken: a token makes you pro in this game', async function() {
          await Meteor.users.updateAsync(w.users[0]._id, {$set: {proTokens: 2}});
          await clients[0].call('activateProToken', w.gameId);
          equal((await w.player(0)).pro, true, 'pro in this game');
          equal((await Meteor.users.findOneAsync(w.users[0]._id)).proTokens, 1, 'one token used');
          await expectError(async function() { return await clients[0].call('activateProToken', w.gameId); },
            'You have already activated pro in this game.', null, 'twice');
          equal((await Meteor.users.findOneAsync(w.users[0]._id)).proTokens, 1, 'no second token used');
        });

        await test('activateProToken: without a token it is refused', async function() {
          await Meteor.users.updateAsync(w.users[0]._id, {$set: {proTokens: 0}});
          var before = await dTest.snapshot(w.gameId);
          await expectError(async function() { return await clients[0].call('activateProToken', w.gameId); },
            'User does not have any pro tokens.', null, 'no tokens');
          await dTest.assertUnchanged(w.gameId, before, 'a refused activation changed the game');
        });



        // --- simulations ---

        // The browser runs send_gold_to, buildVillage, upgradeVillage,
        // set_unit_image and activateProToken as a simulation first, a sync
        // copy of the change behind this.isSimulation; the server runs the
        // async part the method returns. These run the simulation here, on
        // the server's collections, and check that it is sync and ends where
        // the real calls do, less what only the server does: the game's tax,
        // the alerts, a village's country, and the army that joins it. As in
        // server/playerContractTests.js, the handler is called with the
        // invocation as this.
        await test('castle, village and store simulations: each is sync, and ends where the real calls do', async function() {
          var at = await grainHex();
          var invocation = function(i) {
            return {userId: w.users[i]._id, isSimulation: true, connection: null, unblock: function() {}, setUserId: function() {}};
          };
          var simulate = function(i, name, args) {
            var returned = Meteor.server.method_handlers[name].apply(invocation(i), args);
            assert(!dTest.isPromise(returned), name + ': the simulation is sync');
            return returned;
          };
          var real = async function(i, name, args) {
            dTest.ddp.resetRateLimits();
            return await clients[i].call.apply(null, [name].concat(args));
          };
          var removeVillages = async function() {
            await Villages.find({gameId: w.gameId}).forEachAsync(async function(v) {
              await Villages.removeAsync(v._id);
              await Mapmaker.buildingRemoved(w.gameId, v.x, v.y);
            });
          };
          var state = async function() {
            var resources = async function(i) { return _.pick(await w.player(i), _s.market.types_plus_gold.concat(['pro'])); };
            return JSON.stringify({
              p0: await resources(0), p1: await resources(1),
              user: _.pick(await Meteor.users.findOneAsync(w.users[0]._id), 'proTokens'),
              image: (await w.castle(0)).image,
              villages: await Villages.find({gameId: w.gameId}).mapAsync(function(v) {
                return _.omit(v, ['_id', 'name', 'created_at', 'constructionStarted', 'lastIncomeUpdate', 'countryId'].concat(_s.armies.types));
              })
            });
          };
          var reset = async function() {
            await w.removeArmies();
            await removeVillages();
            await w.setResources(0, allResources(1000));
            await Players.updateAsync(w.players[0]._id, {$set: {gold: 1000, allies_below: [w.players[1]._id], pro: false}});
            await w.setResources(1, {gold: 10});
            await Meteor.users.updateAsync(w.users[0]._id, {$set: {proTokens: 1, purchases: {castles: ['castle_02_keep']}}});
            await Castles.updateAsync(w.castles[0]._id, {$set: {image: _s.castles.startingImage}});
            await w.makeArmy(0, {footmen: 2}, at);
          };

          var play = async function(call) {
            await reset();
            var returned = [];
            returned.push(await call(0, 'send_gold_to', [w.gameId, w.players[1]._id, '100']));
            returned.push(await call(0, 'set_unit_image', [w.castles[0]._id, 'castles', 'castle_02_keep', w.gameId]));
            returned.push(await call(0, 'activateProToken', [w.gameId]));
            assert(await Villages.findOneAsync(await call(0, 'buildVillage', [w.gameId, at.x, at.y])), 'buildVillage returns the village');
            var built = await state();
            var village = await Villages.findOneAsync({gameId: w.gameId});
            await Villages.updateAsync(village._id, {$set: {under_construction: false, level: 1}});
            returned.push(await call(0, 'upgradeVillage', [w.gameId, village._id]));
            return [JSON.stringify(returned), built, await state()];
          };

          try {
            var fromServer = await play(real);
            var fromSimulations = await play(simulate);
            equal(fromSimulations[0], fromServer[0], 'what each returns');
            equal(fromServer[0], JSON.stringify([100 - 100 * _s.income.sendToVassalTax, true, undefined, true]), 'which is');
            equal(fromSimulations[1], fromServer[1], 'after sending gold, setting the image, activating pro and building a village');
            equal(fromSimulations[2], fromServer[2], 'after upgrading the village');
            var built = JSON.parse(fromServer[1]);
            equal(built.p0.pro + ',' + built.user.proTokens + ',' + built.image + ',' + built.villages.length,
              'true,0,castle_02_keep,1', 'the calls did something');

            // a refused simulation throws, as the real call does
            await reset();
            var theirs = await insertVillage(1, {level: 1});
            var refusals = [
              [0, 'send_gold_to', [w.gameId, w.players[2]._id, 10]],
              [0, 'send_gold_to', [w.gameId, w.players[1]._id, 'lots']],
              [0, 'set_unit_image', [w.castles[0]._id, 'castles', 'castle_03_skull', w.gameId]],
              [0, 'set_unit_image', [w.castles[0]._id, 'banners', 'castle_02_keep', w.gameId]],
              [2, 'activateProToken', [w.gameId]],
              [1, 'buildVillage', [w.gameId, at.x, at.y]],
              // someone else's: the method gate refuses a village that doesn't exist
              [0, 'upgradeVillage', [w.gameId, theirs._id]]
            ];
            await dTest.eachAsync(refusals, async function(r) {
              var fromSimulation = await dTest.throws(function() { return simulate(r[0], r[1], r[2]); });
              var fromReal = await dTest.throws(function() { return real(r[0], r[1], r[2]); });
              assert(fromReal, r[1] + ' ' + JSON.stringify(r[2]) + ' is refused');
              equal(fromSimulation && fromSimulation.error, fromReal && fromReal.error, r[1] + ' ' + JSON.stringify(r[2]) + ': refused the same way');
            });

            // the server's part is a promise
            var server = _.extend(invocation(0), {isSimulation: false});
            var returned = Meteor.server.method_handlers.upgradeVillage.apply(server, [w.gameId, 'noSuchVillage']);
            assert(dTest.isPromise(returned), 'the server\'s part is a promise');
            equal((await dTest.throws(function() { return returned; })).error, 'No village found.', 'that is refused');
          } finally {
            await w.removeArmies();
            await removeVillages();
            await Meteor.users.updateAsync(w.users[0]._id, {$unset: {purchases: 1, proTokens: 1}});
          }
        });

      } finally {
        clients.forEach(function(client) { client.close(); });
        await dTest.waitForJobs();
        await w.cleanup();
        dTest.ddp.resetRateLimits();
      }
    });
  });
}
