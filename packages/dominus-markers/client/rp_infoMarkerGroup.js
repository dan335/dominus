Template.rp_infoMarkerGroup.helpers({
  group: function() {
    var data = Template.instance().groupData;
    if (data) {
      return data.get();
    }
  }
})


Template.rp_infoMarkerGroup.events({
  'click #saveGroupButton': function(event, template) {
    event.preventDefault();

    var selected = Session.get('selected');
    var nameInput = template.find('#groupNameInput');
    var name = nameInput.value;
    var button = event.currentTarget;
    var button_html = $(button).html();
    var alert = template.find('#groupEditAlert');
    
    $(alert).hide();

    $(button).attr('disabled', true);
    $(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait');

    Meteor.apply('saveMarkerGroupInfo', [selected.id, name], {}, function(error, result) {
      $(button).attr('disabled', false);
      $(button).html(button_html);

      if (error) {
        $(alert).show();
        $(alert).html(error.error);
      } else {
        SimpleRouter.go('/game/'+Session.get('gameId'));
      }
    });
  },

  'click #closeGroupButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/game/'+Session.get('gameId'));
  }
})



Template.rp_infoMarkerGroup.onCreated(function() {
  var self = this;
  self.groupData = new ReactiveVar(null);

  self.autorun(function() {
    var selected = Session.get('selected');

    if (selected && selected.type == 'markerGroup' && selected.id) {
      var data = MarkerGroups.findOne(selected.id);
      if (data) {
        self.groupData.set(data);
      }
    }
  })
})
