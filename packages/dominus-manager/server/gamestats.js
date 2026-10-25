// admin game stats


if (process.env.DOMINUS_WORKER == 'true') {
  Queues.gamestats_job.process(async function(job) {
    await gamestatsJob(job.data.gameId);
  });
}


gamestatsJob = async function(gameId) {
	let stat = {
		created_at: dClock.now(),
		gameId: gameId
	};

	stat.num_users = await Players.find({gameId:gameId}).countAsync();

	// soldier worth
	// worth of soldiers
	stat.soldierWorth = {}
	var emptyArmy = {}
	_s.armies.types.forEach(function(type) {
		emptyArmy[type] = 0
	})

	for (const type of _s.armies.types) {
		var army = EJSON.clone(emptyArmy)
		army[type] = 1
		stat.soldierWorth[type] = await dArmies.worthAsync(gameId, army)
	}

	let find = {gameId:gameId, created_at: {$gte: _s.init.gamestatsBegin(), $lt: _s.init.gamestatsEnd()}};
	await Gamestats.upsertAsync(find, stat);
}
