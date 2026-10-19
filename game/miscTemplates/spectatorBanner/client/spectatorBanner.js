Template.spectatorBanner.helpers({
  gameName: function() {
    let game = Games.findOne(Session.get('gameId'), {fields: {name:1}});
    if (game) {
      return game.name;
    }
  },

  verifiedEmail: function() {
    let user = Meteor.users.findOne(Meteor.userId(), {fields: {verifiedEmail:1}});
    if (user) {
      return user.verifiedEmail;
    }
  },

  // same rules as the join button on /games
  canJoin: function() {
    let user = Meteor.users.findOne(Meteor.userId(), {fields: {banned:1}});
    if (!user || user.banned) {
      return false;
    }

    let fields = {hasStarted:1, hasEnded:1, dominusAchieved:1, maxPlayers:1, numPlayers:1};
    let game = Games.findOne(Session.get('gameId'), {fields:fields});
    if (game) {
      return game.hasStarted && !game.hasEnded && !game.dominusAchieved && game.numPlayers < game.maxPlayers;
    }
  }
});


Template.spectatorBanner.events({
  'click #spectatorJoinButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/game/' + Session.get('gameId') + '/join');
  },

  'click #spectatorSignInButton': function(event, template) {
    event.preventDefault();
    // come back to what they were looking at, see accountsLanding.js
    Session.set('afterSignInPath', SimpleRouter.path.get());
    SimpleRouter.go('/signin');
  },

  'click #spectatorGamesButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/games');
  }
});
