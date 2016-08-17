// admin game stats


if (process.env.DOMINUS_WORKER == 'true') {
  Queues.gamestats_job.process(Meteor.bindEnvironment(function(job) {
    gamestatsJob(job.data.gameId);
    return Promise.resolve();
  }));
}


gamestatsJob = function(gameId) {
	let stat = {
		created_at: new Date(),
		gameId: gameId
	};

	stat.num_users = Players.find({gameId:gameId}).count();

	// soldier worth
	// worth of soldiers
	stat.soldierWorth = {}
	var emptyArmy = {}
	_s.armies.types.forEach(function(type) {
		emptyArmy[type] = 0
	})

	_s.armies.types.forEach(function(type) {
		var army = EJSON.clone(emptyArmy)
		army[type] = 1
		stat.soldierWorth[type] = dArmies.worth(gameId, army)
	})

	let find = {gameId:gameId, created_at: {$gte: _s.init.gamestatsBegin(), $lt: _s.init.gamestatsEnd()}};
	Gamestats.upsert(find, stat);
}
