
// TODO: store these in settings
var castleFields = {countryId:1, playerId:1, name:1, user_id:1, x:1, y:1, username:1, image:1}
var villageFields = {countryId:1, playerId:1, name:1, user_id:1, x:1, y:1, username:1, under_construction:1, level:1}
var hexFields = {playerId:1, x:1, y:1, type:1, tileImage:1, large:1, hasBuilding:1};
var capitalFields = {countryId:1, playerId:1, x:1, y:1, name:1};

_s.armies.types.forEach(function(type) {
	castleFields[type] = 1
	villageFields[type] = 1
});


Meteor.publish('gamePiecesAtHex', function(gameId, x, y) {
	//this.unblock();
	if (this.userId) {
		return [
			Hexes.find({gameId:gameId, x:x, y:y}, {fields: hexFields}),
			Castles.find({gameId:gameId, x:x, y:y}, {fields: castleFields}),
			Villages.find({gameId:gameId, x:x, y:y}, {fields: villageFields}),
			Capitals.find({gameId:gameId, x:x, y:y}, {fields: capitalFields})
		]
	} else {
		return this.ready();
	}
});

var gamePiecesAtHexSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'gamePiecesAtHex'
}
DDPRateLimiter.addRule(gamePiecesAtHexSubRule, 5, 5000);



Meteor.publish('countries', function(countryIds) {
	//this.unblock();
	if (this.userId) {
		return Countries.find({_id: {$in: countryIds}}, {fields: {paths:1, image:1, imageWithCoords:1}});
	} else {
		return this.ready();
	}
});

var countriesSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'countries'
}
DDPRateLimiter.addRule(countriesSubRule, 5, 5000);


var armyFields = {countryId:1, gameId:1, playerId:1, name:1, user_id:1, x:1, y:1, last_move_at:1, username:1, pastMoves:1};
var villageFields = {countryId:1, playerId:1, name:1, user_id:1, x:1, y:1, username:1, under_construction:1, level:1};
var castleFields = {countryId:1, playerId:1, name:1, user_id:1, x:1, y:1, username:1, image:1};
var capitalMapFields = {countryId:1, playerId:1, x:1, y:1, name:1};

_s.armies.types.forEach(function(type) {
	villageFields[type] = 1;
	armyFields[type] = 1;
	castleFields[type] = 1;
	capitalMapFields[type] = 1;
});

Meteor.publish('countryOnScreen', function(countryId) {
	//this.unblock();
	if (this.userId) {
		return [
			Countries.find({_id:countryId}, {fields: {paths:1, image:1, imageWithCoords:1}}),
			Armies.find({countryId:countryId}, {fields: armyFields}),
			Villages.find({countryId:countryId}, {fields: villageFields}),
			Castles.find({countryId:countryId}, {fields: castleFields}),
			Capitals.find({countryId:countryId}, {fields: capitalMapFields})
		]
	} else {
		return this.ready();
	}
});

var countrySubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'country'
}
DDPRateLimiter.addRule(countrySubRule, 20, 5000);



var countryIndexFields = {neighbors:1, minX:1, maxX:1, minY:1, maxY:1, minZ:1, maxZ:1, gameId:1};
Meteor.publish('countryIndex', function(gameId) {
	if (this.userId) {
		var sub = this
		var cur = Countries.find({gameId:gameId}, {fields: countryIndexFields});
		Mongo.Collection._publishCursor(cur, sub, 'countryindex');
		return sub.ready();
	} else {
		this.ready()
	}
});

var countryIndexSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'countryIndex'
}
DDPRateLimiter.addRule(countryIndexSubRule, 5, 5000);
