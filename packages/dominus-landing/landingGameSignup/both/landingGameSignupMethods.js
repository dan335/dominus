// These methods run on the client too, so a signup shows at once. Each stays
// a plain function: the simulation is sync and the server's part is async
// (see "Async conversion" in CLAUDE.md).

var signupUserFields = {fields: {banned:1, admin:1, pro:1, proTokens:1, verifiedEmail:1}};

var checkSignupUser = function(user, username) {
  if (!user) {
    throw new Meteor.Error('User not found.');
  }

  if (user.banned) {
    throw new Meteor.Error('banned', 'Your account has been banned. If you think this is a mistake, contact us on Discord: https://discord.gg/b59g5pE');
  }

  if (!user.verifiedEmail) {
    throw new Meteor.Error('Please verify your email before signing up for a game.');
  }

  if (username == 'Danimal' && !user.admin) {
    throw new Meteor.Error('You are not Danimal.');
  }
};

var checkSignupGame = function(signup, game) {
  // already signed up
  if (signup) {
    throw new Meteor.Error('alreadySignedUp', 'You have already signed up for this game.');
  }

  if (!game) {
    throw new Meteor.Error('noGameFound', 'Game not found.');
  }

  // can't signup after game has started
  let startAt = moment(new Date(game.startAt));
  if (moment(dClock.now()).isAfter(startAt)) {
    throw new Meteor.Error('gameAlreadyStarted', 'Game has already started, cannot signup.');
  }
};

var checkNotFull = function(numSignedUp, game) {
  // max signups
  if (numSignedUp > game.maxPlayers) {
    throw new Meteor.Error('maxSignups', 'Game is full, cannot signup.');
  }
};

// whether the signup uses a pro token: throws if the game is pro only and
// the user is not pro and has no token
var usesToken = function(user, game) {
  if (game.isProOnly) {
    if (!user.pro) {
      if (user.proTokens > 0) {
        return true;
      } else {
        throw new Meteor.Error('proOnly', 'This is a pro only game. Upgrade to a pro account or buy a token in the store.');
      }
    }
  }
  return false;
};

var newSignup = function(gameId, userId, username, usedToken) {
  return {
    gameId: gameId,
    userId: userId,
    username: username,
    createdAt: dClock.now(),
    usedToken: usedToken
  };
};

var checkCancel = function(signup, game) {
  if (!signup) {
    throw new Meteor.Error('noSignupFound', 'You have not signed up for this game.');
  }

  if (!game) {
    throw new Meteor.Error('noGameFound', 'Game not found.');
  }

  // can't cancel signup after game has started
  let startAt = moment(new Date(game.startAt));
  if (moment(dClock.now()).isAfter(startAt)) {
    throw new Meteor.Error('gameAlreadyStarted', 'Game has already started, cannot cancel signup.');
  }
};

Meteor.methods({
  signupForGame: function(userId, gameId, username) {
    check(userId, Match.OneOf(String, null));
    check(gameId, String);
    check(username, String);
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

    var gameFields = {fields: {maxPlayers:1, startAt:1, isProOnly:1}};

    if (this.isSimulation) {
      let user = Meteor.users.findOne(self.userId, signupUserFields);
      checkSignupUser(user, username);
      let game = Games.findOne(gameId, gameFields);
      checkSignupGame(Gamesignups.findOne({userId:self.userId, gameId:gameId}), game);
      checkNotFull(Gamesignups.find({gameId:gameId}).count(), game);
      let usedToken = usesToken(user, game);
      if (usedToken) {
        Meteor.users.update(self.userId, {$inc: {proTokens:-1}});
      }
      Gamesignups.insert(newSignup(gameId, self.userId, username, usedToken));
      return;
    }

    return (async () => {
      // case insensitive
      // replace with $text when meteor ships with mongo 3
      let find = {gameId:gameId, username: {$regex: new RegExp('^' +username + '$', 'i')}};
      if (await Gamesignups.find(find).countAsync()) {
        throw new Meteor.Error('A user exists with this username, try another.');
      }

      let user = await Meteor.users.findOneAsync(self.userId, signupUserFields);
      checkSignupUser(user, username);

      let signup = await Gamesignups.findOneAsync({userId:self.userId, gameId:gameId});
      let game = await Games.findOneAsync(gameId, gameFields);
      checkSignupGame(signup, game);
      checkNotFull(await Gamesignups.find({gameId:gameId}).countAsync(), game);

      let usedToken = usesToken(user, game);
      if (usedToken) {
        await Meteor.users.updateAsync(self.userId, {$inc: {proTokens:-1}});
      }

      await Gamesignups.insertAsync(newSignup(gameId, self.userId, username, usedToken));
    })();
  },

  // userId argument is ignored -- you can only cancel your own signup
  cancelSignupForGame: function(userId, gameId) {
    check(userId, Match.OneOf(String, null));
    var self = this;
    check(gameId, String);

    if (!self.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in.');
    }

    if (this.isSimulation) {
      let signup = Gamesignups.findOne({gameId:gameId, userId:self.userId});
      checkCancel(signup, Games.findOne(gameId));
      // give back token if they used one
      if (signup.usedToken) {
        Meteor.users.update(self.userId, {$inc: {proTokens:1}});
      }
      Gamesignups.remove({_id:signup._id, userId:self.userId});
      return;
    }

    return (async () => {
      let signup = await Gamesignups.findOneAsync({gameId:gameId, userId:self.userId});
      let game = signup ? await Games.findOneAsync(gameId) : null;
      checkCancel(signup, game);

      // give back token if they used one
      if (signup.usedToken) {
        await Meteor.users.updateAsync(self.userId, {$inc: {proTokens:1}});
      }

      await Gamesignups.removeAsync({_id:signup._id, userId:self.userId});
    })();
  }
});
