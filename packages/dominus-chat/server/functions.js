// type is "normal" or "everyone" or "king"
// members is an array of playerIds
var memberDataFields =  {_id:1, username:1, x:1, y:1, castle_id:1};

// owner is null in everyone chat
dChat.createChatroom = function(gameId, name, type, owner, members, memberData) {
	check(gameId, String);
	check(name, String);
	check(type, String);

	var id = Rooms.insert({
		gameId: gameId,
		name: name,
		type: type,
		members: members,
		memberData:memberData,
		admins: [],
		owner: owner,
		created_at: new Date()
	})
	return id
}


// call this function when the owner deletes their account or leaves chatroom
// give owner to someone else or delete room if there are no members
dChat.removeOwnerFromRoom = function(room_id) {
	check(room_id, String)

	var room = Rooms.findOne(room_id)
	if (room) {
		var owner = room.owner
		if (owner) {
			if (room.type == 'king') {
				// if king leaves game then kill the king chatroom
				Roomchats.remove({room_id:room._id})
				Rooms.remove(room._id)
				Queues.add('cleanupAllKingChatrooms', {gameId:room.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, room.gameId);
			} else {
				Rooms.update(room_id, {$pull: {members:owner, memberData:{_id:owner}, admins:owner}})

				// get room again because we pulled from admins and members
				var room2 = Rooms.findOne(room._id)
				if (room2) {
					// are there admins?
					if (room2.admins.length > 0) {

						// find admin with highest income
						var highest = -1
						var highest_id = null
						room2.admins.forEach(function(member) {
							let player = Players.findOne(member, {fields: {income:1}})
							if (player && player.income > highest) {
								highest_id = player._id
								highest = player.income
							}
						})

						if (highest_id) {
							Rooms.update(room2._id, {
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
							room2.members.forEach(function(member) {
								let player = Players.findOne(member, {fields: {income:1}});
								if (player && player.income > highest) {
									highest_id = player._id
									highest = player.income
								}
							})

							if (highest_id) {
								Rooms.update(room2._id, {
									$set:{owner:highest_id}
								})

								dAlerts.alert_chatroomNowOwner(highest_id, room_id)
							} else {
								throw new Meteor.Error('Cannot find someone make owner of room.')
							}

						} else {
							// owner is the only member
							// delete room
							Rooms.remove(room2._id)
						}
					}
				}
			}
		}
	}
}







if (process.env.DOMINUS_WORKER == 'true') {
  Queues.updateKingChatroom.process(Meteor.bindEnvironment(function(job) {
		dChat.updateKingChatroom(job.data.gameId, job.data.playerId);
    return Promise.resolve();
  }));
}



// create or update members in king's chatroom
dChat.updateKingChatroom = function(gameId, playerId) {
	check(playerId, String);
	check(gameId, String);

	let player = Players.findOne(playerId, {fields: {gameId:1, king:1}});
	if (player && player.king) {
		let fields = {allies_below:1, username:1};
		let king = Players.findOne(player.king, {fields: fields});
		if (king) {
			if (king.allies_below) {
				var members = _.union(king.allies_below, [king._id])
			} else {
				var members = [king._id]
			}

			if (members.length > 1) {
				var memberData = Players.find({_id:{$in:members}}, {fields:memberDataFields}).fetch();

				// does king already have a chatroom
				var room = Rooms.findOne({owner:king._id, type:'king'})
				if (room) {
					// king already has a room
					Rooms.update(room._id, {$set: {members:members, memberData:memberData}})
				} else {
					// create a room for king
					dChat.createChatroom(gameId, 'King '+king.username+' and Vassals', 'king', king._id, members, memberData)
					dAlerts.alert_newKingChatroom(player.gameId, king._id)
				}
			} else {
				// destroy room if there is one
				var room = Rooms.findOne({gameId:gameId, owner:king._id, type:'king'})
				if (room) {
					// king already has a room
					dChat.destroyKingChatroom(king._id)
				}
			}
		}
	}
}




if (process.env.DOMINUS_WORKER == 'true') {
  Queues.destroyKingChatroom.process(Meteor.bindEnvironment(function(job) {
		dChat.destroyKingChatroom(job.data.king_id);
    return Promise.resolve();
  }));
}

// run when someone is no longer a king
dChat.destroyKingChatroom = function(king_id) {
	check(king_id, String)

	var player = Players.findOne(king_id, {fields: {_id:1}})
	if (player) {

		Rooms.find({owner:player._id, type:'king'}).forEach(function(room) {
			Roomchats.remove({room_id:room._id});
			Rooms.remove(room._id);
		})
	}
}




if (process.env.DOMINUS_WORKER == 'true') {
  Queues.setupEveryoneChatroom.process(Meteor.bindEnvironment(function(job) {
		dChat.setupEveryoneChatroom(job.data.gameId);
    return Promise.resolve();
  }));
}


dChat.setupEveryoneChatroom = function(gameId) {
	check(gameId, String);

	var members = [];
	var memberData = [];
	var fields = {_id:1, username:1, x:1, y:1, castle_id:1};
	Players.find({gameId:gameId}, {fields:fields}).forEach(function(player) {
		members.push(player._id);
		memberData.push(player);
	});

	var room = Rooms.findOne({gameId:gameId, type:'everyone'})
	if (room) {
		Rooms.update(room._id, {$set: {members:members, memberData:memberData}});
	} else {
		dChat.createChatroom(gameId, 'Everyone', 'everyone', null, members, memberData);
	}
}





if (process.env.DOMINUS_WORKER == 'true') {
  Queues.cleanupAllKingChatrooms.process(Meteor.bindEnvironment(function(job) {
		dChat.cleanupAllKingChatrooms(job.data.gameId);
    return Promise.resolve();
  }));
}


dChat.cleanupAllKingChatrooms = function(gameId) {
	// delete rooms where owner doesn't exist
	Rooms.find({gameId:gameId, type:'king'}).forEach(function(room) {
		let player = Players.findOne(room.owner)
		if (!player) {
			Roomchats.remove({room_id:room._id})
			Rooms.remove(room._id)
		}
	})

	// destroy all king chatrooms that belong to people who are not kings
	Players.find({gameId:gameId, is_king:false}).forEach(function(player) {
		if (Rooms.find({owner:player._id, type:'king'}).count() > 0) {
			Queues.add('destroyKingChatroom', {king_id:player._id}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, player._id);
		}
	})

	// destroy chatrooms where king is the only member
	Rooms.find({gameId:gameId, type:'king'}).forEach(function(room) {
		if (room.members.length < 2) {
			Roomchats.remove({room_id:room._id})
			Rooms.remove(room._id)
		}
	})

	// create chatrooms for all users who are kings
	Players.find({gameId:gameId, is_king:true}).forEach(function(player) {
		if (player.team) {
			var team = _.without(player.team, player._id)
			if (team.length > 0) {
				dChat.updateKingChatroom(gameId, player._id)
			}
		}
	})

	// make sure all chatrooms are named correctly
	Rooms.find({gameId:gameId, type:'king'}).forEach(function(room) {
		var owner = Players.findOne(room.owner)
		if (owner) {
			Rooms.update(room._id, {$set: {name:'King '+owner.username+' and Vassals'}})
		}
	})
}
