
if (process.env.DOMINUS_WORKER == 'true') {
  Queues.checkForDominus.process(async function(job) {
		await dManager.checkForDominus(job.data.gameId);
	});
}


dManager.checkForDominus = async function(gameId) {
  //console.log('--- checking for dominus', gameId, '---')
	var numPlayers = await Players.find({gameId:gameId, castle_id: {$exists: true, $ne:null}}).countAsync()

	if (numPlayers <= 1) {
		return;
	}

	// Guard against a transient "no king" state.
	// relation_finder (the relationship rebuild) sets is_king:false for every
	// player in a tree and only restores is_king:true for the king at the end of
	// the same non-atomic bulk op. If checkForDominus reads during that window it
	// finds no king, wrongly clears is_dominus, and fires a false
	// "no longer dominus" alert (re-announcing "new dominus" on the next pass).
	// In any consistent state with >=2 castle-holders the hierarchy is a forest
	// whose roots are kings, so there is always at least one is_king:true player.
	// Zero kings therefore means we are reading an inconsistent/transient state --
	// bail out without touching is_dominus or alerting. A real dethroning always
	// leaves at least one king, so this does not suppress legitimate updates.
	let numKings = await Players.find({gameId:gameId, is_king:true, castle_id: {$exists: true, $ne:null}}).countAsync();
	if (numKings == 0) {
		return;
	}

	let dominus = await Players.findOneAsync({gameId:gameId, is_dominus:true}, {fields: {gameId:1}});
	let is_still_dominus = false;

  // get prevDominusId
  let game = await Games.findOneAsync(gameId, {fields: {lastDominusPlayerId:1}});

	// find dominus
  let newDominus = null;
  let query = {gameId:gameId, is_king:true, castle_id: {$exists:true, $ne:null}};
	for (const king of await Players.find(query, {fields:{gameId:1}}).fetchAsync()) {

		// get number of players who are not under king
		let find = {gameId:gameId, _id:{$ne:king._id}, king:{$ne:king._id}, castle_id: {$exists: true, $ne:null}};
		let nonVassals = await Players.find(find).countAsync();

		// in none then dominus
		if (nonVassals == 0) {
      newDominus = king;
		}
	}

  if (newDominus) {
    await Players.updateAsync(newDominus._id, {$set: {is_dominus: true}});

    // set everyone to not dominus except new dominus
    await Players.updateAsync({gameId:gameId, is_dominus:true, _id:{$ne:newDominus._id}}, {$set: {is_dominus:false}}, {multi:true});

    if (dominus) {
    //if (game.lastDominusPlayerId) {
      if (newDominus._id == dominus._id) {
      //if (newDominus._id == game.lastDominusPlayerId) {
        is_still_dominus = true;
      } else {
        await new_dominus_event(gameId, newDominus);
      }
    } else {
      await new_dominus_event(gameId, newDominus);
    }
  } else {
    //console.log('no dominus found.');
    // remove dominus
    await Players.updateAsync({gameId:gameId, is_dominus:true}, {$set: {is_dominus:false}}, {multi:true});
  }

	// if old dominus is no longer dominus
	// there is a new dominus
	//if (dominus) {
  if (game.lastDominusPlayerId) {
		if (dominus && !is_still_dominus) {
			await dAlerts.alert_noLongerDominus(gameId, dominus._id)
		}
	}
}





if (process.env.DOMINUS_WORKER == 'true') {
  Queues.removeDominus.process(async function(job) {
    await remove_dominus(job.data.gameId);
  });
}


// TODO: fix alerts
// called when new user joins the game
var remove_dominus = async function(gameId) {
	check(gameId, String);
	let dominus = await Players.findOneAsync({is_dominus:true, gameId:gameId}, {fields:{_id:1}})
	if (dominus) {
		await dAlerts.gAlert_noLongerDominusNewUser(gameId, dominus._id);
		await dAlerts.alert_noLongerDominusNewUser(gameId, dominus._id);
		await Players.updateAsync(dominus._id, {$set: {is_dominus: false}});
	}
}


// happens when there is a new dominus
var new_dominus_event = async function(gameId, dominusPlayer) {
	check(dominusPlayer, Object);
	check(dominusPlayer._id, String);
	check(gameId, String);

	let set = {};

	// make sure dominus and last dominus are not the same
	let game = await Games.findOneAsync(gameId, {fields: {dominusAchieved:1, lastDominusPlayerId:1}});
	let lastDominusPlayerId = null;

	if (game && game.lastDominusPlayerId) {
		lastDominusPlayerId = game.lastDominusPlayerId;
	}

	// set game end date
	if (dominusPlayer._id != lastDominusPlayerId) {
		let time = _gs.init(gameId, 'time_til_game_end_when_new_dominus');
		set.endDate = moment(dClock.now()).add(time, 'ms').toDate();
	}

  set.lastDominusPlayerId = dominusPlayer._id;

	// close game registration
	set.dominusAchieved = true;

	await Games.updateAsync(gameId, {$set:set});

	// auto-create next game
	await dManager.createNextGame();

	// send notifications
	await dAlerts.gAlert_newDominus(dominusPlayer.gameId, dominusPlayer._id, lastDominusPlayerId);
	await dAlerts.alert_youAreDominus(dominusPlayer.gameId, dominusPlayer._id);
}
