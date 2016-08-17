Meteor.methods({
  signupForGame: function(userId, gameId, username) {
    var self = this;

    username = username.replace(/[^0-9a-zA-Z_\s]/g, '');
    username = username.trim();
    usernameNoSpaces = username.replace(/[^0-9a-zA-Z_]/g, '');

    if (usernameNoSpaces.length < 3) {
      throw new Meteor.Error('Username must be at least 3 characters long.');
    }

    if (username.length > 25) {
      throw new Meteor.Error('Username is too long.');
    }

    if (!this.isSimulation) {
      // case insensitive
      // replace with $text when meteor ships with mongo 3
      let find = {gameId:gameId, username: {$regex: new RegExp('^' +username + '$', 'i')}};
      if (Gamesignups.find(find).count()) {
        throw new Meteor.Error('A user exists with this username, try another.');
      }
    }

    let user = Meteor.users.findOne(self.userId, {fields: {banned:1, admin:1, pro:1, proTokens:1, verifiedEmail:1}});
    if (!user || user.banned) {
      throw new Meteor.Error('User not found.');
    }
    if (!user.verifiedEmail) {
      throw new Meteor.Error('Please verify your email before signing up for a game.');
    }

    if (username == 'Danimal' && !user.admin) {
      throw new Meteor.Error('You are not Danimal.');
    }

    // already signed up
    let signup = Gamesignups.findOne({userId:self.userId, gameId:gameId});
    if (signup) {
      throw new Meteor.Error('alreadySignedUp', 'You have already signed up for this game.');
    }

    // get game
    let game = Games.findOne(gameId, {fields: {maxPlayers:1, startAt:1, isProOnly:1}});
    if (!game) {
      throw new Meteor.Error('noGameFound', 'Game not found.');
    }

    // can't signup after game has started
    let startAt = moment(new Date(game.startAt));
    if (moment().isAfter(startAt)) {
      throw new Meteor.Error('gameAlreadyStarted', 'Game has already started, cannot signup.');
    }

    // max signups
    let numSignedUp = Gamesignups.find({gameId:gameId}).count();
    if (numSignedUp > game.maxPlayers) {
      throw new Meteor.Error('maxSignups', 'Game is full, cannot signup.');
    }

    let usedToken = false;
    if (game.isProOnly) {
      if (!user.pro) {
        if (user.proTokens > 0) {
          Meteor.users.update(self.userId, {$inc: {proTokens:-1}});
          usedToken = true;
        } else {
          throw new Meteor.Error('proOnly', 'This is a pro only game. Upgrade to a pro account or buy a token in the store.');
        }
      }
    }

    Gamesignups.insert({
      gameId: gameId,
      userId: self.userId,
      username: username,
      createdAt: new Date(),
      usedToken: usedToken
    });
  },

  cancelSignupForGame: function(userId, gameId) {
    var self = this;

    let signup = Gamesignups.findOne({gameId:gameId, userId:this.userId});
    if (!signup) {
      throw new Meteor.Error('noSignupFound', 'You have not signed up for this game.');
    }

    // get game
    let game = Games.findOne(gameId);
    if (!game) {
      throw new Meteor.Error('noGameFound', 'Game not found.');
    }

    // can't cancel signup after game has started
    let startAt = moment(new Date(game.startAt));
    if (moment().isAfter(startAt)) {
      throw new Meteor.Error('gameAlreadyStarted', 'Game has already started, cannot cancel signup.');
    }

    // give back token if they used one
    if (signup.usedToken) {
      Meteor.users.update(self.userId, {$inc: {proTokens:1}});
    }

    Gamesignups.remove({
      gameId:gameId,
      userId:userId
    });
  }
});
