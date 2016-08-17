Template.hexmap.helpers({
  castles: function() {
		return Castles.find();
	},

	armies: function() {
		return Armies.find();
	},

	villages: function() {
		return Villages.find();
	},

  capitals: function() {
    return Capitals.find();
  }
});


var lastMouseMove = 0;

Template.hexmap.events({
	'mousemove .countryMouseCatcher': function(event, template) {
    event.preventDefault();
    event.stopPropagation();
		if (Date.now() - lastMouseMove > 66.666) {
			var mouseMode = Session.get('mouse_mode')
			if (mouseMode == 'findingPath') {
				var coord = dHexmap.getCoordinatesFromEvent(event);
        let selected = Session.get('selected');

        let distance = 0;
        let path = Armypaths.findOne({armyId:selected.id}, {limit:1, sort: {index:-1}});
        if (path) {
          distance = Hx.hexDistance(path.x, path.y, coord.x, coord.y);
        } else {
          distance = Hx.hexDistance(selected.x, selected.y, coord.x, coord.y);
        }

        // store distance for later
        Template.instance().moveHexDistance.set(distance);

        if (distance && distance > _s.armies.maxMoveHexDistance) {
          $(event.currentTarget).attr('class', 'countryMouseCatcher disableMove');
        } else {
          Session.set('mouseOverHexCoords', coord);
          $(event.currentTarget).attr('class', 'countryMouseCatcher');
        }
			}

			lastMouseMove = Date.now();
		}
	},

	'mouseleave .countryMouseCatcher': function(event, template) {
    event.preventDefault();
    event.stopPropagation();
		Session.set('mouseOverHexCoords', null);
    Template.instance().moveHexDistance.set(0);
    $(event.currentTarget).attr('class', 'countryMouseCatcher');
	},

	'click .countryMouseCatcher': function(event, template) {
    event.preventDefault();
    event.stopPropagation();
		if (!dHexmap.mapmover.isDraggingOrScaling) {
      // limit distance player can move army each move
      let distance = Template.instance().moveHexDistance.get();
      if (distance <= _s.armies.maxMoveHexDistance) {
        var coord = dHexmap.getCoordinatesFromEvent(event);
        Mapmaker.mapClick(coord.x, coord.y);
      }
		}
	},
});


Template.hexmap.onDestroyed(function() {
  if (this.subs) {
    this.subs.clear({
      cacheLimit:20,
      expireIn:10
    });
  }
});

Template.hexmap.onCreated(function() {
  var self = this;

  // track how for user is trying to move army
  // limit to _s.armies.maxMoveHexDistance distance for perf
  this.moveHexDistance = new ReactiveVar(0);

  this.autorun(function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      Meteor.subscribe('countryIndex', gameId);
    }
  });

  // runs once when hex map loads
  // set hexScale
  // if nothing in URL select castle and center it
  // if is something in url then center on it
  this.autorun(function() {
		if (Session.get('canvas_size')) {
			if (!Session.get('hexScale')) {
				var player = Players.findOne({gameId:Session.get('gameId'), userId:Meteor.userId()}, {fields: {castle_id:1, hex_scale:1, x:1, y:1}})
				if (player && player.hex_scale) {
					Session.set('hexScale', player.hex_scale)
				}
				if (player && player.hex_scale && player.castle_id) {
          let path = SimpleRouter.path.get();
          let pathArray = path.split('/');
          if (pathArray.length < 4) {
            SimpleRouter.go('/game/'+Session.get('gameId')+'/castle/'+player.x+'/'+player.y+'/'+player.castle_id);
  					dHexmap.centerOnHex(player.x, player.y);
          } else {
            let x = parseInt(pathArray[4]);
            let y = parseInt(pathArray[5]);
            dHexmap.centerOnHex(x, y);
          }
				}
			}
		}
	});

  this.autorun(function() {
		var hexScale = Session.get('hexScale')
		if (hexScale) {
			dHexmap.mapmover.scale = hexScale
		} else {
      dHexmap.mapmover.scale = 1;
    }
	});


  // update session selected var as army moves
  this.autorun(function() {
    var selected = Session.get('selected');
    if (selected && selected.type == 'army') {
      var army = Armies.findOne(selected.id, {fields: {x:1, y:1}});
      if (army) {
        dInit.select('army', army.x, army.y, army._id);
      }
    }
  });



  // figure out which countries are on screen and store in array
	// used to publish countries, armies, castles, villages
	Session.setDefault('countryIdsOnscreen', []);
	self.autorun(function() {
		var center_hex = Session.get('center_hex');
    var canvasSize = Session.get('canvas_size');
    var hex_scale = Session.get('hexScale');

    if (!hex_scale) {
      hex_scale = 1;
    }

		if (center_hex && canvasSize && hex_scale) {
			var z = -1 * center_hex.x - center_hex.y;

	    var numHexesHigh = Hx.posToCoordinates(0, canvasSize.height, _s.init.hexSize * hex_scale, _s.init.hexSquish).y;
	    var numHexesWide = Hx.posToCoordinates(canvasSize.width, 0, _s.init.hexSize * hex_scale, _s.init.hexSquish).x;

	    var diagSingleHexPos = Hx.coordinatesToPos(1, 0, _s.init.hexSize * hex_scale, _s.init.hexSquish);
	    var diagSingleHexDistance = Math.sqrt(diagSingleHexPos.x * diagSingleHexPos.x + diagSingleHexPos.y * diagSingleHexPos.y);

	    var diagPos = Hx.coordinatesToPos(numHexesWide, 0, _s.init.hexSize * hex_scale, _s.init.hexSquish);
	    var diagDistance = Math.sqrt(diagPos.x * diagPos.x + diagPos.y * diagPos.y);

	    var numHexesDiag = diagDistance / diagSingleHexDistance;

	    // decrease to send more countries to client
	    // start at 2, decrease until countries on screen are always loaded
	    var num = 1.2;

	    var find = {
	      minX: {$lte: center_hex.x + numHexesDiag / num},
	      maxX: {$gte: center_hex.x - numHexesDiag / num},
	      minY: {$lte: center_hex.y + numHexesHigh / num},
	      maxY: {$gte: center_hex.y - numHexesHigh / num},
	      minZ: {$lte: z + numHexesDiag / num},
	      maxZ: {$gte: z - numHexesDiag / num}
	    }

			var countryIndexes =  CountryIndex.find(find, {fields:{_id:1, gameId:1}}).fetch();
	    // if (countryIndexes) {
	    //   var countryIds = _.pluck(countryIndexes, '_id');
	    // } else {
	    //   var countryIds = [];
	    // }

			Session.set('countryIdsOnscreen', countryIndexes);
		}
	});
});



