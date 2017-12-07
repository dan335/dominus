// this is the old settings
// converting to _gs
_s = {};

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

        if (!game) {
          game = Games.findOne(gameId);
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

  // limit to fields that are settings
  let fields = {
    isRelaxed:1,
    isSpeed:1,
    isCrazyFast:1,
    isKingOfHill:1,
    isProOnly:1,
    maxPlayers:1
  };

  let cacheGame = function(game) {
    if (game) {
      cachedGames[game._id] = game;
    }
  };

  let query = Games.find({hasStarted:true, hasEnded:false}, {fields:fields});
  query.observe({
    added: function(game) {
      cacheGame(game);
    },
    changed: function(game, oldGame) {
      cacheGame(game);
    },
    removed: function(game) {
      cacheGame(game);
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
