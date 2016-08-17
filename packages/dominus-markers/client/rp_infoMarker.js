Template.rp_infoMarker.helpers({
  marker: function() {
    var data = Template.instance().markerData;
    if (data) {
      return data.get();
    }
  }
})


Template.rp_infoMarker.events({
  'click #saveMarkerButton': function(event, template) {
    event.preventDefault();
    var selected = Session.get('selected');
    if (selected) {
      var nameInput = template.find('#markerNameInput');
      var name = nameInput.value;
      var descInput = template.find('#markerDescInput');
      var desc = descInput.value;
      var button = event.currentTarget;
      var button_html = $(button).html();
      var alert = template.find('#editMarkerAlert');

      $(alert).hide();

      $(button).attr('disabled', true);
      $(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait');

      Meteor.apply('saveMarkerInfo', [selected.id, name, desc], {}, function(error, result) {
        $(button).attr('disabled', false);
        $(button).html(button_html);

        if (error) {
          $(alert).show();
          $(alert).html(error.error);
        } else {
          SimpleRouter.go('/game/'+Session.get('gameId'));
        }
      })
    } else {
      // #TODO:90 fix this
      console.error('No marker selected.');
    }

  },

  'click #closeMarkerButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/game/'+Session.get('gameId'));
  }
})


Template.rp_infoMarker.onCreated(function() {
  var self = this;
  self.markerData = new ReactiveVar(null);

  self.autorun(function() {
    var selected = Session.get('selected');

    if (selected && selected.type == 'marker' && selected.id) {
      var data = Markers.findOne(selected.id);
      if (data) {
        self.markerData.set(data);
      }
    }
  })
})
