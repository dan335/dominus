

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.deleteGameAccount.process(Meteor.bindEnvironment(function(job) {

    check(job.data.playerId, String);
    check(job.data.gameId, String);
    check(job.data.username, String);

    dGame.deleteGameAccount(job.data.playerId);
    dAlerts.gAlert_accountDeleted(job.data.gameId, job.data.username);

    return Promise.resolve();
  }));
}



dGame.deleteGameAccount = function(playerId) {
  let player = Players.findOne(playerId);

  if (!player) {
    return false;
  }

  Villages.find({playerId:playerId}, {fields:{_id:1}}).forEach(function(village) {
		dVillages.destroyVillage(village._id)
	});

  Armies.find({playerId:playerId}, {fields:{_id:1}}).forEach(function(army) {
		dArmies.destroyArmy(army._id);
	});

	Markers.remove({playerId:playerId});
	MarkerGroups.remove({playerId:playerId});

  // fix chat
	Roomchats.remove({playerId:playerId});
	Rooms.find({members:playerId}).forEach(function(room) {
		// remove from admins and members
		Rooms.update(room._id, {$pull: {admins:playerId, members:playerId, memberData:{_id:playerId}}});

		// is user owner?
		// give owner to someone else
		if (room.owner == playerId) {
			dChat.removeOwnerFromRoom(player.gameId, room._id);
		}
	});

  // fix tree
	if (player.lord) {
		var lord = Players.findOne(player.lord, {fields:{_id:1}});
		if (lord) {
			// give vassals to lord
      if (player.vassals) {
        player.vassals.forEach(function(vassal_id) {
  				var vassal = Players.findOne(vassal_id);
  				if (vassal) {
  					dInit.remove_lord_and_vassal(player._id, vassal._id);
  					dInit.set_lord_and_vassal(lord._id, vassal._id);
  				}
  			});
      }

			// remove from lord
			dInit.remove_lord_and_vassal(lord._id, player._id);
		}
	} else {
		// make vassals kings
    if (player.vassals) {
      player.vassals.forEach(function(vassal_id) {
  			var vassal = Players.findOne(vassal_id, {fields:{_id:1}});
  			if (vassal) {
  				dInit.remove_lord_and_vassal(player._id, vassal._id);
  			}
  		});
    }
	}

  Castles.remove({playerId:playerId});

	// if user doesn't have a castle then x,y will not be set
	if (player.gameId && _.isNumber(player.x) && _.isNumber(player.y)) {
		Mapmaker.buildingRemoved(player.gameId, player.x, player.y);
	}

	Players.remove({_id:player._id});
  Dailystats.remove({playerId:player._id});

	// this can't be a job
	// might pick the wrong dominus if multiple people are deleted
	dManager.checkForDominus(player.gameId);

  Queues.add('setupEveryoneChatroom', {gameId:player.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, player.gameId);
  Queues.add('generateTree', {gameId:player.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60}, player.gameId);
}
