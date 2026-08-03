// /robots.txt
//
// Served through Picker rather than a static file in public/ so it can emit the
// environment-dependent Sitemap: URL and flip to a blanket Disallow on dev
// (otherwise the dev host gets indexed as duplicate content).
//
// Picker registers on WebApp.rawConnectHandlers, which runs before both the
// static file handler and the boilerplate handler, so this always wins.


// Paths that are gated, private, or have nothing worth indexing.
var DISALLOW = [
  '/game/',
  '/forum',
  '/admin/',
  '/control',
  '/settings',
  '/store',
  '/mailinglist',
  '/deleteAccount',
  '/signin',
  '/forgotpassword',
  '/battle/',
  '/alert/',
  '/astroepatreon'
];


// AI crawlers are allowed the same surface as everyone else.
//
// Dominus is a free game whose growth constraint is discovery - the in-game FAQ
// says as much: "It's very hard to find new players without paying for ads."
// There is no paywalled content to protect, so being cited by an AI assistant
// answering "good slow-paced multiplayer strategy games?" is free acquisition.
//
// If scraped clones ever become a problem, CCBot is the one to move to a
// blanket Disallow: it sends no referral traffic and its dumps are the usual
// feedstock for content farms.
var AI_AGENTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
  'meta-externalagent',
  'Amazonbot',
  'cohere-ai'
];


SEO.robotsTxt = function() {
  if (SEO.IS_DEV) {
    return 'User-agent: *\nDisallow: /\n';
  }

  var lines = [];

  lines.push('# ' + SEO.ORIGIN);
  lines.push('');
  lines.push('User-agent: *');
  DISALLOW.forEach(function(path) { lines.push('Disallow: ' + path); });
  lines.push('Allow: /');
  lines.push('');
  lines.push('# AI and LLM crawlers are welcome. Dominus is free to play and');
  lines.push('# discovery is the whole problem, so being cited by an assistant');
  lines.push('# is a feature, not a leak.');
  AI_AGENTS.forEach(function(agent) { lines.push('User-agent: ' + agent); });
  DISALLOW.forEach(function(path) { lines.push('Disallow: ' + path); });
  lines.push('Allow: /');
  lines.push('');
  lines.push('Sitemap: ' + SEO.ORIGIN + '/sitemap.xml');
  lines.push('');

  return lines.join('\n');
};


Picker.route('/robots.txt', function(params, req, res) {
  try {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(SEO.robotsTxt());
  } catch (err) {
    console.error('[seo] robots.txt failed', err);
    res.writeHead(500);
    res.end();
  }
});
