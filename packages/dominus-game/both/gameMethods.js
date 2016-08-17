Meteor.methods({
  set_unit_image: function(unit_id, image_type, image_id, gameId) {
		check(image_type, String);
		check(image_id, String);
		check(unit_id, String);
    check(gameId, String);

		var fields = {purchases:1};
		var user = Meteor.users.findOne(this.userId, {fields: fields});

    if (!user) {
      throw new Meteor.Error('No player found.');
    }

		// is this image_type real
		if (_s.store[image_type]) {

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

      // set image
      switch(image_type) {
        case 'castles':
          Castles.update({user_id:user._id, _id:unit_id}, {$set: {image:image_id}});
          return true;
      }

		} else {
      throw new Meteor.Error('Image type not found.');
    }
	},


  activateProToken: function(gameId) {
		var self = this;
		check(gameId, String);

		let user = Meteor.users.findOne(self.userId, {fields: {pro:1, proTokens:1}});
		if (!user) {
			throw new Meteor.Error('User not found.');
		}

		if (!user.proTokens) {
			throw new Meteor.Error('User does not have any pro tokens.');
		}

		let player = Players.findOne({userId:self.userId, gameId:gameId}, {fields: {pro:1}});
		if (!player) {
			throw new Meteor.Error('No player found.');
		}

		if (player.pro) {
			throw new Meteor.Error('You have already activated pro in this game.');
		}

		Players.update(player._id, {$set: {pro:true}});
		Meteor.users.update(self.userId, {$inc: {proTokens:-1}});
	},


	change_username: function(playerId, username) {
		check(username, String);
		check(playerId, String);

		let player = Players.findOne(playerId, {fields: {is_king:1, username:1, gameId:1}});
		if (!player) {
			throw new Meteor.Error('No player found.');
		}

		var previousUsername = player.username;

		username = username.replace(/[^0-9a-zA-Z_\s]/g, '');
    username = username.trim();
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

		if (!this.isSimulation) {
      // case insensitive
      // replace with $text when meteor ships with mongo 3
      let find = {gameId:player.gameId, username: {$regex: new RegExp('^' +username + '$', 'i')}};
      if (Players.find(find).count()) {
        throw new Meteor.Error('A player exists with this username, try another.');
      }
    }

		// name of king's chatroom
		if (player.is_king) {
			var room = Rooms.findOne({type:'king', owner:player._id});
			if (room) {
				Rooms.update(room._id, {$set: {name:'King '+username+' and Vassals'}});
			}
		}

		Players.update({_id:playerId, userId:this.userId}, {$set: {username:username}});

		// update chatroom memberData
		Rooms.update({"memberData._id":player._id}, {$set: {"memberData.$.username":username}}, {multi:true});

		Castles.update({playerId: player._id}, {$set: {username: username}});
		Villages.update({playerId: player._id}, {$set: {username: username}}, {multi: true});
		Armies.update({playerId: player._id}, {$set: {username: username}}, {multi: true});

		dAlerts.gAlert_nameChange(player.gameId, player._id, previousUsername, username);

    Queues.add('generateTree', {gameId:player.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60}, player.gameId);
	},


	show_coords: function(playerId) {
		Players.update({_id:playerId, userId:this.userId}, {$set: {sp_show_coords: true}});
	},

	hide_coords: function(playerId) {
		Players.update({_id:playerId, userId:this.userId}, {$set: {sp_show_coords: false}});
	},

	show_minimap: function (playerId) {
		Players.update({_id:playerId, userId:this.userId}, {$set: {sp_show_minimap: true}});
	},

	hide_minimap: function(playerId) {
		Players.update({_id:playerId, userId:this.userId}, {$set: {sp_show_minimap: false}});
	}
})
