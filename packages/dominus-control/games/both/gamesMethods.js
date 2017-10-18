Meteor.methods({

  // pass in gameId if editing
  // otherwise it will insert game
  // return gameId
  addOrEditGame: function(name, desc, maxPlayers, startAtTimeString, isRelaxed, isSpeed, isSuperSpeed, isProOnly, isKingOfHill, isNoLargeResources, gameId) {

    check(name, String);
    check(maxPlayers, Match.Integer);
    check(startAtTimeString, String);
    check(isRelaxed, Boolean);
    check(isSpeed, Boolean);
    check(isSuperSpeed, Boolean);
    check(isProOnly, Boolean);
    check(isKingOfHill, Boolean);
    check(isNoLargeResources, Boolean);

    var user = Meteor.users.findOne(this.userId, {fields:{admin:1, moderator:1}});
    if (user) {
      if (!user.admin && !user.moderator) {
        throw new Meteor.Error('control.games.addGame', 'Must be admin or moderator.');
      }
    } else {
      throw new Meteor.Error('control.games.addGame', 'Must be admin or moderator.');
    }

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

    var data = {
      name: name,
      desc: desc,
      maxPlayers: maxPlayers,
      startAt: startAt.toDate(),
      isRelaxed: isRelaxed,
      isSpeed: isSpeed,
      isSuperSpeed: isSuperSpeed,
      isProOnly: isProOnly,
      isKingOfHill: isKingOfHill,
      isNoLargeResources: isNoLargeResources
    };

    if (gameId) {

      Games.update(gameId, {$set: data});
      return gameId;

    } else {

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
      let gameId = Games.insert(data);
      return gameId;
    }
  },

  removeGame: function(gameId) {
    check(gameId, String);

    var user = Meteor.users.findOne(this.userId, {fields:{admin:1, moderator:1}});
    if (user) {
      if (!user.admin && !user.moderator) {
        throw new Meteor.Error('control.games.addGame', 'Must be admin or moderator.');
      }
    } else {
      throw new Meteor.Error('control.games.addGame', 'Must be admin or moderator.');
    }

    Games.remove(gameId);

    Alerts.remove({gameId:gameId});
    Armies.remove({gameId:gameId});
    Armypaths.remove({gameId:gameId});
    Battles2.remove({gameId:gameId});
    Capitals.remove({gameId:gameId});
    Castles.remove({gameId:gameId});
    Countries.remove({gameId:gameId});
    CountriesTemp.remove({gameId:gameId});
    Dailystats.remove({gameId:gameId});
    Gamestats.remove({gameId:gameId});
    Gamesignups.remove({gameId:gameId});
    GlobalAlerts.remove({gameId:gameId});
    Hexes.remove({gameId:gameId});
    Market.remove({gameId:gameId});
    Markers.remove({gameId:gameId});
    MarkerGroups.remove({gameId:gameId});
    Markethistory.remove({gameId:gameId});
    Players.remove({gameId:gameId});
    Recentchats.remove({gameId:gameId});
    Rooms.remove({gameId:gameId});
    Roomchats.remove({gameId:gameId});
    Rounds.remove({gameId:gameId});
    Recentchats.remove({gameId:gameId});
    Villages.remove({gameId:gameId});
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
