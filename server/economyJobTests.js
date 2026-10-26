// Job tests: income, market, villages and stats (Oct 2026).
//
// Same approach as server/armyJobTests.js: each queue job's handler is run
// directly (dTest.runJob) in a real started game, and the jobs it adds are
// recorded rather than run (dTest.recordJobs). The tests describe what the
// jobs do today. A test named "known bug" describes a bug in today's code;
// fixing the bug means changing that test on purpose.
//
// collectVillageIncome's lord shares are tested in server/bugFixTests.js and
// the income and vassal ranks in server/gameCreationTests.js.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('jobs: income, market and villages (server/economyJobTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var runJob = dTest.runJob;

      if (process.env.DOMINUS_WORKER != 'true') {
        await run('economy jobs: need the worker', function() { return 'skip'; });
        return;
      }

      var w = await dTest.buildGameWorld({players: 2});

      // close enough for anything that goes through prices
      function near(actual, expected, message) {
        assert(Math.abs(actual - expected) <= Math.abs(expected) * 1e-9 + 1e-9,
          message + ' (expected ' + expected + ', got ' + actual + ')');
      }

      function recent(date) {
        return moment(date).isAfter(moment().subtract(1, 'minute'));
      }

      async function price(type) {
        return (await Market.findOneAsync({gameId: w.gameId, type: type})).price;
      }

      // every resource and gold, 0 unless given
      function resources(values) {
        var out = {};
        _s.market.types_plus_gold.forEach(function(type) { out[type] = (values && values[type]) || 0; });
        return out;
      }

      // the player's Dailystats doc for the current stats period
      async function dailystats(playerId) {
        return await Dailystats.findOneAsync({playerId: playerId,
          created_at: {$gte: _gs.statsBegin(w.gameId), $lt: _gs.statsEnd(w.gameId)}});
      }

      // a village doc for player i, inserted directly
      async function insertVillage(i, fields) {
        var hex = fields && _.has(fields, 'x') ? {x: fields.x, y: fields.y} : await w.freeHex();
        var id = await Villages.insertAsync(_.extend({gameId: w.gameId, x: hex.x, y: hex.y, playerId: w.players[i]._id,
          user_id: w.users[i]._id, username: w.players[i].username, name: 'Testville', level: 1,
          countryId: await Mapmaker.coordsToCountryId(w.gameId, hex.x, hex.y), income: resources(),
          under_construction: false, created_at: new Date(), lastIncomeUpdate: new Date()}, dTest.soldierCounts({}), fields || {}));
        await Mapmaker.buildingAdded(w.gameId, hex.x, hex.y);
        return await Villages.findOneAsync(id);
      }

      // an army for player i that runs none of its jobs
      async function quietArmy(i, soldiers, at) {
        var army;
        await dTest.recordJobs(async function() { army = await w.makeArmy(i, soldiers, at); });
        return army;
      }

      // every player's income fields as a fresh game would have them, not due
      async function resetIncome() {
        await Players.updateAsync({gameId: w.gameId}, {$set: {lastIncomeUpdate: new Date(), allies_above: [],
          incomeFromVassals: resources(), incomeFromVillages: resources(), incomeFromCapitals: resources()}}, {multi: true});
        await dTest.eachAsync(w.players, async function(p, i) { await w.setResources(i, {}); });
      }

      // the world's country has no capital, since buildGameWorld adds it directly
      async function worldCapital() {
        var c = await Capitals.findOneAsync({gameId: w.gameId});
        if (!c) {
          var country = await Countries.findOneAsync({gameId: w.gameId});
          c = await dCapitals.createCapital(w.gameId, country._id);
          if (!c) throw new Error('FAIL: could not place a capital');
          await Mapmaker.buildingAdded(w.gameId, c.x, c.y);
        }
        return await Capitals.findOneAsync(c._id);
      }

      var test = dTest.contractTest(run, async function() {
        await w.removeArmies();
        await Armypaths.removeAsync({gameId: w.gameId});
        await Villages.find({gameId: w.gameId}).forEachAsync(async function(v) {
          await Villages.removeAsync(v._id);
          await Mapmaker.buildingRemoved(w.gameId, v.x, v.y);
        });
        await Markers.removeAsync({gameId: w.gameId});
        await Dailystats.removeAsync({gameId: w.gameId});
        await Capitals.updateAsync({gameId: w.gameId}, {$set: {playerId: null, lastIncomeUpdate: new Date()}}, {multi: true});
        await resetIncome();
      });


      try {

        // --- collectCastleIncome ---

        await test('collectCastleIncome: a due player gets castle and vassal income, the breakdown is kept and the pending income reset', async function() {
          await resetIncome();
          var castle = _gs.castles(w.gameId, 'income');
          await Players.updateAsync(w.players[0]._id, {$set: {lastIncomeUpdate: new Date(0),
            incomeFromVassals: resources({gold: 10, grain: 2}), incomeFromVillages: resources({grain: 3}),
            incomeFromCapitals: resources({ore: 4})}});
          var other = JSON.stringify(await w.player(1));

          await runJob('collectCastleIncome', {});

          var p = await w.player(0);
          _s.market.types_plus_gold.forEach(function(type) {
            var vassal = {gold: 10, grain: 2}[type] || 0;
            near(p[type], castle[type] + vassal, type + ': castle and vassal income (village and capital income was paid by their own jobs)');
            near(p.castleIncome[type], castle[type], 'castleIncome.' + type);
            near(p.vassalIncome[type], vassal, 'vassalIncome.' + type);
            near(p.villageIncome[type], {grain: 3}[type] || 0, 'villageIncome.' + type);
            near(p.capitalIncome[type], {ore: 4}[type] || 0, 'capitalIncome.' + type);
            equal(p.incomeFromVassals[type], 0, 'incomeFromVassals.' + type + ' reset');
            equal(p.incomeFromVillages[type], 0, 'incomeFromVillages.' + type + ' reset');
            equal(p.incomeFromCapitals[type], 0, 'incomeFromCapitals.' + type + ' reset');
          });
          var total = {};
          _s.market.types_plus_gold.forEach(function(type) {
            total[type] = castle[type] + ({gold: 10, grain: 2 + 3, ore: 4}[type] || 0);
          });
          near(p.income, await dMarket.resourcesToGoldAsync(w.gameId, total), 'income: every source, in gold');
          assert(recent(p.lastIncomeUpdate), 'lastIncomeUpdate is now');
          equal(JSON.stringify(await w.player(1)), other, 'a player paid recently is not paid again');
        });

        await test('collectCastleIncome: known bug: a vassal\'s share is lost when the vassal is paid before its lord in the same run', async function() {
          var castle = _gs.castles(w.gameId, 'income');
          var pct = _s.income.percentToLords;

          // in the order the job reads them
          async function dueInOrder() {
            var cutoff = moment().subtract(_gs.castles(w.gameId, 'incomeInterval'), 'ms').toDate();
            return _.pluck(await Players.find({gameId: w.gameId, lastIncomeUpdate: {$lte: cutoff}},
              {fields: {lastIncomeUpdate: 1, username: 1, allies_above: 1, incomeFromVassals: 1, incomeFromCapitals: 1, incomeFromVillages: 1}}).fetchAsync(), '_id');
          }

          // lord read first: its pending income is reset, then the vassal's share arrives for next time
          await resetIncome();
          await Players.updateAsync({gameId: w.gameId}, {$set: {lastIncomeUpdate: new Date(0)}}, {multi: true});
          var order = await dueInOrder();
          equal(order.length, 2, 'both players due');
          await Players.updateAsync(order[1], {$set: {allies_above: [order[0]]}});
          await runJob('collectCastleIncome', {});
          var lord = await Players.findOneAsync(order[0]);
          _s.market.types_plus_gold.forEach(function(type) {
            near(lord.incomeFromVassals[type], castle[type] * pct, 'lord first: incomeFromVassals.' + type + ' kept for its next payment');
          });

          // vassal read first: its share is added, then the lord's reset wipes it
          await resetIncome();
          await Players.updateAsync({gameId: w.gameId}, {$set: {lastIncomeUpdate: new Date(0)}}, {multi: true});
          order = await dueInOrder();
          await Players.updateAsync(order[0], {$set: {allies_above: [order[1]]}});
          await runJob('collectCastleIncome', {});
          lord = await Players.findOneAsync(order[1]);
          _s.market.types_plus_gold.forEach(function(type) {
            equal(lord.incomeFromVassals[type], 0, 'vassal first: incomeFromVassals.' + type + ' lost');
            near(lord[type], castle[type], 'vassal first: the lord got only its own castle income of ' + type);
          });
        });


        // --- collectCapitalIncome ---

        await test('collectCapitalIncome: a due capital collects base income plus a share of its country\'s villages, and pays its owner', async function() {
          var capital = await worldCapital();
          await resetIncome();
          await Capitals.updateAsync({gameId: w.gameId}, {$set: {lastIncomeUpdate: new Date()}}, {multi: true});
          await Capitals.updateAsync(capital._id, {$set: {playerId: w.players[0]._id, lastIncomeUpdate: new Date(0)}});

          var spot = await w.freeHex([], function(h) { return h.countryId == capital.countryId; });
          var villageIncome = resources({gold: 50, grain: 100, ore: 30});
          await insertVillage(1, {x: spot.x, y: spot.y, income: villageIncome});
          var building = await w.freeHex([spot], function(h) { return h.countryId == capital.countryId; });
          await insertVillage(1, {x: building.x, y: building.y, income: resources({grain: 1000}), under_construction: true});

          await runJob('collectCapitalIncome', {});

          var share = _gs.capitals(w.gameId, 'villagePercentageIncome');
          var expected = {};
          _s.market.types_plus_gold.forEach(function(type) {
            expected[type] = _gs.capitals(w.gameId, 'income.' + type) + villageIncome[type] * share;
          });
          var after = await Capitals.findOneAsync(capital._id);
          var owner = await w.player(0);
          _s.market.types_plus_gold.forEach(function(type) {
            near(after.income[type], expected[type], 'capital income.' + type + ' (a village under construction adds nothing)');
            near(owner[type], expected[type], 'owner ' + type);
            near(owner.incomeFromCapitals[type], expected[type], 'owner incomeFromCapitals.' + type);
          });
          near(after.income.worth, await dMarket.resourcesToGoldAsync(w.gameId, expected), 'income.worth');
          assert(recent(after.lastIncomeUpdate), 'lastIncomeUpdate is now');
          equal((await w.player(1)).gold, 0, 'the village owner gets nothing from the capital');

          // an unowned capital still works out its income, and pays nobody
          await Capitals.updateAsync(capital._id, {$set: {playerId: null, lastIncomeUpdate: new Date(0), 'income.grain': 0}});
          var players = JSON.stringify(await Players.find({gameId: w.gameId}, {sort: {_id: 1}}).fetchAsync());
          await runJob('collectCapitalIncome', {});
          near((await Capitals.findOneAsync(capital._id)).income.grain, expected.grain, 'unowned: income.grain worked out');
          equal(JSON.stringify(await Players.find({gameId: w.gameId}, {sort: {_id: 1}}).fetchAsync()), players, 'unowned: no player paid');
        });

        await test('collectCapitalIncome: known bug: the village share is always the default 10%, even in a crazy fast game whose settings say 12%', async function() {
          var capital = await worldCapital();
          await Capitals.updateAsync({gameId: w.gameId}, {$set: {lastIncomeUpdate: new Date()}}, {multi: true});
          await Capitals.updateAsync(capital._id, {$set: {lastIncomeUpdate: new Date(0)}});
          var spot = await w.freeHex([], function(h) { return h.countryId == capital.countryId; });
          await insertVillage(1, {x: spot.x, y: spot.y, income: resources({grain: 100})});

          await Games.updateAsync(w.gameId, {$set: {isCrazyFast: true}});
          try {
            assert(await dTest.waitFor(function() { return _gs.capitals(w.gameId, 'villagePercentageIncome') == 0.12; }, 5000),
              'the game\'s settings say 12%');
            await runJob('collectCapitalIncome', {});
            near((await Capitals.findOneAsync(capital._id)).income.grain, _gs.capitals(w.gameId, 'income.grain') + 100 * _s.capitals.villagePercentageIncome,
              'paid at the default ' + _s.capitals.villagePercentageIncome);
          } finally {
            await Games.updateAsync(w.gameId, {$unset: {isCrazyFast: ''}});
            await dTest.waitFor(function() { return _gs.capitals(w.gameId, 'villagePercentageIncome') == _s.capitals.villagePercentageIncome; }, 5000);
          }
        });


        // --- collectVillageIncome ---

        await test('collectVillageIncome: the job pays a due village to its owner and leaves one paid recently', async function() {
          await resetIncome();
          var due = await insertVillage(0, {lastIncomeUpdate: new Date(0)});
          var notDue = await insertVillage(1);
          await runJob('collectVillageIncome', {});
          var after = await Villages.findOneAsync(due._id);
          equal(after.income.gold, _s.villages.gold_gained_at_village, 'income.gold');
          assert(recent(after.lastIncomeUpdate), 'lastIncomeUpdate is now');
          var owner = await w.player(0);
          _s.market.types_plus_gold.forEach(function(type) {
            near(owner[type], after.income[type], 'owner ' + type);
          });
          equal(JSON.stringify(await Villages.findOneAsync(notDue._id)), JSON.stringify(notDue), 'village paid recently unchanged');
          equal((await w.player(1)).gold, 0, 'its owner not paid');
        });


        // --- spendTaxes, record_market_history ---

        await test('spendTaxes: the game\'s taxes buy an equal share of each resource, raising its price, and are reset', async function() {
          await Games.updateAsync(w.gameId, {$set: {taxesCollected: 120}});
          var before = {};
          await dTest.eachAsync(_s.market.types, async function(type) { before[type] = await price(type); });

          await runJob('spendTaxes', {gameId: w.gameId});
          await dTest.eachAsync(_s.market.types, async function(type) {
            var amount = dMarket.max_buy_withoutRounding(120 / _s.market.types.length, before[type]);
            near(await price(type), before[type] * Math.pow(_s.market.increment + 1, amount), type + ' price');
            assert(await price(type) > before[type], type + ' price went up');
          });
          equal((await Games.findOneAsync(w.gameId)).taxesCollected, 0, 'taxes reset');

          // no taxes: no prices change
          var prices = JSON.stringify(await Market.find({gameId: w.gameId}, {sort: {_id: 1}}).fetchAsync());
          await runJob('spendTaxes', {gameId: w.gameId});
          equal(JSON.stringify(await Market.find({gameId: w.gameId}, {sort: {_id: 1}}).fetchAsync()), prices, 'prices unchanged');
          equal((await Games.findOneAsync(w.gameId)).taxesCollected, 0, 'taxes still 0');
        });

        await test('record_market_history: one doc per hour, adding up the quantity and keeping the latest prices', async function() {
          await Markethistory.removeAsync({gameId: w.gameId});
          var hour = moment().startOf('hour').valueOf();
          await runJob('record_market_history', {gameId: w.gameId, quantity: 5});
          var market = await Market.findOneAsync({gameId: w.gameId, type: 'grain'});
          await Market.updateAsync(market._id, {$set: {price: market.price * 2}});
          await runJob('record_market_history', {gameId: w.gameId, quantity: 3});
          if (moment().startOf('hour').valueOf() != hour) {
            return 'skip';  // ran across the hour
          }

          var docs = await Markethistory.find({gameId: w.gameId}).fetchAsync();
          equal(docs.length, 1, 'one doc for the hour');
          equal(docs[0].quantity, 8, 'quantities added up');
          await dTest.eachAsync(_s.market.types, async function(type) {
            near(docs[0].price[type], await price(type), 'latest ' + type + ' price');
          });
          near(docs[0].price.grain, market.price * 2, 'the changed grain price');
          await Market.updateAsync(market._id, {$set: {price: market.price}});
        });


        // --- villageConstructionJob, destroyVillage ---

        await test('villageConstructionJob: a finished village goes up a level and takes in its owner\'s stopped armies; others wait', async function() {
          var timeToBuild = _gs.villages(w.gameId, 'cost.level1.timeToBuild');
          var done = await insertVillage(0, {level: 0, under_construction: true, constructionStarted: moment().subtract(timeToBuild + 60000, 'ms').toDate()});
          var building = await insertVillage(0, {level: 0, under_construction: true, constructionStarted: new Date()});

          var stopped = await quietArmy(0, {footmen: 4, archers: 1}, done);
          var moving = await quietArmy(0, {footmen: 2}, done);
          await Armypaths.insertAsync({gameId: w.gameId, armyId: moving._id, index: 0, x: done.x + 1, y: done.y, user_id: moving.user_id});
          var visitor = await quietArmy(1, {footmen: 3}, done);

          await dTest.recordJobs(async function() {
            await runJob('villageConstructionJob', {gameId: w.gameId});
          });

          var v = await Villages.findOneAsync(done._id);
          equal(v.level, 1, 'level 1');
          equal(v.under_construction, false, 'finished');
          equal(v.footmen, 4, 'took in the stopped army\'s footmen');
          equal(v.archers, 1, 'and archers');
          assert(!await Armies.findOneAsync(stopped._id), 'stopped army gone');
          assert(await Armies.findOneAsync(moving._id), 'an army with a path stays an army');
          assert(await Armies.findOneAsync(visitor._id), 'another player\'s army stays');

          var b = await Villages.findOneAsync(building._id);
          equal(b.level, 0, 'not finished yet: still level 0');
          equal(b.under_construction, true, 'still under construction');
        });

        await test('destroyVillage: the village and its markers are removed, and its soldiers come out as a new army', async function() {
          var v = await insertVillage(0, {footmen: 7, archers: 2});
          var marker = await Markers.insertAsync({gameId: w.gameId, user_id: w.users[0]._id, unitType: 'village', unitId: v._id, x: v.x, y: v.y});
          var jobs = await dTest.recordJobs(async function() {
            await runJob('destroyVillage', {villageId: v._id});
          });
          assert(!await Villages.findOneAsync(v._id), 'village removed');
          assert(!await Markers.findOneAsync(marker), 'its marker removed');
          equal((await Hexes.findOneAsync({gameId: w.gameId, x: v.x, y: v.y})).hasBuilding, false, 'hex free again');
          var army = await Armies.findOneAsync({gameId: w.gameId, playerId: w.players[0]._id, x: v.x, y: v.y});
          assert(army, 'an army on the village\'s hex');
          equal(army.footmen, 7, 'footmen');
          equal(army.archers, 2, 'archers');
          equal(dTest.jobsNamed(jobs, 'enterNewHexCheck').length, 1, 'the new army\'s enterNewHexCheck queued');

          // no soldiers: no army
          var elsewhere = await w.freeHex([v]);
          var empty = await insertVillage(0, {x: elsewhere.x, y: elsewhere.y});
          await runJob('destroyVillage', {villageId: empty._id});
          assert(!await Villages.findOneAsync(empty._id), 'empty village removed');
          equal(await Armies.find({gameId: w.gameId, x: empty.x, y: empty.y}).countAsync(), 0, 'no army');

          // already gone: nothing happens
          await runJob('destroyVillage', {villageId: 'noSuchVillage'});
        });


        // --- update_losses_worth, updateIncomeStats ---

        await test('update_losses_worth: works out what a player\'s lost soldiers cost at today\'s prices, on the player and in Dailystats', async function() {
          await Players.updateAsync(w.players[0]._id, {$set: {losses: {footmen: 10, archers: 5}}});
          await Players.updateAsync(w.players[1]._id, {$unset: {losses: '', losses_worth: '', losses_num: ''}});

          await runJob('update_losses_worth', {playerId: w.players[0]._id});
          await runJob('update_losses_worth', {playerId: w.players[1]._id});

          var worth = 0;
          await dTest.eachAsync(_s.market.types, async function(type) {
            worth += await price(type) * (_s.armies.cost.footmen[type] * 10 + _s.armies.cost.archers[type] * 5);
          });
          var p = await w.player(0);
          near(p.losses_worth, worth, 'losses_worth');
          equal(p.losses_num, 15, 'losses_num');
          var stats = await dailystats(w.players[0]._id);
          assert(stats, 'a Dailystats doc for the period');
          near(stats.losses_worth, worth, 'Dailystats losses_worth');
          equal(stats.losses_num, 15, 'Dailystats losses_num');
          equal(stats.user_id, w.users[0]._id, 'Dailystats user_id');

          equal((await w.player(1)).losses_worth, undefined, 'no losses: nothing set');
          assert(!await dailystats(w.players[1]._id), 'no losses: no Dailystats doc');
          await Players.updateAsync(w.players[0]._id, {$unset: {losses: '', losses_worth: '', losses_num: ''}});
        });

        await test('updateIncomeStats: each player\'s income breakdown goes into Dailystats in gold', async function() {
          var incomes = {castleIncome: {grain: 10, gold: 5}, villageIncome: {ore: 3}, capitalIncome: {}, vassalIncome: {gold: 2}};
          await Players.updateAsync(w.players[0]._id, {$set: incomes});
          await Players.updateAsync(w.players[1]._id, {$unset: {castleIncome: '', villageIncome: '', capitalIncome: '', vassalIncome: ''}});

          await runJob('updateIncomeStats', {gameId: w.gameId});

          var stats = await dailystats(w.players[0]._id);
          var total = 0;
          for (var field of ['castleIncome', 'villageIncome', 'capitalIncome', 'vassalIncome']) {
            var gold = await dMarket.resourcesToGoldAsync(w.gameId, incomes[field]);
            near(stats[field], gold, field);
            total += gold;
          }
          near(stats.totalIncome, total, 'totalIncome');
          assert(total > 0, 'some income to record');

          var none = await dailystats(w.players[1]._id);
          assert(none, 'a player with no income still gets a doc');
          equal(none.totalIncome, 0, 'totalIncome 0');
        });

      } finally {
        await w.cleanup();
      }
    });
  });
}
