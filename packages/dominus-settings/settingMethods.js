Meteor.methods({
  getGameInfo: async function(gameId) {
    check(gameId, String);
    return await Games.findOneAsync(gameId);
  }
})
