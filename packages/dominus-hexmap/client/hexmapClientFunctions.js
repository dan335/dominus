// Cached DOM node for the SVG map layer (avoid jQuery lookup every pan frame).
var hexesEl = null;

var getHexesEl = function() {
  if (!hexesEl) {
    hexesEl = document.getElementById('hexes');
  }
  return hexesEl;
};

var getCurrentHexPos = function() {
  // Prefer live mapPos (updated every visual pan frame). Session may lag during drag.
  if (typeof mapPos !== 'undefined' && mapPos && typeof mapPos.x === 'number') {
    return mapPos;
  }
  return Session.get('hexes_pos');
};

// Visual pan only: update canvas mapPos + SVG CSS transform. No Session.set.
// Used on the drag hot path so Meteor/Blaze are not invalidated every mousemove.
dHexmap.moveHexesToVisual = function(pixelX, pixelY) {
  var hexScale = Session.get('hexScale');
  if (!hexScale) {
    hexScale = 1;
  }

  pixelX = parseFloat(pixelX);
  pixelY = parseFloat(pixelY);

  mapPos = {x: pixelX, y: pixelY};

  var el = getHexesEl();
  if (el) {
    el.style.transform =
      'translate3d(' + pixelX + 'px,' + pixelY + 'px, 0px) scale3d(' +
      hexScale + ', ' + hexScale + ', 1)';
  }
};

// Commit map position to Session (subscriptions, hover box, center_hex tracking).
dHexmap.commitHexesPos = function() {
  if (typeof mapPos === 'undefined' || !mapPos) {
    return;
  }
  var cur = Session.get('hexes_pos');
  if (cur && cur.x === mapPos.x && cur.y === mapPos.y) {
    return;
  }
  Session.set('hexes_pos', {x: mapPos.x, y: mapPos.y});
};

// offset your position on the map
// this is pixel position not coordinates
// Full commit — used by non-drag callers if any.
dHexmap.offsetHexes = function(offsetX, offsetY) {
  check(offsetX, validNumber);
  check(offsetY, validNumber);
  var hexPos = getCurrentHexPos();
  if (hexPos) {
    dHexmap.moveHexesTo(hexPos.x + offsetX, hexPos.y + offsetY);
  }
};

// Visual offset only (drag hot path). No Session.set.
dHexmap.offsetHexesVisual = function(offsetX, offsetY) {
  var hexPos = getCurrentHexPos();
  if (hexPos) {
    dHexmap.moveHexesToVisual(hexPos.x + offsetX, hexPos.y + offsetY);
  }
};

// move the map to a position (visual + Session commit)
// this is pixel position not coordinates
// Used by centerOnHex, nav panel, etc.
dHexmap.moveHexesTo = function(pixelX, pixelY) {
  check(pixelX, validNumber);
  check(pixelY, validNumber);
  dHexmap.moveHexesToVisual(pixelX, pixelY);
  dHexmap.commitHexesPos();
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
  // Re-apply transform at current pos so scale change updates SVG immediately.
  var hexPos = getCurrentHexPos();
  if (hexPos) {
    dHexmap.moveHexesToVisual(hexPos.x, hexPos.y);
  }
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

  // Use live map position so pathfinding stays accurate during pan.
  var hexesPos = getCurrentHexPos()
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
