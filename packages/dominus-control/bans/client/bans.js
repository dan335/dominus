Template.control_bans.helpers({
  bannedUsers: function() {
    return Meteor.users.find({banned:true});
  }
});


Template.control_bans.events({
  'click #banButton': function(event, template) {
    event.preventDefault();
    let idInput = template.find('#banInput');
    let reasonInput = template.find('#banReason');
    Meteor.call('banUser', idInput.value, reasonInput.value);
  }
});


Template.control_bans.onCreated(function() {
  this.subscribe('control_bans');
});



Template.control_bans_players.helpers({
  nicedate: function() {
    return moment(new Date(this.bannedDate)).calendar();
  }
})


Template.control_bans_players.events({
  'click .unbanButton': function(event, template) {
    event.preventDefault();
    Meteor.call('unbanUser', this._id);
  }
})
