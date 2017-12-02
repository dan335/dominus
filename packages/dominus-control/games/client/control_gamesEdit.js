Template.control_gamesEdit.helpers({
  game: function() {
    return Games.findOne();
  },

  isChecked: function(value) {
    if (value) return 'checked';
  },

  utctime: function() {
    Session.get('refresh_time_field');
    return moment().tz('UTC').format('h:mma');
  }
});

Template.control_gamesEdit.events({
  'click #backToGamesButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/control/games');
  },

  'click #saveGameButton': function(event, template) {
    event.preventDefault();

    var name = template.find('#nameInput');
    var desc = template.find('#descInput');
    var maxPlayers = template.find('#maxPlayers');
    var startAtDate = template.find('#gameStartDateInput');
		var startAtTime = template.find('#gameStartTimeInput');
    var isRelaxed = template.$('#isRelaxedCheckbox').is(':checked');
    var isSpeed = template.$('#isSpeedCheckbox').is(':checked');
    var isCrazyFast = template.$('#isCrazyFastCheckbox').is(':checked');
    var isProOnly = template.$('#isProOnlyCheckbox').is(':checked');
    var isKingOfHill = template.$('#isKingOfHillCheckbox').is(':checked');
    var isNoLargeResources = template.$('#isNoLargeResourcesCheckbox').is(':checked');

    var path = SimpleRouter.path.get();
    var pathArray = path.split('/');
    var gameId = pathArray[3];

    Meteor.apply(
      'addOrEditGame',
      [
        name.value,
        desc.value,
        Number(maxPlayers.value),
        startAtDate.value+' '+startAtTime.value,
        isRelaxed,
        isSpeed,
        isCrazyFast,
        isProOnly,
        isKingOfHill,
        isNoLargeResources,
        gameId
      ],
      {},
      function(error, result) {
        if (error) {

        } else {
          SimpleRouter.go('/control/games');
        }
    })
  }
});


Template.control_gamesEdit.onCreated(function() {
  this.autorun(function() {
    var path = SimpleRouter.path.get();
    var pathArray = path.split('/');
    var gameId = pathArray[3];
    Meteor.subscribe('gameForControl', gameId);
  })
});
