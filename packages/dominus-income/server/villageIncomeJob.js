

if (process.env.DOMINUS_WORKER == 'true') {
	Queues.collectVillageIncome.process(async function(job) {
		await collectVillageIncome();
  });
}


var collectVillageIncome = async function() {
	let bulkVillages = Villages.rawCollection().initializeOrderedBulkOp();
	let bulkPlayers = Players.rawCollection().initializeOrderedBulkOp();
	let hasBulkOp = false;

	for (const game of await Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).fetchAsync()) {

		const interval = _gs.villages(game._id, 'incomeInterval');
		const cutoff = moment(dClock.now()).subtract(interval, 'ms').toDate();
		const villageFields = {playerId:1, x:1, y:1, level:1};
		for (const village of await Villages.find({gameId:game._id, under_construction:false, lastIncomeUpdate: {$lte:cutoff}}, {fields:villageFields}).fetchAsync()) {

			const player = await Players.findOneAsync(village.playerId, {fields:{allies_above:1}});
			if (player) {

				let error = false;

				// #TODO this could be removed and cache village's income
				// includes large hex multipler
				const villageIncome = await dVillages.resourcesFromSurroundingHexes(game._id, village.x, village.y, _s.villages.num_rings_village);
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

					let percentPerLord = 1;
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
				villageIncome.worth = await dMarket.resourcesToGoldAsync(game._id, villageIncome);
				villageIncome.worth += _s.villages.gold_gained_at_village;
				check(villageIncome.worth, validNumber);

				let setVillage = {};
				_s.market.types_plus_gold.forEach(function(type) {
					setVillage['income.'+type] = villageIncome[type];
				})
				setVillage['income.worth'] = villageIncome.worth;
				setVillage.lastIncomeUpdate = dClock.now();

				bulkVillages.find({_id:village._id}).updateOne({$set:setVillage});
			}
		}
	}

	if (hasBulkOp) {
		await dIncome.executeBulk(bulkVillages);
		await dIncome.executeBulk(bulkPlayers);
	}
}

// exposed for server/bugFixTests.js
dIncome.collectVillageIncome = collectVillageIncome;
