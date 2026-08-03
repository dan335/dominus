// Route -> metadata table.  Shared by the server boilerplate hook (which uses it
// to build <head> and the crawlable body) and the client autorun (which uses it
// to keep the title and canonical correct across SPA navigation).
//
// Ordered array, first match wins.  Exact `path` matches are checked in the same
// pass as `re` regex matches, so keep specific entries above general ones.
//
// robots:
//   'index'          - index, follow
//   'noindex-follow' - crawl it, don't index it (thin or auth pages)
//   'noindex'        - noindex, nofollow (private / gated)

SEO.DEFAULT_DESC = 'Conquer castles, gain vassals and climb the feudal tree to become the Dominus. ' +
  'A free multiplayer browser strategy game you play a few minutes a day.';


SEO.routes = [

  // ---- public, indexable --------------------------------------------------

  { path: '/', name: 'landing', viewport: 'site', robots: 'index',
    jsonld: ['org', 'website', 'game'], body: 'home',
    title: 'Dominus - Free Multiplayer Browser Strategy Game',
    description: SEO.DEFAULT_DESC },

  { path: '/guide', name: 'guide', viewport: 'site', robots: 'index',
    jsonld: ['howto', 'crumb'], body: 'guide', image: SEO.OG_IMAGE_ALT,
    crumb: [['/', 'Dominus'], [null, 'How to Play']],
    title: 'How to Play Dominus - Beginner’s Guide',
    description: 'Learn how to play Dominus: build villages, hire armies, conquer castles, gain vassals and climb the tree to become the Dominus.' },

  { path: '/games', name: 'landingGames', viewport: 'site', robots: 'index',
    jsonld: ['crumb'], body: 'games',
    crumb: [['/', 'Dominus'], [null, 'Game List']],
    title: 'Join a Game - Open & Upcoming Games | Dominus',
    description: 'Browse Dominus games starting soon and games already in progress. Sign up free and get an email when your game begins.' },

  { path: '/results', name: 'landingResults', viewport: 'site', robots: 'index',
    jsonld: ['crumb'], body: 'results',
    crumb: [['/', 'Dominus'], [null, 'Results']],
    title: 'Past Game Results | Dominus',
    description: 'Winners, final standings and player counts from every completed game of Dominus.' },

  { path: '/oldresults', name: 'landingResultsOld', viewport: 'site', robots: 'index',
    jsonld: ['crumb'], body: 'results',
    crumb: [['/', 'Dominus'], ['/results', 'Results'], [null, 'Archived']],
    title: 'Archived Game Results | Dominus',
    description: 'Results from older games of Dominus, archived from the main results list.' },

  { path: '/rankings', name: 'landingRankings', viewport: 'site', robots: 'index',
    jsonld: ['crumb'], body: 'rankings',
    crumb: [['/', 'Dominus'], [null, 'Rankings']],
    title: 'Player Rankings | Dominus',
    description: 'Overall Dominus player rankings for regular and pro games, ranked by performance across completed games.' },

  { path: '/presskit', name: 'presskit', viewport: 'site', robots: 'index',
    jsonld: ['crumb'], body: 'presskit',
    crumb: [['/', 'Dominus'], [null, 'Press Kit']],
    title: 'Dominus Press Kit - Fact Sheet, Logos & Screenshots',
    description: 'Press kit for Dominus: description, history, features, logos, screenshots and press contact for journalists and content creators.' },

  { path: '/privacy', name: 'privacy', viewport: 'site', robots: 'index', body: 'privacy',
    title: 'Privacy Policy | Dominus',
    description: 'How Dominus collects, uses and stores your data.' },

  { path: '/terms', name: 'terms', viewport: 'site', robots: 'index', body: 'terms',
    title: 'Terms of Service | Dominus',
    description: 'Terms of service for playing Dominus, a free multiplayer browser strategy game.' },

  // ---- public but thin / auth: crawl, don't index -------------------------

  { path: '/signin', name: 'landingSignin', viewport: 'site', robots: 'noindex-follow', body: 'auth',
    title: 'Sign In | Dominus', description: 'Sign in to your Dominus account.' },

  { path: '/createaccount', name: 'landingCreateaccount', viewport: 'site', robots: 'noindex-follow', body: 'auth',
    title: 'Create a Free Account | Dominus',
    description: 'Create a free Dominus account and join a game.' },

  { path: '/forgotpassword', name: 'landingForgotPassword', viewport: 'site', robots: 'noindex-follow', body: 'auth',
    title: 'Reset Password | Dominus', description: 'Reset your Dominus account password.' },

  // ---- dynamic ------------------------------------------------------------

  { re: /^\/result\/([A-Za-z0-9]{6,32})$/, name: 'landingResults', viewport: 'site',
    robots: 'index', jsonld: ['crumb'], dynamic: 'result', body: 'results',
    title: 'Game Results | Dominus',
    description: 'Final results and standings from a completed game of Dominus.' },

  { re: /^\/profile\/([A-Za-z0-9]{6,32})$/, name: 'landingProfile', viewport: 'site',
    robots: 'index', jsonld: ['crumb'], dynamic: 'profile', body: 'results',
    title: 'Player Profile | Dominus',
    description: 'A Dominus player profile: games played, games won and final standings.' },

  { re: /^\/battle(\/|$)/, name: 'sharedBattle', viewport: 'game', robots: 'noindex-follow',
    title: 'Battle Report | Dominus',
    description: 'A shared battle report from a game of Dominus.' },

  { re: /^\/alert(\/|$)/, name: 'sharedGlobalAlert', viewport: 'game', robots: 'noindex-follow',
    title: 'Alert | Dominus', description: 'A shared alert from a game of Dominus.' },

  // ---- gated / private ----------------------------------------------------

  { re: /^\/game(\/|$)/, name: 'game', viewport: 'game', robots: 'noindex',
    title: 'Dominus', description: SEO.DEFAULT_DESC },

  { re: /^\/forum(\/|$)/, name: 'forum', viewport: 'game', robots: 'noindex',
    title: 'Forum | Dominus', description: 'The Dominus player forum.' },

  { re: /^\/admin(\/|$)/, name: 'admin', viewport: 'game', robots: 'noindex',
    title: 'Admin | Dominus', description: '' },

  { re: /^\/control(\/|$)/, name: 'control', viewport: 'game', robots: 'noindex',
    title: 'Control | Dominus', description: '' },

  { path: '/settings', name: 'landingSettings', viewport: 'site', robots: 'noindex',
    title: 'Settings | Dominus', description: '' },

  { path: '/store', name: 'landingStore', viewport: 'site', robots: 'noindex',
    title: 'Store | Dominus', description: '' },

  { path: '/mailinglist', name: 'mailinglist', viewport: 'site', robots: 'noindex',
    title: 'Mailing List | Dominus', description: '' },

  { path: '/deleteAccount', name: 'landingDeleteAccount', viewport: 'site', robots: 'noindex',
    title: 'Delete Account | Dominus', description: '' },

  { path: '/astroepatreon', name: 'astroepatreon', viewport: 'site', robots: 'noindex',
    title: 'Dominus', description: '' }
];


