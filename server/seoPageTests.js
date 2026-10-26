// The pages whose crawlable content comes from the database (upgrade PR 17,
// Oct 2026): /result/:gameId, /profile/:userId, /results, /rankings and /games,
// built by server/seo/seoDynamicMeta.js inside the boilerplate callback
// (server/seo/seoBoilerplate.js). Each page is fetched over HTTP, the way a
// crawler sees it.
//
// The result and profile pages of a fixed set of games and players are
// compared, head and body, with tests/golden/seo.json, which was recorded from
// the code before the pages read the database asynchronously. A change meant
// to change those pages needs that file recorded again: each run writes what it
// got to .test-results/seo/actual.json. The lists hold every game and player in
// the database, so for them the tests check the fixture's rows instead.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the same rule
// applies: only against a local development database.

if (Meteor.isServer) {

  var fs = Npm.require('fs');
  var path = Npm.require('path');
  var http = Npm.require('http');

  var GOLDEN = 'tests/golden/seo.json';

  Meteor.startup(function() {
    dTest.addSuite('SEO pages (server/seoPageTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;

      var repoPath = function(file) { return path.join(dTest.appDir(), file); };

      // --- Fixture: fixed ids, names and dates, so the pages come out the same every run ---

      var day = function(d) { return new Date(Date.UTC(2026, 0, d, 12, 0, 0)); };

      var IDS = {
        ended: 'seoTestGameEnded1', older: 'seoTestGameOlder1', live: 'seoTestGameLive01',
        soon: 'seoTestGameSoon01', missingGame: 'seoTestGameNone01',
        winner: 'seoTestUserWin01', second: 'seoTestUserTwo01', thin: 'seoTestUserThin1',
        missingUser: 'seoTestUserNone1'
      };

      var standings = function(ranks) {
        return {
          numVassals: ranks.map(function(r, i) { return {rank: i + 1, userId: r[0], username: r[1], numVassals: r[2]}; }),
          income: ranks.map(function(r, i) { return {rank: i + 1, userId: r[0], username: r[1], income: r[3]}; }),
          lostSoldiers: ranks.map(function(r, i) { return {rank: i + 1, userId: r[0], username: r[1], lostSoldiersNum: r[4], lostSoldiersWorth: r[5]}; })
        };
      };

      var removeFixture = function() {
        Games.remove({_id: {$in: [IDS.ended, IDS.older, IDS.live, IDS.soon]}});
        Players.remove({gameId: {$in: [IDS.ended, IDS.older, IDS.live]}});
        Meteor.users.remove({_id: {$in: [IDS.winner, IDS.second, IDS.thin]}});
      };

      // isStarting and a start in 2099 keep the game start job away from the
      // upcoming game: a real start bakes the map to S3
      var insertFixture = function() {
        removeFixture();
        Meteor.users.insert({_id: IDS.winner, username: 'seo_test_<winner>',
          rankingRegular: {numGames: 2, wins: 1, overallRank: 1, overallPoints: 1234567},
          rankingPro: {numGames: 1, wins: 0, overallRank: 2, overallPoints: 999}});
        Meteor.users.insert({_id: IDS.second, username: 'seo_test_second',
          rankingRegular: {numGames: 1, wins: 0, overallRank: 2, overallPoints: 50.6}});
        Meteor.users.insert({_id: IDS.thin, username: 'seo_test_thin'});

        Games.insert({_id: IDS.ended, name: 'SEO <Test> & "Game"', hasEnded: true, hasStarted: true,
          startedAt: day(1), endDate: day(15), numPlayers: 3, maxPlayers: 10, isSpeed: true, isKingOfHill: true,
          desc: 'A game made for the SEO tests.', winningPlayer: {userId: IDS.winner, username: 'seo_test_<winner>'},
          results: standings([[IDS.winner, 'seo_test_<winner>', 4, 123456.7, 10, 2500], [IDS.second, 'seo_test_second', 1, 900, 1200, 300000]])});
        Games.insert({_id: IDS.older, name: 'SEO Older Game', hasEnded: true, hasStarted: true,
          startedAt: day(2), endDate: day(3), numPlayers: 2, isProOnly: true, winningPlayer: 'seo_test_second'});
        Games.insert({_id: IDS.live, name: 'SEO Live Game', hasEnded: false, hasStarted: true, startAt: day(20), numPlayers: 2, maxPlayers: 8, isCrazyFast: true});
        Games.insert({_id: IDS.soon, name: 'SEO Soon Game', hasEnded: false, hasStarted: false, isStarting: true, startAt: new Date(Date.UTC(2099, 0, 28, 12, 0, 0)), numPlayers: 0, isRelaxed: true});

        Players.insert({gameId: IDS.ended, userId: IDS.winner, gameIsOver: true, wonGame: true, rankByVassals: 1, rankByIncome: 1});
        Players.insert({gameId: IDS.older, userId: IDS.winner, gameIsOver: true, wonGame: false, rankByVassals: 2, rankByIncome: 2});
        Players.insert({gameId: IDS.ended, userId: IDS.second, gameIsOver: true, wonGame: false, rankByVassals: 2, rankByIncome: 2});
        Players.insert({gameId: IDS.live, userId: IDS.thin, gameIsOver: false});
      };

      // --- Fetching pages ---

      function request(urlPath) {
        return dTest.settle(new Promise(function(resolve, reject) {
          var req = http.request({host: '127.0.0.1', port: process.env.PORT, method: 'GET', path: urlPath, headers: {accept: 'text/html'}}, function(res) {
            var body = '';
            res.setEncoding('utf8');
            res.on('data', function(chunk) { body += chunk; });
            res.on('end', function() { resolve({status: res.statusCode, headers: res.headers, body: body}); });
          });
          req.on('error', reject);
          req.end();
        }));
      }

      // the part of the page the SEO code wrote: the end of <head>, and the
      // crawlable block in <body>
      function page(urlPath) {
        var res = request(urlPath);
        var html = res.body;
        var headAt = html.indexOf('<title>');
        var headEnd = html.indexOf('</head>');
        var bodyAt = html.indexOf('<div id="seoSsr"');
        var bodyEnd = bodyAt == -1 ? -1 : html.indexOf('<script', bodyAt);
        return {
          status: res.status,
          robotsHeader: res.headers['x-robots-tag'] || null,
          head: headAt == -1 || headEnd < headAt ? null : html.slice(headAt, headEnd).trim(),
          body: bodyAt == -1 ? null : html.slice(bodyAt, bodyEnd == -1 ? undefined : bodyEnd).trim()
        };
      }

      var title = function(p) {
        var m = p.head && p.head.match(/<title>([^<]*)<\/title>/);
        return m ? m[1] : null;
      };

      // as production serves them: robots from each page, not the dev blanket
      function asProduction(fn) {
        var was = SEO.IS_DEV;
        SEO.IS_DEV = false;
        SEO.clearDynamicCache();
        try {
          return fn();
        } finally {
          SEO.IS_DEV = was;
          SEO.clearDynamicCache();
        }
      }

      var PAGES = {
        resultEnded: '/result/' + IDS.ended,
        resultOlder: '/result/' + IDS.older,
        resultLive: '/result/' + IDS.live,
        resultMissing: '/result/' + IDS.missingGame,
        profileWinner: '/profile/' + IDS.winner,
        profileThin: '/profile/' + IDS.thin,
        profileMissing: '/profile/' + IDS.missingUser
      };

      var pagesOnce = null;
      var fetchPages = function() {
        if (!pagesOnce) {
          pagesOnce = asProduction(function() {
            var out = {};
            _.each(PAGES, function(urlPath, key) { out[key] = page(urlPath); });
            return out;
          });
          var dir = repoPath('.test-results/seo');
          fs.mkdirSync(dir, {recursive: true});
          fs.writeFileSync(path.join(dir, 'actual.json'), JSON.stringify({pages: pagesOnce}, null, 1) + '\n');
        }
        return pagesOnce;
      };

      try {
        insertFixture();

        run('SEO pages: a finished game\'s result page has its name, winner and standings, escaped', function() {
          var p = fetchPages().resultEnded;
          equal(p.status, 200, 'status');
          equal(p.robotsHeader, null, 'no X-Robots-Tag: it is indexed');
          equal(title(p), 'SEO &lt;Test&gt; &amp; &quot;Game&quot; Results - Won by seo_test_&lt;winner&gt; | Dominus', 'title');
          assert(p.head.indexOf('<meta name="robots" content="index, follow') != -1, 'robots meta: index');
          assert(p.body.indexOf('was a speed, king of the hill game of Dominus with 3 players that ran for 14 days, from 2026-01-01 to 2026-01-15.') != -1, 'the summary');
          assert(p.body.indexOf('<a href="/profile/' + IDS.winner + '">seo_test_&lt;winner&gt;</a>') != -1, 'a link to the winner');
          assert(p.body.indexOf('<td>123,457</td>') != -1, 'income rounded with commas');
          assert(p.body.indexOf('<td>300,000</td>') != -1, 'soldiers lost worth');
          assert(p.body.indexOf('<Test>') == -1 && p.head.indexOf('<Test>') == -1, 'the name is escaped everywhere');
        });

        run('SEO pages: a live game\'s page is not indexed, and an unknown game is a 404', function() {
          var pages = fetchPages();
          equal(pages.resultLive.status, 200, 'a live game: 200');
          equal(pages.resultLive.robotsHeader, 'noindex, follow', 'not indexed');
          equal(title(pages.resultLive), 'SEO Live Game | Dominus', 'its title');
          assert(pages.resultLive.body.indexOf('2 players have joined so far.') != -1, 'its players');
          equal(pages.resultMissing.status, 404, 'an unknown game: 404');
          equal(pages.resultOlder.status, 200, 'a game whose winner is only a name: 200');
          equal(title(pages.resultOlder), 'SEO Older Game Results - Won by seo_test_second | Dominus', 'its title');
        });

        run('SEO pages: a profile lists its finished games, newest first; one with none is not indexed; an unknown user is a 404', function() {
          var pages = fetchPages();
          var p = pages.profileWinner;
          equal(p.status, 200, 'status');
          equal(title(p), 'seo_test_&lt;winner&gt; - Player Profile | Dominus', 'title');
          assert(p.body.indexOf('has played 2 completed games of Dominus and won 1 of them.') != -1, 'played and won');
          var newer = p.body.indexOf('/result/' + IDS.ended);
          var older = p.body.indexOf('/result/' + IDS.older);
          assert(newer != -1 && older != -1 && newer < older, 'both games, newest first');
          equal(pages.profileThin.status, 200, 'no finished games: 200');
          equal(pages.profileThin.robotsHeader, 'noindex, follow', 'not indexed');
          assert(pages.profileThin.body.indexOf('seo_test_thin has not finished a game of Dominus yet.') != -1, 'says so');
          equal(pages.profileMissing.status, 404, 'an unknown user: 404');
        });

        run('SEO pages: every result and profile page matches the pages recorded before (tests/golden/seo.json)', function() {
          var pages = fetchPages();
          var goldenFile = repoPath(GOLDEN);
          if (!fs.existsSync(goldenFile)) {
            throw new Error('FAIL: no ' + GOLDEN + ' to compare with (record it from .test-results/seo/actual.json)');
          }
          var golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8')).pages;
          equal(_.keys(golden).sort().join(','), _.keys(pages).sort().join(','), 'the same pages');
          _.each(golden, function(expected, key) {
            _.each(expected, function(value, field) {
              equal(JSON.stringify(pages[key][field]), JSON.stringify(value), key + ' ' + field);
            });
          });
        });

        run('SEO pages: /results lists finished games newest first, linked, with the winner', function() {
          var p = asProduction(function() { return page('/results'); });
          equal(p.status, 200, 'status');
          var ended = p.body.indexOf('<a href="/result/' + IDS.ended + '">SEO &lt;Test&gt; &amp; &quot;Game&quot;</a>');
          var older = p.body.indexOf('<a href="/result/' + IDS.older + '">SEO Older Game</a>');
          assert(ended != -1 && older != -1 && ended < older, 'both games, newest first');
          assert(p.body.indexOf('<td>Speed, King of the hill</td><td>2026-01-15</td><td>14</td><td>3</td><td><a href="/profile/' + IDS.winner + '">seo_test_&lt;winner&gt;</a></td>') != -1, 'the finished game\'s row');
          assert(p.body.indexOf('<td>Regular, Pro only</td><td>2026-01-03</td><td>1</td><td>2</td><td>seo_test_second</td>') != -1, 'a winner without an id is not linked');
          equal(p.body.indexOf(IDS.live), -1, 'a live game is not listed');
        });

        run('SEO pages: /rankings lists ranked players by rank, regular and pro', function() {
          var p = asProduction(function() { return page('/rankings'); });
          equal(p.status, 200, 'status');
          var regular = p.body.indexOf('<h2>Regular games</h2>');
          var pro = p.body.indexOf('<h2>Pro games</h2>');
          assert(regular != -1 && pro > regular, 'both tables, regular first');
          assert(p.body.indexOf('<td>1</td><td><a href="/profile/' + IDS.winner + '">seo_test_&lt;winner&gt;</a></td><td>2</td><td>1</td><td>1,234,567</td>') != -1, 'the winner\'s regular row');
          assert(p.body.indexOf('<td>2</td><td><a href="/profile/' + IDS.second + '">seo_test_second</a></td><td>1</td><td>0</td><td>51</td>') != -1, 'the second\'s row, points rounded');
          assert(p.body.indexOf('<td>2</td><td><a href="/profile/' + IDS.winner + '">seo_test_&lt;winner&gt;</a></td><td>1</td><td>0</td><td>999</td>', pro) != -1, 'the winner\'s pro row');
          equal(p.body.indexOf(IDS.thin), -1, 'an unranked player is not listed');
        });

        run('SEO pages: /games lists games starting soon and in progress, without links', function() {
          var p = asProduction(function() { return page('/games'); });
          equal(p.status, 200, 'status');
          var soon = p.body.indexOf('<td>SEO Soon Game</td><td>Relaxed</td><td>0</td><td>2099-01-28</td>');
          var live = p.body.indexOf('<td>SEO Live Game</td><td>Crazy fast</td><td>2 / 8</td><td>2026-01-20</td>');
          var soonHeading = p.body.indexOf('<h2>Starting soon</h2>');
          var liveHeading = p.body.indexOf('<h2>In progress</h2>');
          assert(soonHeading != -1 && soon > soonHeading && soon < liveHeading, 'the upcoming game, under Starting soon');
          assert(live > liveHeading, 'the live game, under In progress');
          equal(p.body.indexOf('SEO Older Game'), -1, 'a finished game is not listed');
          assert(p.body.indexOf('<a href="/createaccount">Create a free account</a>') != -1, 'the signup link');
        });

        run('SEO pages: a page is read from the database once in five minutes', function() {
          asProduction(function() {
            equal(title(page(PAGES.resultOlder)), 'SEO Older Game Results - Won by seo_test_second | Dominus', 'first');
            Games.update(IDS.older, {$set: {name: 'SEO Renamed Game'}});
            try {
              equal(title(page(PAGES.resultOlder)), 'SEO Older Game Results - Won by seo_test_second | Dominus', 'the rename is not read again yet');
              SEO.clearDynamicCache();
              equal(title(page(PAGES.resultOlder)), 'SEO Renamed Game Results - Won by seo_test_second | Dominus', 'once the cache is cleared it is');
            } finally {
              Games.update(IDS.older, {$set: {name: 'SEO Older Game'}});
            }
          });
        });

        run('SEO pages: if building a page fails, it falls back to the route\'s own title, logs the error, and the page still answers', function() {
          var errors = [];
          var error = console.error;
          var htmlPara = SEO.htmlPara;
          var p;
          console.error = function() { errors.push(_.toArray(arguments).join(' ')); };
          SEO.htmlPara = function() { throw new Error('planted'); };
          try {
            p = asProduction(function() { return page(PAGES.resultEnded); });
          } finally {
            SEO.htmlPara = htmlPara;
            console.error = error;
          }
          equal(p.status, 200, 'status');
          equal(title(p), 'Game Results | Dominus', 'the route\'s own title');
          equal(errors.length, 1, 'one error logged');
          assert(errors[0] && errors[0].indexOf('[seo] dynamic result failed for /result/' + IDS.ended) === 0, 'naming the page: ' + errors[0]);
          assert(errors[0] && errors[0].indexOf('planted') != -1, 'with the error');
        });

      } finally {
        removeFixture();
        SEO.clearDynamicCache();
      }
    });
  });
}
