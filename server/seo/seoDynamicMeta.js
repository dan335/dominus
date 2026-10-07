// Server side enrichment for the routes whose content comes from the database:
// /result/:gameId, /profile/:userId, /results, /rankings and /games.
//
// Turns the generic per-route metadata into a real title and description using
// the actual game name / username, decides whether the URL is a genuine 404,
// and renders the data itself (standings, game lists, rankings) into the
// crawlable block.  Hooked into SEO.resolve() through the `dynamic` key on
// those routes in lib/seo/seoRoutes.js.
//
// The data has to be in the server HTML.  The client loads it over DDP, which
// prefers WebSockets, and Googlebot does not support WebSockets - Search
// Console's crawled copy of /results was a heading and a loading spinner.
//
// Only /result and /profile ever 404.  /game/* and /forum* must always return
// 200 - the server can't tell whether the client is logged in (that redirect is
// client side), and 404ing a live player's game URL would be a real outage.
//
// Route regexes already shape-validate the id ([A-Za-z0-9]{6,32}) before we get
// here, so a bot spraying junk paths never reaches Mongo.
//
// Every handler falls back to the unenriched meta on error.  A throw here
// would otherwise land in the boilerplate callback's catch and cost the page
// its whole <head>.

var CACHE_MAX = 2000;
var CACHE_TTL = 5 * 60 * 1000;

var MAX_RESULTS_LISTED = 1000;
var MAX_RANKED_LISTED = 100;

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


function safely(name, meta, fn) {
  try {
    return fn() || meta;
  } catch (err) {
    console.error('[seo] dynamic ' + name + ' failed for', meta && meta.path, err && err.stack ? err.stack : err);
    return meta;
  }
}


function notFound(meta) {
  return _.extend({}, meta, SEO.NOT_FOUND, { canonical: meta.canonical });
}


// winningPlayer is {userId, username, ...} (see gameEndJob.js).  Printing the
// object itself is what put "Won by [object Object]" in result page titles.
function winnerOf(game) {
  var winner = game && game.winningPlayer;
  if (!winner) return null;
  if (typeof winner === 'string') return { username: winner };
  if (!winner.username) return null;
  return { username: String(winner.username), userId: winner.userId };
}


function profileLink(userId, username) {
  return userId ? { href: '/profile/' + userId, text: username } : (username || '');
}


function isoDay(value) {
  if (!value) return '';
  var date = (value instanceof Date) ? value : new Date(value);
  return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
}


function daysBetween(start, end) {
  if (!start || !end) return null;
  var ms = new Date(end).getTime() - new Date(start).getTime();
  if (isNaN(ms) || ms < 0) return null;
  return Math.max(1, Math.round(ms / 86400000));
}


function num(value) {
  var n = Math.round(Number(value) || 0);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}


function gameType(game) {
  var types = [];
  if (game.isCrazyFast || game.isSuperSpeed) types.push('Crazy fast');
  else if (game.isSpeed) types.push('Speed');
  else if (game.isRelaxed) types.push('Relaxed');
  else types.push('Regular');
  if (game.isKingOfHill) types.push('King of the hill');
  if (game.isProOnly) types.push('Pro only');
  return types.join(', ');
}


var GAME_TYPE_FIELDS = {
  isRelaxed: 1, isSpeed: 1, isSuperSpeed: 1, isCrazyFast: 1, isKingOfHill: 1, isProOnly: 1
};


function standingsHtml(results) {
  if (!results) return '';
  var out = [];

  if (results.numVassals && results.numVassals.length) {
    out.push(SEO.htmlHeading(2, 'Final standings by vassals'));
    out.push(SEO.htmlTable(['Rank', 'Player', 'Vassals'], results.numVassals.map(function(r) {
      return [r.rank, profileLink(r.userId, r.username), num(r.numVassals)];
    })));
  }

  if (results.income && results.income.length) {
    out.push(SEO.htmlHeading(2, 'Final standings by income'));
    out.push(SEO.htmlTable(['Rank', 'Player', 'Income'], results.income.map(function(r) {
      return [r.rank, profileLink(r.userId, r.username), num(r.income)];
    })));
  }

  if (results.lostSoldiers && results.lostSoldiers.length) {
    out.push(SEO.htmlHeading(2, 'Soldiers lost'));
    out.push(SEO.htmlTable(['Rank', 'Player', 'Soldiers lost', 'Worth'], results.lostSoldiers.map(function(r) {
      return [r.rank, profileLink(r.userId, r.username), num(r.lostSoldiersNum), num(r.lostSoldiersWorth)];
    })));
  }

  return out.join('\n');
}


