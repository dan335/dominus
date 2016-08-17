Meteor.methods({
	startChatroomWith: function(gameId, username) {

		check(gameId, String);
		check(username, String)

		let find = {gameId:gameId, userId:this.userId};
		let options = {fields: {username:1, x:1, y:1, castle_id:1}};
		var player = Players.findOne(find, options);

		if (player) {
			if (username == player.username) {
				throw new Meteor.Error("Can't chat with yourself.")
			}

			var other_player = Players.findOne({gameId:gameId, username: {$regex: new RegExp('^' +username + '$', 'i')}}, {fields: {username:1, x:1, y:1, castle_id:1}})

			if (other_player) {
				// make sure there isn't another chatroom with only these two people
				if (Rooms.find({gameId:gameId, type:'normal', members: {$all: [player._id, other_player._id], $size:2}}).count() > 0) {
					throw new Meteor.Error("You already have a chatroom with "+username+".")
				}

				var name = player.username+' and '+other_player.username;
				var id = dChat.createChatroom(gameId, name, 'normal', player._id, [player._id, other_player._id], [player, other_player]);

				dAlerts.alert_addedToChatroom(gameId, other_player._id, player._id, id);

				return id;

			} else {
				throw new Meteor.Error("Can't find a player named "+username+".")
			}
		} else {
			throw new Meteor.Error("Can't find your account.  You shouldn't see this error, please report it.")
		}
	},


	leaveChatroom: function(gameId, room_id) {
		check(room_id, String);
		check(gameId, String);

		let find = {gameId:gameId, userId:this.userId};
		let options = {fields: {_id:1}};
		let player = Players.findOne(find, options);

		var room = Rooms.findOne({gameId:gameId, _id:room_id, members:player._id, type:'normal'})
		if (room) {
			// removing from members and admins removes user from chatroom
			Rooms.update(room_id, {$pull: {members:player._id, memberData:{_id:player._id}, admins:player._id}})

			// if user is owner give room to person with most income
			// if user is only person this will delete it
			if (room.owner == player._id) {
				dChat.removeOwnerFromRoom(gameId, room._id)
			}

		} else {
			throw new Meteor.Error("Can't find room.")
		}
	},


	renameChatroom: function(gameId, room_id, name) {
		check(room_id, String);
		check(name, String);
		check(gameId, String);

		var chatroomMaxNameLength = 35

		let find = {gameId:gameId, userId:this.userId};
		let options = {fields: {_id:1}};
		let player = Players.findOne(find, options);

		var room = Rooms.findOne({_id:room_id, gameId:gameId});

		if (room) {
			if (room.owner == player._id) {
				if (name.length < 1) {
					throw new Meteor.Error("New name is not long enough.")
				}

				if (name.length >= chatroomMaxNameLength) {
					throw new Meteor.Error("Must be less than "+chatroomMaxNameLength+" characters.")
				}

				Rooms.update(room_id, {$set: {name:name}})
				return true

			} else {
				throw new Meteor.Error("Only the owner can rename a chatroom.")
			}
		} else {
			throw new Meteor.Error("Error renaming room.")
		}
	},


	inviteToChatroom: function(gameId, room_id, name) {
		check(room_id, String)
		check(name, String);
		check(gameId, String);

		let find = {gameId:gameId, userId:this.userId};
		let options = {fields: {_id:1}};
		let player = Players.findOne(find, options);

		var room = Rooms.findOne({_id:room_id, gameId:gameId})

		if (room) {
			if (room.owner == player._id || _.contains(room.admins, player._id)) {
				var member = Players.findOne({username:name, gameId:gameId}, {fields: {username:1, x:1, y:1, castle_id:1}})

				if (member) {
					if (_.contains(room.members, member._id)) {
						throw new Meteor.Error(name+" is already in this chatroom.")
					}

					dAlerts.alert_addedToChatroom(gameId, member._id, player._id, room._id)

					Rooms.update(room_id, {$addToSet: {members:member._id, memberData:member}})

				} else {
					throw new Meteor.Error("Can't find anyone named "+name+".")
				}

			} else {
				throw new Meteor.Error('Only the room owner and admins can invite users.')
			}

		} else {
			throw new Meteor.Error('Error inviting user.')
		}
	},


	// must be owner
	// owner is now admin
	chatroomMakeOwner: function(gameId, room_id, member_id) {
		check(room_id, String)
		check(member_id, String);
		check(gameId, String);

		let find = {gameId:gameId, userId:this.userId};
		let options = {fields: {_id:1}};
		let player = Players.findOne(find, options);

		if (!player) {
			return false;
		}

		var room = Rooms.findOne({gameId:gameId, _id:room_id, owner:player._id})
		if (room) {
			// make sure member_id is a member of room
			if (!_.contains(room.members, member_id)) {
				return false
			}

			// can't do these two updates at the same time
			// MongoError: Field name duplication not allowed with modifiers
			// mongo bug?
			Rooms.update(room_id, {
				$set: {owner:member_id},
				$addToSet: {admins:player._id}
			})

			Rooms.update(room_id, {
				$pull: {admins:member_id}
			})

			dAlerts.alert_chatroomNowOwner(gameId, member_id, room_id)
		}
	},


	// if I am owner or admin and other user is not admin or owner
	chatroomMakeAdmin: function(gameId, room_id, member_id) {
		check(room_id, String)
		check(member_id, String);
		check(gameId, String);

		let find = {gameId:gameId, userId:this.userId};
		let options = {fields: {_id:1}};
		let player = Players.findOne(find, options);

		if (!player) {
			return false;
		}

		var room = Rooms.findOne({_id:room_id, gameId:gameId})
		if (room) {
			// make sure member_id is a member of room
			if (!_.contains(room.members, member_id)) {
				return false
			}

			if (room.owner == player._id || _.contains(room.admins, player._id)) {
				if (room.owner != member_id) {
					if (!_.contains(room.admins, member_id)) {
						Rooms.update(room_id, {$addToSet: {admins:member_id}})
						dAlerts.alert_chatroomMadeAdmin(gameId, member_id, room_id)
					}
				}
			}
		}
	},


	// if i am owner and user is admin
	chatroomRemoveAdmin: function(gameId, room_id, member_id) {
		check(room_id, String)
		check(member_id, String);
		check(gameId, String);

		let find = {gameId:gameId, userId:this.userId};
		let options = {fields: {_id:1}};
		let player = Players.findOne(find, options);

		if (!player) {
			return false;
		}

		var room = Rooms.findOne(room_id)
		if (room) {
			// make sure member_id is a member of room
			if (!_.contains(room.members, member_id)) {
				return false
			}

			// i am owner
			if (room.owner != player._id) {
				return false
			}

			if (!_.contains(room.admins, member_id)) {
				return false
			}

			Rooms.update(room_id, {$pull: {admins:member_id}})
			dAlerts.alert_chatroomRemovedFromAdmin(gameId, member_id, room_id)
		}
	},


	// if i am owner - can kick anyone
	// if i am admin - can kick not admin
	kickFromChatroom: function(gameId, room_id, member_id) {
		check(room_id, String)
		check(member_id, String);
		check(gameId, String);

		let find = {gameId:gameId, userId:this.userId};
		let options = {fields: {_id:1}};
		let player = Players.findOne(find, options);

		if (!player) {
			return false;
		}

		var room = Rooms.findOne({_id:room_id, gameId:gameId})
		if (room) {
			// make sure member_id is a member of room
			if (!_.contains(room.members, member_id)) {
				return false
			}

			// i am owner
			if (room.owner == player._id) {
				Rooms.update(room_id, {$pull: {admins:member_id, members:member_id, memberData:{_id:member_id}}});
			}

			// i am admin
			if (_.contains(room.admins, player._id)) {
				// member is not owner
				if (room.owner != member_id) {
					// member is not an admin
					if (!_.contains(room.admins, member_id)) {
						Rooms.update(room_id, {$pull: {members:member_id, memberData:{_id:member_id}}})
					}
				}
			}

			dAlerts.alert_kickedFromChatroom(gameId, member_id, room_id)
		}
	},
})


