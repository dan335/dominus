Future = Npm.require('fibers/future');



if (process.env.DOMINUS_WORKER == 'true') {
	Queues.collectCastleIncome.process(Meteor.bindEnvironment(function(job) {
		dIncome.collectCastleIncome();
		return Promise.resolve();
  }));
}



dIncome.collectCastleIncome = function() {

	let bulkPlayers = Players.rawCollection().initializeOrderedBulkOp();
	let hasBulkOp = false;
	const playerFields = {lastIncomeUpdate:1, username:1, allies_above:1, incomeFromVassals:1, incomeFromCapitals:1, incomeFromVillages:1};

	Games.find({hasStarted:true, hasEnded:false}, {fields: {_id:1}}).forEach(function(game) {

		const interval = _gs.castles(game._id, 'incomeInterval');
		const cutoff = moment().subtract(interval, 'ms').toDate();

		// base castle income
		let incomeFromCastle = _gs.castles(game._id, 'income');

		Players.find({gameId:game._id, lastIncomeUpdate:{$lte:cutoff}}, {fields:playerFields}).forEach(function(player) {
			hasBulkOp = true;

			// defaults
			if (!player.incomeFromVillages) {
				player.incomeFromVillages = {};
			}
			if (!player.incomeFromCapitals) {
				player.incomeFromCapitals = {};
			}
			if (!player.incomeFromVassals) {
				player.incomeFromVassals = {};
			}

			_s.market.types_plus_gold.forEach(function(type) {
				if (!player.incomeFromVillages[type]) {player.incomeFromVillages[type] = 0;}
				if (!player.incomeFromCapitals[type]) {player.incomeFromCapitals[type] = 0;}
				if (!player.incomeFromVassals[type]) {player.incomeFromVassals[type] = 0;}
			});

			// add income to player
			let playerInc = {};
			_s.market.types_plus_gold.forEach(function(type) {
				playerInc[type] = incomeFromCastle[type] + player.incomeFromVassals[type];
			});

			// track income in player
			let playerSet = {};
			_s.market.types_plus_gold.forEach(function(type) {
				playerSet['villageIncome.'+type] = player.incomeFromVillages[type];
				playerSet['capitalIncome.'+type] = player.incomeFromCapitals[type];
				playerSet['castleIncome.'+type] = incomeFromCastle[type];
				playerSet['vassalIncome.'+type] = player.incomeFromVassals[type];
			});

			//playerSet.lastIncomeUpdate = new Date();

			// total income worth
			let totalIncome = {};
			_s.market.types_plus_gold.forEach(function(type) {
				totalIncome[type] = incomeFromCastle[type] + player.incomeFromVassals[type] + player.incomeFromVillages[type] + player.incomeFromCapitals[type];

				// reset for future updates
				playerSet['incomeFromVillages.'+type] = 0;
				playerSet['incomeFromCapitals.'+type] = 0;
				playerSet['incomeFromVassals.'+type] = 0;
			});

			// total income worth
			playerSet.income = dMarket.resourcesToGold(game._id, totalIncome);

			// update player
			bulkPlayers.find({_id:player._id}).updateOne({
				$inc:playerInc,
				$set:playerSet,
				$currentDate: {lastIncomeUpdate:true}
			});
			// Players.update(player._id, {
			// 	$inc:playerInc,
			// 	$set:playerSet,
			// 	$currentDate: {lastIncomeUpdate:true}
			// });

			// send castle money to lords
			const numAbove = player.allies_above.length;
			if (numAbove) {

				// figure out how much to send
				let percentPerLord = 1;
				if (numAbove <= _s.income.maxToLords / _s.income.percentToLords) {
					percentPerLord = _s.income.percentToLords;
				} else {
					percentPerLord = _s.income.maxToLords / numAbove;
				}

				let lordIncome = {};
				_s.market.types_plus_gold.forEach(function(type) {
					lordIncome['incomeFromVassals.'+type] = incomeFromCastle[type] * percentPerLord;
				});

				// player.allies_above.forEach(function(lord) {
				// 	bulkPlayers.find({_id:lord}).updateOne({$inc:lordIncome});
				// })

				bulkPlayers.find({_id: {$in:player.allies_above}}).update({$inc:lordIncome});

				//Players.update({_id: {$in: player.allies_above}}, {$inc:lordIncome}, {multi:true});
			}
		});
	});

	if (hasBulkOp) {
		let future = new Future();
		bulkPlayers.execute({}, function(error, result) {
			if (error) {
				console.error(error);
			}
			future.return(result);
		});
		let result = future.wait();
		//console.log(result.writeErrors, result.writeConcernErrors, result.nInserted, result.nUpserted, result.nMatched, result.nModified, result.nRemoved)
	}
}
