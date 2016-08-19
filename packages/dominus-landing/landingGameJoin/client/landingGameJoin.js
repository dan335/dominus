Template.landingGameJoin.helpers({
  user: function() {
    return Meteor.users.findOne(Meteor.userId(), {fields: {proTokens:1, pro:1, username:1, verifiedEmail:1}});
  },

  game: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      return Games.findOne(gameId);
    }
  },

  hasProToken: function() {
    let user = Meteor.users.findOne(Meteor.userId(), {fields: {proTokens:1}});
    if (user) {
      return (user.proTokens > 0);
    }
  }
});


Template.landingGameJoin.events({
  'click .gameJoinButton': function(event, template) {
    event.preventDefault();

    let username = template.find('#gameJoinUsernameInput');
    let alert = template.find('#gameJoinError');
    let button = event.currentTarget;
    let buttonText = $(button).text();

    username.value = username.value.replace(/[^a-zA-Z0-9_\s]+/g, "");

    $(alert).hide();
    $(button).attr('disabled', true);
		$(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait');

    Meteor.apply('joinGame', [Session.get('gameId'), username.value], {}, function(error, result) {
      if (error) {
        $(alert).show();
        $(alert).html(error.reason || error.error);
        $(button).attr('disabled', false);
        $(button).html(buttonText);
      } else {
        SimpleRouter.go('/game/'+Session.get('gameId'));
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



Template.landingGameJoin.onCreated(function() {
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
