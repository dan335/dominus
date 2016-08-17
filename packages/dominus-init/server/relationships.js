// allies - everyone above and below you in tree not including self
// allies_below - everyone below not including self
// allies_above - everyone above not including self
// vassals - direct vassals
// king - your king (sometimes yourself if you are king sometimes null or undefined if you are king, should fix this)
//		#TODO:230 when user is created this is null even though they are a king
// is_king - are you king
// team - everyone under your king - may or may not include self
//		used to not include self, including self now to speed up relations.js
//		#TODO:220 when user is created team does not include self


dInit.set_lord_and_vassal = function(winner_id, loser_id) {
	var fields = {allies_above:1, lord:1, king:1, is_king:1, gameId:1};

	var winner = Players.findOne(winner_id, {fields:fields});
	var loser = Players.findOne(loser_id, {fields:fields});

	if (!winner || !loser) {
		console.error('winner or loser not found');
		return false;
	}

	if (winner._id == loser._id) {
		console.error('winner and loser are the same in set_lord_and_vassal');
		return false;
	}

	// lost/gained vassal notifications
	// compare people above loser to people above winner
	// if someone above loser is not above winner then they lost a vassal
	// do opposite for gained

	if (process.env.DOMINUS_TEST != 'true') {
		_.each(loser.allies_above, function(above_loser_lord_id) {
			if (_.indexOf(winner.allies_above, above_loser_lord_id) == -1) {

				// make sure we don't send it to winner or loser
				if (above_loser_lord_id != winner._id && above_loser_lord_id != loser._id) {
					dAlerts.alert_lostVassal(winner.gameId, above_loser_lord_id, loser._id, winner._id);
				}
			}
		});

		_.each(winner.allies_above, function(above_winner_lord_id) {
			if (_.indexOf(loser.allies_above, above_winner_lord_id) == -1) {

				// make sure we don't send it to winner or loser
				if (above_winner_lord_id != winner._id && above_winner_lord_id != loser._id) {
					dAlerts.alert_gainedVassal(winner.gameId, above_winner_lord_id, loser._id, winner._id);
				}
			}
		});

		// send notification to winner
		dAlerts.alert_gainedVassal(winner.gameId, winner._id, loser._id, winner._id);

		// vassal is no longer a king, he had no lord, now he does
		// destroy king chatroom
		// #TODO:120 isn't this handled in cleanupAllKingChatrooms?
		if (loser.is_king) {
			Queues.add('destroyKingChatroom', {king_id:loser._id}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, loser._id);
		}
	}

	// is loser above winner
	// he is either above winner or he is in a different branch
	if (_.contains(winner.allies_above, loser._id)) {

		// winner is conquering their lord, moving up the tree
		dInit.remove_lord_and_vassal(winner.lord, winner._id);

		// loser's lord is now winner's lord
		if (loser.lord) {
			dInit.remove_lord_and_vassal(loser.lord, loser._id);
			create_lord_and_vassal(loser.lord, winner._id);
		}

	// winner is stealing loser from another lord
	// remove connection between loser and their lord
	// create notification for old lord that he lost a vassal
	} else if (loser.lord) {
		dInit.remove_lord_and_vassal(loser.lord, loser._id);
	}

	// create connection between winner and loser
	create_lord_and_vassal(winner._id, loser._id);

	// is winner a new king
	// has he conquered their lord?
	if (winner.king == loser._id) {
		Players.update(winner._id, {$set: {is_king:true}});
	}

	if (process.env.DOMINUS_TEST != 'true') {
		// send notification
		dAlerts.alert_newLord(loser.gameId, loser._id, winner._id);

		Queues.add('enemies_together_check', {gameId:loser.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:3000, timeout:1000*60*5}, loser.gameId);
		Queues.add('enemy_on_building_check', {gameId:loser.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:3000, timeout:1000*60*5}, loser.gameId);

		Queues.add('checkForDominus', {gameId:loser.gameId}, {attempts:10, backoff:{type:'fixed', delay:20000}, delay:0, timeout:1000*60*5}, loser.gameId);
		if (loser.king) {
			Queues.add('updateKingChatroom', {gameId:loser.gameId, playerId:loser.king}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:15000, timeout:1000*60*5}, false);
		}

		Queues.add('updateKingChatroom', {gameId:loser.gameId, playerId:loser._id}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60}, false);
		Queues.add('cleanupAllKingChatrooms', {gameId:loser.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60}, loser.gameId);

		Queues.add('generateTree', {gameId:winner.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60}, winner.gameId);
	}
};



