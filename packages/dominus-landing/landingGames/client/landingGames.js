Template.landingGames.helpers({
  currentGames: function() {
    return Games.find({hasStarted:true, hasEnded:false}, {sort: {startAt:-1}});
  },

  futureGames: function() {
    return Games.find({hasStarted:false}, {sort: {startAt:1}});
  },

  hasCurrentGames: function() {
    return Games.find({hasStarted:true, hasEnded:false}).count();
  },

  hasFutureGames: function() {
    return Games.find({hasStarted:false}).count();
  },

  alreadyJoinedGame: function() {
    return Mygames.find({gameId:this._id}).count();
  },
});


Template.landingGames.onCreated(function() {
  this.subscribe('landingGames');
  this.subscribe('gamesSignups');
});


Template.landingGame.helpers({
  alreadyJoinedGame: function() {
    let game = Template.currentData();
    if (game) {
      return Mygames.find({gameId:game._id}).count();
    }
  },

  alreadySignedUp: function() {
    let game = Template.currentData();
    if (game) {
      return Gamesignups.find({gameId:game._id, userId:Meteor.userId()}).count();
    }
  },

  numPlayers: function() {
    let game = Template.currentData();
    if (game) {
      if (game.hasStarted) {
        return game.numPlayers;
      } else {
        return Gamesignups.find({gameId:game._id}).count();
      }
    }
  },

  isFull: function() {
    let game = Template.currentData();
    if (game) {
      if (game.hasStarted) {
        return (game.maxPlayers - game.numPlayers) <= 0;
      } else {
        let signups = Gamesignups.find({gameId:game._id}).count();
        return (game.maxPlayers - signups) <= 0;
      }
    }
  },

  verifiedEmail: function() {
    let user = Meteor.users.findOne(Meteor.userId(), {fields: {verifiedEmail:1}});
    if (user) {
      return user.verifiedEmail;
    }
  },

  hasDescription: function() {
    let game = Template.currentData();
    if (game && game.desc) {
      return (game.desc.length > 0);
    }
  }
});


Template.landingGame.events({
  'click .gameSignInButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/signin');
  },

  'click .gotoGameButton': function(event, template) {
    event.preventDefault();

    let game = Template.currentData();
    if (!game) {
      console.error('no game found in gotoGameButton event');
      return false;
    }

    SimpleRouter.go('/game/' + game._id);
  },

  'click .joinGameButton': function(event, template) {
    event.preventDefault();

    let game = Template.currentData();
    if (!game) {
      console.error('no game found in joinGameButton event');
      return false;
    }

    SimpleRouter.go('/game/' + game._id + '/join');
  },

  'click .signUpButton': function(event, template) {
    event.preventDefault();

    let game = Template.currentData();
    if (!game) {
      console.error('no game found in signUpButton event');
      return false;
    }

    SimpleRouter.go('/game/' + game._id + '/signup');
  }
})
