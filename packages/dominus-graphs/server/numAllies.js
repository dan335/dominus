

if (process.env.DOMINUS_WORKER == 'true') {
	Queues.dailystatsNumVassalsEveryone.process(Meteor.bindEnvironment(function(job) {
		dGraphs.dailystatsNumVassalsEveryone(job.data.gameId);
	  return Promise.resolve();
	}));
}


dGraphs.dailystatsNumVassalsEveryone = function(gameId) {

  var fut = Npm.require('fibers/future');
  var future = new fut();
  var bulk = Dailystats.rawCollection().initializeUnorderedBulkOp();

	var hasBulkOp = false;
	Players.find({gameId:gameId}, {fields: {userId:1, num_allies_below:1}}).forEach(function(player) {
		hasBulkOp = true;

		let num_allies_below = 0;
		if (player.num_allies_below) {
			num_allies_below = player.num_allies_below;
		}

		var f = {playerId:player._id, created_at: {$gte: _gs.statsBegin(gameId), $lt: _gs.statsEnd(gameId)}};
    var set = {numVassals:num_allies_below, updated_at:new Date()};
    var setOnInsert = {_id:Random.id, gameId:gameId, playerId:player._id, user_id:player.userId, created_at: new Date()};
    bulk.find(f).upsert().updateOne({$set:set, $setOnInsert:setOnInsert});
	})

	if (hasBulkOp) {
		bulk.execute({}, function(error, result) {
	    if (error) {
	      console.error(error);
	    }
	    future.return(result);
	  });
	  var result = future.wait();
	}
}
