// check if game should end
// record results in game
// record ranking in player
// send alert
// set closeDate
const Future = Npm.require('fibers/future');

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.checkForGameEnd.process(Meteor.bindEnvironment(function(job) {
    checkForGameEnd();
    return Promise.resolve();
  }));
}


// when someone becomes dominus gameEndDate is set
// set closeDate to date when game will be erased
var checkForGameEnd = function() {

  // let game = Games.findAndModify({
  //     query: {hasStarted:true, hasEnded:false, hasClosed:false, endDate: {$lte: new Date()}},
  //     update: {$set:{hasEnded:true, endDate:new Date()}}
  // });

  let game = Games.findOne({hasStarted:true, hasEnded:false, hasClosed:false, endDate: {$lte: new Date()}});

  if (game) {
    Games.update(game._id, {$set:{hasEnded:true, endDate:new Date()}});
    
    // wait a couple seconds for jobs to finish
    // jobs should stop queueing when hasEnded is set to true
		let future = new Future();
		Meteor.setTimeout(function() {
			future.return(true);
		}, 1000*3);
		future.wait();

    let winningPlayer = Players.findOne({gameId:game._id, is_dominus:true});

    // if nobody is currently dominus see who was last dominus
    if (!winningPlayer) {
      winningPlayer = Players.findOne(game.lastDominusPlayerId);
    }

    if (winningPlayer) {

      Players.update({gameId:game._id}, {$set: {gameIsOver:true, wonGame:false}}, {multi:true});
      Players.update(winningPlayer._id, {$set: {wonGame:true}});

      let winningUser = Meteor.users.findOne(winningPlayer.userId);
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
      let closeDate = moment().add(3, 'days').toDate();

      Games.update(game._id, {$set: {winningPlayer:winnerData, closeDate:closeDate}});

      dAlerts.gAlert_gameOver(game._id, winningPlayer._id);
      dGraphs.updateIncomeRank(game._id);
      dGraphs.updateVassalRank(game._id);
      updatePlayersWithRank(game._id);
      updateGameWithResults(game._id);
      Queues.add('updateOverallPlayerRankings', {}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*10}, false);

    } else {
      console.error('game ended but no winning player found', game)
    }
  }
};



// sets rankByIncome and rankByVassals in player
var updatePlayersWithRank = function(gameId) {
  var bulk = Players.rawCollection().initializeUnorderedBulkOp();
	var hasBulkOp = false;

  Players.find({gameId:gameId}).forEach(function(player) {
    let options = {fields: {incomeRank:1, vassalRank:1}, sort: {updated_at:-1}};
    let dailystats = Dailystats.findOne({playerId:player._id}, options);
    if (dailystats) {
      let set = {rankByIncome:dailystats.incomeRank, rankByVassals:dailystats.vassalRank};
      bulk.find({_id:player._id}).updateOne({$set:set});
      hasBulkOp = true;
    }
  })

  if (hasBulkOp) {
		bulk.execute({}, function(error, result) {
	    if (error) {
	      console.error(error);
	    }
	  });
	}
}



var updateGameWithResults = function(gameId) {
  let results = {};

  // num vassals
  results.numVassals = [];
  var rank = 1;
  let sort = {num_allies_below:-1};
  let fields = {userId:1, username:1, num_allies_below:1};
  let limit = 10;
  Players.find({gameId:gameId}, {sort:sort, fields:fields, limit:limit}).forEach(function(player) {
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
  Players.find({gameId:gameId}, {sort:sort, fields:fields, limit:limit}).forEach(function(player) {
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
  Players.find({gameId:gameId}, {sort:sort, fields:fields, limit:limit}).forEach(function(player) {
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
  Villages.find(find, {sort:sort, fields:fields, limit:limit}).forEach(function(village) {

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

  Games.update(gameId, {$set: {results:results}});
}
