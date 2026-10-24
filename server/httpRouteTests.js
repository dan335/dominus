// HTTP routes (Oct 2026): server/lib/httpRoutes.js and the routes on it
// (robots.txt, the sitemaps, llms.txt, /astroepatreon), which used
// meteorhacks:picker until upgrade PR 2. The matching tests pin down how
// Picker matched, so nothing that worked before stops working.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  var http = Npm.require('http');

  Meteor.startup(function() {
    dTest.addSuite('HTTP routes (server/httpRouteTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;


      // --- Helpers ---

      // a request to this server, straight to its port: {status, headers, body}
      function request(method, path) {
        return dTest.settle(new Promise(function(resolve, reject) {
          var req = http.request({host: '127.0.0.1', port: process.env.PORT, method: method, path: path}, function(res) {
            var body = '';
            res.setEncoding('utf8');
            res.on('data', function(chunk) { body += chunk; });
            res.on('end', function() { resolve({status: res.statusCode, headers: res.headers, body: body}); });
          });
          req.on('error', reject);
          req.end();
        }));
      }

      // a stand-in for Node's response, enough for the router
      function fakeResponse() {
        var res = {status: null, headersSent: false, ended: false};
        res.writeHead = function(status) { res.status = status; res.headersSent = true; };
        res.end = function() { res.ended = true; };
        return res;
      }

      // calls a route's middleware with a fake request; resolves when the route
      // has ended the response or passed it on
      function dispatch(middleware, url) {
        var res = fakeResponse();
        var passed = false;
        middleware({url: url, method: 'GET'}, res, function() { passed = true; });
        for (var i = 0; i < 200 && !passed && !res.ended; i++) dTest.sleep(5);
        return {passed: passed, res: res};
      }

      function withSeo(isDev, fn) {
        var was = SEO.IS_DEV;
        SEO.IS_DEV = isDev;
        SEO.clearSitemapCache();
        try {
          return fn();
        } finally {
          SEO.IS_DEV = was;
          SEO.clearSitemapCache();
        }
      }


      // --- Matching, the way Picker matched (path-to-regexp 1.0.1) ---

      run('a route matches its path ignoring case, a query string and one trailing slash', function() {
        var cases = {
          '/robots.txt': true, '/ROBOTS.TXT': true, '/Robots.Txt': true, '/robots.txt/': true,
          '/robots.txt?x=1': true, '/robots.txt/?x=1&y=2': true,
          '/robots.txt//': false, '//robots.txt': false, '/robots.txtx': false, '/robotsXtxt': false,
          '/robots.txt/x': false, '/x/robots.txt': false, '/robots': false, '/': false
        };
        var middleware = HttpRoutes.middleware('/robots.txt', function(req, res) { res.end(); });
        _.each(cases, function(matches, url) {
          equal(dispatch(middleware, url).passed, !matches, url + (matches ? ' is handled' : ' falls through'));
        });
      });

      run('special characters in a route are matched literally', function() {
        var middleware = HttpRoutes.middleware('/sitemap-static.xml', function(req, res) { res.end(); });
        equal(dispatch(middleware, '/sitemap-static.xml').passed, false, 'the route itself');
        equal(dispatch(middleware, '/sitemap-staticXxml').passed, true, 'a dot is not any character');
      });


      // --- Failures ---

      run('a route that throws answers 500 and the server carries on', function() {
        var middleware = HttpRoutes.middleware('/throws', function() { throw new Error('planted'); });
        var out = dispatch(middleware, '/throws');
        equal(out.res.status, 500, 'status');
        assert(out.res.ended, 'the response is ended');
        equal(dispatch(middleware, '/throws').res.status, 500, 'and again');
      });

      run('an async route that rejects answers 500, without an unhandled rejection', function() {
        var middleware = HttpRoutes.middleware('/rejects', async function() {
          await Promise.resolve();
          throw new Error('planted');
        });
        var out = dispatch(middleware, '/rejects');
        equal(out.res.status, 500, 'status');
        assert(out.res.ended, 'the response is ended');
      });

      run('a route that fails after sending its headers just ends the response', function() {
        var middleware = HttpRoutes.middleware('/half', function(req, res) {
          res.writeHead(200);
          throw new Error('planted');
        });
        var out = dispatch(middleware, '/half');
        equal(out.res.status, 200, 'the status already sent stands');
        assert(out.res.ended, 'the response is ended');
      });

      run('a route called outside a Fiber gets one, so the synchronous collection API works', function() {
        var found;
        var middleware = HttpRoutes.middleware('/fiber', function(req, res) {
          found = Games.findOne({}, {fields: {_id: 1}}) || null;
          res.end();
        });
        var res = fakeResponse();
        // Node's own timer, not Meteor's, so the call starts outside any Fiber
        setTimeout(function() { middleware({url: '/fiber', method: 'GET'}, res, function() {}); }, 0);
        for (var i = 0; i < 200 && !res.ended; i++) dTest.sleep(5);
        assert(res.ended, 'the response is ended');
        equal(res.status, null, 'no error');
        assert(found !== undefined, 'findOne ran');
      });


      // --- The routes themselves, over HTTP ---

      run('robots.txt: plain text, a blanket Disallow on dev, the sitemap in production', function() {
        withSeo(true, function() {
          var res = request('GET', '/robots.txt');
          equal(res.status, 200, 'status on dev');
          equal(res.headers['content-type'], 'text/plain; charset=utf-8', 'content type');
          equal(res.body, 'User-agent: *\nDisallow: /\n', 'dev asks everyone to stay away');
        });
        withSeo(false, function() {
          var res = request('GET', '/robots.txt');
          equal(res.headers['cache-control'], 'public, max-age=3600', 'cache control');
          equal(res.body, SEO.robotsTxt(), 'the production text');
          assert(res.body.indexOf('Sitemap: ' + SEO.ORIGIN + '/sitemap.xml') != -1, 'names the sitemap');
          equal(request('POST', '/ROBOTS.TXT/?a=b').body, res.body, 'any method, case, trailing slash and query string');
        });
      });

      run('sitemaps: only in production; players with a finished game, once each, and finished games newest first', function() {
        var stamp = Random.id(6);
        var g1 = 'rt_' + stamp + '_old', g2 = 'rt_' + stamp + '_new', g3 = 'rt_' + stamp + '_running';
        var u1 = 'rt_' + stamp + '_u1', u2 = 'rt_' + stamp + '_u2', u3 = 'rt_' + stamp + '_u3';
        try {
          Games.insert({_id: g1, name: 'RT old', hasEnded: true, endDate: new Date('2026-01-02T03:04:05Z')});
          Games.insert({_id: g2, name: 'RT new', hasEnded: true, endDate: new Date('2026-02-02T03:04:05Z')});
          Games.insert({_id: g3, name: 'RT running', hasEnded: false});
          Players.insert({gameId: g1, userId: u1, gameIsOver: true});
          Players.insert({gameId: g2, userId: u1, gameIsOver: true});
          Players.insert({gameId: g2, userId: u2, gameIsOver: true});
          Players.insert({gameId: g3, userId: u3, gameIsOver: false});

          withSeo(true, function() {
            equal(request('GET', '/sitemap.xml').status, 404, 'no sitemap on dev');
            equal(request('GET', '/sitemap-players.xml').status, 404, 'nor its children');
          });

          withSeo(false, function() {
            var index = request('GET', '/sitemap.xml');
            equal(index.status, 200, 'the index');
            equal(index.headers['content-type'], 'application/xml; charset=utf-8', 'content type');
            equal(index.headers['cache-control'], 'public, max-age=21600', 'cache control');
            ['sitemap-static.xml', 'sitemap-games.xml', 'sitemap-players.xml'].forEach(function(key) {
              assert(index.body.indexOf('<loc>' + SEO.ORIGIN + '/' + key + '</loc>') != -1, 'the index lists ' + key);
            });

            var players = request('GET', '/sitemap-players.xml').body;
            var count = function(s) { return players.split(s).length - 1; };
            equal(count('/profile/' + u1 + '<'), 1, 'a player with two finished games is listed once');
            equal(count('/profile/' + u2 + '<'), 1, 'a player with one finished game is listed');
            equal(count('/profile/' + u3 + '<'), 0, 'a player whose game is still running is not');

            var games = request('GET', '/sitemap-games.xml').body;
            var at1 = games.indexOf('/result/' + g1 + '<'), at2 = games.indexOf('/result/' + g2 + '<');
            assert(at1 != -1 && at2 != -1, 'both finished games are listed');
            assert(at2 < at1, 'the newer one first');
            assert(games.indexOf('<lastmod>2026-02-02</lastmod>') != -1, 'with the day it ended');
            equal(games.indexOf('/result/' + g3 + '<'), -1, 'a running game is not listed');

            assert(request('GET', '/sitemap-static.xml').body.indexOf('<loc>' + SEO.ORIGIN + '/</loc>') != -1, 'the static pages include the home page');
          });
        } finally {
          Players.remove({userId: {$in: [u1, u2, u3]}});
          Games.remove({_id: {$in: [g1, g2, g3]}});
        }
      });

      run('llms.txt and llms-full.txt: markdown', function() {
        var index = request('GET', '/llms.txt');
        equal(index.status, 200, 'llms.txt');
        equal(index.headers['content-type'], 'text/markdown; charset=utf-8', 'content type');
        equal(index.body, SEO.llmsIndex(), 'the index');
        equal(request('GET', '/llms-full.txt').body, SEO.llmsFull(), 'the full text');
      });

      run('/astroepatreon tells astroe and dominus 2 about a Patreon update and answers at once', function() {
        var urls = [];
        var get = HTTP.get;
        HTTP.get = function(url) { urls.push(url); };
        try {
          var res = request('GET', '/astroepatreon');
          equal(res.status, 200, 'status');
          equal(res.body, '', 'no body');
          equal(urls.join(' '), 'http://astroe.io/patreonsync http://dominus2.io/patreonsync', 'both told');
        } finally {
          HTTP.get = get;
        }
      });

      run('anything else falls through to the app', function() {
        ['/robots.txtx', '/sitemap-nothing.xml', '/llms.txt.bak', '/astroepatreon/x'].forEach(function(path) {
          var res = request('GET', path);
          assert(/^text\/html/.test(res.headers['content-type']), path + ' gets the app\'s page');
        });
      });
    });
  });
}
