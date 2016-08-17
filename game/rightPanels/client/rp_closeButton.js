Template.rp_closeButton.helpers({
  selected: function() {
    return Session.get('selected');
  }
});


Template.rp_closeButton.events({
    'click #closeRpButton': function(event, template) {
      event.preventDefault();
      dInit.deselect();
    }
});
