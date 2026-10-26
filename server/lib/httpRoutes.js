// Plain HTTP routes (robots.txt, the sitemaps, llms.txt, /astroepatreon).
//
// These used meteorhacks:picker, which doesn't work on Meteor 3. Routes match
// the way Picker matched them: on the path without its query string, ignoring
// case, with or without one trailing slash, for any method. Like Picker they
// are on WebApp.rawConnectHandlers, so they run before Meteor's static files,
// compression and the app's HTML, and anything that doesn't match falls
// through to those. (Meteor 3 renames rawConnectHandlers to rawHandlers.)
//
// A handler gets (req, res) and may be async. It runs in Meteor's environment
// (Meteor.bindEnvironment; on Meteor 2.16 that is a fiber, which the *Async
// collection calls still need there). If it throws or rejects, the request
// gets a 500 and the server carries on.

if (Meteor.isServer) {

  HttpRoutes = {};

  var escapeRegExp = function(s) {
    return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  };

  HttpRoutes.matcher = function(path) {
    return new RegExp('^' + escapeRegExp(path) + '\\/?$', 'i');
  };

  // the connect middleware for one route, exposed for server/httpRouteTests.js
  HttpRoutes.middleware = function(path, handler) {
    var pattern = HttpRoutes.matcher(path);
    var run = Meteor.bindEnvironment(async function(req, res) {
      try {
        await handler(req, res);
      } catch (err) {
        console.error('[http] ' + path + ' failed', err);
        if (!res.headersSent) {
          res.writeHead(500);
        }
        res.end();
      }
    });

    return function(req, res, next) {
      if (!pattern.test(req.url.replace(/\?.*/, ''))) {
        return next();
      }
      run(req, res);
    };
  };

  HttpRoutes.route = function(path, handler) {
    WebApp.rawConnectHandlers.use(HttpRoutes.middleware(path, handler));
  };
}
