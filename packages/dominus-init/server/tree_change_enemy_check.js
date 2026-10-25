// this can create an infinite loop
// if lord and vassal have armies on each others castles which are empty
// vassal take's lord's castle

// #TODO:110 is there a way to check for enemies with mongodb queries?  use $or maybe
// $nin team $or in team but not in allies




if (process.env.DOMINUS_WORKER == 'true') {
  Queues.enemy_on_building_check.process(async function(job) {
		await enemy_on_building_check(job.data.gameId);
  });
}


var enemy_on_building_check = async function(gameId) {
	for (const building of await Castles.find({gameId:gameId}, {fields: {playerId:1, user_id:1, x:1, y:1}}).fetchAsync()) {
		await check_for_enemies_here(gameId, building, 'castle');
	}

	for (const building of await Villages.find({gameId:gameId}, {fields: {playerId:1, user_id:1, x:1, y:1}}).fetchAsync()) {
		await check_for_enemies_here(gameId, building, 'village')
	}
}


var check_for_enemies_here = async function(gameId, building, type) {
	check(gameId, String);
	check(type, String);
  check(building.x, validNumber);
  check(building.y, validNumber);
  check(building.playerId, String);

	var armies = await Armies.find({gameId:gameId, x:building.x, y:building.y, playerId: {$ne: building.playerId}}, {fields: {playerId:1}}).fetchAsync()
	if (armies.length > 0) {
		for (const army of armies) {
			var relation = await dInit.getRelationshipServer(army.playerId, building.playerId);

			if (type == 'village') {
				var canAttack = ['enemy', 'enemy_ally']
			}

			if (type == 'castle') {
				var canAttack = ['king', 'direct_lord', 'lord', 'enemy', 'enemy_ally']
			}

			if (_.contains(canAttack, relation)) {
				if (!await dInit.attackCreatesLoop(gameId, building.x, building.y)) {
					await Queues.addAsyncOrLog('runBattle', {gameId:gameId, x:building.x, y:building.y}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, gameId+'_'+building.x+'_'+building.y);
				}
			}
		}
	}
}





if (process.env.DOMINUS_WORKER == 'true') {
  Queues.enemies_together_check.process(async function(job) {
		await enemies_together_check(job.data.gameId);
  });
}

// loop through every army and check if there are any enemies on the same hex, if so they fight
var enemies_together_check = async function(gameId) {

	for (const army of await Armies.find({gameId:gameId}, {fields: {playerId:1, x:1, y:1}}).fetchAsync()) {

		// find armies here except this one
		for (const other_army of await Armies.find({gameId:gameId, x:army.x, y:army.y, _id: {$ne: army._id}, playerId: {$ne: army.playerId}}, {fields: {playerId:1}}).fetchAsync()) {

			// make sure army still exists
			var a = await Armies.findOneAsync(army._id, {fields: {playerId:1}})
			if (a) {

				// if one of them is dominus then they fight
				var player = await Players.findOneAsync(a.playerId, {fields: {is_dominus:1}})
				var otherPlayer = await Players.findOneAsync(other_army.playerId, {fields: {is_dominus:1}})
				if (player && otherPlayer) {
					if (player.is_dominus || otherPlayer.is_dominus) {
						// dominus' armies can attack any army
						await Queues.addAsyncOrLog('runBattle', {gameId:gameId, x:army.x, y:army.y}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, gameId+'_'+army.x+'_'+army.y);

					} else {
						var relation = await dInit.getRelationshipServer(player._id, otherPlayer._id);
						var canAttack = ['enemy', 'enemy_ally']
						if (_.contains(canAttack, relation)) {

							if (!await dInit.attackCreatesLoop(gameId, army.x, army.y)) {
								await Queues.addAsyncOrLog('runBattle', {gameId:gameId, x:army.x, y:army.y}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, gameId+'_'+army.x+'_'+army.y);
							}
						}
					}
				}
			}
		}
	}
}


// Would attacking at x,y start an endless capture loop: the castle owner here
// has an army on the castle of someone who has an army here. Every lookup is
// scoped to the game, otherwise a castle or army at the same coordinates in
// another open game could skip a real battle or miss a real loop.
dInit.attackCreatesLoop = async function(gameId, x, y) {
	check(gameId, String);
	var isLoop = false

	var castleHere = await Castles.findOneAsync({gameId:gameId, x:x, y:y}, {fields: {playerId:1}})
	if (castleHere) {

		for (const armyHere of await Armies.find({gameId:gameId, x:x, y:y}, {fields: {playerId:1}}).fetchAsync()) {

			// don't check armies on their own castle
			if (castleHere.playerId != armyHere.playerId) {

				// get their castle
				var castle = await Castles.findOneAsync({playerId:armyHere.playerId}, {fields: {x:1, y:1}})
				if (castle) {

					// is there an army at their castle owned by castleHere
					if (await Armies.find({gameId:gameId, x:castle.x, y:castle.y, playerId:castleHere.playerId}).countAsync() > 0) {
						isLoop = true
					}
				}
			}
		}
	}

	return isLoop
}
