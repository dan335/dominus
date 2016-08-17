




if (process.env.DOMINUS_WORKER == 'true') {
  Queues.update_losses_worth.process(Meteor.bindEnvironment(function(job) {
    dGraphs.update_losses_worth(job.data.playerId);
    return Promise.resolve();
  }));
}


dGraphs.update_losses_worth = function(playerId) {
	check(playerId, String);

	var player = Players.findOne(playerId, {fields: {losses:1, gameId:1, userId:1}})
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
		_s.market.types.forEach(function(t) {
			var m = Market.findOne({gameId:player.gameId, type: t}, {fields: {price: 1}})
			if (!m) { return false }
			worth.total += m.price * worth[t]
		})

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
		Dailystats.upsert({
			playerId:playerId,
			created_at: {$gte: _gs.statsBegin(player.gameId), $lt: _gs.statsEnd(player.gameId)}
		}, {
			$setOnInsert: {
				gameId:player.gameId,
				playerId:playerId,
				created_at: new Date(),
				user_id:player.userId
			}, $set: {
				losses_worth:worth.total,
				losses_num:num,
				updated_at:new Date()
			}
		})
		Players.update(playerId, {$set: {losses_worth:worth.total, losses_num:num}})
	}
}





if (process.env.DOMINUS_WORKER == 'true') {
  Queues.updateIncomeStats.process(Meteor.bindEnvironment(function(job) {

    const playerFields = {gameId:1, castleIncome:1, capitalIncome:1, villageIncome:1, vassalIncome:1, userId:1};
		Players.find({gameId:job.data.gameId}, {fields:playerFields}).forEach(function(player) {
			dGraphs.updateIncomeStats(player);
		});

    return Promise.resolve();
  }));
}

dGraphs.updateIncomeStats = function(player) {

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
	Dailystats.upsert({
		playerId: player._id,
		created_at: {$gte: _gs.statsBegin(player.gameId), $lt: _gs.statsEnd(player.gameId)}
	}, {
		$setOnInsert: {
			gameId:player.gameId,
			playerId:player._id,
			user_id:player.userId,
			created_at: new Date()
		},
		$set: {
      totalIncome:totalIncome,
      capitalIncome:capitalIncome,
      castleIncome:castleIncome,
      villageIncome:villageIncome,
      vassalIncome:vassalIncome,
			updated_at:new Date()
		}
	})
}





if (process.env.DOMINUS_WORKER == 'true') {
  Queues.updateIncomeRank.process(Meteor.bindEnvironment(function(job) {
    dGraphs.updateIncomeRank(job.data.gameId);
    return Promise.resolve();
  }));
}



dGraphs.updateIncomeRank = function(gameId) {
	var rank = 1
	var prevIncome = null

	Players.find({gameId:gameId}, {sort: {income:-1}, fields: {userId:1, income:1}}).forEach(function(player) {

		check(player.userId, String);
		Dailystats.upsert({
			playerId: player._id,
			created_at: {$gte: _gs.statsBegin(gameId), $lt: _gs.statsEnd(gameId)}
		}, {
			$setOnInsert: {gameId:gameId, playerId:player._id, user_id:player.userId, created_at: new Date()},
			$set: {incomeRank:rank, updated_at:new Date()}
		});

		if (prevIncome) {
			if (prevIncome != player.income) {
				rank++
			}
		} else {
			rank++
		}

		prevIncome = player.income;
	})
}




if (process.env.DOMINUS_WORKER == 'true') {
  Queues.updateVassalRank.process(2, Meteor.bindEnvironment(function(job) {
    dGraphs.updateVassalRank(job.data.gameId);
    return Promise.resolve();
  }));
}



dGraphs.updateVassalRank = function(gameId) {
	let playerFields = {userId:1, num_allies_below:1};
	let playerSort = {num_allies_below:-1};

	let rank = 1;
	let prevNumVassals = null;

	Players.find({gameId:gameId}, {sort:playerSort, fields:playerFields}).forEach(function(player) {

		check(player.userId, String);
		Dailystats.upsert({
			playerId: player._id,
			created_at: {$gte: _gs.statsBegin(gameId), $lt: _gs.statsEnd(gameId)}
		}, {
			$setOnInsert: {gameId:gameId, playerId:player._id, user_id:player.userId, created_at: new Date()},
			$set: {vassalRank:rank, updated_at:new Date()}
		});

		if (prevNumVassals) {
			if (prevNumVassals != player.num_allies_below) {
				rank++;
			}
		} else {
			rank++;
		}

		prevNumVassals = player.num_allies_below;
	})
}






if (process.env.DOMINUS_WORKER == 'true') {
  Queues.initDailystatsForNewUser.process(4, Meteor.bindEnvironment(function(job) {
    dGraphs.init_dailystats_for_new_user(job.data.gameId, job.data.userId, job.data.playerId);
    return Promise.resolve();
  }));
}

dGraphs.init_dailystats_for_new_user = function(gameId, userId, playerId) {
	check(userId, String);
	check(gameId, String);
	check(playerId, String);

	let game = Games.findOne(gameId, {fields: {numPlayers:1}});
	if (!game) {
		game = {numPlayers:0};
	}

	var stat = {
		user_id: userId,
		playerId: playerId,
		gameId: gameId,
		created_at: new Date(),
		updated_at: new Date(),
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
	Dailystats.insert(stat)
}
