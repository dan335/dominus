




if (process.env.DOMINUS_WORKER == 'true') {
  Queues.update_losses_worth.process(async function(job) {
    await dGraphs.update_losses_worth(job.data.playerId);
  });
}


dGraphs.update_losses_worth = async function(playerId) {
	check(playerId, String);

	var player = await Players.findOneAsync(playerId, {fields: {losses:1, gameId:1, userId:1}})
	if (player && player.losses) {
		// worth of losses in gold
		var worth = {gold: 0}

		_s.market.types.forEach(function(t) {
			worth[t] = 0
		})

		_s.market.types.forEach(function(t) {
			_s.armies.types.forEach(function(type) {
				if (player.losses[type]) {
					worth[t] += _s.armies.cost[type][t] * player.losses[type]
				}
			})
		})

		worth.total = worth.gold

		// convert to gold
		for (const t of _s.market.types) {
			var m = await Market.findOneAsync({gameId:player.gameId, type: t}, {fields: {price: 1}})
			if (!m) { continue }
			worth.total += m.price * worth[t]
		}

		check(worth.total, validNumber)

		// number of soldiers
		var num = 0
		_s.armies.types.forEach(function(type) {
			if (player.losses[type]) {
				num += player.losses[type]
			}
		})

		check(num, validNumber)
		check(player.userId, String);
		await Dailystats.upsertAsync({
			playerId:playerId,
			created_at: {$gte: _gs.statsBegin(player.gameId), $lt: _gs.statsEnd(player.gameId)}
		}, {
			$setOnInsert: {
				gameId:player.gameId,
				playerId:playerId,
				created_at: dClock.now(),
				user_id:player.userId
			}, $set: {
				losses_worth:worth.total,
				losses_num:num,
				updated_at:dClock.now()
			}
		})
		await Players.updateAsync(playerId, {$set: {losses_worth:worth.total, losses_num:num}})
	}
}





if (process.env.DOMINUS_WORKER == 'true') {
  Queues.updateIncomeStats.process(async function(job) {

    const playerFields = {gameId:1, castleIncome:1, capitalIncome:1, villageIncome:1, vassalIncome:1, userId:1};
		for (const player of await Players.find({gameId:job.data.gameId}, {fields:playerFields}).fetchAsync()) {
			await dGraphs.updateIncomeStats(player);
		}
  });
}

dGraphs.updateIncomeStats = async function(player) {

  let totalIncome = 0;
  let capitalIncome = 0;
  let castleIncome = 0;
  let villageIncome = 0;
  let vassalIncome = 0;

  if (player.castleIncome || player.capitalIncome || player.villageIncome || player.vassalIncome) {
    totalIncome += dMarket.resourcesToGold(player.gameId, player.castleIncome);
    totalIncome += dMarket.resourcesToGold(player.gameId, player.capitalIncome);
    totalIncome += dMarket.resourcesToGold(player.gameId, player.villageIncome);
    totalIncome += dMarket.resourcesToGold(player.gameId, player.vassalIncome);
  }

  if (player.capitalIncome) {
    capitalIncome = dMarket.resourcesToGold(player.gameId, player.capitalIncome);
  }

  if (player.castleIncome) {
    castleIncome = dMarket.resourcesToGold(player.gameId, player.castleIncome);
  }

  if (player.villageIncome) {
    villageIncome = dMarket.resourcesToGold(player.gameId, player.villageIncome);
  }

  if (player.vassalIncome) {
    vassalIncome = dMarket.resourcesToGold(player.gameId, player.vassalIncome);
  }

	check(player.userId, String);
	await Dailystats.upsertAsync({
		playerId: player._id,
		created_at: {$gte: _gs.statsBegin(player.gameId), $lt: _gs.statsEnd(player.gameId)}
	}, {
		$setOnInsert: {
			gameId:player.gameId,
			playerId:player._id,
			user_id:player.userId,
			created_at: dClock.now()
		},
		$set: {
      totalIncome:totalIncome,
      capitalIncome:capitalIncome,
      castleIncome:castleIncome,
      villageIncome:villageIncome,
      vassalIncome:vassalIncome,
			updated_at:dClock.now()
		}
	})
}





