var castleFields = {playerId:1, name:1, user_id:1, x:1, y:1, username:1, image:1};

_s.armies.types.forEach(function(type) {
	castleFields[type] = 1;
});

Meteor.publish("castlesOnScreen", function (countryIds) {
	if (countryIds instanceof Array) {
		var find = {countryId: {$in: countryIds}};
	  return Castles.find(find, {fields: castleFields});
	} else {
		this.ready();
	}
});

var castlesOnScreenSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'castlesOnScreen'
}
DDPRateLimiter.addRule(castlesOnScreenSubRule, 5, 5000);



Meteor.publish("castlesInCountry", function (countryId) {
	//this.unblock();
	
	if (this.userId) {
	  return Castles.find({countryId:countryId}, {fields: castleFields});
	} else {
		this.ready();
	}
});

var castlesInCountrySubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'castlesInCountry'
}
DDPRateLimiter.addRule(castlesInCountrySubRule, 5, 5000);
