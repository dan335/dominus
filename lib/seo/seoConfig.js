// SEO namespace.  Shared by client and server.
//
// NOTE: do not use import/export in lib/seo/*.  That would make these files
// strict ES modules and break the bare-assignment global pattern the rest of
// the codebase relies on (_s = {}, _gs = {}, Router = ...).

SEO = {};


// ROOT_URL is set off-repo in the server's docker compose file, so
// Meteor.absoluteUrl() is not reliable here.  Hardcode with a settings override.
SEO.ORIGIN = (Meteor.settings && Meteor.settings.public && Meteor.settings.public.canonicalOrigin) || 'https://dominusgame.net';

SEO.IS_DEV = !!(Meteor.settings && Meteor.settings.public && Meteor.settings.public.dominusIsDev);

// Returning real 404s for unknown paths is the one change here that could hide
// a live page if a matcher is wrong.  Set public.seoSoft404 to false in
// settings.json to fall back to the old behaviour without a rebuild.
SEO.SOFT_404 = !(Meteor.settings && Meteor.settings.public && Meteor.settings.public.seoSoft404 === false);

SEO.SITE_NAME = 'Dominus';
SEO.TWITTER = '@DominusGame';
SEO.THEME_COLOR = '#2b2b2b';

// 1200x628 press images already in public/presskit/
SEO.OG_IMAGE = '/presskit/dominus_1200x628_01.jpg';
SEO.OG_IMAGE_ALT = '/presskit/dominus_1200x628_02.jpg';
SEO.LOGO = '/presskit/dominus_logo.jpg';
SEO.SCREENSHOT = '/landing/landingScreenshot.jpg';


// The game map is a fixed 850px layout.  Marketing pages use responsive
// bootstrap grids and can take a real device-width viewport.
//
// NOTE: VIEWPORT_GAME is intentionally byte-identical to what shipped before,
// missing comma included.  Browsers split the viewport content on commas, so
// the missing comma means "user-scalable=no" is currently ignored and pinch
// zoom works in game.  Adding the comma would silently disable it.
SEO.VIEWPORT_GAME = 'width=850 user-scalable=no';
SEO.VIEWPORT_SITE = 'width=device-width, initial-scale=1';


// Internal links shown in the server rendered block on every page.
SEO.NAV = [
  ['/', 'Home'],
  ['/games', 'Game List'],
  ['/guide', 'How to Play'],
  ['/results', 'Results'],
  ['/rankings', 'Rankings']
];


SEO.SOCIAL = [
  'https://www.facebook.com/dominusgame',
  'https://twitter.com/DominusGame',
  'https://www.reddit.com/r/dominusgame/',
  'https://discord.gg/b59g5pE',
  'https://github.com/dan335/dominus',
  'https://trello.com/b/q40VdLBJ/dominus'
];


// Game names and usernames are user input and end up inside meta content
// attributes.  Escaping is security critical, not cosmetic.
SEO.esc = function(str) {
  return String(str === null || str === undefined ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};


SEO.abs = function(path) {
  if (!path) return SEO.ORIGIN + '/';
  return (/^https?:/).test(path) ? path : SEO.ORIGIN + path;
};


// Trim a description to a length search engines will actually show.
SEO.clamp = function(str, max) {
  str = String(str || '').replace(/\s+/g, ' ').trim();
  if (str.length <= max) return str;
  var cut = str.slice(0, max);
  var space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,.;:\-]$/, '') + '...';
};
