Meteor.publish('left_panel_allies', function(gameId, playerId) {
	if(this.userId) {
		var sub = this;

		var fields = {
			playerId:1,
			username:1,
			castle_id:1,
			x:1,
			y:1
		};

		var cur = Players.find({gameId:gameId, allies_above:playerId}, {fields: fields});
		Mongo.Collection._publishCursor(cur, sub, 'left_panel_allies');
		return sub.ready();
	} else {
		this.ready();
	}
})


Meteor.publish('left_panel_lords', function(gameId, playerId) {
	if(this.userId) {
		var sub = this
		var cur = Players.find({gameId:gameId, allies_below:playerId}, {fields: {
				username:1,
				castle_id:1,
				x:1,
				y:1,
				playerId:1
			}})
		Mongo.Collection._publishCursor(cur, sub, 'left_panel_lords')
		return sub.ready();
	} else {
		this.ready()
	}
})

Meteor.publish('left_panel_castle', function(gameId) {
	if(this.userId) {
		var sub = this

		var fields = {playerId:1, name:1, x:1, y:1, user_id:1}
		_s.armies.types.forEach(function(type) {
			fields[type] = 1
		})

		var cur = Castles.find({gameId:gameId, user_id: this.userId}, {fields: fields})
		Mongo.Collection._publishCursor(cur, sub, 'left_panel_castle')
		return sub.ready()
	} else {
		this.ready()
	}
})

Meteor.publish('left_panel_villages', function(gameId) {
	if(this.userId) {
		var sub = this;
		var fields = {playerId:1, name:1, x:1, y:1, user_id:1, level:1, "income.worth":1, under_construction:1, constructionStarted:1};

		_s.armies.types.forEach(function(type) {
			fields[type] = 1;
		});

		var cur = Villages.find({gameId:gameId, user_id: this.userId}, {fields: fields});
		Mongo.Collection._publishCursor(cur, sub, 'left_panel_villages');
		return sub.ready();
	} else {
		this.ready();
	}
});


Meteor.publish('left_panel_capitals', function(gameId, playerId) {
	if(this.userId) {
		var sub = this;
		var fields = {playerId:1, name:1, x:1, y:1, "income.worth":1};
		var cur = Capitals.find({gameId:gameId, playerId:playerId}, {fields: fields});
		Mongo.Collection._publishCursor(cur, sub, 'left_panel_capitals');
		return sub.ready();
	} else {
		this.ready();
	}
});



var left_panel_alliesSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'left_panel_allies'
}
DDPRateLimiter.addRule(left_panel_alliesSubRule, 5, 5000);

var left_panel_lordsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'left_panel_lords'
}
DDPRateLimiter.addRule(left_panel_lordsSubRule, 5, 5000);

var left_panel_castleSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'left_panel_castle'
}
DDPRateLimiter.addRule(left_panel_castleSubRule, 5, 5000);

var left_panel_villagesSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'left_panel_villages'
}
DDPRateLimiter.addRule(left_panel_villagesSubRule, 5, 5000);

var left_panel_capitalsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'left_panel_capitals'
}
DDPRateLimiter.addRule(left_panel_capitalsSubRule, 5, 5000);
