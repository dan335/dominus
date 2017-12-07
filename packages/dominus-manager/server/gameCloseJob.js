

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.checkForGameClose.process(Meteor.bindEnvironment(function(job) {
    checkForGameClose();
    return Promise.resolve();
  }));
}



var checkForGameClose = function() {
  // let game = Games.findAndModify({
  //     query: {hasClosed:false, hasEnded:true, closeDate: {$lte: new Date()}},
  //     update: {$set:{hasClosed:true, closeDate:new Date()}}
  // });

  let game = Games.findOne({hasClosed:false, hasEnded:true, closeDate: {$lte: new Date()}});

  if (game) {
    Games.update(game._id, {$set:{hasClosed:true, closeDate:new Date()}});
    cleanupPlayers(game._id);
    cleanupGame(game._id);
    closeGame(game._id);
    Mapbaker.deleteS3BakesForGame(game._id);
  }
}



// remove extra fields from players
var cleanupPlayers = function(gameId) {
  let keep = {
    username:1,
    userId:1,
    gameId:1,
    createdAt:1,
    rankByIncome:1,
    rankByVassals:1,
    wonGame:1,
    gameIsOver:1,
    gameIsClosed:1,
    pro:1
  }

  var bulk = Players.rawCollection().initializeUnorderedBulkOp();
	var hasBulkOp = false;

  Players.find({gameId:gameId}, {fields:keep}).forEach(function(player) {
    player.gameIsClosed = true;
    bulk.find({_id:player._id}).updateOne(player);
    hasBulkOp = true;
  });

  if (hasBulkOp) {
		bulk.execute({}, function(error, result) {
	    if (error) {
	      console.error(error);
	    }
	  });
	}
}



// remove extra fields from game
var cleanupGame = function(gameId) {
  let keep = {
    createdAt:1,
    hasEnded:1,
    hasStarted:1,
    hasClosed:1,
    closeDate:1,
    endDate:1,
    winningPlayer:1,
    results:1,
    name:1,
    maxPlayers:1,
    numPlayers:1,
    startedAt:1,
    desc:1,
    isProOnly:1,
    isKingOfHill:1,
    isRelaxed:1,
    isSpeed:1,
    isCrazyFast:1,
  }

  let game = Games.findOne(gameId, {fields:keep});
  if (game) {
    Games.update(gameId, game);
  }
}




var closeGame = function(gameId) {
  Alerts.remove({gameId:gameId});
  Armies.remove({gameId:gameId});
  Armypaths.remove({gameId:gameId});
  Battles2.remove({gameId:gameId});
  Castles.remove({gameId:gameId});
  Countries.remove({gameId:gameId});
  CountriesTemp.remove({gameId:gameId})
  Dailystats.remove({gameId:gameId});
  Gamestats.remove({gameId:gameId});
  GlobalAlerts.remove({gameId:gameId});
  Hexes.remove({gameId:gameId});
  Markers.remove({gameId:gameId});
  MarkerGroups.remove({gameId:gameId});
  Market.remove({gameId:gameId});
  Markethistory.remove({gameId:gameId});
  Recentchats.remove({gameId:gameId});
  Reports.remove({gameId:gameId});
  Roomchats.remove({gameId:gameId});
  Rooms.remove({gameId:gameId});
  Rounds.remove({gameId:gameId});
  Villages.remove({gameId:gameId});
}
