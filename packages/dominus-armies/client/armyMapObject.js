Template.armyMapObject.helpers({
	//only draw guy that has been there the longest
	draw: function() {
		return Template.instance().draw.get();
	}
});


Template.armyMapObject.events({
	'click .armyMapObject': function(event, template) {
		event.preventDefault();
    event.stopPropagation();
		if (!dHexmap.mapmover.isDraggingOrScaling) {
			if (Session.get('mouse_mode') == 'default') {
				dInit.select('army', template.data.x, template.data.y, Template.currentData()._id);
			}
		}
	},

	'mouseenter .armyMapObject': function(event, template) {
		event.preventDefault();
    event.stopPropagation();
		Session.set('hover_box_data', {type: 'army', x:template.data.x, y:template.data.y})
		Meteor.clearTimeout(Session.get('hover_on_object_timer'))
		Session.set('hover_on_object', true)
	},

	'mouseleave .armyMapObject': function(event, template) {
		event.preventDefault();
    event.stopPropagation();
		Meteor.clearTimeout(Session.get('hover_on_object_timer'))
		Session.set('hover_on_object_timer', Meteor.setTimeout(function() { Session.set('hover_on_object', false) }, 1000))
	},
});


Template.armyMapObject.onCreated(function() {
  var self = this;

  //only draw guy that has been there the longest
  self.draw = new ReactiveVar(true);
	self.autorun(function() {
    self.draw.set(true);
    var currentData = Template.currentData();

		if (currentData) {
      var find = {x: currentData.x, y: currentData.y, _id: {$ne: currentData._id}};
      var options =  {fields: {last_move_at:1}};
			var armies = Armies.find(find, options);

			if (armies && armies.count()) {
				armies.forEach(function(res) {
					if (currentData.last_move_at > res.last_move_at) {
						self.draw.set(false);
					}
				});
			}
		}
	});
});


Template.armyMapObject.onRendered(function() {
  var self = this;

	// highlight army
  this.autorun(function() {
    var currentData = Template.currentData();
    if (currentData && currentData._id) {
      removeArmyHighlight(currentData._id);
      var selected = Session.get('selected');
      if (selected && selected.type == 'army') {
        if (selected.id == currentData._id) {
          highlightArmy(currentData.x, currentData.y, currentData._id);
        }
      }
    }
  })
})


// remove highlight
Template.armyMapObject.onDestroyed(function() {
  var currentData = Template.currentData();
  if (currentData && currentData._id) {
    removeArmyHighlight(currentData._id);
  }
})


var highlightArmy = function(x, y, armyId) {
  check(x, Match.Integer);
  check(y, Match.Integer);

  var grid = Hx.coordinatesToPos(x, y, _s.init.hexSize, _s.init.hexSquish);

  var ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  ellipse.setAttribute('cx', grid.x + _s.armies.mapObjectOffsetX);
  ellipse.setAttribute('cy', grid.y + _s.armies.mapObjectOffsetY);
  ellipse.setAttribute('rx', _s.armies.mapObjectHighlightRadius);
  ellipse.setAttribute('ry', _s.armies.mapObjectHighlightRadius * _s.init.hexSquish);
  ellipse.setAttribute('class', 'armySelectedHighlight');
  ellipse.setAttribute('data-id', armyId);
  $('#armyHighlights-selected').append(ellipse);
}

var removeArmyHighlight = function(armyId) {
  $('.armySelectedHighlight[data-id='+armyId+']').remove();
}
