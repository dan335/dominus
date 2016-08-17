// offset your position on the map
// this is pixel position not coordinates
dHexmap.offsetHexes = function(offsetX, offsetY) {
  check(offsetX, validNumber);
  check(offsetY, validNumber);
  var hexPos = Session.get('hexes_pos');
  if (hexPos) {
    x = hexPos.x + offsetX;
		y = hexPos.y + offsetY;
		dHexmap.moveHexesTo(x, y);
  }
};

// TODO: https://davidwalsh.name/translate3d
// move the map to a position
// this is pixel position not coordinates
dHexmap.moveHexesTo = function(pixelX, pixelY) {
  check(pixelX, validNumber);
	check(pixelY, validNumber);
  var hexScale = Session.get('hexScale');
  if (!hexScale) {
    hexScale = 1;
  }

  // for map, instead of using session
  mapPos = {x:pixelX, y:pixelY};

  pixelX = parseFloat(pixelX);
  pixelY = parseFloat(pixelY);
  //$('#hexes').attr('transform', 'translate('+pixelX+','+pixelY+') scale('+hexScale+')')
  $('#hexes').attr('style', 'transform:translate3d('+pixelX+'px,'+pixelY+'px, 0px) scale3d('+hexScale+', '+hexScale+', 1)')
  Session.set('hexes_pos', {x:pixelX, y:pixelY})
};

// center the map on a hex
// give coordinates of a hex 3,-5
// why * -1 ?????
dHexmap.centerOnHex = function(x, y) {
  check(x, Match.Integer);
	check(y, Match.Integer);

  var hexScale = Session.get('hexScale')
	var canvasSize = Session.get('canvas_size');

  if (!hexScale) {
    hexScale = 1;
  }

	if (canvasSize && hexScale) {
    var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish)

		var x = canvasSize.width/2
		var y = canvasSize.height/2

		x += grid.x * hexScale * -1
		y += grid.y * hexScale * -1

		dHexmap.moveHexesTo(x, y)
  }
};

dHexmap.setHexScale = function(scale) {
  check(scale, validNumber);
  Session.set('hexScale', scale);
  _saveHexScale();
};

dHexmap.getCoordinatesFromEvent = function(event) {
  // get click position
	// if is a touch event
	if (_.contains(['touchstart', 'touchend', 'touchcancel', 'touchmove'], event.type)) {
		var x = event.originalEvent.touches[0].pageX
		var y = event.originalEvent.touches[0].pageY
	} else {
		var x = event.clientX || event.pageX
		var y = event.clientY || event.pageY
	}

	var hexesPos = Session.get('hexes_pos')
	var hexScale = s.hex_size * Session.get('hexScale')

	if (hexesPos && hexScale) {
		// get hex coordinates
		var coord = Hx.posToCoordinates(x-hexesPos.x, y-hexesPos.y, hexScale, s.hex_squish)

		return coord
	}
}


// #TODO:160 pass in hexScale?
var _saveHexScale = _.debounce(function() {
  let playerId = Session.get('playerId');
  let newScale = Session.get('hexScale');
  if (playerId && newScale) {
    let player = Players.findOne(playerId, {fields: {hex_scale:1}});
    if (player) {
      if (player.hex_scale != newScale) {
        Meteor.call('setHexScale', playerId, newScale);
      }
    }
  }
}, 1000 * 5);