Template.hexmap.onRendered(function() {
  var self = this;

  dHexmap.mapmover.start($('#mapEvents'));

  // if hexScale changes center on hex which will change the scale
	this.autorun(function() {
		if (Session.get('hexScale')) {
			Tracker.nonreactive(function() {
				var centerHex = Session.get('center_hex')
				if (centerHex) {
					dHexmap.centerOnHex(centerHex.x, centerHex.y)
				}
			})
		}
	});

  // update session with which hex is at the center of the screen
	// used to subscribe to hexes onscreen
	this.autorun(function() {
		var hexes_pos = Session.get('hexes_pos')
		if (typeof hexes_pos != 'undefined') {
			var canvas_size = Session.get('canvas_size')
			if (canvas_size) {
				var pixel = dHexmap.grid_to_pixel(hexes_pos.x, hexes_pos.y)
				if (pixel) {
          setCenterHex(hexes_pos);
				}
			}
		}
	});

  // set canvas size
	// update size of map when window size changes
	// if canvas size changes redraw hexes
	this.autorun(function() {
		var canvas_size = Session.get('canvas_size');
		if (canvas_size) {
			$('#hex_body').css('height', canvas_size.height);
			$('#svg_container').css('height', canvas_size.height);
			$('#svg_container').css('width', canvas_size.width);
		}
	});


  // highlight selected hex
  this.autorun(function() {
    removeHexHighlights();
		var selected = Session.get('selected');
		if (selected && selected.type == 'hex') {
			highlightHexCoords(selected.x, selected.y);
		}
	})
});


let setCenterHex = _.debounce(function(hexes_pos) {
  let pixel = dHexmap.grid_to_pixel(hexes_pos.x, hexes_pos.y)
  if (pixel) {
    let coords = Hx.posToCoordinates(pixel.x, pixel.y, s.hex_size, s.hex_squish)

    let x = coords.x * -1 	// why -1???
    let y = coords.y * -1
    Session.set('center_hex', {x:x, y:y})
  }
}, 500);



Template.hexmap.destroyed = function() {
	dHexmap.mapmover.stop();
  removeHexHighlights();
}


var highlightHexCoords = function(x, y) {
  check(x, Match.Integer);
	check(y, Match.Integer);

	var pixel = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);
	var points = Hx.getHexPolygonVerts(pixel.x, pixel.y, _s.init.hexSize * 0.95, _s.init.hexSquish);

	if (points != false) {
		var polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
		polygon.setAttribute('class', 'hex_highlight');
		polygon.setAttribute('points', points);
		$('#hex_highlights').append(polygon)
	}
}


var removeHexHighlights = function() {
  $('.hex_highlight').remove();
}
