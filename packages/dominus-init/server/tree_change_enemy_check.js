// this can create an infinite loop
// if lord and vassal have armies on each others castles which are empty
// vassal take's lord's castle

// #TODO:110 is there a way to check for enemies with mongodb queries?  use $or maybe
// $nin team $or in team but not in allies




if (process.env.DOMINUS_WORKER == 'true') {
  Queues.enemy_on_building_check.process(Meteor.bindEnvironment(function(job) {
		enemy_on_building_check(job.data.gameId);
    return Promise.resolve();
  }));
}


var enemy_on_building_check = function(gameId) {
	Castles.find({gameId:gameId}, {fields: {playerId:1, user_id:1, x:1, y:1}}).forEach(function(building) {
		check_for_enemies_here(gameId, building, 'castle');
	})

	Villages.find({gameId:gameId}, {fields: {playerId:1, user_id:1, x:1, y:1}}).forEach(function(building) {
		check_for_enemies_here(gameId, building, 'village')
	})
}


var check_for_enemies_here = function(gameId, building, type) {
	check(gameId, String);
	check(type, String);
  check(building.x, validNumber);
  check(building.y, validNumber);
  check(building.playerId, String);

	var armies = Armies.find({gameId:gameId, x:building.x, y:building.y, playerId: {$ne: building.playerId}}, {fields: {playerId:1}})
	if (armies.count() > 0) {
		armies.forEach(function(army) {
			var relation = dInit.getRelationshipServer(army.playerId, building.playerId);

			if (type == 'village') {
				var canAttack = ['enemy', 'enemy_ally']
			}

			if (type == 'castle') {
				var canAttack = ['king', 'direct_lord', 'lord', 'enemy', 'enemy_ally']
			}

			if (_.contains(canAttack, relation)) {
				if (!attackCreatesLoop(building.x,building.y)) {
					Queues.add('runBattle', {gameId:gameId, x:building.x, y:building.y}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, gameId+'_'+building.x+'_'+building.y);
				}
			}
		})
	}
}





if (process.env.DOMINUS_WORKER == 'true') {
  Queues.enemies_together_check.process(Meteor.bindEnvironment(function(job) {
		enemies_together_check(job.data.gameId);
    return Promise.resolve();
  }));
}

// loop through every army and check if there are any enemies on the same hex, if so they fight
var enemies_together_check = function(gameId) {

	Armies.find({gameId:gameId}, {fields: {playerId:1, x:1, y:1}}).forEach(function(army) {

		// find armies here except this one
		Armies.find({gameId:gameId, x:army.x, y:army.y, _id: {$ne: army._id}, playerId: {$ne: army.playerId}}, {fields: {playerId:1}}).forEach(function(other_army) {

			// make sure army still exists
			var a = Armies.findOne(army._id, {fields: {playerId:1}})
			if (a) {

				// if one of them is dominus then they fight
				var player = Players.findOne(a.playerId, {fields: {is_dominus:1}})
				var otherPlayer = Players.findOne(other_army.playerId, {fields: {is_dominus:1}})
				if (player && otherPlayer) {
					if (player.is_dominus || otherPlayer.is_dominus) {
						// dominus' armies can attack any army
						Queues.add('runBattle', {gameId:gameId, x:army.x, y:army.y}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, gameId+'_'+army.x+'_'+army.y);

					} else {
						var relation = dInit.getRelationshipServer(player._id, otherPlayer._id);
						var canAttack = ['enemy', 'enemy_ally']
						if (_.contains(canAttack, relation)) {

							if (!attackCreatesLoop(army.x, army.y)) {
								Queues.add('runBattle', {gameId:gameId, x:army.x, y:army.y}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, gameId+'_'+army.x+'_'+army.y);
							}
						}
					}
				}
			}
		})
	})
}


var attackCreatesLoop = function(x, y) {
	var isLoop = false

	var castleHere = Castles.findOne({x:x, y:y}, {fields: {playerId:1}})
	if (castleHere) {

		var armiesHere = Armies.find({x:x, y:y}, {fields: {playerId:1}})
		armiesHere.forEach(function(armyHere) {

			// don't check armies on their own castle
			if (castleHere.playerId != armyHere.playerId) {

				// get their castle
				var castle = Castles.findOne({playerId:armyHere.playerId}, {fields: {x:1, y:1}})
				if (castle) {

					// is there an army at their castle owned by castleHere
					if (Armies.find({x:castle.x, y:castle.y, playerId:castleHere.playerId}).count() > 0) {
						isLoop = true
					}
				}
			}
		})
	}

	return isLoop
}
