Template.infoPanelMarkerButton.helpers({
  hasMarkerHere: function() {
    let data = Template.currentData();
    if (data) {
      let unitId = data._id;
      let marker = Markers.findOne({unitId:unitId}, {fields: {_id:1}});
      if (marker) {
        return true;
      }
    }
    return false;
  }
})


Template.infoPanelMarkerButton.events({
  'click #infoPanelRemoveMarkerButton': function(event, template) {
    event.preventDefault();

    let data = Template.currentData();
    if (data) {
      let unitId = data._id;
      let marker = Markers.findOne({unitId:unitId}, {fields: {_id:1}});
      if (marker) {
        Meteor.call('removeMarker', marker._id);
      }
    }
  },

  'click #infoPanelMarkerButton': function(event, template) {
    event.preventDefault();

    var selected = Session.get('selected');
    var alert = template.$('.addMarkerAlert');

    alert.hide();

    var validTypes = ['castle', 'village', 'army', 'hex', 'capital'];

    if (!_.contains(validTypes, selected.type)) {
      console.error('invalid type');
      return;
    }

    if (selected.type == 'hex') {
      if (!dFunc.isInt(selected.x) || !dFunc.isInt(selected.y)) {
        console.error('invalid coordinates');
        return;
      }

      Meteor.apply('addMarkerCoords', [Session.get('gameId'), selected.type, selected.x, selected.y], {}, function(error, markerId) {
        if (error) {
          alert.show();
          alert.html(error.error);
        } else {
          if (markerId) {
            dInit.select('marker', selected.x, selected.y, markerId);
          }
        }
      });

    } else {
      if (!selected.id) {
        console.error('invalid id');
        return;
      }

      Meteor.apply('addMarker', [Session.get('gameId'), selected.type, selected.id], {}, function(error, markerId) {
        if (error) {
          alert.show();
          alert.html(error.error);
        } else {
          if (markerId) {
            dInit.select('marker', selected.x, selected.y, markerId);
          }
        }
      });
    }
  }
})