if (process.env.DOMINUS_WORKER == 'true') {
  Queues.updateIncomeRank.process(async function(job) {
    await dGraphs.updateIncomeRank(job.data.gameId);
  });
}



dGraphs.updateIncomeRank = async function(gameId) {
	var rank = 1
	var prevIncome = null

	for (const player of await Players.find({gameId:gameId}, {sort: {income:-1}, fields: {userId:1, income:1}}).fetchAsync()) {

		check(player.userId, String);

		// dense ranking: tied values share a rank; rank increases by 1 on each
		// new (lower) value. Compare with !== null, not truthiness -- a previous
		// value of 0 (the common case: most players have 0 income) was treated as
		// "no previous", which inflated the rank of every 0 player and never
		// collapsed a tie with the top player.
		if (prevIncome !== null && prevIncome != player.income) {
			rank++
		}

		await Dailystats.upsertAsync({
			playerId: player._id,
			created_at: {$gte: _gs.statsBegin(gameId), $lt: _gs.statsEnd(gameId)}
		}, {
			$setOnInsert: {gameId:gameId, playerId:player._id, user_id:player.userId, created_at: dClock.now()},
			$set: {incomeRank:rank, updated_at:dClock.now()}
		});

		prevIncome = player.income;
	}
}




if (process.env.DOMINUS_WORKER == 'true') {
  Queues.updateVassalRank.process(2, async function(job) {
    await dGraphs.updateVassalRank(job.data.gameId);
  });
}



dGraphs.updateVassalRank = async function(gameId) {
	let playerFields = {userId:1, num_allies_below:1};
	let playerSort = {num_allies_below:-1};

	let rank = 1;
	let prevNumVassals = null;

	for (const player of await Players.find({gameId:gameId}, {sort:playerSort, fields:playerFields}).fetchAsync()) {

		check(player.userId, String);

		// dense ranking: tied values share a rank; rank increases by 1 on each
		// new (lower) value. Compare with !== null, not truthiness -- a previous
		// value of 0 (the common case: most players have no vassals) was treated
		// as "no previous", which inflated the rank of every 0 player and never
		// collapsed a tie with the top player.
		if (prevNumVassals !== null && prevNumVassals != player.num_allies_below) {
			rank++;
		}

		await Dailystats.upsertAsync({
			playerId: player._id,
			created_at: {$gte: _gs.statsBegin(gameId), $lt: _gs.statsEnd(gameId)}
		}, {
			$setOnInsert: {gameId:gameId, playerId:player._id, user_id:player.userId, created_at: dClock.now()},
			$set: {vassalRank:rank, updated_at:dClock.now()}
		});

		prevNumVassals = player.num_allies_below;
	}
}






if (process.env.DOMINUS_WORKER == 'true') {
  Queues.initDailystatsForNewUser.process(4, async function(job) {
    await dGraphs.init_dailystats_for_new_user(job.data.gameId, job.data.userId, job.data.playerId);
  });
}

dGraphs.init_dailystats_for_new_user = async function(gameId, userId, playerId) {
	check(userId, String);
	check(gameId, String);
	check(playerId, String);

	let game = await Games.findOneAsync(gameId, {fields: {numPlayers:1}});
	if (!game) {
		game = {numPlayers:0};
	}

	var stat = {
		user_id: userId,
		playerId: playerId,
		gameId: gameId,
		created_at: dClock.now(),
		updated_at: dClock.now(),
		inc: {
			gold:0,
			grain:0,
			lumber:0,
			ore:0,
			wool:0,
			clay:0,
			glass:0,
		},
		vassalInc: {
			gold:0,
			grain:0,
			lumber:0,
			ore:0,
			wool:0,
			clay:0,
			glass:0,
		},
		capitalInc: {
			gold:0,
			grain:0,
			lumber:0,
			ore:0,
			wool:0,
			clay:0,
			glass:0,
		},
		numVassals: 0,
		losses_worth: 0,
		losses_num: 0,
		incomeRank: game.numPlayers
	}
	await Dailystats.insertAsync(stat)
}
