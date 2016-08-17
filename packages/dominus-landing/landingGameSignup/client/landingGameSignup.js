Template.landingGameSignup.helpers({
  user: function() {
    return Meteor.users.findOne(Meteor.userId(), {fields: {proTokens:1, pro:1, username:1, verifiedEmail:1}});
  },

  hasToken: function() {
    let user = Meteor.users.findOne(Meteor.userId(), {fields: {proTokens:1}});
    if (user) {
      return (user.proTokens > 0);
    }
  },

  game: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      return Games.findOne(gameId);
    }
  },

  notStarted: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      let game = Games.findOne(gameId);
      if (game) {
        let startAt = moment(new Date(game.startAt));
        if (startAt.isAfter(moment())) {
          return true;
        }
      }
    }
  },

  alreadySignedUp: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      return Gamesignups.find({gameId:gameId, userId:Meteor.userId()}).count();
    }
  },

  numSignedUp: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      return Gamesignups.find({gameId:gameId}).count();
    }
  }
});


Template.landingGameSignup.events({
  'click #gameSignUpButton': function(event, template) {
    event.preventDefault();

    let username = template.find('#gameSignupUsernameInput');
    let alert = template.find('#gameSignupError');
    let button = event.currentTarget;
    let buttonText = $(button).text();

    username.value = username.value.replace(/[^a-zA-Z0-9]+/g, "");

    $(alert).hide();
    $(button).attr('disabled', true);
		$(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait');

    Meteor.apply('signupForGame', [Meteor.userId(), Session.get('gameId'), username.value], {}, function(error, result) {
      if (error) {
        $(alert).show();
        $(alert).html(error.error);
      }
      $(button).attr('disabled', false);
      $(button).html(buttonText);
    });
  },

  'click #gameRemoveSignUpButton': function(event, template) {
    event.preventDefault();
    Meteor.apply('cancelSignupForGame', [Meteor.userId(), Session.get('gameId')], {}, function(error, result) {
      if (error) {

      }
    });
  },

  'click #returnToGameListLink': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/games');
  },

  'click #gotoStoreLink': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/store');
  }
});


Template.landingGameSignup.onCreated(function() {
  var self = this;

  // if not signed in send to signin
  if (!Meteor.userId()) {
    SimpleRouter.go('/signin');
  }

  // subscribe to game
  this.autorun(function() {
    let gameId = Session.get('gameId');
    self.subscribe('landingGame', gameId);
    self.subscribe('gameSignups', gameId);
  });
});
