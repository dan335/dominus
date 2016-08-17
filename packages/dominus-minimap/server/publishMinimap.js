Meteor.publish('user_buildings_for_minimap', function(playerId) {
	var self = this;
	var fields = {playerId:1, name:1, x:1, y:1};

	_s.armies.types.forEach(function(type) {
		fields[type] = 1
	});

	let find = {playerId:playerId};

	var curVillages = Villages.find(find, {fields: fields})
	Mongo.Collection._publishCursor(curVillages, self, 'left_panel_villages')

	var curCastle = Castles.find(find, {fields: fields})
	Mongo.Collection._publishCursor(curCastle, self, 'left_panel_castle')

	var curCapitals = Capitals.find(find, {fields: fields});
	Mongo.Collection._publishCursor(curCapitals, self, 'left_panel_capitals');

	return self.ready();
});

var user_buildings_for_minimapSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'user_buildings_for_minimap'
}
DDPRateLimiter.addRule(user_buildings_for_minimapSubRule, 5, 5000);
