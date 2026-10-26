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

// settings might be different per game. On the server every game is kept in
// a cache (cachedGames, below), so reading a setting never waits on the
// database: _gs stays synchronous through the Meteor 3 upgrade, where a
// server-side findOne no longer works without await.
let cacheMiss = null;
_gs = {
  getGame: function(gameId) {
    let game = null;

    if (gameId) {
      if (Meteor.isServer) {
        game = _.has(cachedGames, gameId) ? cachedGames[gameId] : null;
        if (!game) {
          game = cacheMiss(gameId);
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

  // exposed for server/asyncFoundationTests.js and server/bugFixTests.js
  _gs._cachedGames = cachedGames;
  _gs._settingsFields = settingsFields;

  let cacheGame = function(game) {
    if (game) {
      cachedGames[game._id] = _.pick(game, ['_id'].concat(_.keys(settingsFields)));
    }
  };

  // A game that isn't in the cache: a new game that the observer below hasn't
  // seen yet, or a gameId that isn't a game. Every caller that can see a
  // brand-new game should have awaited _gs.ensureGame first (jobs and game
  // methods do), so this logs where it was called from, once per game. The
  // server can't read the game here without waiting, so it reads as {}: every
  // setting has its default value.
  let missesLogged = {};
  _gs._missesLogged = missesLogged;
  cacheMiss = function(gameId) {
    if (!missesLogged[gameId]) {
      missesLogged[gameId] = true;
      console.error('_gs: game ' + gameId + ' is not in the settings cache; await _gs.ensureGame(gameId) first\n' +
        new Error('settings cache miss').stack);
    }
    return null;
  };

  // adds a game to the cache right away, for the code that inserts it
  _gs.cacheGame = cacheGame;

  // makes sure a game is in the cache before its settings are read
  _gs.ensureGame = async function(gameId) {
    if (typeof gameId !== 'string' || _.has(cachedGames, gameId)) {
      return;
    }
    cacheGame(await Games.findOneAsync(gameId, {fields:settingsFields}));
  };

  // Fills the cache with every game, then keeps it up to date. Games are only
  // removed by hand (control panel, tests), so the cache holds every game the
  // database has; a game is a few booleans. _gs.ready resolves once the cache
  // is full; the worker waits for it before it takes jobs (dominus-queue).
  // Meteor 3's observe may deliver its first documents after it returns, so
  // the cache is filled by a query first.
  _gs._fill = async function() {
    await Games.find({}, {fields:settingsFields}).forEachAsync(cacheGame);
  };
  _gs.ready = (async function() {
    await _gs._fill();
    await Games.find({}, {fields:settingsFields}).observeAsync({
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
  })().catch(function(error) {
    console.error('_gs: could not fill the settings cache', error);
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
