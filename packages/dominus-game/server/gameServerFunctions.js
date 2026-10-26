

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.deleteGameAccount.process(async function(job) {

    check(job.data.playerId, String);
    check(job.data.gameId, String);
    check(job.data.username, String);

    await dGame.deleteGameAccount(job.data.playerId);
    await dAlerts.gAlert_accountDeleted(job.data.gameId, job.data.username);
  });
}



dGame.deleteGameAccount = async function(playerId) {
  let player = await Players.findOneAsync(playerId);

  if (!player) {
    return false;
  }

  for (const village of await Villages.find({playerId:playerId}, {fields:{_id:1}}).fetchAsync()) {
		await dVillages.destroyVillage(village._id)
	}

  for (const army of await Armies.find({playerId:playerId}, {fields:{_id:1}}).fetchAsync()) {
		await dArmies.destroyArmy(army._id);
	}

	await Markers.removeAsync({playerId:playerId});
	await MarkerGroups.removeAsync({playerId:playerId});

  // fix chat
	await Roomchats.removeAsync({playerId:playerId});
	for (const room of await Rooms.find({members:playerId}).fetchAsync()) {
		// remove from admins and members
		await Rooms.updateAsync(room._id, {$pull: {admins:playerId, members:playerId, memberData:{_id:playerId}}});

		// is user owner?
		// give owner to someone else
		if (room.owner == playerId) {
			await dChat.removeOwnerFromRoom(player.gameId, room._id);
		}
	}

  // fix tree
	if (player.lord) {
		var lord = await Players.findOneAsync(player.lord, {fields:{_id:1}});
		if (lord) {
			// give vassals to lord
      if (player.vassals) {
        for (const vassal_id of player.vassals) {
  				var vassal = await Players.findOneAsync(vassal_id);
  				if (vassal) {
  					await dInit.remove_lord_and_vassal(player._id, vassal._id);
  					await dInit.set_lord_and_vassal(lord._id, vassal._id);
  				}
  			}
      }

			// remove from lord
			await dInit.remove_lord_and_vassal(lord._id, player._id);
		} else {
			// player.lord points at a lord that no longer exists (e.g. that lord was
			// deleted first, or a pre-existing dangling pointer). Without this branch
			// the player's vassals are left orphaned with a dangling lord pointer and
			// is_king:false -- invisible to generateTree and the nightly rebuild, yet
			// still counted by checkForDominus, which permanently blocks any dominus
			// (unwinnable game). Promote them to kings, same as the no-lord branch.
			if (player.vassals) {
				for (const vassal_id of player.vassals) {
					var vassal = await Players.findOneAsync(vassal_id, {fields:{_id:1}});
					if (vassal) {
						await dInit.remove_lord_and_vassal(player._id, vassal._id);
					}
				}
			}
		}
	} else {
		// make vassals kings
    if (player.vassals) {
      for (const vassal_id of player.vassals) {
  			var vassal = await Players.findOneAsync(vassal_id, {fields:{_id:1}});
  			if (vassal) {
  				await dInit.remove_lord_and_vassal(player._id, vassal._id);
  			}
  		}
    }
	}

  await Castles.removeAsync({playerId:playerId});

	// if user doesn't have a castle then x,y will not be set
	if (player.gameId && _.isNumber(player.x) && _.isNumber(player.y)) {
		await Mapmaker.buildingRemoved(player.gameId, player.x, player.y);
	}

	await Players.removeAsync({_id:player._id});
  await Dailystats.removeAsync({playerId:player._id});

	// this can't be a job
	// might pick the wrong dominus if multiple people are deleted
	await dManager.checkForDominus(player.gameId);

  await Queues.addAsyncOrLog('setupEveryoneChatroom', {gameId:player.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, player.gameId);
  await Queues.addAsyncOrLog('generateTree', {gameId:player.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60}, player.gameId);
}
