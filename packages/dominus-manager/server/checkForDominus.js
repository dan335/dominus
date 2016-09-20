
if (process.env.DOMINUS_WORKER == 'true') {
  Queues.checkForDominus.process(Meteor.bindEnvironment(function(job) {
		dManager.checkForDominus(job.data.gameId);
    return Promise.resolve();
	}));
}


dManager.checkForDominus = function(gameId) {
  //console.log('--- checking for dominus', gameId, '---')
	var numPlayers = Players.find({gameId:gameId, castle_id: {$exists: true, $ne:null}}).count()

	if (numPlayers <= 1) {
		return;
	}

	//let dominus = Players.findOne({gameId:gameId, is_dominus:true}, {fields: {gameId:1}});
	let is_still_dominus = false;

  // get prevDominusId
  let game = Games.findOne(gameId, {fields: {dominusAchieved:1, lastDominusPlayerId:1}});

	// find dominus
  let newDominus = null;
  let query = {gameId:gameId, is_king:true, castle_id: {$exists:true, $ne:null}};
	Players.find(query, {fields:{gameId:1}}).forEach(function(king) {

		// get number of players who are not under king
		let find = {gameId:gameId, _id:{$ne:king._id}, king:{$ne:king._id}, castle_id: {$exists: true, $ne:null}};
		let nonVassals = Players.find(find).count();

		// in none then dominus
		if (nonVassals == 0) {
      newDominus = king;
		}
	})

  if (newDominus) {
    Players.update(newDominus._id, {$set: {is_dominus: true}});

    // set everyone to not dominus except new dominus
    Players.update({gameId:gameId, is_dominus:true, _id:{$ne:newDominus._id}}, {$set: {is_dominus:false}}, {multi:true});

    //if (dominus) {
    if (game.lastDominusPlayerId) {
      //if (newDominus._id == dominus._id) {
      if (newDominus._id == game.lastDominusPlayerId)
        is_still_dominus = true;
      } else {
        new_dominus_event(gameId, newDominus);
      }
    } else {
      new_dominus_event(gameId, newDominus);
    }
  } else {
    //console.log('no dominus found.');
    // remove dominus
    Players.update({gameId:gameId, is_dominus:true}, {$set: {is_dominus:false}}, {multi:true});
  }

	// if old dominus is no longer dominus
	// there is a new dominus
	//if (dominus) {
  if (game.lastDominusPlayerId) {
		if (!is_still_dominus) {
			dAlerts.alert_noLongerDominus(gameId, dominus._id)
		}
	}
}





if (process.env.DOMINUS_WORKER == 'true') {
  Queues.removeDominus.process(Meteor.bindEnvironment(function(job) {
    remove_dominus(job.data.gameId);
    return Promise.resolve();
  }));
}


// TODO: fix alerts
// called when new user joins the game
var remove_dominus = function(gameId) {
	check(gameId, String);
	let dominus = Players.findOne({is_dominus:true, gameId:gameId}, {fields:{_id:1}})
	if (dominus) {
		dAlerts.gAlert_noLongerDominusNewUser(gameId, dominus._id);
		dAlerts.alert_noLongerDominusNewUser(gameId, dominus._id);
		Players.update(dominus._id, {$set: {is_dominus: false}});
	}
}


// happens when there is a new dominus
var new_dominus_event = function(gameId, dominusPlayer) {
	check(dominusPlayer, Object);;
	check(dominusPlayer._id, String);
	check(gameId, String);

	let set = {};

	// make sure dominus and last dominus are not the same
	let game = Games.findOne(gameId, {fields: {dominusAchieved:1, lastDominusPlayerId:1}});
	let lastDominusPlayerId = null;

	if (game && game.lastDominusPlayerId) {
		lastDominusPlayerId = game.lastDominusPlayerId;
	}

	// set game end date
	if (dominusPlayer._id != lastDominusPlayerId) {
		let time = _gs.init(gameId, 'time_til_game_end_when_new_dominus');
		set.endDate = moment(new Date()).add(time, 'ms').toDate();
		set.lastDominusPlayerId = lastDominusPlayerId;
	}

	// close game registration
	if (!game.dominusAchieved) {
		set.dominusAchieved = true;
	}

	Games.update(gameId, {$set:set});

	// send notifications
	dAlerts.gAlert_newDominus(dominusPlayer.gameId, dominusPlayer._id, lastDominusPlayerId);
	dAlerts.alert_youAreDominus(dominusPlayer.gameId, dominusPlayer._id);
}
