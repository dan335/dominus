Meteor.methods({
	reportPlayer: function(playerId, reason) {
		check(playerId, String);
		check(reason, String);

		let gameId = Session.get('gameId');

		if (reason.length < 6) {
			throw new Meteor.Error('Please give a reason why you are reporting this player.');
		}

		if (reason.length > 300) {
			throw new Meteor.Error('Reason too long.  300 characters max.');
		}

		// make sure user isn't reporting too often
		let find = {gameId:gameId, userId:this.userId};
		var fields = {lastReportDate:1, username:1, admin:1};
		var player = Players.findOne(find, {fields:fields});

		if (!player) { return; }

		var rFields = {username:1, userId:1};
		rPlayer = Players.findOne(find, {fields:rFields});

		if (!rPlayer) { return; }

		// limit reports
		if (!player.admin) {
			if (player.lastReportDate) {
				var lastReportDate = moment(new Date(player.lastReportDate));

				if (moment() - lastReportDate < _s.init.canReportEvery) {
					var dur = moment.duration(_s.init.canReportEvery);
					throw new Meteor.Error('Can only make a report once '+dur.humanize()+'.');
				}
			}
		}

		// create report
		var report = {
			playerId: playerId,
			userId: player.userId,
			username: player.username,
			reason: reason,
			createdAt: new Date(),
			reportedPlayerId: rPlayer._id,
			reportedUserId: rPlayer.userId,
			reportedUsername: rPlayer.username,
			active:true,
			gameId:gameId
		};

		if (player.admin) {
			report.username = 'Admin';
		}

		Reports.insert(report);

		// global alert
		dAlerts.gAlert_playerReported(gameId, player._id, player.username, reason, rPlayer._id, rPlayer.username);

		// record date
		// users can only report once every ...
		Players.update(player._id, {$set: {lastReportDate: new Date()}});
	},


	edit_name: function(type, id, name, playerId) {
		var error = false;

		if (name.length < 1) {
			throw new Meteor.Error('Name is too short.');
		}

		if (name.length > 30) {
			throw new Meteor.Error('Name must be less than 30 characters.');
		}

		let player = Players.findOne({_id:playerId, userId:this.userId}, {fields: {_id:1}});

		name = _.clean(name);

		switch(type) {
			case 'capital':
				Capitals.update({_id:id, playerId:player._id}, {$set:{name:name}});
				break;
			case 'castle':
				Castles.update({_id:id, playerId:player._id}, {$set: {name: name}});
				break;
			case 'village':
				Villages.update({_id:id, playerId:player._id}, {$set: {name: name}});
				break;
			case 'army':
				Armies.update({_id:id, playerId:player._id}, {$set: {name: name}});
				break;
		}
	},
})




if (Meteor.isServer) {
	var edit_nameRule = {
	  userId: function() {return true;},
	  type: 'method',
	  name: 'edit_name'
	}
	DDPRateLimiter.addRule(edit_nameRule, 5, 5000);

	var reportPlayerRule = {
	  userId: function() {return true;},
	  type: 'method',
	  name: 'reportPlayer'
	}
	DDPRateLimiter.addRule(reportPlayerRule, 5, 5000);

}
