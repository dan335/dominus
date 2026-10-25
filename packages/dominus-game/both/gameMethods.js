// These run on the client too, so the change shows at once. Each stays a
// plain function: the simulation is sync and the server's part is async (see
// "Async conversion" in CLAUDE.md).

// throws unless user owns image_id, and returns true if it is an image of a
// type the method can set
var checkOwnsImage = function(user, image_type, image_id) {
	if (!user) {
		throw new Meteor.Error('No player found.');
	}

	// is this image_type real
	if (!_s.store[image_type]) {
		throw new Meteor.Error('Image type not found.');
	}

	// is this id real
	if (_.indexOf(_s.store[image_type].types, image_id) == -1) {
		throw new Meteor.Error('Image id not found.')
	}

	// make sure user owns this image
	let ownsImage = false;
	if (user.purchases && user.purchases[image_type]) {
		if (_.contains(user.purchases[image_type], image_id)) {
			ownsImage = true;
		}
	}

	if (!ownsImage) {
		throw new Meteor.Error('Player does not own image.');
	}

	return image_type == 'castles';
};

var checkCanActivatePro = function(user, player) {
	if (!user) {
		throw new Meteor.Error('User not found.');
	}

	if (!user.proTokens) {
		throw new Meteor.Error('User does not have any pro tokens.');
	}

	if (!player) {
		throw new Meteor.Error('No player found.');
	}

	if (player.pro) {
		throw new Meteor.Error('You have already activated pro in this game.');
	}
};

var cleanUsername = function(username) {
	username = username.replace(/[^0-9a-zA-Z_\s]/g, '');
	return username.trim();
};

var checkNewUsername = function(player, username) {
	if (!player) {
		throw new Meteor.Error('No player found.');
	}

	usernameNoSpaces = username.replace(/[^0-9a-zA-Z_]/g, '');

	if (username == 'Danimal') {
		throw new Meteor.Error('You are not Danimal.');
	}

	if (username == player.username) {
		throw new Meteor.Error("You're already named "+username);
	}

	if (usernameNoSpaces.length < 3) {
		throw new Meteor.Error('New username must be at least 3 characters long.');
	}

	if (username.length > 25) {
		throw new Meteor.Error('New username is too long.');
	}
};

// for show_coords, hide_coords, show_minimap and hide_minimap
var setPlayerFlag = function(invocation, playerId, set) {
	var find = {_id:playerId, userId:invocation.userId};
	if (invocation.isSimulation) {
		Players.update(find, {$set: set});
		return;
	}
	return (async () => {
		await Players.updateAsync(find, {$set: set});
	})();
};

Meteor.methods({
  set_unit_image: function(unit_id, image_type, image_id, gameId) {
		check(image_type, String);
		check(image_id, String);
		check(unit_id, String);
    check(gameId, String);

		var fields = {purchases:1};

		if (this.isSimulation) {
			var user = Meteor.users.findOne(this.userId, {fields: fields});
			if (checkOwnsImage(user, image_type, image_id)) {
				Castles.update({user_id:user._id, _id:unit_id}, {$set: {image:image_id}});
				return true;
			}
			return;
		}

		return (async () => {
			var user = await Meteor.users.findOneAsync(this.userId, {fields: fields});

			// set image
			if (checkOwnsImage(user, image_type, image_id)) {
				await Castles.updateAsync({user_id:user._id, _id:unit_id}, {$set: {image:image_id}});
				return true;
			}
		})();
	},


  activateProToken: function(gameId) {
		var self = this;
		check(gameId, String);

		var playerFind = {userId:self.userId, gameId:gameId};

		if (this.isSimulation) {
			let player = Players.findOne(playerFind, {fields: {pro:1}});
			checkCanActivatePro(Meteor.users.findOne(self.userId, {fields: {pro:1, proTokens:1}}), player);
			Players.update(player._id, {$set: {pro:true}});
			Meteor.users.update(self.userId, {$inc: {proTokens:-1}});
			return;
		}

		return (async () => {
			let user = await Meteor.users.findOneAsync(self.userId, {fields: {pro:1, proTokens:1}});
			let player = await Players.findOneAsync(playerFind, {fields: {pro:1}});
			checkCanActivatePro(user, player);

			await Players.updateAsync(player._id, {$set: {pro:true}});
			await Meteor.users.updateAsync(self.userId, {$inc: {proTokens:-1}});
		})();
	},


	change_username: function(playerId, username) {
		check(username, String);
		check(playerId, String);

		// scope to the caller's own player -- otherwise passing another player's id
		// renames that victim's denormalized castle/village/army/chatroom names
		// (the writes below use player._id) and fires a global name-change alert
		// attributed to them, even though the authoritative Players write is
		// already userId-scoped.
		var playerFind = {_id:playerId, userId:this.userId};
		var playerOptions = {fields: {is_king:1, username:1, gameId:1}};

		username = cleanUsername(username);

		if (this.isSimulation) {
			let player = Players.findOne(playerFind, playerOptions);
			checkNewUsername(player, username);

			// name of king's chatroom
			if (player.is_king) {
				var room = Rooms.findOne({type:'king', owner:player._id});
				if (room) {
					Rooms.update(room._id, {$set: {name:'King '+username+' and Vassals'}});
				}
			}

			Players.update(playerFind, {$set: {username:username}});
			Rooms.update({"memberData._id":player._id}, {$set: {"memberData.$.username":username}}, {multi:true});
			Castles.update({playerId: player._id}, {$set: {username: username}});
			Villages.update({playerId: player._id}, {$set: {username: username}}, {multi: true});
			Armies.update({playerId: player._id}, {$set: {username: username}}, {multi: true});
			return;
		}

		return (async () => {
			let player = await Players.findOneAsync(playerFind, playerOptions);
			checkNewUsername(player, username);

			var previousUsername = player.username;

			// case insensitive
			// replace with $text when meteor ships with mongo 3
			let find = {gameId:player.gameId, username: {$regex: new RegExp('^' +username + '$', 'i')}};
			if (await Players.find(find).countAsync()) {
				throw new Meteor.Error('A player exists with this username, try another.');
			}

			// name of king's chatroom
			if (player.is_king) {
				var room = await Rooms.findOneAsync({type:'king', owner:player._id});
				if (room) {
					await Rooms.updateAsync(room._id, {$set: {name:'King '+username+' and Vassals'}});
				}
			}

			await Players.updateAsync(playerFind, {$set: {username:username}});

			// update chatroom memberData
			await Rooms.updateAsync({"memberData._id":player._id}, {$set: {"memberData.$.username":username}}, {multi:true});

			await Castles.updateAsync({playerId: player._id}, {$set: {username: username}});
			await Villages.updateAsync({playerId: player._id}, {$set: {username: username}}, {multi: true});
			await Armies.updateAsync({playerId: player._id}, {$set: {username: username}}, {multi: true});

			dAlerts.gAlert_nameChange(player.gameId, player._id, previousUsername, username);

			await Queues.addAsyncOrLog('generateTree', {gameId:player.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60}, player.gameId);
		})();
	},


	show_coords: function(playerId) {
		check(playerId, String);
		return setPlayerFlag(this, playerId, {sp_show_coords: true});
	},

	hide_coords: function(playerId) {
		check(playerId, String);
		return setPlayerFlag(this, playerId, {sp_show_coords: false});
	},

	show_minimap: function (playerId) {
		check(playerId, String);
		return setPlayerFlag(this, playerId, {sp_show_minimap: true});
	},

	hide_minimap: function(playerId) {
		check(playerId, String);
		return setPlayerFlag(this, playerId, {sp_show_minimap: false});
	}
})
