

if (process.env.DOMINUS_WORKER == 'true') {
	Queues.dailystatsNumVassalsEveryone.process(async function(job) {
		await dGraphs.dailystatsNumVassalsEveryone(job.data.gameId);
	});
}


dGraphs.dailystatsNumVassalsEveryone = async function(gameId) {

  var bulk = Dailystats.rawCollection().initializeUnorderedBulkOp();

	var hasBulkOp = false;
	for (const player of await Players.find({gameId:gameId}, {fields: {userId:1, num_allies_below:1}}).fetchAsync()) {
		hasBulkOp = true;

		let num_allies_below = 0;
		if (player.num_allies_below) {
			num_allies_below = player.num_allies_below;
		}

		var f = {playerId:player._id, created_at: {$gte: _gs.statsBegin(gameId), $lt: _gs.statsEnd(gameId)}};
    var set = {numVassals:num_allies_below, updated_at:dClock.now()};
    var setOnInsert = {_id:dRandom.id(), gameId:gameId, playerId:player._id, user_id:player.userId, created_at: dClock.now()};
    bulk.find(f).upsert().updateOne({$set:set, $setOnInsert:setOnInsert});
	}

	if (hasBulkOp) {
		try {
			await bulk.execute();
		} catch (error) {
			console.error(error);
		}
	}
}
