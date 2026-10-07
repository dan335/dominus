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
	}

	return multiplier
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
