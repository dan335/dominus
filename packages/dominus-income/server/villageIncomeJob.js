

if (process.env.DOMINUS_WORKER == 'true') {
	Queues.collectVillageIncome.process(Meteor.bindEnvironment(function(job) {
		collectVillageIncome();
		return Promise.resolve();
  }));
}

Future = Npm.require('fibers/future');


var collectVillageIncome = function() {
	let bulkVillages = Villages.rawCollection().initializeOrderedBulkOp();
	let bulkPlayers = Players.rawCollection().initializeOrderedBulkOp();
	let hasBulkOp = false;

	Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).forEach(function(game) {

		const interval = _gs.villages(game._id, 'incomeInterval');
		const cutoff = moment().subtract(interval, 'ms').toDate();
		const villageFields = {playerId:1, x:1, y:1, level:1};
		Villages.find({gameId:game._id, under_construction:false, lastIncomeUpdate: {$lte:cutoff}}, {fields:villageFields}).forEach(function(village) {

			const player = Players.findOne(village.playerId, {fields:{allies_above:1}});
			if (player) {

				let error = false;

				// #TODO this could be removed and cache village's income
				// includes large hex multipler
				const villageIncome = dVillages.resourcesFromSurroundingHexes(game._id, village.x, village.y, _s.villages.num_rings_village);
				villageIncome.gold = _s.villages.gold_gained_at_village;

				// check numbers
				_s.market.types_plus_gold.forEach(function(type) {
					check(villageIncome[type], validNumber);
				});

				// update player
				let playerIncomeInc = {};
				_s.market.types_plus_gold.forEach(function(type) {
					playerIncomeInc['incomeFromVillages.'+type] = villageIncome[type];
					playerIncomeInc[type] = villageIncome[type];
				});

				// addIncome to player
				bulkPlayers.find({_id:player._id}).updateOne({$inc:playerIncomeInc});
				hasBulkOp = true;

				// send to lords
				const numAbove = player.allies_above.length;
				if (numAbove) {

					let percentToLords = 1;
					if (numAbove <= _s.income.maxToLords / _s.income.percentToLords) {
						percentPerLord = _s.income.percentToLords;
					} else {
						percentPerLord = _s.income.maxToLords / numAbove;
					}

					let lordInc = {};
					_s.market.types_plus_gold.forEach(function(type) {
						lordInc['incomeFromVassals.'+type] = villageIncome[type] * percentPerLord;
					});

					bulkPlayers.find({_id: {$in:player.allies_above}}).update({$inc:lordInc});
				}

				// find worth for rankings and right panel
				villageIncome.worth = dMarket.resourcesToGold(game._id, villageIncome);
				villageIncome.worth += _s.villages.gold_gained_at_village;
				check(villageIncome.worth, validNumber);

				let setVillage = {};
				_s.market.types_plus_gold.forEach(function(type) {
					setVillage['income.'+type] = villageIncome[type];
				})
				setVillage['income.worth'] = villageIncome.worth;
				setVillage.lastIncomeUpdate = new Date();

				bulkVillages.find({_id:village._id}).updateOne({$set:setVillage});
			}
		});
	});

	if (hasBulkOp) {
		const villageFuture = new Future();
		bulkVillages.execute({}, function(error, result) {
			if (error) {
				console.error(error);
			}
			villageFuture.return(result);
		});
		villageFuture.wait();

		const playerFuture = new Future();
		bulkPlayers.execute({}, function(error, result) {
			if (error) {
				console.error(error);
			}
			playerFuture.return(result);
		});
		playerFuture.wait();
	}
}
