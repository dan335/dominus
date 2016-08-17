Template.control_gamesAdd.helpers({
  utctime: function() {
    Session.get('refresh_time_field');
    return moment().tz('UTC').format('h:mma');
  }
})

Template.control_gamesAdd.events({
  'click #backToGamesButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/control/games');
  },

  'click #addGameButton': function(event, template) {
    event.preventDefault();

    var name = template.find('#nameInput');
    var desc = template.find('#descInput');
    var maxPlayers = template.find('#maxPlayers');
    var date = template.find('#gameStartDateInput');
		var time = template.find('#gameStartTimeInput');
    var isSpeed = template.$('#isSpeedCheckbox').is(':checked');
    var isSuperSpeed = template.$('#isSuperSpeedCheckbox').is(':checked');
    var isProOnly = template.$('#isProOnlyCheckbox').is(':checked');
    var isKingOfHill = template.$('#isKingOfHillCheckbox').is(':checked');
    var isNoLargeResources = template.$('#isNoLargeResourcesCheckbox').is(':checked');

    Meteor.apply(
      'addOrEditGame',
      [name.value, desc.value, Number(maxPlayers.value), date.value+' '+time.value, isSpeed, isSuperSpeed, isProOnly, isKingOfHill, isNoLargeResources, null],
      {},
      function(error, result) {
        if (error) {

        } else {
          SimpleRouter.go('/control/games');
        }
    })
  }
});
