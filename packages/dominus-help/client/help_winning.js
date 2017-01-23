Template.help_winning.helpers({
  dominusTime: function() {
    return _gs.init(Session.get('gameId'), 'time_til_game_end_when_new_dominus');
  }
})
