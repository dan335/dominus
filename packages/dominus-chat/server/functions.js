// type is "normal" or "everyone" or "king"
// members is an array of playerIds
var memberDataFields =  {_id:1, username:1, x:1, y:1, castle_id:1};

// owner is null in everyone chat
dChat.createChatroom = async function(gameId, name, type, owner, members, memberData) {
	check(gameId, String);
	check(name, String);
	check(type, String);

	var id = await Rooms.insertAsync({
		gameId: gameId,
		name: name,
		type: type,
		members: members,
		memberData:memberData,
		admins: [],
		owner: owner,
		created_at: dClock.now()
	})
	return id
}


// call this function when the owner deletes their account or leaves chatroom
// give owner to someone else or delete room if there are no members
dChat.removeOwnerFromRoom = async function(room_id) {
	check(room_id, String)

	var room = await Rooms.findOneAsync(room_id)
	if (room) {
		var owner = room.owner
		if (owner) {
			if (room.type == 'king') {
				// if king leaves game then kill the king chatroom
				await Roomchats.removeAsync({room_id:room._id})
				await Rooms.removeAsync(room._id)
				await Queues.addAsyncOrLog('cleanupAllKingChatrooms', {gameId:room.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, room.gameId);
			} else {
				await Rooms.updateAsync(room_id, {$pull: {members:owner, memberData:{_id:owner}, admins:owner}})

				// get room again because we pulled from admins and members
				var room2 = await Rooms.findOneAsync(room._id)
				if (room2) {
					// are there admins?
					if (room2.admins.length > 0) {

						// find admin with highest income
						var highest = -1
						var highest_id = null
						for (const member of room2.admins) {
							let player = await Players.findOneAsync(member, {fields: {income:1}})
							if (player && player.income > highest) {
								highest_id = player._id
								highest = player.income
							}
						}

						if (highest_id) {
							await Rooms.updateAsync(room2._id, {
								$set:{owner:highest_id},
								$pull:{admins:highest_id}
							})

							dAlerts.alert_chatroomNowOwner(highest_id, room_id)
						} else {
							throw new Meteor.Error('Cannot find someone make owner of room.')
						}

					} else {
						// no admins
						// are there members?
						if (room2.members.length > 0) {

							// find member with highest income
							var highest = -1
							var highest_id = null
							for (const member of room2.members) {
								let player = await Players.findOneAsync(member, {fields: {income:1}});
								if (player && player.income > highest) {
									highest_id = player._id
									highest = player.income
								}
							}

							if (highest_id) {
								await Rooms.updateAsync(room2._id, {
									$set:{owner:highest_id}
								})

								dAlerts.alert_chatroomNowOwner(highest_id, room_id)
							} else {
								throw new Meteor.Error('Cannot find someone make owner of room.')
							}

						} else {
							// owner is the only member
							// delete room
							await Rooms.removeAsync(room2._id)
						}
					}
				}
			}
		}
	}
}







if (process.env.DOMINUS_WORKER == 'true') {
  Queues.updateKingChatroom.process(async function(job) {
		await dChat.updateKingChatroom(job.data.gameId, job.data.playerId);
  });
}



// create or update members in king's chatroom
dChat.updateKingChatroom = async function(gameId, playerId) {
	check(playerId, String);
	check(gameId, String);

	let player = await Players.findOneAsync(playerId, {fields: {gameId:1, king:1}});
	if (player && player.king) {
		let fields = {allies_below:1, username:1};
		let king = await Players.findOneAsync(player.king, {fields: fields});
		if (king) {
			if (king.allies_below) {
				var members = _.union(king.allies_below, [king._id])
			} else {
				var members = [king._id]
			}

			if (members.length > 1) {
				var memberData = await Players.find({_id:{$in:members}}, {fields:memberDataFields}).fetchAsync();

				// does king already have a chatroom
				var room = await Rooms.findOneAsync({owner:king._id, type:'king'})
				if (room) {
					// king already has a room
					await Rooms.updateAsync(room._id, {$set: {members:members, memberData:memberData}})
				} else {
					// create a room for king
					await dChat.createChatroom(gameId, 'King '+king.username+' and Vassals', 'king', king._id, members, memberData)
					dAlerts.alert_newKingChatroom(player.gameId, king._id)
				}
			} else {
				// destroy room if there is one
				var room = await Rooms.findOneAsync({gameId:gameId, owner:king._id, type:'king'})
				if (room) {
					// king already has a room
					await dChat.destroyKingChatroom(king._id)
				}
			}
		}
	}
}




if (process.env.DOMINUS_WORKER == 'true') {
  Queues.destroyKingChatroom.process(async function(job) {
		await dChat.destroyKingChatroom(job.data.king_id);
  });
}

// run when someone is no longer a king
dChat.destroyKingChatroom = async function(king_id) {
	check(king_id, String)

	var player = await Players.findOneAsync(king_id, {fields: {_id:1}})
	if (player) {

		for (const room of await Rooms.find({owner:player._id, type:'king'}).fetchAsync()) {
			await Roomchats.removeAsync({room_id:room._id});
			await Rooms.removeAsync(room._id);
		}
	}
}




if (process.env.DOMINUS_WORKER == 'true') {
  Queues.setupEveryoneChatroom.process(async function(job) {
		await dChat.setupEveryoneChatroom(job.data.gameId);
  });
}


dChat.setupEveryoneChatroom = async function(gameId) {
	check(gameId, String);

	var members = [];
	var memberData = [];
	var fields = {_id:1, username:1, x:1, y:1, castle_id:1};
	for (const player of await Players.find({gameId:gameId}, {fields:fields}).fetchAsync()) {
		members.push(player._id);
		memberData.push(player);
	}

	var room = await Rooms.findOneAsync({gameId:gameId, type:'everyone'})
	if (room) {
		await Rooms.updateAsync(room._id, {$set: {members:members, memberData:memberData}});
	} else {
		await dChat.createChatroom(gameId, 'Everyone', 'everyone', null, members, memberData);
	}
}





if (process.env.DOMINUS_WORKER == 'true') {
  Queues.cleanupAllKingChatrooms.process(async function(job) {
		await dChat.cleanupAllKingChatrooms(job.data.gameId);
  });
}


dChat.cleanupAllKingChatrooms = async function(gameId) {
	// delete rooms where owner doesn't exist
	for (const room of await Rooms.find({gameId:gameId, type:'king'}).fetchAsync()) {
		let player = await Players.findOneAsync(room.owner)
		if (!player) {
			await Roomchats.removeAsync({room_id:room._id})
			await Rooms.removeAsync(room._id)
		}
	}

	// destroy all king chatrooms that belong to people who are not kings
	for (const player of await Players.find({gameId:gameId, is_king:false}).fetchAsync()) {
		if (await Rooms.find({owner:player._id, type:'king'}).countAsync() > 0) {
			await Queues.addAsyncOrLog('destroyKingChatroom', {king_id:player._id}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, player._id);
		}
	}

	// destroy chatrooms where king is the only member
	for (const room of await Rooms.find({gameId:gameId, type:'king'}).fetchAsync()) {
		if (room.members.length < 2) {
			await Roomchats.removeAsync({room_id:room._id})
			await Rooms.removeAsync(room._id)
		}
	}

	// create chatrooms for all users who are kings
	for (const player of await Players.find({gameId:gameId, is_king:true}).fetchAsync()) {
		if (player.team) {
			var team = _.without(player.team, player._id)
			if (team.length > 0) {
				await dChat.updateKingChatroom(gameId, player._id)
			}
		}
	}

	// make sure all chatrooms are named correctly
	for (const room of await Rooms.find({gameId:gameId, type:'king'}).fetchAsync()) {
		var owner = await Players.findOneAsync(room.owner)
		if (owner) {
			await Rooms.updateAsync(room._id, {$set: {name:'King '+owner.username+' and Vassals'}})
		}
	}
}
