// uses Meteor.userId()
dInit.getRelationshipClient = function(otherPlayerId) {
  check(otherPlayerId, String);

  let gameId = Session.get('gameId');
  let userId = Meteor.userId();
  if (gameId && userId) {
    var fields = {userId:1, lord:1, allies_above:1, allies_below:1, team:1, king:1, vassals:1}
  	var player = Players.findOne({gameId:gameId, userId:userId}, {fields: fields})
    if (player) {
      return dInit.getPlayersRelationship(player, otherPlayerId);
    } else {
      return 'enemy';
    }
  }
}


dInit.getRelationshipServer = function(playerId, otherPlayerId) {
  check(playerId, String)
  check(otherPlayerId, String)

  var fields = {userId:1, lord:1, allies_above:1, allies_below:1, team:1, king:1, vassals:1}
  var player = Players.findOne(playerId, {fields: fields})
  if (player) {
    return dInit.getPlayersRelationship(player, otherPlayerId);
  } else {
    console.error('player not found in dInit.getRelationshipServer', playerId, otherPlayerId);
    return null;
  }
}


dInit.getPlayersRelationship = function(player, otherPlayerId) {
  check(player._id, String);
	check(player.team, Array);
	check(player.lord, Match.OneOf(null, String));
	check(player.allies_above, Array);
	check(player.allies_below, Array);
	check(player.king, Match.OneOf(null, String));
	check(player.vassals, Array);

  if (otherPlayerId == player._id) {
    return 'mine';
  }

  if (_.contains(player.team, otherPlayerId)) {

    if (_.contains(player.allies_above, otherPlayerId)) {

      if (otherPlayerId == player.king) {
        return 'king';

      } else if (otherPlayerId == player.lord) {
        return 'direct_lord';

      } else {
        return 'lord';
      }

    } else if (_.contains(player.allies_below, otherPlayerId)) {

      if (_.contains(player.vassals, otherPlayerId)) {
        return 'direct_vassal';

      } else {
        return 'vassal';
      }

    } else {
      return 'enemy_ally';
    }
  }

  return 'enemy';
}


// takes return value of getUnitRelationType and return a nice string
dInit.getNiceRelationType = function(relationType) {
	switch(relationType) {
		case 'mine':
			return 'mine'
		case 'king':
			return 'king'
		case 'direct_lord':
			return 'lord'
		case 'lord':
			return 'lord'
		case 'vassal':
			return 'vassal'
		case 'direct_vassal':
			return 'vassal'
		case 'enemy_ally':
			return 'enemy with same king'
		case 'enemy':
			return 'enemy'
	}
}


// TODO: are these used?
// #TODO:140 make this check more than just armies
dInit.isEnemyHere = function(gameId, x, y, player) {
  check(gameId, String);
  check(x, Match.Integer);
  check(y, Match.Integer);
  return this.isEnemyArmyHere(gameId, x, y, player);
};

dInit.isEnemyArmyHere = function(gameId, x, y, player) {
  check(gameId, String);
  check(x, Match.Integer);
  check(y, Match.Integer);

  check(player, Match.ObjectIncluding({
    _id: String,
    team: Array,
    lord: Match.OneOf(String, null),
    allies_above: Array,
    allies_below: Array,
    king: Match.OneOf(String, null),
    vassals: Array,
    is_dominus: Boolean
  }));

  var isEnemyHere = false;

  var find = {gameId:gameId, x:x, y:y, playerId: {$ne:player._id}};
  Armies.find(find, {fields: {_id:1, playerId:1}}).forEach(function(otherArmy) {

    // dominus can attack any armies
    var otherPlayer = Players.findOne(otherArmy.playerId, {fields: {is_dominus:1}});
    if (player.is_dominus || otherPlayer.is_dominus) {
      isEnemyHere = true;

    } else {
      var relation = dInit.getPlayersRelationship(player, otherPlayer._id);
      var enemyTypes = ['enemy_ally', 'enemy'];
      if (_.contains(enemyTypes, relation)) {
        isEnemyHere = true;
      }
    }
  })

  return isEnemyHere;
};
