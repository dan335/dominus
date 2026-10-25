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
    dTest.addSuite('jobs: income, market and villages (server/economyJobTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var runJob = dTest.runJob;

      if (process.env.DOMINUS_WORKER != 'true') {
        run('economy jobs: need the worker', function() { return 'skip'; });
        return;
      }

      var w = dTest.buildGameWorld({players: 2});

      // close enough for anything that goes through prices
      function near(actual, expected, message) {
        assert(Math.abs(actual - expected) <= Math.abs(expected) * 1e-9 + 1e-9,
          message + ' (expected ' + expected + ', got ' + actual + ')');
      }

      function recent(date) {
        return moment(date).isAfter(moment().subtract(1, 'minute'));
      }

      function price(type) {
        return Market.findOne({gameId: w.gameId, type: type}).price;
      }

      // every resource and gold, 0 unless given
      function resources(values) {
        var out = {};
        _s.market.types_plus_gold.forEach(function(type) { out[type] = (values && values[type]) || 0; });
        return out;
      }

      // the player's Dailystats doc for the current stats period
      function dailystats(playerId) {
        return Dailystats.findOne({playerId: playerId,
          created_at: {$gte: _gs.statsBegin(w.gameId), $lt: _gs.statsEnd(w.gameId)}});
      }

      // a village doc for player i, inserted directly
      function insertVillage(i, fields) {
        var hex = fields && _.has(fields, 'x') ? {x: fields.x, y: fields.y} : w.freeHex();
        var id = Villages.insert(_.extend({gameId: w.gameId, x: hex.x, y: hex.y, playerId: w.players[i]._id,
          user_id: w.users[i]._id, username: w.players[i].username, name: 'Testville', level: 1,
          countryId: Mapmaker.coordsToCountryId(w.gameId, hex.x, hex.y), income: resources(),
          under_construction: false, created_at: new Date(), lastIncomeUpdate: new Date()}, dTest.soldierCounts({}), fields || {}));
        Mapmaker.buildingAdded(w.gameId, hex.x, hex.y);
        return Villages.findOne(id);
      }

      // an army for player i that runs none of its jobs
      function quietArmy(i, soldiers, at) {
        var army;
        dTest.recordJobs(function() { army = w.makeArmy(i, soldiers, at); });
        return army;
      }

      // every player's income fields as a fresh game would have them, not due
      function resetIncome() {
        Players.update({gameId: w.gameId}, {$set: {lastIncomeUpdate: new Date(), allies_above: [],
          incomeFromVassals: resources(), incomeFromVillages: resources(), incomeFromCapitals: resources()}}, {multi: true});
        w.players.forEach(function(p, i) { w.setResources(i, {}); });
      }

      // the world's country has no capital, since buildGameWorld adds it directly
      function worldCapital() {
        var c = Capitals.findOne({gameId: w.gameId});
        if (!c) {
          var country = Countries.findOne({gameId: w.gameId});
          c = dTest.settle(dCapitals.createCapital(w.gameId, country._id));
          if (!c) throw new Error('FAIL: could not place a capital');
          Mapmaker.buildingAdded(w.gameId, c.x, c.y);
        }
        return Capitals.findOne(c._id);
      }

      var test = dTest.contractTest(run, function() {
        w.removeArmies();
        Armypaths.remove({gameId: w.gameId});
        Villages.find({gameId: w.gameId}).forEach(function(v) {
          Villages.remove(v._id);
          Mapmaker.buildingRemoved(w.gameId, v.x, v.y);
        });
        Markers.remove({gameId: w.gameId});
        Dailystats.remove({gameId: w.gameId});
        Capitals.update({gameId: w.gameId}, {$set: {playerId: null, lastIncomeUpdate: new Date()}}, {multi: true});
        resetIncome();
      });


      try {

        // --- collectCastleIncome ---

        test('collectCastleIncome: a due player gets castle and vassal income, the breakdown is kept and the pending income reset', function() {
          resetIncome();
          var castle = _gs.castles(w.gameId, 'income');
          Players.update(w.players[0]._id, {$set: {lastIncomeUpdate: new Date(0),
            incomeFromVassals: resources({gold: 10, grain: 2}), incomeFromVillages: resources({grain: 3}),
            incomeFromCapitals: resources({ore: 4})}});
          var other = JSON.stringify(w.player(1));

          runJob('collectCastleIncome', {});

          var p = w.player(0);
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
          near(p.income, dMarket.resourcesToGold(w.gameId, total), 'income: every source, in gold');
          assert(recent(p.lastIncomeUpdate), 'lastIncomeUpdate is now');
          equal(JSON.stringify(w.player(1)), other, 'a player paid recently is not paid again');
        });

        test('collectCastleIncome: known bug: a vassal\'s share is lost when the vassal is paid before its lord in the same run', function() {
          var castle = _gs.castles(w.gameId, 'income');
          var pct = _s.income.percentToLords;

          // in the order the job reads them
          function dueInOrder() {
            var cutoff = moment().subtract(_gs.castles(w.gameId, 'incomeInterval'), 'ms').toDate();
            return _.pluck(Players.find({gameId: w.gameId, lastIncomeUpdate: {$lte: cutoff}},
              {fields: {lastIncomeUpdate: 1, username: 1, allies_above: 1, incomeFromVassals: 1, incomeFromCapitals: 1, incomeFromVillages: 1}}).fetch(), '_id');
          }

          // lord read first: its pending income is reset, then the vassal's share arrives for next time
          resetIncome();
          Players.update({gameId: w.gameId}, {$set: {lastIncomeUpdate: new Date(0)}}, {multi: true});
          var order = dueInOrder();
          equal(order.length, 2, 'both players due');
          Players.update(order[1], {$set: {allies_above: [order[0]]}});
          runJob('collectCastleIncome', {});
          var lord = Players.findOne(order[0]);
          _s.market.types_plus_gold.forEach(function(type) {
            near(lord.incomeFromVassals[type], castle[type] * pct, 'lord first: incomeFromVassals.' + type + ' kept for its next payment');
          });

          // vassal read first: its share is added, then the lord's reset wipes it
          resetIncome();
          Players.update({gameId: w.gameId}, {$set: {lastIncomeUpdate: new Date(0)}}, {multi: true});
          order = dueInOrder();
          Players.update(order[0], {$set: {allies_above: [order[1]]}});
          runJob('collectCastleIncome', {});
          lord = Players.findOne(order[1]);
          _s.market.types_plus_gold.forEach(function(type) {
            equal(lord.incomeFromVassals[type], 0, 'vassal first: incomeFromVassals.' + type + ' lost');
            near(lord[type], castle[type], 'vassal first: the lord got only its own castle income of ' + type);
          });
        });


        // --- collectCapitalIncome ---

        test('collectCapitalIncome: a due capital collects base income plus a share of its country\'s villages, and pays its owner', function() {
          var capital = worldCapital();
          resetIncome();
          Capitals.update({gameId: w.gameId}, {$set: {lastIncomeUpdate: new Date()}}, {multi: true});
          Capitals.update(capital._id, {$set: {playerId: w.players[0]._id, lastIncomeUpdate: new Date(0)}});

          var spot = w.freeHex([], function(h) { return h.countryId == capital.countryId; });
          var villageIncome = resources({gold: 50, grain: 100, ore: 30});
          insertVillage(1, {x: spot.x, y: spot.y, income: villageIncome});
          var building = w.freeHex([spot], function(h) { return h.countryId == capital.countryId; });
          insertVillage(1, {x: building.x, y: building.y, income: resources({grain: 1000}), under_construction: true});

          runJob('collectCapitalIncome', {});

          var share = _gs.capitals(w.gameId, 'villagePercentageIncome');
          var expected = {};
          _s.market.types_plus_gold.forEach(function(type) {
            expected[type] = _gs.capitals(w.gameId, 'income.' + type) + villageIncome[type] * share;
          });
          var after = Capitals.findOne(capital._id);
          var owner = w.player(0);
          _s.market.types_plus_gold.forEach(function(type) {
            near(after.income[type], expected[type], 'capital income.' + type + ' (a village under construction adds nothing)');
            near(owner[type], expected[type], 'owner ' + type);
            near(owner.incomeFromCapitals[type], expected[type], 'owner incomeFromCapitals.' + type);
          });
          near(after.income.worth, dMarket.resourcesToGold(w.gameId, expected), 'income.worth');
          assert(recent(after.lastIncomeUpdate), 'lastIncomeUpdate is now');
          equal(w.player(1).gold, 0, 'the village owner gets nothing from the capital');

          // an unowned capital still works out its income, and pays nobody
          Capitals.update(capital._id, {$set: {playerId: null, lastIncomeUpdate: new Date(0), 'income.grain': 0}});
          var players = JSON.stringify(Players.find({gameId: w.gameId}, {sort: {_id: 1}}).fetch());
          runJob('collectCapitalIncome', {});
          near(Capitals.findOne(capital._id).income.grain, expected.grain, 'unowned: income.grain worked out');
          equal(JSON.stringify(Players.find({gameId: w.gameId}, {sort: {_id: 1}}).fetch()), players, 'unowned: no player paid');
        });

        test('collectCapitalIncome: known bug: the village share is always the default 10%, even in a crazy fast game whose settings say 12%', function() {
          var capital = worldCapital();
          Capitals.update({gameId: w.gameId}, {$set: {lastIncomeUpdate: new Date()}}, {multi: true});
          Capitals.update(capital._id, {$set: {lastIncomeUpdate: new Date(0)}});
          var spot = w.freeHex([], function(h) { return h.countryId == capital.countryId; });
          insertVillage(1, {x: spot.x, y: spot.y, income: resources({grain: 100})});

          Games.update(w.gameId, {$set: {isCrazyFast: true}});
          try {
            assert(dTest.waitFor(function() { return _gs.capitals(w.gameId, 'villagePercentageIncome') == 0.12; }, 5000),
              'the game\'s settings say 12%');
            runJob('collectCapitalIncome', {});
            near(Capitals.findOne(capital._id).income.grain, _gs.capitals(w.gameId, 'income.grain') + 100 * _s.capitals.villagePercentageIncome,
              'paid at the default ' + _s.capitals.villagePercentageIncome);
          } finally {
            Games.update(w.gameId, {$unset: {isCrazyFast: ''}});
            dTest.waitFor(function() { return _gs.capitals(w.gameId, 'villagePercentageIncome') == _s.capitals.villagePercentageIncome; }, 5000);
          }
        });


        // --- collectVillageIncome ---

        test('collectVillageIncome: the job pays a due village to its owner and leaves one paid recently', function() {
          resetIncome();
          var due = insertVillage(0, {lastIncomeUpdate: new Date(0)});
          var notDue = insertVillage(1);
          runJob('collectVillageIncome', {});
          var after = Villages.findOne(due._id);
          equal(after.income.gold, _s.villages.gold_gained_at_village, 'income.gold');
          assert(recent(after.lastIncomeUpdate), 'lastIncomeUpdate is now');
          var owner = w.player(0);
          _s.market.types_plus_gold.forEach(function(type) {
            near(owner[type], after.income[type], 'owner ' + type);
          });
          equal(JSON.stringify(Villages.findOne(notDue._id)), JSON.stringify(notDue), 'village paid recently unchanged');
          equal(w.player(1).gold, 0, 'its owner not paid');
        });


        // --- spendTaxes, record_market_history ---

        test('spendTaxes: the game\'s taxes buy an equal share of each resource, raising its price, and are reset', function() {
          Games.update(w.gameId, {$set: {taxesCollected: 120}});
          var before = {};
          _s.market.types.forEach(function(type) { before[type] = price(type); });

          runJob('spendTaxes', {gameId: w.gameId});
          _s.market.types.forEach(function(type) {
            var amount = dMarket.max_buy_withoutRounding(120 / _s.market.types.length, before[type]);
            near(price(type), before[type] * Math.pow(_s.market.increment + 1, amount), type + ' price');
            assert(price(type) > before[type], type + ' price went up');
          });
          equal(Games.findOne(w.gameId).taxesCollected, 0, 'taxes reset');

          // no taxes: no prices change
          var prices = JSON.stringify(Market.find({gameId: w.gameId}, {sort: {_id: 1}}).fetch());
          runJob('spendTaxes', {gameId: w.gameId});
          equal(JSON.stringify(Market.find({gameId: w.gameId}, {sort: {_id: 1}}).fetch()), prices, 'prices unchanged');
          equal(Games.findOne(w.gameId).taxesCollected, 0, 'taxes still 0');
        });

        test('record_market_history: one doc per hour, adding up the quantity and keeping the latest prices', function() {
          Markethistory.remove({gameId: w.gameId});
          var hour = moment().startOf('hour').valueOf();
          runJob('record_market_history', {gameId: w.gameId, quantity: 5});
          var market = Market.findOne({gameId: w.gameId, type: 'grain'});
          Market.update(market._id, {$set: {price: market.price * 2}});
          runJob('record_market_history', {gameId: w.gameId, quantity: 3});
          if (moment().startOf('hour').valueOf() != hour) {
            return 'skip';  // ran across the hour
          }

          var docs = Markethistory.find({gameId: w.gameId}).fetch();
          equal(docs.length, 1, 'one doc for the hour');
          equal(docs[0].quantity, 8, 'quantities added up');
          _s.market.types.forEach(function(type) {
            near(docs[0].price[type], price(type), 'latest ' + type + ' price');
          });
          near(docs[0].price.grain, market.price * 2, 'the changed grain price');
          Market.update(market._id, {$set: {price: market.price}});
        });


        // --- villageConstructionJob, destroyVillage ---

        test('villageConstructionJob: a finished village goes up a level and takes in its owner\'s stopped armies; others wait', function() {
          var timeToBuild = _gs.villages(w.gameId, 'cost.level1.timeToBuild');
          var done = insertVillage(0, {level: 0, under_construction: true, constructionStarted: moment().subtract(timeToBuild + 60000, 'ms').toDate()});
          var building = insertVillage(0, {level: 0, under_construction: true, constructionStarted: new Date()});

          var stopped = quietArmy(0, {footmen: 4, archers: 1}, done);
          var moving = quietArmy(0, {footmen: 2}, done);
          Armypaths.insert({gameId: w.gameId, armyId: moving._id, index: 0, x: done.x + 1, y: done.y, user_id: moving.user_id});
          var visitor = quietArmy(1, {footmen: 3}, done);

          dTest.recordJobs(function() {
            runJob('villageConstructionJob', {gameId: w.gameId});
          });

          var v = Villages.findOne(done._id);
          equal(v.level, 1, 'level 1');
          equal(v.under_construction, false, 'finished');
          equal(v.footmen, 4, 'took in the stopped army\'s footmen');
          equal(v.archers, 1, 'and archers');
          assert(!Armies.findOne(stopped._id), 'stopped army gone');
          assert(Armies.findOne(moving._id), 'an army with a path stays an army');
          assert(Armies.findOne(visitor._id), 'another player\'s army stays');

          var b = Villages.findOne(building._id);
          equal(b.level, 0, 'not finished yet: still level 0');
          equal(b.under_construction, true, 'still under construction');
        });

        test('destroyVillage: the village and its markers are removed, and its soldiers come out as a new army', function() {
          var v = insertVillage(0, {footmen: 7, archers: 2});
          var marker = Markers.insert({gameId: w.gameId, user_id: w.users[0]._id, unitType: 'village', unitId: v._id, x: v.x, y: v.y});
          var jobs = dTest.recordJobs(function() {
            runJob('destroyVillage', {villageId: v._id});
          });
          assert(!Villages.findOne(v._id), 'village removed');
          assert(!Markers.findOne(marker), 'its marker removed');
          equal(Hexes.findOne({gameId: w.gameId, x: v.x, y: v.y}).hasBuilding, false, 'hex free again');
          var army = Armies.findOne({gameId: w.gameId, playerId: w.players[0]._id, x: v.x, y: v.y});
          assert(army, 'an army on the village\'s hex');
          equal(army.footmen, 7, 'footmen');
          equal(army.archers, 2, 'archers');
          equal(dTest.jobsNamed(jobs, 'enterNewHexCheck').length, 1, 'the new army\'s enterNewHexCheck queued');

          // no soldiers: no army
          var elsewhere = w.freeHex([v]);
          var empty = insertVillage(0, {x: elsewhere.x, y: elsewhere.y});
          runJob('destroyVillage', {villageId: empty._id});
          assert(!Villages.findOne(empty._id), 'empty village removed');
          equal(Armies.find({gameId: w.gameId, x: empty.x, y: empty.y}).count(), 0, 'no army');

          // already gone: nothing happens
          runJob('destroyVillage', {villageId: 'noSuchVillage'});
        });


        // --- update_losses_worth, updateIncomeStats ---

        test('update_losses_worth: works out what a player\'s lost soldiers cost at today\'s prices, on the player and in Dailystats', function() {
          Players.update(w.players[0]._id, {$set: {losses: {footmen: 10, archers: 5}}});
          Players.update(w.players[1]._id, {$unset: {losses: '', losses_worth: '', losses_num: ''}});

          runJob('update_losses_worth', {playerId: w.players[0]._id});
          runJob('update_losses_worth', {playerId: w.players[1]._id});

          var worth = 0;
          _s.market.types.forEach(function(type) {
            worth += price(type) * (_s.armies.cost.footmen[type] * 10 + _s.armies.cost.archers[type] * 5);
          });
          var p = w.player(0);
          near(p.losses_worth, worth, 'losses_worth');
          equal(p.losses_num, 15, 'losses_num');
          var stats = dailystats(w.players[0]._id);
          assert(stats, 'a Dailystats doc for the period');
          near(stats.losses_worth, worth, 'Dailystats losses_worth');
          equal(stats.losses_num, 15, 'Dailystats losses_num');
          equal(stats.user_id, w.users[0]._id, 'Dailystats user_id');

          equal(w.player(1).losses_worth, undefined, 'no losses: nothing set');
          assert(!dailystats(w.players[1]._id), 'no losses: no Dailystats doc');
          Players.update(w.players[0]._id, {$unset: {losses: '', losses_worth: '', losses_num: ''}});
        });

        test('updateIncomeStats: each player\'s income breakdown goes into Dailystats in gold', function() {
          var incomes = {castleIncome: {grain: 10, gold: 5}, villageIncome: {ore: 3}, capitalIncome: {}, vassalIncome: {gold: 2}};
          Players.update(w.players[0]._id, {$set: incomes});
          Players.update(w.players[1]._id, {$unset: {castleIncome: '', villageIncome: '', capitalIncome: '', vassalIncome: ''}});

          runJob('updateIncomeStats', {gameId: w.gameId});

          var stats = dailystats(w.players[0]._id);
          var total = 0;
          ['castleIncome', 'villageIncome', 'capitalIncome', 'vassalIncome'].forEach(function(field) {
            var gold = dMarket.resourcesToGold(w.gameId, incomes[field]);
            near(stats[field], gold, field);
            total += gold;
          });
          near(stats.totalIncome, total, 'totalIncome');
          assert(total > 0, 'some income to record');

          var none = dailystats(w.players[1]._id);
          assert(none, 'a player with no income still gets a doc');
          equal(none.totalIncome, 0, 'totalIncome 0');
        });

      } finally {
        w.cleanup();
      }
    });
  });
}
