var armyFields = {gameId:1, playerId:1, name:1, user_id:1, x:1, y:1, last_move_at:1, username:1, pastMoves:1};

_s.armies.types.forEach(function(type) {
  armyFields[type] = 1;
});

Meteor.publish("armiesOnScreen", function (countryIds) {
  if (countryIds instanceof Array) {
    var find = {countryId: {$in: countryIds}};
    return Armies.find(find, {fields: armyFields});
  } else {
    this.ready();
  }
});

var armiesOnScreenSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'armiesOnScreen'
}
DDPRateLimiter.addRule(armiesOnScreenSubRule, 5, 5000);



Meteor.publish('armiesInCountry', function(countryId) {
  //this.unblock();

  if (this.userId) {
		return Armies.find({countryId:countryId}, {fields: armyFields});
	} else {
		return this.ready();
	}
});

var armiesInCountrySubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'armiesInCountry'
}
DDPRateLimiter.addRule(armiesInCountrySubRule, 5, 5000);


Meteor.publish('armiesAtHex', function(gameId, x, y) {
  return Armies.find({gameId:gameId, x:x, y:y}, {fields: armyFields});
});

var armiesAtHexSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'armiesAtHex'
}
DDPRateLimiter.addRule(armiesAtHexSubRule, 5, 5000);




// always publish my armies
Meteor.publish('myArmies', function(gameId) {
  var self = this;
  if(self.userId) {

    // fields must contain everything that RightPanelArmies doesn
    // because it can be used in right panel
		var fields = {gameId:1, playerId:1, speed:1, moveTime:1, moveDistance:1, name:1, user_id:1, x:1, y:1, last_move_at:1, username:1, castle_x:1, castle_y:1, castle_id:1, onAllyBuilding:1}
    _s.armies.types.forEach(function(type) {
			fields[type] = 1
		})

		var query = Armies.find({user_id: this.userId, gameId:gameId}, {fields: fields});
		Mongo.Collection._publishCursor(query, self, 'myarmies');
		return self.ready()
	} else {
		return self.ready()
	}
});

var myArmiesSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'myArmies'
}
DDPRateLimiter.addRule(myArmiesSubRule, 5, 5000);
