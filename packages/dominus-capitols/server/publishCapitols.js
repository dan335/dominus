var capitalMapFields = {playerId:1, x:1, y:1, name:1};
var capitalRightPanelFields = {lastIncomeUpdate:1, playerId:1, x:1, y:1, name:1, income:1};

_s.armies.types.forEach(function(type) {
  capitalMapFields[type] = 1;
  capitalRightPanelFields[type] = 1;
});

Meteor.publish("capitalsOnScreen", function (countryIds) {
  check(countryIds, Match.OneOf([String], null));
  if (countryIds instanceof Array) {
    var find = {countryId: {$in: countryIds}};
    return Capitals.find(find, {fields: capitalMapFields});
  } else {
    this.ready();
  }
});

var capitalsOnScreenSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'capitalsOnScreen'
}
DDPRateLimiter.addRule(capitalsOnScreenSubRule, 5, 5000);




Meteor.publish("capitalsInCountry", function (countryId) {
  check(countryId, Match.OneOf(String, null));
  //this.unblock();
  
  if (this.userId) {
    return Capitals.find({countryId:countryId}, {fields: capitalMapFields});
  } else {
    this.ready();
  }
});

var capitalsOnScreenSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'capitalsInCountry'
}
DDPRateLimiter.addRule(capitalsOnScreenSubRule, 5, 5000);




// public so logged out spectators can watch
Meteor.publish('capitalForHexInfo', async function(id) {
	check(id, Match.OneOf(String, null));
	if (Match.test(id, String)) {
		var self = this;
		var query = Capitals.find(id, {fields:capitalRightPanelFields});
		await Mongo.Collection._publishCursor(query, self, 'right_panel_capitals');
		return self.ready();
	} else {
		this.ready()
	}
});

var capitalForHexInfoSubRule = {
  userId: function() {return true;},
  connectionId: function() {return true;},
  type: 'subscription',
  name: 'capitalForHexInfo'
}
DDPRateLimiter.addRule(capitalForHexInfoSubRule, 5, 5000);
