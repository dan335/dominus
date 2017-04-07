Meteor.methods({

  // called from game.onCreated template
  // if user is already in game return true
  // if user is not then create player and castle in game then return true
  // throws error if fails
  // if no username then main username is used
  joinGame: function(gameId, username) {
    check(gameId, String);

    var self = this;

    let alreadyInGame = Players.find({userId:this.userId, gameId:gameId}).count();
    if (alreadyInGame) {
      return true;
    }

    // get username
    let user = Meteor.users.findOne(this.userId, {fields: {banned:1, admin:1, pro:1, proTokens:1, username:1, verifiedEmail:1}});
    if (!user || user.banned) {
      throw new Meteor.Error('userNotFound', 'User not found.');
    }
    if (!username) {
      username = user.username;
    }

    username = username.trim();

    if (username == 'Danimal' && !user.admin) {
      throw new Meteor.Error('You are not Danimal.');
    }

    if (username.length > 25) {
      throw new Meteor.Error('Username is too long.');
    }

    if (!user.verifiedEmail) {
      throw new Meteor.Error('nonVerifiedEmail', 'Email must be verified before joining a game.');
    }

    let game = Games.findOne(gameId, {fields: {isProOnly:1, dominusAchieved:1, hasStarted:1, hasEnded:1}});
    if (!game) {
      throw new Meteor.Error('gameNotFound', 'Game not found.');
    }

    if (!game.hasStarted) {
      throw new Meteor.Error('gameNotStarted', 'Game has not started yet.');
    }

    if (game.hasEnded) {
      throw new Meteor.Error('gameEnded', 'Game has already ended.');
    }

    if (game.dominusAchieved) {
      throw new Meteor.Error('someoneIsDominus', 'Dominus achieved, registration closed.');
    }

    let makePro = false;
    if (game.isProOnly) {
      if (!user.pro) {
        if (user.proTokens > 0) {
          // use token
          Meteor.users.update(self.userId, {$inc: {proTokens:-1}});
          makePro = true;
        }
      }
    }

    // join game
    // create player and castle
    Queues.add('createPlayer', {gameId:gameId, userId:self.userId, username:username, makePro:makePro}, {attempts:10, backoff:{type:'fixed', delay:5000}, delay:0, timeout:1000*60*10}, false);
  }
});
