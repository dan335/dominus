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
    dTest.addSuite('method contracts: villages, gold and market (server/economyContractTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var expectError = dTest.expectError;

      var w = dTest.buildGameWorld({players: 3});
      var clients = w.users.map(function(user) { return dTest.ddp.connect(user._id); });


      // --- Helpers ---

      // close enough for prices, which go through Math.pow
      function near(actual, expected, message) {
        assert(Math.abs(actual - expected) <= Math.abs(expected) * 1e-9 + 1e-9,
          message + ' (expected ' + expected + ', got ' + actual + ')');
      }

      function price(type) {
        return Market.findOne({gameId: w.gameId, type: type}).price;
      }

      function taxes() {
        return Games.findOne(w.gameId).taxesCollected || 0;
      }

      function grainHex(skip) {
        return w.freeHex(skip, function(h) { return h.type == 'grain'; });
      }

      function allResources(amount) {
        var out = {};
        _s.market.types.forEach(function(type) { out[type] = amount; });
        return out;
      }

      // a village doc for player i, inserted directly
      function insertVillage(i, fields) {
        var hex = fields && _.has(fields, 'x') ? {x: fields.x, y: fields.y} : w.freeHex();
        var id = Villages.insert(_.extend({gameId: w.gameId, x: hex.x, y: hex.y, playerId: w.players[i]._id,
          user_id: w.users[i]._id, username: w.players[i].username, name: 'Testville', level: 1,
          under_construction: false, created_at: new Date()}, dTest.soldierCounts({}), fields || {}));
        Mapmaker.buildingAdded(w.gameId, hex.x, hex.y);
        return Villages.findOne(id);
      }

      function hexAt(at) {
        return Hexes.findOne({gameId: w.gameId, x: at.x, y: at.y});
      }

      var test = dTest.contractTest(run, function() {
        w.removeArmies();
        Villages.find({gameId: w.gameId}).forEach(function(v) {
          Villages.remove(v._id);
          Mapmaker.buildingRemoved(w.gameId, v.x, v.y);
        });
        Players.update({gameId: w.gameId}, {$set: {allies_below: [], pro: false}}, {multi: true});
        Alerts.remove({gameId: w.gameId});
        GlobalAlerts.remove({gameId: w.gameId});
      });


      try {

        // --- buildVillage ---

        test('buildVillage: an army on a free grain hex becomes a village under construction', function() {
          w.setResources(0, allResources(250));
          var at = grainHex();
          var army = w.makeArmy(0, {footmen: 4}, at);
          var villageId = clients[0].call('buildVillage', w.gameId, at.x, at.y);
          var village = Villages.findOne(villageId);
          assert(village, 'returns the new village id');
          equal(village.level, 0, 'level 0 until built');
          equal(village.under_construction, true, 'under construction');
          equal(village.playerId, w.players[0]._id, 'owner');
          equal(village.footmen, 4, 'the army joins the village');
          equal(Armies.find(army._id).count(), 0, 'army removed');
          equal(hexAt(at).hasBuilding, true, 'hex marked as having a building');
          var p = w.player(0);
          _s.market.types.forEach(function(type) {
            equal(p[type], 250 - _s.villages.cost.level1[type], type + ' paid');
          });
        });

        test('buildVillage: no army, not enough resources, or the wrong hex is refused', function() {
          var at = grainHex();
          w.setResources(0, allResources(1000));
          var before = dTest.snapshot(w.gameId, [Players, Villages, Armies, Hexes]);
          expectError(function() { return clients[0].call('buildVillage', w.gameId, at.x, at.y); }, 'No army on hex.', null, 'no army');
          dTest.assertUnchanged(w.gameId, before, 'a build with no army changed the game', [Players, Villages, Armies, Hexes]);

          w.makeArmy(0, {footmen: 1}, at);
          w.setResources(0, allResources(199));
          before = dTest.snapshot(w.gameId, [Players, Villages, Armies, Hexes]);
          expectError(function() { return clients[0].call('buildVillage', w.gameId, at.x, at.y); }, 'Not enough resources.', null, 'too poor');
          dTest.assertUnchanged(w.gameId, before, 'a build without the resources changed the game', [Players, Villages, Armies, Hexes]);

          w.setResources(0, allResources(1000));
          var notGrain = w.freeHex([], function(h) { return h.type != 'grain'; });
          w.makeArmy(0, {footmen: 1}, notGrain);
          before = dTest.snapshot(w.gameId, [Players, Villages, Armies, Hexes]);
          expectError(function() { return clients[0].call('buildVillage', w.gameId, notGrain.x, notGrain.y); }, 'Must be a grain hex.', null, 'not grain');
          expectError(function() { return clients[0].call('buildVillage', w.gameId, at.x + 0.5, at.y); }, 400, null, 'fraction');
          dTest.assertUnchanged(w.gameId, before, 'a refused build changed the game', [Players, Villages, Armies, Hexes]);
        });

        test('buildVillage: a hex with a building or an enemy army is refused', function() {
          w.setResources(0, allResources(1000));
          var at = grainHex();
          var army = w.makeArmy(0, {footmen: 1}, at);
          Hexes.update({gameId: w.gameId, x: at.x, y: at.y}, {$set: {hasBuilding: true}});
          try {
            expectError(function() { return clients[0].call('buildVillage', w.gameId, at.x, at.y); }, 'Already a building on hex.', null, 'building');
          } finally {
            Hexes.update({gameId: w.gameId, x: at.x, y: at.y}, {$set: {hasBuilding: false}});
          }
          // inserted directly: a real one would start a battle on the hex
          Armies.insert(_.extend(_.omit(army, '_id'), {playerId: w.players[1]._id, user_id: w.users[1]._id}));
          var before = dTest.snapshot(w.gameId, [Players, Villages, Armies, Hexes]);
          expectError(function() { return clients[0].call('buildVillage', w.gameId, at.x, at.y); },
            'Cannot build a village on an enemy occupied hex.', null, 'enemy army');
          dTest.assertUnchanged(w.gameId, before, 'a refused build changed the game', [Players, Villages, Armies, Hexes]);
        });

        test('buildVillage: refused once a player has the most villages allowed', function() {
          var max = _gs.villages(w.gameId, 'max_can_have');
          for (var n = 0; n < max; n++) insertVillage(0);
          w.setResources(0, allResources(1000));
          var at = grainHex();
          w.makeArmy(0, {footmen: 1}, at);
          var before = dTest.snapshot(w.gameId, [Players, Villages, Armies, Hexes]);
          expectError(function() { return clients[0].call('buildVillage', w.gameId, at.x, at.y); }, 'Already have max villages.', null, max + ' villages');
          dTest.assertUnchanged(w.gameId, before, 'a refused build changed the game', [Players, Villages, Armies, Hexes]);
        });


        // --- upgradeVillage ---

        test('upgradeVillage: takes the next level\'s cost and starts construction', function() {
          var village = insertVillage(0, {level: 1});
          w.setResources(0, allResources(100));
          equal(clients[0].call('upgradeVillage', w.gameId, village._id), true, 'returns true');
          var doc = Villages.findOne(village._id);
          equal(doc.under_construction, true, 'under construction');
          equal(doc.level, 1, 'level goes up later, when construction finishes');
          var p = w.player(0);
          _s.market.types.forEach(function(type) {
            equal(p[type], 100 - _gs.villages(w.gameId, 'cost.level2.' + type), type + ' paid');
          });
        });

        test('upgradeVillage: under construction, max level, too poor or someone else\'s village is refused', function() {
          var building = insertVillage(0, {level: 1, under_construction: true});
          var maxed = insertVillage(0, {level: _s.villages.maxLevel});
          var ready = insertVillage(0, {level: 1});
          var theirs = insertVillage(1, {level: 1});
          w.setResources(0, allResources(_gs.villages(w.gameId, 'cost.level2.grain') - 1));
          w.setResources(1, allResources(1000));
          var before = dTest.snapshot(w.gameId);
          expectError(function() { return clients[0].call('upgradeVillage', w.gameId, building._id); },
            'Cannot upgrade village while under construction.', null, 'under construction');
          expectError(function() { return clients[0].call('upgradeVillage', w.gameId, maxed._id); }, 'Village at max level.', null, 'max level');
          expectError(function() { return clients[0].call('upgradeVillage', w.gameId, ready._id); }, 'Not enough resources.', null, 'too poor');
          expectError(function() { return clients[0].call('upgradeVillage', w.gameId, theirs._id); }, 'No village found.', null, 'someone else\'s');
          dTest.assertUnchanged(w.gameId, before, 'a refused upgrade changed the game');
        });


        // --- destroyVillage ---

        test('destroyVillage: the village is removed and its soldiers come out as an army', function() {
          var village = insertVillage(0, {footmen: 4, archers: 1});
          equal(clients[0].call('destroyVillage', village._id), undefined, 'returns nothing');
          // the job is added without waiting, so wait for its effect
          assert(dTest.waitFor(function() { return !Villages.findOne(village._id); }, 15000), 'village removed');
          dTest.waitForJobs();
          var army = Armies.findOne({gameId: w.gameId, playerId: w.players[0]._id, x: village.x, y: village.y});
          assert(army, 'an army is left on the hex');
          equal(army.footmen + ',' + army.archers, '4,1', 'with the village\'s soldiers');
          equal(hexAt(village).hasBuilding, false, 'hex no longer has a building');
        });

        test('destroyVillage: someone else\'s village is refused', function() {
          var village = insertVillage(1, {footmen: 4});
          var before = dTest.snapshot(w.gameId);
          expectError(function() { return clients[0].call('destroyVillage', village._id); }, 'villageNotFound', null, 'someone else\'s');
          dTest.waitForJobs();
          dTest.assertUnchanged(w.gameId, before, 'a refused destroy changed the game');
        });


        // --- send_gold_to ---

        test('send_gold_to: a vassal gets the gold less the tax, and both are alerted', function() {
          Players.update(w.players[0]._id, {$set: {allies_below: [w.players[1]._id]}});
          w.setResources(0, {gold: 1000});
          w.setResources(1, {gold: 10});
          var taxesBefore = taxes();
          var received = clients[0].call('send_gold_to', w.gameId, w.players[1]._id, 100);
          var tax = 100 * _s.income.sendToVassalTax;
          equal(received, 100 - tax, 'returns what the vassal got');
          equal(w.player(0).gold, 900, 'sender pays the full amount');
          equal(w.player(1).gold, 10 + 100 - tax, 'vassal gets it less the tax');
          equal(taxes(), taxesBefore + tax, 'tax goes to the game');
          var alert = Alerts.findOne({gameId: w.gameId, type: 'alert_receivedGoldFrom'});
          assert(alert && alert.playerIds[0].playerId == w.players[1]._id, 'the vassal is alerted');
          equal(GlobalAlerts.find({gameId: w.gameId, type: 'ga_sentGold'}).count(), 1, 'one global alert');

          // a number as a string works too
          equal(clients[0].call('send_gold_to', w.gameId, w.players[1]._id, '50'), 50 - 50 * _s.income.sendToVassalTax, 'string amount');
        });

        test('send_gold_to: not a vassal, too much, or not a positive number is refused', function() {
          Players.update(w.players[0]._id, {$set: {allies_below: [w.players[1]._id]}});
          w.setResources(0, {gold: 1000});
          var before = dTest.snapshot(w.gameId, [Players, Games]);
          var send = function(to, amount) {
            return function() { return clients[0].call('send_gold_to', w.gameId, w.players[to]._id, amount); };
          };
          expectError(send(2, 10), 'Can only send gold to vassals.', null, 'not a vassal');
          expectError(send(1, 1001), 'You do not have enough gold.', null, 'too much');
          expectError(send(1, 0), 'Number must be greater than 0.', null, 'zero');
          expectError(send(1, -5), 'Number must be greater than 0.', null, 'negative');
          dTest.ddp.resetRateLimits();
          expectError(send(1, 'lots'), 'Enter a number.', null, 'not a number');
          dTest.assertUnchanged(w.gameId, before, 'a refused send changed the game', [Players, Games]);
        });


        // --- buy_resource and sell_resource ---

        test('buy_resource: gold buys the resource, the price goes up and the game gets the tax', function() {
          w.setResources(0, {gold: 100000, ore: 5});
          var oldPrice = price('ore');
          var taxesBefore = taxes();
          var expectedCost = dMarket.total_of_buy(w.gameId, 'ore', 10);
          var cost = clients[0].call('buy_resource', w.gameId, 'ore', 10);
          near(cost, expectedCost, 'returns the cost');
          near(w.player(0).gold, 100000 - expectedCost, 'gold paid');
          equal(w.player(0).ore, 15, 'ore bought');
          var newPrice = price('ore');
          near(newPrice, oldPrice * Math.pow(1 + _s.market.increment, 10), 'price goes up');
          // the tax is the cost less what the ore would sell for at the new price
          var sellAtNewPrice = newPrice * (1 - Math.pow(1 - _s.market.increment, 10)) / _s.market.increment;
          near(taxes(), taxesBefore + expectedCost - sellAtNewPrice, 'tax collected');
          dTest.waitForJobs();
          assert(Markethistory.find({gameId: w.gameId}).count() > 0, 'market history recorded');
        });

        test('sell_resource: the resource sells for gold and the price goes down', function() {
          w.setResources(0, {gold: 0, wool: 50});
          var oldPrice = price('wool');
          var expected = dMarket.total_of_sell(w.gameId, 'wool', 10);
          var total = clients[0].call('sell_resource', w.gameId, 'wool', 10);
          near(total, expected, 'returns the gold made');
          near(w.player(0).gold, expected, 'gold received');
          equal(w.player(0).wool, 40, 'wool sold');
          near(price('wool'), oldPrice * Math.pow(1 + _s.market.increment, -10), 'price goes down');
        });

        test('buy_resource and sell_resource: fractional quantities are accepted', function() {
          w.setResources(0, {gold: 100000, clay: 1});
          clients[0].call('buy_resource', w.gameId, 'clay', 0.5);
          equal(w.player(0).clay, 1.5, 'bought half a clay');
          clients[0].call('sell_resource', w.gameId, 'clay', 1.25);
          equal(w.player(0).clay, 0.25, 'sold one and a quarter');
        });

        test('buy_resource and sell_resource: bad quantities, unknown resources and too little are refused', function() {
          w.setResources(0, {gold: 1, wool: 5});
          var before = dTest.snapshot(w.gameId, [Players, Market, Games]);
          expectError(function() { return clients[0].call('buy_resource', w.gameId, 'ore', 0); }, 'Quantity must be above 0.', null, 'buy 0');
          expectError(function() { return clients[0].call('buy_resource', w.gameId, 'gold', 1); }, 'Resource not found.', null, 'buy gold');
          expectError(function() { return clients[0].call('buy_resource', w.gameId, 'ore', 100); }, 'Not enough gold.', null, 'buy too much');
          expectError(function() { return clients[0].call('buy_resource', w.gameId, 'ore', 'some'); }, 400, null, 'buy a word');
          expectError(function() { return clients[0].call('sell_resource', w.gameId, 'wool', 6); }, 'Not enough resources.', null, 'sell too much');
          expectError(function() { return clients[0].call('sell_resource', w.gameId, 'wool', -1); }, 'Quantity must be above 0.', null, 'sell negative');
          dTest.assertUnchanged(w.gameId, before, 'a refused trade changed the game', [Players, Market, Games]);
        });

        test('buy_resource: an 11th call within 5 seconds is refused with too-many-requests', function() {
          w.setResources(0, {gold: 1000000});
          for (var n = 0; n < 10; n++) {
            clients[0].call('buy_resource', w.gameId, 'grain', 1);
          }
          expectError(function() { return clients[0].call('buy_resource', w.gameId, 'grain', 1); }, 'too-many-requests', null, '11th call');
        });


        // --- set_unit_image ---

        test('set_unit_image: a castle image you own is set on your castle', function() {
          Meteor.users.update(w.users[0]._id, {$set: {purchases: {castles: ['castle_02_keep']}}});
          try {
            equal(clients[0].call('set_unit_image', w.castles[0]._id, 'castles', 'castle_02_keep', w.gameId), true, 'returns true');
            equal(w.castle(0).image, 'castle_02_keep', 'castle image');

            // someone else's castle: says yes, changes nothing (the update is scoped to the caller)
            var theirImage = w.castle(1).image;
            equal(clients[0].call('set_unit_image', w.castles[1]._id, 'castles', 'castle_02_keep', w.gameId), true, 'returns true for someone else\'s castle');
            equal(w.castle(1).image, theirImage, 'their castle is unchanged');
          } finally {
            Meteor.users.update(w.users[0]._id, {$unset: {purchases: 1}});
          }
        });

        test('set_unit_image: an image you don\'t own, or that doesn\'t exist, is refused', function() {
          Meteor.users.update(w.users[0]._id, {$set: {purchases: {castles: ['castle_02_keep']}}});
          try {
            var before = dTest.snapshot(w.gameId);
            var set = function(type, id) {
              return function() { return clients[0].call('set_unit_image', w.castles[0]._id, type, id, w.gameId); };
            };
            expectError(set('castles', 'castle_03_skull'), 'Player does not own image.', null, 'not bought');
            expectError(set('castles', 'castle_99'), 'Image id not found.', null, 'no such image');
            expectError(set('banners', 'castle_02_keep'), 'Image type not found.', null, 'no such type');
            dTest.assertUnchanged(w.gameId, before, 'a refused image changed the game');
          } finally {
            Meteor.users.update(w.users[0]._id, {$unset: {purchases: 1}});
          }
        });


        // --- activateProToken ---

        test('activateProToken: a token makes you pro in this game', function() {
          Meteor.users.update(w.users[0]._id, {$set: {proTokens: 2}});
          clients[0].call('activateProToken', w.gameId);
          equal(w.player(0).pro, true, 'pro in this game');
          equal(Meteor.users.findOne(w.users[0]._id).proTokens, 1, 'one token used');
          expectError(function() { return clients[0].call('activateProToken', w.gameId); },
            'You have already activated pro in this game.', null, 'twice');
          equal(Meteor.users.findOne(w.users[0]._id).proTokens, 1, 'no second token used');
        });

        test('activateProToken: without a token it is refused', function() {
          Meteor.users.update(w.users[0]._id, {$set: {proTokens: 0}});
          var before = dTest.snapshot(w.gameId);
          expectError(function() { return clients[0].call('activateProToken', w.gameId); },
            'User does not have any pro tokens.', null, 'no tokens');
          dTest.assertUnchanged(w.gameId, before, 'a refused activation changed the game');
        });

      } finally {
        clients.forEach(function(client) { client.close(); });
        dTest.waitForJobs();
        w.cleanup();
        dTest.ddp.resetRateLimits();
      }
    });
  });
}
