dHexmap.getUnitLocationBonusMultiplier = function(unit, type) {
	check(unit, Object)
	check(type, String)

	var multiplier = 1

	switch (type) {
		case 'castle':
			multiplier = _s.castles.defense_bonus
			break
		case 'village':
			multiplier = _s.villages.defense_bonus
			break;
		case 'capital':
			multiplier = _s.capitals.battleBonus
			break;
		// case 'army':
		// 	if (dHexmap.isArmyOnAllyCastle(unit)) {
		// 		multiplier = _s.castless.ally_defense_bonus
		// 	} else if (dHexmap.isArmyOnAllyVillage(unit)) {
		// 		multiplier = _s.village.ally_defense_bonus
		// 	} else if (dHexmap.isArmyOnAllyCapital(unit)) {
		// 		multiplier = _s.capitals.battleBonus;
		// 	}
		// 	break;
	}

	return multiplier
}


dHexmap.isArmyOnAllyCapital = function(army) {
	check(army.playerId, String);
	var capital = Capitals.findOne({x:army.x, y:army.y}, {fields: {playerId:1}});
	if (capital) {
		return capital.playerId == army.playerId;
	}
	return false;
}


// castle must be in client db if called on client
dHexmap.isArmyOnAllyCastle = function(army) {
	check(army.playerId, String)
	var castle = Castles.findOne({x:army.x, y:army.y}, {fields: {playerId:1}})
	if (castle) {
		var relationship = dInit.getRelationshipServer(army.playerId, castle.playerId);
		return _.contains(['vassal', 'direct_vassal'], relationship);
	}
	return false
}


// village must be in client db if called on client
dHexmap.isArmyOnAllyVillage = function(army) {
	check(army.playerId, String)
	var village = Villages.findOne({x:army.x, y:army.y}, {fields: {playerId:1}})
	if (village) {
		var relationship = dInit.getRelationshipServer(army.playerId, village.playerId);
		return _.contains(['vassal', 'direct_vassal'], relationship);
	}
	return false
}



dHexmap.grid_to_pixel = function(x,y) {
	check(x, validNumber)
	check(y, validNumber)

	var canvas_size = Session.get('canvas_size')
	var hexScale = Session.get('hexScale')

	if (!hexScale) {
		hexScale = 1;
	}

	if (canvas_size && hexScale) {
		x -= canvas_size.width/2
		y -= canvas_size.height/2
		x = x * (1/hexScale)
		y = y * (1/hexScale)
		return {x:x, y:y}
	}

	return false
}


// not used
dHexmap.pixel_to_grid = function(x,y) {
	check(x, validNumber)
	check(y, validNumber)

	var canvas_size = Session.get('canvas_size')
	var hexScale = Session.get('hexScale');

	if (!hexScale) {
		hexScale = 1;
	}

	if (canvas_size && hexScale) {
		x += canvas_size.width/2
		y += canvas_size.height/2
		x = x * (hexScale)
		y = y * (hexScale)
		return {x:x, y:y}
	}

	return false
}
