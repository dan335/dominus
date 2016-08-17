Template.castleMapObject.helpers({
	image: function() {
		return _s.store.castles[this.image].image
	}
});


Template.castleMapObject.events({

	'click .castle': function(event, template) {
		event.preventDefault();
    event.stopPropagation();
		if (!dHexmap.mapmover.isDraggingOrScaling) {
			var mouseMode = Session.get('mouse_mode')

			if (mouseMode == 'default') {
				dInit.select('castle', template.data.x, template.data.y, template.data._id);
			} else if (mouseMode == 'findingPath') {
				var coord = dHexmap.getCoordinatesFromEvent(event);
				Mapmaker.mapClick(coord.x, coord.y);
			}
		}
	},

	'mouseenter .castle': function(event, template) {
		event.preventDefault();
    event.stopPropagation();
		// hover box
		Session.set('hover_box_data', {type:'castle', x:template.data.x, y:template.data.y})
		Meteor.clearTimeout(Session.get('hover_on_object_timer'))
		Session.set('hover_on_object', true)

		var currentData = Template.currentData();
		if (currentData) {
			Session.set('mouseOverHexCoords', {x:currentData.x, y:currentData.y});
		}

	},

	'mouseleave .castle': function(event, template) {
		event.preventDefault();
    event.stopPropagation();
		Meteor.clearTimeout(Session.get('hover_on_object_timer'))
		Session.set('hover_on_object_timer', Meteor.setTimeout(function() { Session.set('hover_on_object', false) }, 1000))

		Session.set('mouseOverHexCoords', null);
	},
});


Template.castleMapObject.onRendered(function() {
  var self = this;

	// highlight castle when selected
  this.autorun(function() {
    var currentData = Template.currentData();
    if (currentData && currentData._id) {
      removeCastleHighlight(currentData._id);
      var selected = Session.get('selected');
      if (selected && selected.type == 'castle') {
        if (selected.id == currentData._id) {
          highlightCastle(currentData.x, currentData.y, currentData._id);
        }
      }
    }
  })
})


Template.castleMapObject.onDestroyed(function() {
  var currentData = Template.currentData();
  if (currentData && currentData._id) {
    removeCastleHighlight(currentData._id);
  }
});


var highlightCastle = function(x, y, castleId) {
	check(x, Match.Integer);
	check(y, Match.Integer);

	var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);
	var points = Hx.getHexPolygonVerts(grid.x, grid.y, _s.init.hexSize * 0.95, _s.init.hexSquish);

	if (points != false) {
		var polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
		polygon.setAttribute('class', 'castleHighlight');
		polygon.setAttribute('points', points);
		polygon.setAttribute('data-id', castleId);
		$('#castle_highlights').append(polygon);
	}
}


var removeCastleHighlight = function(castleId) {
	$('.castleHighlight[data-id='+castleId+']').remove();
}
