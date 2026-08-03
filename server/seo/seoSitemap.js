// /sitemap.xml plus its child sitemaps.
//
// A sitemap index rather than one flat file, so the dynamic result and profile
// URLs can grow without ever bumping into the 50,000 URL / 50 MB per-file
// limit.
//
// Everything is cached in process for 6 hours.  Multi-container deploys just
// build once per container, which is fine at this scale.

var MAX_GAMES = 5000;
var MAX_PLAYERS = 5000;
var TTL = 6 * 60 * 60 * 1000;

var cache = {};


function isoDate(value) {
  try {
    var date = (value instanceof Date) ? value : new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  } catch (err) {
    return null;
  }
}


function urlset(urls) {
  var body = urls.map(function(url) {
    return '  <url><loc>' + SEO.esc(SEO.ORIGIN + url.loc) + '</loc>' +
      (url.lastmod ? '<lastmod>' + url.lastmod + '</lastmod>' : '') +
      '<changefreq>' + (url.freq || 'weekly') + '</changefreq>' +
      '<priority>' + (url.pri || '0.5') + '</priority></url>';
  }).join('\n');

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '\n</urlset>\n';
}


var distinctUserIds = Meteor.wrapAsync(function(query, callback) {
  Players.rawCollection().distinct('userId', query, callback);
});


var builders = {

  'sitemap-static.xml': function() {
    var urls = SEO.routes.filter(function(route) {
      return route.path && route.robots === 'index';
    }).map(function(route) {
      var pri = '0.6';
      if (route.path === '/') pri = '1.0';
      else if (route.path === '/guide') pri = '0.9';
      else if (route.path === '/games') pri = '0.8';
      else if (route.path === '/privacy' || route.path === '/terms') pri = '0.3';

      return {
        loc: route.path,
        freq: route.path === '/games' ? 'hourly' : 'weekly',
        pri: pri
      };
    });
    return urlset(urls);
  },

  'sitemap-games.xml': function() {
    // sort by endDate desc so the cap drops the oldest, least valuable games
    var urls = Games.find({ hasEnded: true }, {
      fields: { endDate: 1 },
      sort: { endDate: -1 },
      limit: MAX_GAMES
    }).map(function(game) {
      return {
        loc: '/result/' + game._id,
        lastmod: isoDate(game.endDate),
        freq: 'yearly',
        pri: '0.4'
      };
    });
    return urlset(urls);
  },

  'sitemap-players.xml': function() {
    // Only players with at least one finished game - that is all /profile has
    // anything to render for.
    //
    // Dedup in Mongo rather than in JS: a player has one doc per game, so
    // streaming every one of them back just to throw away duplicates would
    // scale with games-times-players.
    var userIds = distinctUserIds({ gameIsOver: true });

    var urls = userIds.slice(0, MAX_PLAYERS).filter(Boolean).map(function(userId) {
      return { loc: '/profile/' + userId, freq: 'monthly', pri: '0.3' };
    });

    if (userIds.length > MAX_PLAYERS) {
      console.log('[seo] sitemap-players capped at ' + MAX_PLAYERS + ' of ' + userIds.length + ' players');
    }

    return urlset(urls);
  }
};


function build(key) {
  var entry = cache[key];
  if (entry && (Date.now() - entry.at) < TTL) return entry.xml;

  var xml = builders[key]();
  cache[key] = { xml: xml, at: Date.now() };
  return xml;
}


function serveXml(fn) {
  return function(params, req, res) {
    if (SEO.IS_DEV) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      var xml = fn();
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=21600');
      res.end(xml);
    } catch (err) {
      console.error('[seo] sitemap failed', err);
      res.writeHead(500);
      res.end();
    }
  };
}


Picker.route('/sitemap.xml', serveXml(function() {
  var children = Object.keys(builders);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    children.map(function(key) {
      return '  <sitemap><loc>' + SEO.ORIGIN + '/' + key + '</loc></sitemap>';
    }).join('\n') +
    '\n</sitemapindex>\n';
}));


Object.keys(builders).forEach(function(key) {
  Picker.route('/' + key, serveXml(function() { return build(key); }));
});
