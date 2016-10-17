Template.control_moderators.helpers({
  mods: function() {
    return Meteor.users.find({moderator:true});
  }
});



Template.control_moderators.events({
  'click #modButton': function(event, template) {
    event.preventDefault();
    let idInput = template.find('#modInput');
    Meteor.call('addMod', idInput.value);
  }
});



Template.control_moderators.onCreated(function() {
  this.subscribe('control_moderators');
});
