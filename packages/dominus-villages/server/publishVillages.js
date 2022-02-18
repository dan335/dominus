var villageFields = {playerId:1, name:1, user_id:1, x:1, y:1, username:1, under_construction:1, level:1}

_s.armies.types.forEach(function(type) {
	villageFields[type] = 1;
});

Meteor.publish("villagesOnScreen", function (countryIds) {
	if (countryIds instanceof Array) {
	  var find = {countryId: {$in: countryIds}};
	  return Villages.find(find, {fields: villageFields});
	} else {
		this.ready();
	}
});

var villagesOnScreenSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'villagesOnScreen'
}
DDPRateLimiter.addRule(villagesOnScreenSubRule, 5, 5000);





Meteor.publish("villagesInCountry", function (countryId) {
	//this.unblock();
	
	if (this.userId) {
	  return Villages.find({countryId:countryId}, {fields: villageFields});
	} else {
		this.ready();
	}
});

var villagesInCountrySubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'villagesInCountry'
}
DDPRateLimiter.addRule(villagesInCountrySubRule, 5, 5000);
