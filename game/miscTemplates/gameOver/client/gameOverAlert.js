Template.gameOverAlert.helpers({
    show: function() {
      let gameId = Session.get('gameId');
      if (gameId) {
        let game = Games.findOne(gameId, {fields: {hasEnded:1}});
        if (game && game.hasEnded) {
          return true;
        }
      }
    },

    winner: function() {
      let gameId = Session.get('gameId');
      if (gameId) {
        let game = Games.findOne(gameId, {fields: {winningPlayer:1}});
        if (game && game.winningPlayer) {
          return game.winningPlayer;
        }
      }
    },

    gameOverDate: function() {
      let gameId = Session.get('gameId');
      if (gameId) {
        let game = Games.findOne(gameId, {fields: {endDate:1}});
        if (game && game.endDate) {
          return true;
        }
      }
    },

    closeDate: function() {
      let gameId = Session.get('gameId');
      if (gameId) {
        let game = Games.findOne(gameId, {fields: {closeDate:1}});
        if (game && game.closeDate) {
          return game.closeDate;
        }
      }
    }
});


Template.gameOverAlert.events({
  'click #gameOverUserLink': function(event, template) {
    event.preventDefault();
    var self = this;

    let gameId = Session.get('gameId');
    if (gameId) {
      let game = Games.findOne(gameId, {fields: {winningPlayer:1}});
      if (game && game.winningPlayer) {
        dInit.select('castle', game.winningPlayer.x, game.winningPlayer.y, game.winningPlayer.castle_id);
        dHexmap.centerOnHex(game.winningPlayer.x, game.winningPlayer.y);
      }
    }
  }
});