// remove lord and vassal connection
// vassal is now king
dInit.remove_lord_and_vassal = function(lord_id, vassal_id) {
	check(lord_id, String);
	check(vassal_id, String);

	var bulk = Players.rawCollection().initializeOrderedBulkOp();

	if (lord_id == vassal_id) {
		console.error('winner and loser are the same in remove_lord_and_vassal');
	}

	var fields = {allies_above:1, allies_below:1, gameId:1};
	var lord = Players.findOne(lord_id, {fields:fields});
	var vassal = Players.findOne(vassal_id, {fields:fields});

	if (!lord || !vassal) {
		console.error('lord or vassal not found');
		return false;
	}

	// vassal
	bulk.find({_id:lord_id}).updateOne({$pull: {vassals:vassal_id}});
	// Players.update(lord_id, {$pull: {
	// 	vassals: vassal_id
	// }});

	// lord
	bulk.find({_id:vassal_id}).updateOne({$set: {lord:null}});
	// Players.update(vassal_id, {$set: {
	// 	lord: null
	// }});

	// allies
	// remove lord and lord's allies_above from 		vassal and vassal's allies_below
	// allies_above
	// remove lord and lord's allies_above from 		vassal and vassal's allies_below
	var pullIds = _.union(lord.allies_above, [lord._id]);
	var pullUsers = _.union(vassal.allies_below, [vassal._id]);
	bulk.find({_id: {$in:pullUsers}}).update({$pull: {allies_above:{$in:pullIds}}})
	//Players.update({_id: {$in:pullUsers}}, {$pull: {allies_above:{$in:pullIds}}}, {multi:true});

	// allies
	// remove vassal and vassal's allies_below from 	lord and lord's allies_above
	// allies_below
	// remove vassal and vassal's allies_below from 	lord and lord's allies_above
	var pullVassalIds = _.union(vassal.allies_below, [vassal._id]);
	var pullVassalUsers = _.union(lord.allies_above, [lord._id]);
	bulk.find({_id: {$in:pullVassalUsers}}).update({$pull: {allies_below:{$in:pullVassalIds}}});
	//Players.update({_id: {$in:pullVassalUsers}}, {$pull: {allies_below:{$in:pullVassalIds}}}, {multi:true});

	// king
	// vassal is now king
	// vassal is now king of everyone below him
	//Players.update(vassal._id, {$set:{is_king:true}});
	bulk.find({_id:vassal._id}).updateOne({$set: {is_king:true}});
	var setUsers = vassal.allies_below;
	bulk.find({_id: {$in: setUsers}}).update({$set:{king:vassal._id}});
	//Players.update({_id:{$in:setUsers}}, {$set:{king:vassal._id}}, {multi:true});

	// team
	// remove vassal and vassal's allies_below from everyone's team
	var teamIds = _.union(vassal.allies_below, [vassal._id]);
	bulk.find({gameId:vassal.gameId}).update({$pull: {team: {$in:teamIds}}});
	//Players.update({gameId:vassal.gameId}, {$pull: {team:{$in:teamIds}}}, {multi:true});
	// vassal's team = vassal's new allies_below plus self
	bulk.find({_id: {$in: teamIds}}).update({$set: {team: teamIds}});
	//Players.update({_id:{$in:teamIds}}, {$set:{team:teamIds}}, {multi:true});

	var fut = Npm.require('fibers/future');
  var future = new fut();
	bulk.execute({}, function(error, result) {
		if (error) {
			console.error(error);
		}
		future.return(result);
	});
	var result = future.wait();

	// update count of everyone who was changed
	var ids = _.union([lord_id, vassal_id], lord.team, vassal.team);
	if (ids.length) {
		Queues.add('updateVassalAllyCountMultiple', {playerIds:ids}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, false);
	}
};



