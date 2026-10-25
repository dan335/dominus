

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.checkForGameClose.process(async function(job) {
    await checkForGameClose();
  });
}


var executeBulk = async function(bulk) {
  try {
    await bulk.execute();
  } catch (error) {
    console.error(error);
  }
};



var checkForGameClose = async function() {
  // let game = Games.findAndModify({
  //     query: {hasClosed:false, hasEnded:true, closeDate: {$lte: new Date()}},
  //     update: {$set:{hasClosed:true, closeDate:new Date()}}
  // });

  let game = await Games.findOneAsync({hasClosed:false, hasEnded:true, closeDate: {$lte: dClock.now()}});

  if (game) {
    await Games.updateAsync(game._id, {$set:{hasClosed:true, closeDate:dClock.now()}});
    await cleanupPlayers(game._id);
    await cleanupGame(game._id);
    await closeGame(game._id);
    Mapbaker.deleteS3BakesForGame(game._id);
  }
}



// remove extra fields from players
var cleanupPlayers = async function(gameId) {
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

  (await Players.find({gameId:gameId}, {fields:keep}).fetchAsync()).forEach(function(player) {
    // player.gameIsClosed = true;
    // bulk.find({_id:player._id}).updateOne(player);
    bulk.find({_id:player._id}).updateOne({$set:{gameIsClosed:true}});
    hasBulkOp = true;
  });

  if (hasBulkOp) {
		await executeBulk(bulk);
	}
}



// remove extra fields from game
var cleanupGame = async function(gameId) {
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
    isSuperSpeed:1
  }

  let game = await Games.findOneAsync(gameId, {fields:keep});
  if (game) {
    await Games.updateAsync(gameId, game);
  }
}




var closeGame = async function(gameId) {
  await Alerts.removeAsync({gameId:gameId});
  await Armies.removeAsync({gameId:gameId});
  await Armypaths.removeAsync({gameId:gameId});
  await Battles2.removeAsync({gameId:gameId});
  await Castles.removeAsync({gameId:gameId});
  await Countries.removeAsync({gameId:gameId});
  await CountriesTemp.removeAsync({gameId:gameId});
  await Dailystats.removeAsync({gameId:gameId});
  await Gamestats.removeAsync({gameId:gameId});
  await GlobalAlerts.removeAsync({gameId:gameId});
  await Hexes.removeAsync({gameId:gameId});
  await Markers.removeAsync({gameId:gameId});
  await MarkerGroups.removeAsync({gameId:gameId});
  await Market.removeAsync({gameId:gameId});
  await Markethistory.removeAsync({gameId:gameId});
  await Recentchats.removeAsync({gameId:gameId});
  await Reports.removeAsync({gameId:gameId});
  await Roomchats.removeAsync({gameId:gameId});
  await Rooms.removeAsync({gameId:gameId});
  await Rounds.removeAsync({gameId:gameId});
  await Villages.removeAsync({gameId:gameId});
}
