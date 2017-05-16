Future = Npm.require('fibers/future');


if (process.env.DOMINUS_WORKER == 'true') {
	Queues.collectCapitalIncome.process(Meteor.bindEnvironment(function(job) {

    let bulkCapitals = Capitals.rawCollection().initializeOrderedBulkOp();
    let bulkPlayers = Players.rawCollection().initializeOrderedBulkOp();
    let hasBulkOp = false;
		let hasBulkPlayerOp = false;

    Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).forEach(function(game) {

      const interval = _gs.capitals(game._id, 'incomeInterval');
      const cutoff = moment().subtract(interval, 'ms').toDate();
      const capitalFields = {playerId:1, countryId:1};
      Capitals.find({gameId:game._id, lastIncomeUpdate: {$lte:cutoff}}, {fields:capitalFields}).forEach(function(capital) {

				// how muc income capital collected
				let capitalIncome = {};

				// base income
				_s.market.types_plus_gold.forEach(function(type) {
					capitalIncome[type] = _gs.capitals(game._id, 'income.'+type);
					check(capitalIncome[type], validNumber);
				});

				// income from villages
				const villageFind = {countryId:capital.countryId, under_construction:false};
				const villageOptions = {fields: {income:1}};
				Villages.find(villageFind, villageOptions).forEach(function(village) {
					_s.market.types_plus_gold.forEach(function(type) {
						capitalIncome[type] += village.income[type] * _s.capitals.villagePercentageIncome;
						check(capitalIncome[type], validNumber);
					})
				});

				// worth in gold
				capitalIncome.worth = dMarket.resourcesToGold(game._id, capitalIncome);

				// update capital with income
				// always do this even if a player doesn't own capital
				let capitalSet = {};
				_s.market.types_plus_gold.forEach(function(type) {
					capitalSet['income.'+type] = capitalIncome[type];
				});
				capitalSet['income.worth'] = capitalIncome.worth;
				capitalSet.lastIncomeUpdate = new Date();
				bulkCapitals.find({_id:capital._id}).updateOne({$set:capitalSet});
				hasBulkOp = true;

				// if player owns capital update player
				if (capital.playerId) {
					let playerIncomeInc = {};
					_s.market.types_plus_gold.forEach(function(type) {
						playerIncomeInc['incomeFromCapitals.'+type] = capitalIncome[type];
						playerIncomeInc[type] = capitalIncome[type];
					});

					bulkPlayers.find({_id:capital.playerId}).updateOne({$inc:playerIncomeInc});
					hasBulkPlayerOp = true;
				}
      });
    });

		if (hasBulkOp) {
			var capFuture = new Future();
      bulkCapitals.execute({}, function(error, result) {
        if (error) {
          console.error(error);
        }
        capFuture.return(result);
      });
      var result = capFuture.wait();
		}

		if (hasBulkPlayerOp) {
			var playerFuture = new Future();
      bulkPlayers.execute({}, function(error, result) {
        if (error) {
          console.error(error);
        }
        playerFuture.return(result);
      });
      var result = playerFuture.wait();
		}

		return Promise.resolve();
  }));
}
