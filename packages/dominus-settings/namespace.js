// this is the old settings
// converting to _gs
_s = {};

// limit to fields that are settings
// the settings files only read these flags from the game
let settingsFields = {
  isRelaxed:1,
  isSpeed:1,
  isCrazyFast:1,
  isSuperSpeed:1,
  isKingOfHill:1,
  isProOnly:1,
  maxPlayers:1,
  isNoLargeResources:1
};

// settings might be different per game
// when server starts observe games and fill in cachedSettings
// with settings per game
_gs = {
  getGame: function(gameId) {
    let game = null;

    if (gameId) {
      if (Meteor.isServer) {
        game = _.find(cachedGames, function(cachedGame) {
          return cachedGame._id == gameId;
        });

        // games that are not running are not cached
        if (!game) {
          game = Games.findOne(gameId, {fields:settingsFields});
        }
      } else {
        game = Games.findOne(gameId);
      }
    }

    if (!game) {
      game = {};
    }

    return game;
  }
};





if (Meteor.isServer) {
  cachedGames = {};

  // exposed for server/bugFixTests.js
  _gs._cachedGames = cachedGames;

  let cacheGame = function(game) {
    if (game) {
      cachedGames[game._id] = game;
    }
  };

  let query = Games.find({hasStarted:true, hasEnded:false}, {fields:settingsFields});
  query.observe({
    added: function(game) {
      cacheGame(game);
    },
    changed: function(game, oldGame) {
      cacheGame(game);
    },
    removed: function(game) {
      delete cachedGames[game._id];
    }
  });
}



// get nested object value from string
// blah.wee.hrm = 'boob'
// objectValueFromString(blah, 'wee.hrm')
objectValueFromString = function(obj, path){
    for (var i=0, path=path.split('.'), len=path.length; i<len; i++){
        obj = obj[path[i]];
    };
    return obj;
};
