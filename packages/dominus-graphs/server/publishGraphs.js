Meteor.publish('my_dailystats', function(gameId) {
	if(this.userId) {
		return Dailystats.find({gameId:gameId, user_id: this.userId})
	} else {
		this.ready();
	}
});

var my_dailystatsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'my_dailystats'
}
DDPRateLimiter.addRule(my_dailystatsSubRule, 5, 5000);




Meteor.publish('stats_gamestats', function(gameId) {
	if(this.userId) {
		return Gamestats.find({gameId:gameId}, {fields: {num_users:1, created_at:1, soldierWorth:1}})
	} else {
		this.ready();
	}
});

var stats_gamestatsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'stats_gamestats'
}
DDPRateLimiter.addRule(stats_gamestatsSubRule, 5, 5000);
