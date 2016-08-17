Template.capitalMapObject.events({

	'click .capital': function(event, template) {
		event.preventDefault();
    event.stopPropagation();
		if (!dHexmap.mapmover.isDraggingOrScaling) {
			var mouseMode = Session.get('mouse_mode')

			if (mouseMode == 'default') {
				dInit.select('capital', template.data.x, template.data.y, template.data._id);
			} else if (mouseMode == 'findingPath') {
				var coord = dHexmap.getCoordinatesFromEvent(event);
				Mapmaker.mapClick(coord.x, coord.y);
			}
		}
	},

	'mouseenter .capital': function(event, template) {
		event.preventDefault();
    event.stopPropagation();
		// hover box
		// Session.set('hover_box_data', {type:'capital', x:template.data.x, y:template.data.y})
		// Meteor.clearTimeout(Session.get('hover_on_object_timer'))
		// Session.set('hover_on_object', true)

		var currentData = Template.currentData();
		if (currentData) {
			Session.set('mouseOverHexCoords', {x:currentData.x, y:currentData.y});
		}

	},

	'mouseleave .capital': function(event, template) {
		event.preventDefault();
    event.stopPropagation();
		Meteor.clearTimeout(Session.get('hover_on_object_timer'))
		//Session.set('hover_on_object_timer', Meteor.setTimeout(function() { Session.set('hover_on_object', false) }, 1000))

		Session.set('mouseOverHexCoords', null);
	},
});





Template.capitalMapObject.onRendered(function() {
  var self = this;

	// highlight capital when selected
  this.autorun(function() {
    var currentData = Template.currentData();
    if (currentData && currentData._id) {
      removeCapitalHighlight(currentData._id);
      var selected = Session.get('selected');
      if (selected && selected.type == 'capital') {
        if (selected.id == currentData._id) {
          highlightCapital(currentData.x, currentData.y, currentData._id);
        }
      }
    }
  })
})


Template.capitalMapObject.onDestroyed(function() {
  var currentData = Template.currentData();
  if (currentData && currentData._id) {
    removeCapitalHighlight(currentData._id);
  }
});


var highlightCapital = function(x, y, capitalId) {
	check(x, Match.Integer);
	check(y, Match.Integer);

	var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);
	var points = Hx.getHexPolygonVerts(grid.x, grid.y, _s.init.hexSize * 0.95, _s.init.hexSquish);

	if (points != false) {
		var polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
		polygon.setAttribute('class', 'capitalHighlight');
		polygon.setAttribute('points', points);
		polygon.setAttribute('data-id', capitalId);
		$('#castle_highlights').append(polygon);
	}
}


var removeCapitalHighlight = function(capitalId) {
	$('.capitalHighlight[data-id='+capitalId+']').remove();
}
