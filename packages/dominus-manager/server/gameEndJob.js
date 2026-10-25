// check if game should end
// record results in game
// record ranking in player
// send alert
// set closeDate

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.checkForGameEnd.process(async function(job) {
    await checkForGameEnd();
  });
}


var executeBulk = async function(bulk) {
  try {
    await bulk.execute();
  } catch (error) {
    console.error(error);
  }
};


// when someone becomes dominus gameEndDate is set
// set closeDate to date when game will be erased
var checkForGameEnd = async function() {

  // let game = Games.findAndModify({
  //     query: {hasStarted:true, hasEnded:false, hasClosed:false, endDate: {$lte: new Date()}},
  //     update: {$set:{hasEnded:true, endDate:new Date()}}
  // });

  let game = await Games.findOneAsync({hasStarted:true, hasEnded:false, hasClosed:false, endDate: {$lte: dClock.now()}});

  if (game) {
    await Games.updateAsync(game._id, {$set:{hasEnded:true, endDate:dClock.now()}});
    
    // wait a couple seconds for jobs to finish
    // jobs should stop queueing when hasEnded is set to true
		await new Promise(function(resolve) {
			Meteor.setTimeout(resolve, 1000*3);
		});

    let winningPlayer = await Players.findOneAsync({gameId:game._id, is_dominus:true});

    // if nobody is currently dominus see who was last dominus
    if (!winningPlayer) {
      winningPlayer = await Players.findOneAsync(game.lastDominusPlayerId);
    }

    if (winningPlayer) {

      await Players.updateAsync({gameId:game._id}, {$set: {gameIsOver:true, wonGame:false}}, {multi:true});
      await Players.updateAsync(winningPlayer._id, {$set: {wonGame:true}});

      let winningUser = await Meteor.users.findOneAsync(winningPlayer.userId);
      let winnerEmail = AccountsEmail.extract(winningUser);

      let winnerData = {
        playerId: winningPlayer._id,
        userId: winningPlayer.userId,
        email: winnerEmail,
        username: winningPlayer.username,
        x: winningPlayer.x,
        y: winningPlayer.y,
        castle_id: winningPlayer.castle_id
      }

      // closeDate is when the game will be erased
      let closeDate = moment(dClock.now()).add(3, 'days').toDate();

      await Games.updateAsync(game._id, {$set: {winningPlayer:winnerData, closeDate:closeDate}});

      dAlerts.gAlert_gameOver(game._id, winningPlayer._id);
      await dGraphs.updateIncomeRank(game._id);
      await dGraphs.updateVassalRank(game._id);
      await updatePlayersWithRank(game._id);
      await updateGameWithResults(game._id);
      await Queues.addAsyncOrLog('updateOverallPlayerRankings', {}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*10}, false);

    } else {
      // No resolvable winner: the recorded dominus (is_dominus, and the
      // fallback game.lastDominusPlayerId) no longer exists -- e.g. that player
      // deleted their account while the countdown was running. Committing
      // hasEnded:true above without ever setting a closeDate would strand the
      // game forever (checkForGameClose requires closeDate <= now, so it never
      // runs) with no winner declared and players never sent to game-over.
      // Instead, revert hasEnded and cancel the stale countdown so play can
      // continue; a future real dominus will restart the countdown.
      console.error('game endDate reached but no winning player found; clearing stale countdown', game._id)
      await Games.updateAsync(game._id, {$set: {hasEnded:false, endDate:null, lastDominusPlayerId:null}});
    }
  }
};



// sets rankByIncome and rankByVassals in player
var updatePlayersWithRank = async function(gameId) {
  var bulk = Players.rawCollection().initializeUnorderedBulkOp();
	var hasBulkOp = false;

  for (const player of await Players.find({gameId:gameId}).fetchAsync()) {
    let options = {fields: {incomeRank:1, vassalRank:1}, sort: {updated_at:-1}};
    let dailystats = await Dailystats.findOneAsync({playerId:player._id}, options);
    if (dailystats) {
      let set = {rankByIncome:dailystats.incomeRank, rankByVassals:dailystats.vassalRank};
      bulk.find({_id:player._id}).updateOne({$set:set});
      hasBulkOp = true;
    }
  }

  if (hasBulkOp) {
		await executeBulk(bulk);
	}
}



var updateGameWithResults = async function(gameId) {
  let results = {};

  // num vassals
  results.numVassals = [];
  var rank = 1;
  let sort = {num_allies_below:-1};
  let fields = {userId:1, username:1, num_allies_below:1};
  let limit = 10;
  (await Players.find({gameId:gameId}, {sort:sort, fields:fields, limit:limit}).fetchAsync()).forEach(function(player) {
      let data = {
          username:player.username,
          userId:player.userId,
          playerId:player._id,
          rank:rank,
          numVassals: player.num_allies_below
      };
      results.numVassals.push(data);
      rank++;
  });

  // by income
  results.income = [];
  rank = 1;
  sort = {income: -1};
  fields = {userId:1, username:1, income:1};
  limit = 10;
  (await Players.find({gameId:gameId}, {sort:sort, fields:fields, limit:limit}).fetchAsync()).forEach(function(player) {
      let data = {
          username:player.username,
          rank:rank,
          userId:player.userId,
          playerId:player._id,
          income:player.income
      };
      results.income.push(data);
      rank++;
  });

  // by lostSoldiers
  results.lostSoldiers = [];
  rank = 1;
  sort = {losses_worth: -1};
  fields = {userId:1, username:1, losses_worth:1, losses_num:1};
  limit = 10;
  (await Players.find({gameId:gameId}, {sort:sort, fields:fields, limit:limit}).fetchAsync()).forEach(function(player) {
      var data = {
          username:player.username,
          rank:rank,
          userId:player.userId,
          playerId:player._id,
          lostSoldiersWorth:player.losses_worth,
          lostSoldiersNum:player.losses_num
      };
      results.lostSoldiers.push(data);
      rank++;
  });

  // by villages
  results.villages = [];
  rank = 1;
  find = {gameId:gameId};
  sort = {"income.worth": -1};
  fields = {user_id:1, playerId:1, username:1, "income.worth":1};
  limit = 10;
  (await Villages.find(find, {sort:sort, fields:fields, limit:limit}).fetchAsync()).forEach(function(village) {

      let data = {
          username:village.username,
          rank:rank,
          villageWorth:village.income.worth,
          playerId:village.playerId,
          userId:village.user_id
      };

      results.villages.push(data);
      rank++;
  });

  await Games.updateAsync(gameId, {$set: {results:results}});
}
