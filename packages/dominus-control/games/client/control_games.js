Template.control_games.helpers({
  games: function() {
    return Games.find({}, {sort:{startAt: -1}});
  }
})


Template.control_games.events({
  'click #addGameButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/control/gamesAdd');
  },

  'click #removeGameButton': function(event, template) {
    event.preventDefault();
    Meteor.call('removeGame', this._id);
  },

  'click #editGameButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/control/gamesEdit/'+this._id);
  }
});


Template.control_games.onCreated(function() {
  this.subscribe('gamesForControl');
})
