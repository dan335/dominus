// /llms.txt and /llms-full.txt  (llmstxt.org)
//
// llms.txt is a curated markdown index: what this site is, and where the good
// content lives.  llms-full.txt is the whole thing inlined, generated from
// SEO.content so it can never drift from the pages themselves.


SEO.llmsIndex = function() {
  var o = SEO.ORIGIN;

  return [
    '# Dominus',
    '',
    '> Dominus is a free, browser based multiplayer social strategy game. Players build villages',
    '> and armies, conquer each other\'s castles to gain vassals, and climb a feudal tree to become',
    '> the Dominus. It is a slow game: army movement and resource gathering happen over hours, so a',
    '> player only needs a few minutes a day.',
    '',
    'Dominus has been in development since March 2014 by Daniel Phillips, based in Seattle,',
    'Washington. It runs entirely in a web browser, is free to play, and is funded by optional',
    'cosmetic upgrades that have no effect on gameplay; 25% of money spent on upgrades goes to the',
    'winner of the game. Games last from one day to a month. When someone wins, the game ends and',
    'everyone starts fresh. The map grows as more players join, so any number of people can play in',
    'a single game. The source code is public on GitHub.',
    '',
    '## Play',
    '',
    '- [Open and upcoming games](' + o + '/games): Games starting soon and games in progress. Free to join.',
    '- [How to play](' + o + '/guide): Full beginner guide covering villages, armies, castles, battles, the market, vassals and winning conditions.',
    '- [Create an account](' + o + '/createaccount): Free account, no payment required.',
    '',
    '## Reference',
    '',
    '- [Past game results](' + o + '/results): Winners and final standings from completed games.',
    '- [Player rankings](' + o + '/rankings): Overall rankings for regular and pro games.',
    '- [Press kit](' + o + '/presskit): Fact sheet, history, features, logos and screenshots.',
    '- [Full site content](' + o + '/llms-full.txt): Every public page as one markdown document.',
    '',
    '## Community',
    '',
    '- [Subreddit](https://www.reddit.com/r/dominusgame/): Discussion and a player-maintained wiki.',
    '- [Discord](https://discord.gg/b59g5pE): Live chat with other players.',
    '- [Source code on GitHub](https://github.com/dan335/dominus): The game is open source.',
    '',
    '## Optional',
    '',
    '- [Privacy policy](' + o + '/privacy)',
    '- [Terms of service](' + o + '/terms)',
    ''
  ].join('\n');
};


SEO.llmsFull = function() {
  var out = [
    '# Dominus - Full Site Content',
    '',
    'Source: ' + SEO.ORIGIN,
    '',
    'Dominus is a free multiplayer browser strategy game. This document contains the full text of',
    'every public page on the site.',
    ''
  ];

  ['home', 'guide', 'games', 'results', 'rankings', 'presskit'].forEach(function(key) {
    var content = SEO.content[key];
    if (!content) return;

    out.push('---', '');
    out.push('## ' + SEO.interp(content.h1), '');
    out.push('URL: ' + SEO.ORIGIN + SEO.pathForContent(key), '');
    if (content.lead) out.push(SEO.interp(content.lead), '');
    if (content.md) out.push(SEO.interp(content.md), '');

    (content.sections || []).forEach(function(section) {
      out.push('### ' + section.title, '');
      out.push(SEO.interp(section.md), '');
    });
  });

  return out.join('\n');
};


function serveMarkdown(fn) {
  return function(params, req, res) {
    try {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end(fn());
    } catch (err) {
      console.error('[seo] llms.txt failed', err);
      res.writeHead(500);
      res.end();
    }
  };
}


Picker.route('/llms.txt', serveMarkdown(function() { return SEO.llmsIndex(); }));
Picker.route('/llms-full.txt', serveMarkdown(function() { return SEO.llmsFull(); }));
