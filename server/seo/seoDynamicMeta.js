// Server side enrichment for /result/:gameId and /profile/:userId.
//
// Turns the generic per-route metadata into a real title and description using
// the actual game name / username, and decides whether the URL is a genuine
// 404.  Hooked into SEO.resolve() through the `dynamic` key on those routes in
// lib/seo/seoRoutes.js.
//
// Only these two route shapes ever 404.  /game/* and /forum* must always return
// 200 - the server can't tell whether the client is logged in (that redirect is
// client side), and 404ing a live player's game URL would be a real outage.
//
// Route regexes already shape-validate the id ([A-Za-z0-9]{6,32}) before we get
// here, so a bot spraying junk paths never reaches Mongo.

var CACHE_MAX = 2000;
var CACHE_TTL = 5 * 60 * 1000;

var cache = {};
var cacheOrder = [];


function memo(key, fn) {
  var entry = cache[key];
  if (entry && (Date.now() - entry.at) < CACHE_TTL) return entry.value;

  var value = fn();
  cache[key] = { value: value, at: Date.now() };
  cacheOrder.push(key);

  while (cacheOrder.length > CACHE_MAX) {
    delete cache[cacheOrder.shift()];
  }

  return value;
}


function notFound(meta) {
  return _.extend({}, meta, SEO.NOT_FOUND, { canonical: meta.canonical });
}


SEO.dynamic = {

  result: function(meta, gameId) {
    var game = memo('game:' + gameId, function() {
      return Games.findOne(gameId, {
        fields: { name: 1, hasEnded: 1, endDate: 1, winningPlayer: 1, numPlayers: 1 }
      }) || null;
    });

    if (!game) return notFound(meta);

    var name = game.name || 'Game';
    var players = game.numPlayers || 0;

    if (!game.hasEnded) {
      // live game: real page, but standings change constantly and the game is
      // playable only when logged in, so don't put it in the index
      return _.extend({}, meta, {
        robots: 'noindex-follow',
        title: name + ' | Dominus',
        description: 'Live standings for ' + name + ', a game of Dominus with ' + players + ' players.',
        crumb: [['/', 'Dominus'], ['/results', 'Results'], [null, name]],
        content: {
          h1: name,
          lead: 'A game of Dominus in progress.',
          md: 'This game is still being played. ' + players + ' players have joined so far. ' +
            'Final standings will appear here once someone becomes the Dominus.',
          links: SEO.content.results.links
        }
      });
    }

    var winner = game.winningPlayer;
    var title = name + ' Results' + (winner ? ' - Won by ' + winner : '') + ' | Dominus';

    return _.extend({}, meta, {
      robots: 'index',
      title: title,
      description: 'Final results for ' + name + ' in Dominus: ' + players + ' players' +
        (winner ? ', won by ' + winner : '') + '. See the full final standings.',
      crumb: [['/', 'Dominus'], ['/results', 'Results'], [null, name]],
      content: {
        h1: name + ' Results',
        lead: winner ? 'Won by ' + winner + '.' : 'A completed game of Dominus.',
        md: name + ' was a game of Dominus with ' + players + ' players. ' +
          (winner ? winner + ' became the Dominus and won the game. ' : '') +
          'The full final standings for every player are listed on this page.',
        links: SEO.content.results.links
      }
    });
  },


  profile: function(meta, userId) {
    var profile = memo('profile:' + userId, function() {
      var user = Meteor.users.findOne(userId, { fields: { username: 1 } });
      if (!user) return null;

      return {
        username: user.username || 'Player',
        played: Players.find({ userId: userId, gameIsOver: true }).count(),
        won: Players.find({ userId: userId, gameIsOver: true, wonGame: true }).count()
      };
    });

    if (!profile) return notFound(meta);

    var name = profile.username;
    var played = profile.played;
    var won = profile.won;

    // no completed games means an empty page - crawl it, don't index it
    var thin = played === 0;

    return _.extend({}, meta, {
      robots: thin ? 'noindex-follow' : 'index',
      title: name + ' - Player Profile | Dominus',
      description: thin
        ? name + ' is a Dominus player. No completed games yet.'
        : name + ' has played ' + played + ' completed ' + (played === 1 ? 'game' : 'games') +
          ' of Dominus and won ' + won + '.',
      crumb: [['/', 'Dominus'], ['/rankings', 'Rankings'], [null, name]],
      content: {
        h1: name,
        lead: 'Dominus player profile.',
        md: thin
          ? name + ' has not finished a game of Dominus yet.'
          : name + ' has played ' + played + ' completed ' + (played === 1 ? 'game' : 'games') +
            ' of Dominus and won ' + won + ' of them. Each game they took part in is listed on ' +
            'this page along with their final rank by income and by vassals.',
        links: [
          ['/rankings', 'Player rankings'],
          ['/results', 'Past game results'],
          ['/games', 'Join a game'],
          ['/', 'Home']
        ]
      }
    });
  }
};
