Meteor.publish('income_rankings', function(gameId, page) {
	var skip = (page-1) * _s.panels.rankings.perPage

	var sub = this
	var cur = Players.find({gameId:gameId}, {skip:skip, sort: {income: -1}, fields: {
			income:1,
			username:1,
			castle_id:1,
			x:1,
			y:1,
			is_king:1,
			userId:1
		}, limit:_s.panels.rankings.perPage})
	Mongo.Collection._publishCursor(cur, sub, 'income_rankings')
	return sub.ready();
});

var income_rankingsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'income_rankings'
}
DDPRateLimiter.addRule(income_rankingsSubRule, 5, 5000);


Meteor.publish('ally_rankings', function(gameId, page) {
	var skip = (page-1) * _s.panels.rankings.perPage

	var sub = this
	var cur = Players.find({gameId:gameId}, {skip:skip, sort: {num_allies_below: -1}, fields: {
			username:1,
			castle_id:1,
			x:1,
			y:1,
			num_allies_below:1,
			is_king:1,
			userId:1
		}, limit:_s.panels.rankings.perPage})
	Mongo.Collection._publishCursor(cur, sub, 'ally_rankings')
	return sub.ready();
});

var ally_rankingsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'ally_rankings'
}
DDPRateLimiter.addRule(ally_rankingsSubRule, 5, 5000);


Meteor.publish('losses_rankings', function(gameId, page) {
	var skip = (page-1) * _s.panels.rankings.perPage

	var sub = this
	var cur = Players.find({gameId:gameId}, {skip:skip, sort: {losses_worth: -1}, fields: {
			username:1,
			castle_id:1,
			x:1,
			y:1,
			losses_worth:1,
			losses_num:1,
			is_king:1,
			userId:1
		}, limit:_s.panels.rankings.perPage})
	Mongo.Collection._publishCursor(cur, sub, 'losses_rankings')
	return sub.ready();
});

var losses_rankingsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'losses_rankings'
}
DDPRateLimiter.addRule(losses_rankingsSubRule, 5, 5000);



Meteor.publish('dominus_rankings', function(gameId) {
	//this.unblock();

	var sub = this
	var cur = Players.find({gameId:gameId, is_dominus:true}, {fields: {
			username:1,
			castle_id:1,
			x:1,
			y:1,
			is_dominus:1,
			userId:1
		}})
	Mongo.Collection._publishCursor(cur, sub, 'dominusplayer')
	return sub.ready();
});

var dominus_rankingsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'dominus_rankings'
}
DDPRateLimiter.addRule(dominus_rankingsSubRule, 5, 5000);




Meteor.publish('country_rankings', function(gameId, page) {
	//this.unblock();
	
	var skip = (page-1) * _s.panels.rankings.perPage
	var sub = this
	var cur = Capitals.find({gameId:gameId}, {skip:skip, sort: {"income.worth": -1}, fields: {
			name:1,
			x:1,
			y:1,
			"income.worth":1,
			userId:1,
			playerId:1
		}, limit:_s.panels.rankings.perPage})
	Mongo.Collection._publishCursor(cur, sub, 'country_rankings')
	return sub.ready();
});

var country_rankingsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'country_rankings'
}
DDPRateLimiter.addRule(country_rankingsSubRule, 5, 5000);




Meteor.publish('village_rankings', function(gameId, page) {
	var skip = (page-1) * _s.panels.rankings.perPage

	var sub = this
	var cur = Villages.find({gameId:gameId, under_construction:false}, {skip:skip, sort: {"income.worth": -1}, fields: {
			username:1,
			name:1,
			castle_id:1,
			castle_x:1,
			castle_y:1,
			x:1,
			y:1,
			"income.worth":1,
			userId:1,
			playerId:1
		}, limit:_s.panels.rankings.perPage})
	Mongo.Collection._publishCursor(cur, sub, 'village_rankings')
	return sub.ready();
});

var village_rankingsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'village_rankings'
}
DDPRateLimiter.addRule(village_rankingsSubRule, 5, 5000);
