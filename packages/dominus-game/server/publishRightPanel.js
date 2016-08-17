var castle_fields = {male:1, gameId:1, playerId:1, name:1, user_id:1, x:1, y:1, username:1, image:1}
var army_fields = {male:1, gameId:1, playerId:1, name:1, user_id:1, x:1, y:1, last_move_at:1, username:1, castle_x:1, castle_y:1, castle_id:1};
var capitalFields = {lastIncomeUpdate:1, male:1, gameId:1, playerId:1, name:1, x:1, y:1, user_id:1};
var village_fields = {
	male:1,
	gameId:1,
	playerId:1,
	name:1,
	user_id:1,
	x:1,
	y:1,
	username:1,
	castle_x:1,
	castle_y:1,
	castle_id:1,
	income:1,
	under_construction:1,
	created_at:1,
	level:1,
	constructionStarted:1,
	lastIncomeUpdate:1
}

_s.armies.types.forEach(function(type) {
	castle_fields[type] = 1
	army_fields[type] = 1
	village_fields[type] = 1
})


Meteor.publish('rightPanelPlayers', function(playerId) {
	if (this.userId) {
		var sub = this
		var fields = {
			username:1,
			lord:1,
			x:1,
			y:1,
			castle_id:1,
			num_allies_below:1,
			allies_above:1,
			allies_below:1,
			is_dominus:1,
			is_king:1,
			income:1,
			losses_num:1,
			possibleDupe:1,
			male:1,
			lastIncomeUpdate:1
		}
		var cur = Players.find(playerId, {fields: fields})
		Mongo.Collection._publishCursor(cur, sub, 'right_panel_players')
		return sub.ready()
	} else {
		this.ready()
	}
});

var rightPanelPlayersSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'rightPanelPlayers'
}
DDPRateLimiter.addRule(rightPanelPlayersSubRule, 5, 5000);



Meteor.publish('castleForHexInfo', function(id) {
	if (this.userId) {
		var sub = this
		var cur = Castles.find(id, {fields:castle_fields});
		Mongo.Collection._publishCursor(cur, sub, 'right_panel_castle')
		return sub.ready()
	} else {
		this.ready()
	}
});

var castleForHexInfoSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'castleForHexInfo'
}
DDPRateLimiter.addRule(castleForHexInfoSubRule, 5, 5000);




Meteor.publish('armyForHexInfo', function(id) {
	if (this.userId) {
		var sub = this
		var cur = Armies.find(id, {fields:army_fields})
		Mongo.Collection._publishCursor(cur, sub, 'right_panel_armies')
		return sub.ready()
	} else {
		this.ready()
	}
});

var armyForHexInfoSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'armyForHexInfo'
}
DDPRateLimiter.addRule(armyForHexInfoSubRule, 5, 5000);



Meteor.publish('villageForHexInfo', function(id) {
	if (this.userId) {
		var sub = this
		var cur = Villages.find(id, {fields:village_fields})
		Mongo.Collection._publishCursor(cur, sub, 'right_panel_villages')
		return sub.ready()
	} else {
		this.ready()
	}
});

var villageForHexInfoSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'villageForHexInfo'
}
DDPRateLimiter.addRule(villageForHexInfoSubRule, 5, 5000);




Meteor.publish('rightPanelTree', function(playerId) {
	if (this.userId) {
		let player = Players.findOne(playerId, {fields: {allies_above:1}});
		if (player) {
			var fields = {name:1, x:1, y:1, castle_id:1, lord:1, username:1}
			var cur = Players.find({_id: {$in:player.allies_above}}, {fields: fields})
			Mongo.Collection._publishCursor(cur, this, 'right_panel_tree_players')
		}
	} else {
		this.ready();
	}
});

var rightPanelTreeSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'rightPanelTree'
}
DDPRateLimiter.addRule(rightPanelTreeSubRule, 5, 5000);
