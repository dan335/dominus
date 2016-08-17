Meteor.publish('market', function(gameId) {
	if (this.userId) {
		return Market.find({gameId:gameId});
	} else {
		this.ready();
	}
});

var marketSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'market'
}
DDPRateLimiter.addRule(marketSubRule, 5, 5000);


Meteor.publish('markethistory', function(gameId) {
	if (this.userId) {
		let fields = {created_at:1, price:1, quantity:1}
		return Markethistory.find({gameId:gameId}, {fields:fields, sort: {created_at:-1}, limit: 120}, {disableOplog:true, pollingIntervalMs:1000*60*5});
	} else {
		this.ready();
	}
});

var markethistorySubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'markethistory'
}
DDPRateLimiter.addRule(markethistorySubRule, 5, 5000);
