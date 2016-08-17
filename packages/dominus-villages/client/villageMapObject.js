// villages are level 0 when created
// when finished construction level is incremented

Template.villageMapObject.helpers({
	friend_or_foe: function() {
		return Template.instance().flagColor.get()
	},

	flag_points: function(x, y) {
		check(x, validNumber)
		check(y, validNumber)

		var canvas_size = Session.get('canvas_size')
		if (canvas_size) {
			var grid = Hx.coordinatesToPos(x, y, s.hex_size, s.hex_squish)
			var offset_x = 0
			var offset_y = 0
			var points = ''
			points = points + (0 + grid.x + offset_x) + ',' + (0 + grid.y + offset_y) + ' '
			points = points + (0 + grid.x + offset_x) + ',' + (-20 + grid.y + offset_y) + ' '
			points = points + (18 + grid.x + offset_x) + ',' + (-20 + grid.y + offset_y) + ' '
			points = points + (0 + grid.x + offset_x) + ',' + (-11 + grid.y + offset_y)
			return points
		}
	},

	levelPlusOne: function() {
		if (this) {
			return this.level+1
		}
	}
})


Template.villageMapObject.events({
  'click .village': function(event, template) {
		event.preventDefault();
    event.stopPropagation();
		if (!dHexmap.mapmover.isDraggingOrScaling) {
			var mouseMode = Session.get('mouse_mode')

			if (mouseMode == 'default') {
				dInit.select('village', template.data.x, template.data.y, template.data._id);
			} else if (mouseMode == 'findingPath') {
				var coord = dHexmap.getCoordinatesFromEvent(event);
				Mapmaker.mapClick(coord.x, coord.y);
			}
		}
	},

	'mouseenter .village': function(event, template) {
		event.preventDefault();
    event.stopPropagation();
		// hover box
		Session.set('hover_box_data', {type:'village', x:template.data.x, y:template.data.y})
		Meteor.clearTimeout(Session.get('hover_on_object_timer'))
		Session.set('hover_on_object', true)

		var currentData = Template.currentData();
		if (currentData) {
			Session.set('mouseOverHexCoords', {x:currentData.x, y:currentData.y});
		}

	},

	'mouseleave .village': function(event, template) {
		event.preventDefault();
    event.stopPropagation();
		Meteor.clearTimeout(Session.get('hover_on_object_timer'))
		Session.set('hover_on_object_timer', Meteor.setTimeout(function() { Session.set('hover_on_object', false) }, 1000))

		Session.set('mouseOverHexCoords', null);
	},
});



Template.villageMapObject.onRendered(function() {
  var self = this;

	// highlight village when selected
  this.autorun(function() {
    var currentData = Template.currentData();
    if (currentData && currentData._id) {
      removeVillageHighlight(currentData._id);
      var selected = Session.get('selected');
      if (selected && selected.type == 'village') {
        if (selected.id == currentData._id) {
          highlightVillage(currentData.x, currentData.y, currentData._id);
        }
      }
    }
  })
});


Template.villageMapObject.onDestroyed(function() {
  var currentData = Template.currentData();
  if (currentData && currentData._id) {
    removeVillageHighlight(currentData._id);
  }
});


var highlightVillage = function(x, y, villageId) {
	check(x, Match.Integer);
	check(y, Match.Integer);

	var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);
	var points = Hx.getHexPolygonVerts(grid.x, grid.y, _s.init.hexSize * 0.95, _s.init.hexSquish);

	if (points != false) {
		var polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
		polygon.setAttribute('class', 'villageHighlight');
		polygon.setAttribute('points', points);
		polygon.setAttribute('data-id', villageId);
		$('#village_highlights').append(polygon);
	}
}


var removeVillageHighlight = function(villageId) {
	$('.villageHighlight[data-id='+villageId+']').remove();
}
