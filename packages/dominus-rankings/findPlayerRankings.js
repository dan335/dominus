//
// ranking = {
//    wins: 0,
//    numGames: 0,
//    numVassalsRank: 0,
//    numVassalsPoints: 0,
//    incomeRank: 0,
//    incomePoints: 0,
//    overallPoints: 0
//    overallRank: 0
// };

var pointsForWinning = 500;

let gameRankToPoints = function(rankInGame) {

  if (!rankInGame || rankInGame <= 0) {
    return 0;
  }

  let points = Math.max(51 - rankInGame, 0);

  if (rankInGame <= 10) {
    points += 10;
  }
  if (rankInGame <= 5) {
    points += 10;
  }
  if (rankInGame <= 3) {
    points += 10;
  }
  if (rankInGame <= 2) {
    points += 10;
  }
  if (rankInGame == 1) {
    points += 20;
  }

  return points;
}


var fut = Npm.require('fibers/future');

dRankings = {
  updateOverallPlayerRankings: function() {

    let hasBulk = false;
    let bulk = Meteor.users.rawCollection().initializeUnorderedBulkOp();


    // zero out everyone
    // reset rankings
    // find wins and num Games
    Meteor.users.find({}, {fields: {_id:1}}).forEach(function(user) {

      let rankingRegular = {
    		 wins: 0,
    		 numGames: 0,
         overallRank: 0,
         numVassalsRank: 0,
         incomeRank: 0,
         overallPoints: 0,
         numVassalsPoints: 0,
         incomePoints: 0,
    	};

    	let rankingPro = {
        wins: 0,
        numGames: 0,
        overallRank: 0,
        numVassalsRank: 0,
        incomeRank: 0,
        overallPoints: 0,
        numVassalsPoints: 0,
        incomePoints: 0,
    	};

      Players.find({userId:user._id}, {fields: {gameId:1, wonGame:1}}).forEach(function(player) {
        let game = Games.findOne(player.gameId, {fields: {hasEnded:1, isProOnly:1, isCrazyFast:1}});

        if (!game.isCrazyFast) {
          if (game.hasEnded) {
            let wins = 0;
            let overallPoints = 0;
            if (player.wonGame) {
              wins = 1;
              overallPoints = pointsForWinning;
            }

            if (game.isProOnly) {
              rankingPro.numGames++;
              rankingPro.wins += wins;
              rankingPro.overallPoints += overallPoints;
            } else {
              rankingRegular.numGames++;
              rankingRegular.wins += wins;
              rankingRegular.overallPoints += overallPoints;
            }
          }
        }
      });

      bulk.find({_id:user._id}).updateOne({$set: {rankingRegular:rankingRegular, rankingPro:rankingPro}});
      hasBulk = true;
    });



    // results

    // num vassal points
    Games.find({hasEnded:true}, {fields: {isProOnly:1, results:1, isCrazyFast:1}}).forEach(function(game) {
      if (!game.isCrazyFast) {
        game.results.numVassals.forEach(function(u) {
          let points = gameRankToPoints(u.rank);

          if (points > 0) {
            if (game.isProOnly) {
              bulk.find({_id:u.userId}).updateOne({$inc: {"rankingPro.numVassalsPoints":points}});
              hasBulk = true;
            } else {
              bulk.find({_id:u.userId}).updateOne({$inc:{"rankingRegular.numVassalsPoints":points}});
              hasBulk = true;
            }
          }
        });

        // income points
        game.results.income.forEach(function(u) {
          let points = gameRankToPoints(u.rank);

          if (points > 0) {
            if (game.isProOnly) {
              bulk.find({_id:u.userId}).updateOne({$inc:{"rankingPro.incomePoints":points}});
              hasBulk = true;
            } else {
              bulk.find({_id:u.userId}).updateOne({$inc:{"rankingRegular.incomePoints":points}});
              hasBulk = true;
            }
          }
        });
      }
    });

    // save
    var future = new fut();
    if (hasBulk) {
      bulk.execute({}, function(error, result) {
        if (error) {
          console.error(error);
        }
        future.return(result);
      });
    }
    future.wait();


    // overall points

    let hasOBulk = false;
    let oBulk = Meteor.users.rawCollection().initializeUnorderedBulkOp();

    // regular
    Meteor.users.find({"rankingRegular.numGames": {$gt:0}}, {fields: {rankingRegular:1}}).forEach(function(user) {
      if (user.rankingRegular) {
        let overall = user.rankingRegular.incomePoints + user.rankingRegular.numVassalsPoints;
        oBulk.find({_id:user._id}).updateOne({$inc: {"rankingRegular.overallPoints":overall}});
        hasOBulk = true;
      }
    });

    // pro
    Meteor.users.find({"rankingPro.numGames": {$gt:0}}, {fields: {rankingPro:1}}).forEach(function(user) {
      if (user.rankingPro) {
        let overall = user.rankingPro.incomePoints + user.rankingPro.numVassalsPoints;
        oBulk.find({_id:user._id}).updateOne({$inc: {"rankingPro.overallPoints":overall}});
        hasOBulk = true;
      }
    });

    // save
    var oFuture = new fut();
    if (hasOBulk) {
      oBulk.execute({}, function(error, result) {
  	    if (error) {
  	      console.error(error);
  	    }
        oFuture.return(result);
  	  });
    }
    oFuture.wait();

    // ranking
    // everyone should have points, now figure out ranking by sorting by points

    let hasRBulk = false;
    let rBulk = Meteor.users.rawCollection().initializeUnorderedBulkOp();

    // vassal rank
    // if two people have same number of points ranking is random?
    let rank = 1;
    Meteor.users.find({"rankingPro.numVassalsPoints": {$gt:0}}, {fields: {"rankingPro.numVassalsPoints":1}, sort: {"rankingPro.numVassalsPoints":-1}}).forEach(function(user) {
      rBulk.find({_id:user._id}).updateOne({$set: {"rankingPro.numVassalsRank":rank}});
      hasRBulk = true;
      rank++;
    });

    // income rank
    rank = 1;
    Meteor.users.find({"rankingPro.incomePoints": {$gt:0}}, {fields: {"rankingPro.incomePoints":1}, sort: {"rankingPro.incomePoints":-1}}).forEach(function(user) {
      rBulk.find({_id:user._id}).updateOne({$set: {"rankingPro.incomeRank":rank}});
      hasRBulk = true;
      rank++;
    });

    // overall rank
    rank = 1;
    Meteor.users.find({"rankingPro.overallPoints": {$gt:0}}, {fields: {"rankingPro.overallPoints":1}, sort: {"rankingPro.overallPoints":-1}}).forEach(function(user) {
      rBulk.find({_id:user._id}).updateOne({$set: {"rankingPro.overallRank":rank}});
      hasRBulk = true;
      rank++;
    });

    // regular
    // vassal rank
    rank = 1;
    Meteor.users.find({"rankingRegular.numVassalsPoints": {$gt:0}}, {fields: {"rankingRegular.numVassalsPoints":1}, sort: {"rankingRegular.numVassalsPoints":-1}}).forEach(function(user) {
      rBulk.find({_id:user._id}).updateOne({$set: {"rankingRegular.numVassalsRank":rank}});
      hasRBulk = true;
      rank++;
    });

    // income rank
    rank = 1;
    Meteor.users.find({"rankingRegular.incomePoints": {$gt:0}}, {fields: {"rankingRegular.incomePoints":1}, sort: {"rankingRegular.incomePoints":-1}}).forEach(function(user) {
      rBulk.find({_id:user._id}).updateOne({$set: {"rankingRegular.incomeRank":rank}});
      hasRBulk = true;
      rank++;
    });

    // overall rank
    rank = 1;
    Meteor.users.find({"rankingRegular.overallPoints": {$gt:0}}, {fields: {"rankingRegular.overallPoints":1}, sort: {"rankingRegular.overallPoints":-1}}).forEach(function(user) {
      rBulk.find({_id:user._id}).updateOne({$set: {"rankingRegular.overallRank":rank}});
      hasRBulk = true;
      rank++;
    });

    // save
    var rFuture = new fut();
    if (hasRBulk) {
      rBulk.execute({}, function(error, result) {
  	    if (error) {
  	      console.error(error);
  	    }
        rFuture.return(result);
  	  });
    }
    rFuture.wait();
  }
}