if (Meteor.isServer) {
	var kickFromChatroomRule = {
	  userId: function() {return true;},
	  type: 'method',
	  name: 'kickFromChatroom'
	}
	DDPRateLimiter.addRule(kickFromChatroomRule, 6, 5000);

	var chatroomRemoveAdminRule = {
	  userId: function() {return true;},
	  type: 'method',
	  name: 'chatroomRemoveAdmin'
	}
	DDPRateLimiter.addRule(chatroomRemoveAdminRule, 6, 5000);

	var chatroomMakeAdminRule = {
	  userId: function() {return true;},
	  type: 'method',
	  name: 'chatroomMakeAdmin'
	}
	DDPRateLimiter.addRule(chatroomMakeAdminRule, 6, 5000);

	var chatroomMakeOwnerRule = {
	  userId: function() {return true;},
	  type: 'method',
	  name: 'chatroomMakeOwner'
	}
	DDPRateLimiter.addRule(chatroomMakeOwnerRule, 6, 5000);

	var inviteToChatroomRule = {
	  userId: function() {return true;},
	  type: 'method',
	  name: 'inviteToChatroom'
	}
	DDPRateLimiter.addRule(inviteToChatroomRule, 6, 5000);

	var renameChatroomRule = {
	  userId: function() {return true;},
	  type: 'method',
	  name: 'renameChatroom'
	}
	DDPRateLimiter.addRule(renameChatroomRule, 6, 5000);

	var leaveChatroomRule = {
	  userId: function() {return true;},
	  type: 'method',
	  name: 'leaveChatroom'
	}
	DDPRateLimiter.addRule(leaveChatroomRule, 6, 5000);

	var startChatroomWithRule = {
	  userId: function() {return true;},
	  type: 'method',
	  name: 'startChatroomWith'
	}
	DDPRateLimiter.addRule(startChatroomWithRule, 6, 5000);
}
