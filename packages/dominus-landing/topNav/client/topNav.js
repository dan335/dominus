Template.topNav.helpers({
  loggingIn: function() {
    return Meteor.loggingIn();
  },

  active: function(path) {
    var currentPath = SimpleRouter.path.get();
    if (currentPath == path) return {class:'active'};
  },

  myGames: function() {
    return Mygames.find();
  },

  currentGameString: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      let game = Games.findOne(gameId, {fields: {name:1}});
      if (game && game.name) {
        return game.name;
      }
    }
    return 'Your Games';
  }
});

Template.topNav.events({
  'click .topNavButton': function(event, template) {
    event.preventDefault();
    var path = $(event.currentTarget).attr('href');
    SimpleRouter.go(path);
  },

  'click #topNavSignoutButton': function(event, template) {
    event.preventDefault();
    Meteor.logout();
  },

  'click .gameListLink': function(event, template) {
    event.preventDefault();
    $('.dropdown-menu').hide();
    SimpleRouter.go('/game/'+this.gameId);
  },

  'click #noGamesLink': function(event, template) {
    event.preventDefault();
    $('.dropdown-menu').hide();
    SimpleRouter.go('/games');
  },

  'click .dropdown-toggle': function(event, template) {
    event.preventDefault();
    $('.dropdown-menu').toggle();
  }
})