var create_lord_and_vassal = function(lord_id, vassal_id) {
	check(lord_id, String);
	check(vassal_id, String);

	var bulk = Players.rawCollection().initializeOrderedBulkOp();

	if (lord_id == vassal_id) {
		console.log('lord '+lord_id);
		console.log('vassal '+vassal_id);
		console.error('winner and loser are the same in create_lord_and_vassal');
		return false;
	}

	var fields = {allies_above:1, allies_below:1, king:1, team:1, is_king:1};
	var lord = Players.findOne(lord_id, {fields:fields});
	var vassal = Players.findOne(vassal_id, {fields:fields});

	if (!lord || !vassal) {
		console.log('lord '+lord_id);
		console.log('vassal '+vassal_id);
		console.error('lord or vassal not found');
		return false;
	}

	check(lord.allies_above, Array);
	check(lord.allies_below, Array);
	check(lord.team, Array);
	check(vassal.allies_above, Array);
	check(vassal.allies_below, Array);
	check(vassal.team, Array);

	// vassal must not have a lord
	// if so call remove first
	if (vassal.lord) {
		console.log('lord '+lord_id);
		console.log('vassal '+vassal_id);
		console.error('vassal must not have a lord');
		return false;
	}

	// set lord and remove king
	//bulk.find({_id:vassal_id}).updateOne({$set: {lord:lord_id, is_king:false}});
	bulk.find({_id:vassal_id}).updateOne({$set: {lord:lord_id, is_king:false}});
	// Players.update(vassal_id, {$set: {
	// 	lord: lord_id,
	// 	is_king:false
	// }});

	// set vassal
	bulk.find({_id:lord_id}).updateOne({$addToSet: {vassals:vassal_id}});
	// Players.update(lord_id, {$addToSet: {
	// 	vassals: vassal_id
	// }});

	// set vassal and vassal's allies below's king to king of lord
	// must happen after setting lord
	var newKing = null;

	if (lord.is_king) {
		newKing = lord._id;
	} else if (lord.king){
		newKing = lord.king;
	} else {
		newKing = getKingOf(vassal_id);
	}

	if (!newKing) {
		console.error('king not found');
	}

	var setKingIds = _.union(vassal.allies_below, vassal._id, lord._id);
	bulk.find({_id: {$in: setKingIds}}).update({$set: {king:newKing}});
	//Players.update({_id:{$in:setKingIds}}, {$set:{king:newKing}}, {multi:true});

	// allies_above
	// add lord and lord's allies_above to 		vassal and vassal's allies below allies_above
	var addIds = _.union(lord.allies_above, [lord._id]);
	var addUsers = _.union(vassal.allies_below, [vassal._id]);
	bulk.find({_id: {$in: addUsers}}).update({$addToSet: {allies_above: {$each:addIds}}});
	//Players.update({_id: {$in:addUsers}}, {$addToSet: {allies_above:{$each:addIds}}}, {multi:true});

	// allies_below
	// add vassal and vassal's allies_below to 	lord and lord's allies above allies_below
	var addVassalIds = _.union(vassal.allies_below, [vassal._id]);
	var addVassalUsers = _.union(lord.allies_above, [lord._id]);
	bulk.find({_id: {$in: addVassalUsers}}).update({$addToSet: {allies_below: {$each: addVassalIds}}});
	//Players.update({_id: {$in:addVassalUsers}}, {$addToSet: {allies_below:{$each:addVassalIds}}}, {multi:true});

	var fut = Npm.require('fibers/future');
  var future = new fut();
	bulk.execute({}, function(error, result) {
		if (error) {
			console.error(error);
		}
		future.return(result);
	});
	var result = future.wait();

	// team
	// add vassal and vassal's allies_below to lord's team
	// this does not work for some reason
	// var team = _.union(lord.team, [lord._id, vassal._id], vassal.allies_below);
	// use this slower way instead
	var team = getTeamOf(newKing);
	Players.update({_id:{$in:team}}, {$set:{team:team}}, {multi:true});

	// update count of everyone who was changed
	var ids = _.union([lord_id, vassal_id], lord.team);
	if (ids.length) {
		Queues.add('updateVassalAllyCountMultiple', {playerIds:ids}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, false);
	}
};





