Template.rp_moveArmy.events({
  'click #moveArmyCloseButton': function(event) {
    event.preventDefault();
    Session.set('rp_template', 'rp_info_army');
  },

  'click #coordSubmitButton': function(event, template) {
    var xInput = template.find('#xCoordInput');
    var yInput = template.find('#yCoordInput');
    var armyId = Template.currentData()._id;
    var button = event.currentTarget;
    var buttonText = $(button).text();
    var alert = template.find('.moveArmyAlert');

    $(alert).hide();

    $(button).text('Adding...');
    $(button).prop('disabled', true);

    var x = parseInt(xInput.value);
    var y = parseInt(yInput.value);

    Meteor.apply('addArmyPath', [Session.get('gameId'), x, y, armyId], {}, function(error, result) {
      $(button).text(buttonText);
      $(button).prop('disabled', false);

      if (error) {
        if (error.error == 'validation-error') {
          $(alert).html(error.details[0].type);
        } else {
          $(alert).html(error.reason);
        }
        $(alert).show();
      } else {
        $(xInput).val('');
        $(yInput).val('');
      }
    });
  }
});


Template.rp_moveArmy.onCreated(function() {
  var self = this;

  Session.set('mouse_mode', 'findingPath');
});


Template.rp_moveArmy.onDestroyed(function() {
  Session.set('mouse_mode', 'default');
})
