Meteor.methods({
  getGameInfo: function(gameId) {
    return Games.findOne(gameId);
  }
})
