Template.control_bans.helpers({
  bannedUsers: function() {
    return Meteor.users.find({banned:true});
  }
});


Template.control_bans.events({
  'click #banButton': function(event, template) {
    event.preventDefault();
    let idInput = template.find('#banInput');
    Meteor.call('banUser', idInput.value);
  }
});


Template.control_bans.onCreated(function() {
  this.subscribe('control_bans');
});
