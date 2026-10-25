// These methods run on the client too. Each stays a plain function: the
// simulation is sync and the server's part is async (see "Async conversion"
// in CLAUDE.md).

var moderatorFields = {fields:{admin:1, moderator:1}};

var checkModerator = function(user) {
  if (user) {
    if (!user.admin && !user.moderator) {
      throw new Meteor.Error('control.games.addGame', 'Must be admin or moderator.');
    }
  } else {
    throw new Meteor.Error('control.games.addGame', 'Must be admin or moderator.');
  }
};

// a game's settings from the form, or an error
var gameData = function(name, desc, maxPlayers, startAtTimeString, isRelaxed, isSpeed, isCrazyFast, isProOnly, isKingOfHill, isNoLargeResources) {
  // 2015-12-23 16:20
  if (!startAtTimeString.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)) {
    throw new Meteor.Error('control.games.addGame', 'startAtTimeString wrong format.');
  }

  var startAt = moment.utc(startAtTimeString, 'YYYY-MM-DD HH:mm');
  if (!startAt.isValid) {
    throw new Meteor.Error('control.games.addGame', 'Start date not valid.');
  }

  if (name.length < 2) {
    throw new Meteor.Error('control.games.addGame', 'Name empty.');
  }

  return {
    name: name,
    desc: desc,
    maxPlayers: maxPlayers,
    startAt: startAt.toDate(),
    isRelaxed: isRelaxed,
    isSpeed: isSpeed,
    isCrazyFast: isCrazyFast,
    isProOnly: isProOnly,
    isKingOfHill: isKingOfHill,
    isNoLargeResources: isNoLargeResources
  };
};

// the fields a new game starts with
var newGameData = function(data) {
  data.createdAt = new Date();
  data.hasEnded = false;  // is game over, somone has won
  data.hasStarted = false;
  data.isStarting = false;  // true while gameStart job is working
  data.hasClosed = false;
  data.closeDate = null;
  data.endDate = null;  // set when someone becomes dominus, game ends at this time
  data.lastDominusPlayerId = null;  // playerId of previous dominus
  data.taxesCollected = 0;
  data.tree = null; // contains cached tree
  data.map_size = null;
  data.minimapBgPath = null;
  data.numPlayers = 0;
  data.dominusAchieved = false;   // close registration after dominus
  data.minimap = null;
  return data;
};

// everything a game has, removed with it
var gameCollections = function() {
  return [Alerts, Armies, Armypaths, Battles2, Capitals, Castles, Countries, CountriesTemp, Dailystats, Gamestats,
    Gamesignups, GlobalAlerts, Hexes, Market, Markers, MarkerGroups, Markethistory, Players, Recentchats, Rooms,
    Roomchats, Rounds, Recentchats, Villages];
};

Meteor.methods({

  // pass in gameId if editing
  // otherwise it will insert game
  // return gameId
  addOrEditGame: function(name, desc, maxPlayers, startAtTimeString, isRelaxed, isSpeed, isCrazyFast, isProOnly, isKingOfHill, isNoLargeResources, gameId) {
    check(desc, String);
    check(gameId, Match.Maybe(String));

    check(name, String);
    check(maxPlayers, Match.Integer);
    check(startAtTimeString, String);
    check(isRelaxed, Boolean);
    check(isSpeed, Boolean);
    check(isCrazyFast, Boolean);
    check(isProOnly, Boolean);
    check(isKingOfHill, Boolean);
    check(isNoLargeResources, Boolean);

    var args = [name, desc, maxPlayers, startAtTimeString, isRelaxed, isSpeed, isCrazyFast, isProOnly, isKingOfHill, isNoLargeResources];

    if (this.isSimulation) {
      checkModerator(Meteor.users.findOne(this.userId, moderatorFields));
      var data = gameData.apply(null, args);
      if (gameId) {
        Games.update(gameId, {$set: data});
      } else {
        Games.insert(newGameData(data));
      }
      return;
    }

    return (async () => {
      checkModerator(await Meteor.users.findOneAsync(this.userId, moderatorFields));
      var data = gameData.apply(null, args);

      if (gameId) {

        await Games.updateAsync(gameId, {$set: data});
        return gameId;

      } else {

        newGameData(data);
        let gameId = await Games.insertAsync(data);
        _gs.cacheGame(_.extend({_id:gameId}, data));
        return gameId;
      }
    })();
  },

  removeGame: function(gameId) {
    check(gameId, String);

    if (this.isSimulation) {
      checkModerator(Meteor.users.findOne(this.userId, moderatorFields));
      Games.remove(gameId);
      gameCollections().forEach(function(collection) {
        collection.remove({gameId:gameId});
      });
      return;
    }

    return (async () => {
      checkModerator(await Meteor.users.findOneAsync(this.userId, moderatorFields));

      await Games.removeAsync(gameId);

      for (const collection of gameCollections()) {
        await collection.removeAsync({gameId:gameId});
      }
    })();
  }
});

if (Meteor.isServer) {
  var addGameRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'addGame'
  }
  DDPRateLimiter.addRule(addGameRule, 1, 1000);
}