SEO.dynamic = {

  result: function(meta, gameId) {
    return safely('result', meta, function() {
      var game = memo('game:' + gameId, function() {
        return Games.findOne(gameId, {
          fields: _.extend({
            name: 1, hasEnded: 1, startedAt: 1, endDate: 1, winningPlayer: 1,
            numPlayers: 1, maxPlayers: 1, desc: 1, results: 1
          }, GAME_TYPE_FIELDS)
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

      var winner = winnerOf(game);
      var title = name + ' Results' + (winner ? ' - Won by ' + winner.username : '') + ' | Dominus';
      var days = daysBetween(game.startedAt, game.endDate);

      var summary = name + ' was a ' + gameType(game).toLowerCase() + ' game of Dominus with ' + players +
        ' players' + (days ? ' that ran for ' + days + (days === 1 ? ' day' : ' days') : '') +
        (isoDay(game.startedAt) && isoDay(game.endDate)
          ? ', from ' + isoDay(game.startedAt) + ' to ' + isoDay(game.endDate) : '') + '.' +
        (winner ? ' ' + winner.username + ' became the Dominus and won the game.' : '');

      var html = [];
      html.push(SEO.htmlPara(summary));
      if (game.desc) html.push(SEO.htmlPara(game.desc));
      if (winner && winner.userId) {
        html.push('<p>Winner: <a href="/profile/' + SEO.esc(winner.userId) + '">' + SEO.esc(winner.username) + '</a></p>');
      }
      html.push(standingsHtml(game.results));

      return _.extend({}, meta, {
        robots: 'index',
        title: title,
        description: 'Final results for ' + name + ' in Dominus: ' + players + ' players' +
          (days ? ', ' + days + (days === 1 ? ' day' : ' days') : '') +
          (winner ? ', won by ' + winner.username : '') + '. See the full final standings.',
        crumb: [['/', 'Dominus'], ['/results', 'Results'], [null, name]],
        content: {
          h1: name + ' Results',
          lead: winner ? 'Won by ' + winner.username + '.' : 'A completed game of Dominus.',
          html: html.join('\n'),
          links: SEO.content.results.links
        }
      });
    });
  },


  profile: function(meta, userId) {
    return safely('profile', meta, function() {
      var profile = memo('profile:' + userId, function() {
        var user = Meteor.users.findOne(userId, { fields: { username: 1 } });
        if (!user) return null;

        var players = Players.find({ userId: userId, gameIsOver: true }, {
          fields: { gameId: 1, wonGame: 1, rankByIncome: 1, rankByVassals: 1 }
        }).fetch();

        var games = {};
        Games.find({ _id: { $in: _.pluck(players, 'gameId') } }, {
          fields: { name: 1, endDate: 1, numPlayers: 1 }
        }).forEach(function(game) { games[game._id] = game; });

        var rows = players.filter(function(player) {
          return games[player.gameId];
        }).map(function(player) {
          var game = games[player.gameId];
          return {
            gameId: player.gameId,
            name: game.name || 'Game',
            endDate: game.endDate,
            numPlayers: game.numPlayers || 0,
            won: !!player.wonGame,
            rankByVassals: player.rankByVassals,
            rankByIncome: player.rankByIncome
          };
        }).sort(function(a, b) {
          return new Date(b.endDate || 0).getTime() - new Date(a.endDate || 0).getTime();
        });

        return {
          username: user.username || 'Player',
          played: players.length,
          won: players.filter(function(player) { return player.wonGame; }).length,
          games: rows
        };
      });

      if (!profile) return notFound(meta);

      var name = profile.username;
      var played = profile.played;
      var won = profile.won;

      // no completed games means an empty page - crawl it, don't index it
      var thin = played === 0;

      // Built as escaped HTML, not markdown: Showdown passes inline HTML
      // through untouched, and the username is user input.
      var html = SEO.htmlPara(thin
        ? name + ' has not finished a game of Dominus yet.'
        : name + ' has played ' + played + ' completed ' + (played === 1 ? 'game' : 'games') +
          ' of Dominus and won ' + won + ' of them. Each game they took part in is listed below ' +
          'along with their final rank by income and by vassals.');

      if (profile.games.length) {
        html += SEO.htmlHeading(2, 'Completed games') +
          SEO.htmlTable(['Game', 'Ended', 'Players', 'Rank by vassals', 'Rank by income', 'Won'],
            profile.games.map(function(g) {
              return [
                { href: '/result/' + g.gameId, text: g.name },
                isoDay(g.endDate),
                g.numPlayers,
                g.rankByVassals || '',
                g.rankByIncome || '',
                g.won ? 'Yes' : ''
              ];
            }));
      }

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
          html: html,
          links: [
            ['/rankings', 'Player rankings'],
            ['/results', 'Past game results'],
            ['/games', 'Join a game'],
            ['/', 'Home']
          ]
        }
      });
    });
  },


  // /results - every finished game, each a real link to its own page.  The
  // client's list uses JavaScript toggles, so without this the result pages
  // are reachable only through the sitemap.
  results: function(meta) {
    return safely('results', meta, function() {
      var games = memo('list:results', function() {
        return Games.find({ hasEnded: true }, {
          fields: _.extend({ name: 1, endDate: 1, startedAt: 1, numPlayers: 1, winningPlayer: 1 }, GAME_TYPE_FIELDS),
          sort: { endDate: -1 },
          limit: MAX_RESULTS_LISTED
        }).fetch();
      });

      if (!games.length) return meta;

      var html = SEO.htmlHeading(2, 'Completed games') +
        SEO.htmlTable(['Game', 'Type', 'Ended', 'Days', 'Players', 'Winner'], games.map(function(game) {
          var winner = winnerOf(game);
          return [
            { href: '/result/' + game._id, text: game.name || 'Game' },
            gameType(game),
            isoDay(game.endDate),
            daysBetween(game.startedAt, game.endDate) || '',
            game.numPlayers || 0,
            winner ? profileLink(winner.userId, winner.username) : ''
          ];
        }));

      return _.extend({}, meta, {
        content: _.extend({}, SEO.content.results, { html: html })
      });
    });
  },


  rankings: function(meta) {
    return safely('rankings', meta, function() {
      function top(key) {
        var query = {};
        query[key + '.numGames'] = { $gt: 0 };
        query[key + '.overallRank'] = { $gt: 0 };
        var sort = {};
        sort[key + '.overallRank'] = 1;
        var fields = { username: 1 };
        fields[key] = 1;
        return Meteor.users.find(query, { fields: fields, sort: sort, limit: MAX_RANKED_LISTED }).fetch();
      }

      var lists = memo('list:rankings', function() {
        return { pro: top('rankingPro'), regular: top('rankingRegular') };
      });

      function table(users, key) {
        return SEO.htmlTable(['Rank', 'Player', 'Games', 'Wins', 'Overall points'], users.map(function(user) {
          var r = user[key] || {};
          return [r.overallRank, profileLink(user._id, user.username || 'Player'), r.numGames || 0, r.wins || 0, num(r.overallPoints)];
        }));
      }

      var html = [];
      if (lists.regular.length) html.push(SEO.htmlHeading(2, 'Regular games'), table(lists.regular, 'rankingRegular'));
      if (lists.pro.length) html.push(SEO.htmlHeading(2, 'Pro games'), table(lists.pro, 'rankingPro'));
      if (!html.length) return meta;

      return _.extend({}, meta, {
        content: _.extend({}, SEO.content.rankings, { html: html.join('\n') })
      });
    });
  },


  // /games - open and running games.  No links: joining needs an account and
  // /game/* is disallowed in robots.txt.
  games: function(meta) {
    return safely('games', meta, function() {
      var games = memo('list:games', function() {
        return Games.find({ hasEnded: false }, {
          fields: _.extend({ name: 1, numPlayers: 1, maxPlayers: 1, startAt: 1, hasStarted: 1 }, GAME_TYPE_FIELDS),
          sort: { startAt: -1 }
        }).fetch();
      });

      if (!games.length) return meta;

      function rows(list) {
        return list.map(function(game) {
          return [
            game.name || 'Game',
            gameType(game),
            (game.numPlayers || 0) + (game.maxPlayers ? ' / ' + game.maxPlayers : ''),
            isoDay(game.startAt)
          ];
        });
      }

      var upcoming = games.filter(function(game) { return !game.hasStarted; });
      var running = games.filter(function(game) { return game.hasStarted; });

      var html = [];
      if (upcoming.length) {
        html.push(SEO.htmlHeading(2, 'Starting soon'),
          SEO.htmlTable(['Game', 'Type', 'Players', 'Starts'], rows(upcoming)));
      }
      if (running.length) {
        html.push(SEO.htmlHeading(2, 'In progress'),
          SEO.htmlTable(['Game', 'Type', 'Players', 'Started'], rows(running)));
      }
      html.push('<p><a href="/createaccount">Create a free account</a> to join a game.</p>');

      return _.extend({}, meta, {
        content: _.extend({}, SEO.content.games, { html: html.join('\n') })
      });
    });
  }
};
