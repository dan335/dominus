Template.markerBox.helpers({
  isSelected: function() {
    var selected = Session.get('selected');
    if (selected && selected.type == 'marker') {
      var data = Template.currentData();
      return selected.id == data._id;
    }
  }
})

Template.markerBox.events({
  'click .selectMarkerButton': function(event, template) {
    event.preventDefault();
    var data = Template.currentData();
    dInit.select(data.unitType, data.x, data.y, data.unitId);
  },


  'click .editMarkerButton': function(event, template) {
    event.preventDefault();
    var data = Template.currentData();
    dInit.select('marker', data.x, data.y, data._id);
  },


  'click .viewMarkerButton': function(event, template) {
    event.preventDefault();
    var data = Template.currentData();
    dHexmap.centerOnHex(data.x,data.y);
  },


  'click .removeMarkerButton': function(event, template) {
    event.preventDefault();
    var data = Template.currentData();
    Meteor.call('removeMarker', data._id);
  }
})