if (process.env.DOMINUS_WORKER == 'true') {
  Queues.updateVassalAllyCountMultiple.process(Meteor.bindEnvironment(function(job) {
		updateVassalAllyCountMultiple(job.data.playerIds);
    return Promise.resolve();
  }));
}

// used for rankings
var updateVassalAllyCountMultiple = function(playerIds) {
	check(playerIds, Array);
	if (!playerIds.length) {
		return;
	}

	var fut = Npm.require('fibers/future');
  var futurePlayers = new fut();
	var futureDailystats = new fut();
  var bulkPlayers = Players.rawCollection().initializeOrderedBulkOp();
	var bulkDailystats = Dailystats.rawCollection().initializeOrderedBulkOp();
	var hasBulkOp = false;

	var find = {_id: {$in: playerIds}};
	var options = {fields: {gameId:1, userId:1, team:1, allies_above:1, allies_below:1}};
	Players.find(find, options).forEach(function(player) {

		var num_vassals = 0;
		if (player.vassals) {
			num_vassals = player.vassals.length;
		}

		var num_allies_above = 0;
		if (player.allies_above) {
			num_allies_above = player.allies_above.length;
		}

		var num_allies_below = 0;
		if (player.allies_below) {
			num_allies_below = player.allies_below.length;
		}

		var num_team = 0;
		if (player.team) {
			num_team = player.team.length;
		}

		var set = {num_team:num_team, num_vassals:num_vassals, num_allies_above: num_allies_above, num_allies_below: num_allies_below};
		bulkPlayers.find({_id:player._id}).updateOne({$set:set});

		var dsFind = {playerId: player._id, created_at: {$gte: _gs.statsBegin(player.gameId), $lt: _gs.statsEnd(player.gameId)}};
    var dsSet = {numVassals:num_allies_below, updated_at:new Date()};
    var dsSetOnInsert = {_id:Random.id, gameId:player.gameId, user_id:player.userId, playerId:player._id, created_at: new Date()};
    bulkDailystats.find(dsFind).upsert().updateOne({$set:dsSet, $setOnInsert:dsSetOnInsert});

		hasBulkOp = true;
	});

	if (hasBulkOp) {
		bulkPlayers.execute({}, function(error, result) {
	    if (error) {
	      console.error(error);
	    }
	    futurePlayers.return(result);
	  });
	  futurePlayers.wait();

		bulkDailystats.execute({}, function(error, result) {
	    if (error) {
	      console.error(error);
	    }
	    futureDailystats.return(result);
	  });
	  futurePlayers.wait();
	}

};



// walk up tree to find king
var getKingOf = function(playerId) {
	check(playerId, String);

	var player = Players.findOne(playerId, {fields: {lord:1}});
	if (player) {
		if (player.lord) {
			return getKingOf(player.lord);
		} else {
			return playerId;
		}
	} else {
		console.error('error finding lord in getKingOf()');
		return false;
	}
};

// find king
// return king's allies_below + king
var getTeamOf = function(playerId) {
	check(playerId, String);

	var kingId = getKingOf(playerId);

	if (kingId) {
		var king = Players.findOne(kingId, {fields: {allies_below:1}});
		if (king) {
			return _.union(king.allies_below, king._id);
		} else {
			console.error('error finding user in getTeamOf()');
			return false;
		}
	} else {
		console.error('error finding king in getTeamOf()');
		return false;
	}
};