SEO.NOT_FOUND = {
  name: 'notFound',
  statusCode: 404,
  viewport: 'site',
  robots: 'noindex',
  body: 'notFound',
  title: 'Page Not Found | Dominus',
  description: 'That page does not exist. Browse open games, past results or the beginner guide.'
};


// Normalize a request path: drop query and hash, drop trailing slash.
SEO.normalizePath = function(rawPath) {
  var path = String(rawPath || '/').split('?')[0].split('#')[0];
  if (path.charAt(0) !== '/') path = '/' + path;
  if (path.length > 1) path = path.replace(/\/+$/, '') || '/';
  return path;
};


// path -> metadata.  `ctx` is optional and server only.
//
// Must never throw: an exception inside the boilerplate callback makes webapp
// return HTTP 500 for every page on the site.
SEO.resolve = function(rawPath, ctx) {
  var path = SEO.normalizePath(rawPath);
  var base = { canonical: SEO.ORIGIN + (path === '/' ? '/' : path), image: SEO.OG_IMAGE, path: path };

  for (var i = 0; i < SEO.routes.length; i++) {
    var r = SEO.routes[i];
    var match = r.path ? (r.path === path ? [path] : null) : path.match(r.re);
    if (!match) continue;

    var meta = _.extend({}, base, r, { params: match });

    // server side enrichment (real game names, usernames, 404 decisions)
    if (r.dynamic && SEO.dynamic && typeof SEO.dynamic[r.dynamic] === 'function') {
      meta = SEO.dynamic[r.dynamic](meta, match[1]) || meta;
    }
    return meta;
  }

  return _.extend({}, base, SEO.NOT_FOUND);
};
