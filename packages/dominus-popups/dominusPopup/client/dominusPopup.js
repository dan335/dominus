Template.dominusPopup.helpers({
  show: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      let dominus = DominusPlayer.findOne();
      let game = Games.findOne(gameId, {fields: {hasEnded:1}});
      if (game) {
        if (game.hasEnded) {
          return false;
        }
        if (dominus) {
          return true;
        }
      }
    }
  },

  isDominus: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      return (DominusPlayer.find({is_dominus:true}).count() > 0);
    }
  },

  dominus: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      return DominusPlayer.findOne({is_dominus:true});
    }
  },

  lastDominus: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      let game = Games.findOne(gameId, {fields: {lastDominusPlayerId:1}});
      if (game && game.lastDominusPlayerId) {
        return DominusPlayer.findOne(game.lastDominusPlayerId);
      }
    }
  },

  gameEndDate: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      let game = Games.findOne(gameId, {fields: {endDate:1}});
      if (game && game.endDate) {
        return game.endDate
      }
    }
  },

  gameHasEnded: function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      let game = Games.findOne(gameId, {fields: {hasEnded:1}});
      if (game) {
        return game.hasEnded;
      }
    }
  }
});


Template.dominusPopup.events({
  'click .userLink': function(event, template) {
    event.preventDefault();
    var x = parseInt(event.currentTarget.getAttribute('data-x'))
    var y = parseInt(event.currentTarget.getAttribute('data-y'))
    var castle_id = event.currentTarget.getAttribute('data-castle_id')

    dInit.select('castle', x, y, castle_id);
    dHexmap.centerOnHex(x,y);
  },
})

// make cheaper, use game.isDominusTriggered
Template.dominusPopup.onCreated(function() {
  this.autorun(function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      let game = Games.findOne(gameId, {fields: {lastDominusPlayerId:1}});
      if (game && game.lastDominusPlayerId) {
        Meteor.subscribe('dominusPopupPlayer', game.lastDominusPlayerId);
      }
      Meteor.subscribe('dominusPopupGameId', gameId);
    }
  })
})
