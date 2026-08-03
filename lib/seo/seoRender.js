// Renders SEO.content and SEO.routes metadata into HTML.
//
// Used on the server to build data.dynamicHead / data.dynamicBody, and on the
// client to build the /guide page from the same source strings.


// Values interpolated into the {{placeholders}} in SEO.content.
//
// Read from _s / _gs(null, ...) so the guide can never drift from real game
// settings.  _gs.getGame(null) returns {} and every accessor falls back to the
// _s defaults, which is why passing null works outside a game.
//
// Fully defensive: this runs inside the boilerplate callback and a throw there
// makes webapp return HTTP 500 for every page.
SEO.vars = function() {
  var v = {};

  function safe(key, fn, fallback) {
    try {
      var out = fn();
      v[key] = (out === undefined || out === null || (typeof out === 'number' && isNaN(out))) ? fallback : out;
    } catch (err) {
      v[key] = fallback;
    }
  }

  function round(n) { return Math.round(n * 100) / 100; }

  safe('maxVillages', function() { return _gs.villages(null, 'max_can_have'); }, 5);
  safe('villageIncomeMins', function() { return Math.round(_gs.villages(null, 'incomeInterval') / 60000); }, 20);
  safe('villageDefBonus', function() { return _s.villages.defense_bonus; }, 2);
  safe('villageCost1', function() { return _s.villages.cost.level1.grain; }, 200);
  safe('villageCost2', function() { return _s.villages.cost.level2.grain; }, 20);
  safe('villageCost3', function() { return _s.villages.cost.level3.grain; }, 20);
  safe('largeResourceMultiplier', function() { return _s.villages.large_resource_multiplier; }, 2);

  safe('castleGold', function() { return _gs.castles(null, 'income').gold; }, 30);
  safe('castleGrain', function() { return _gs.castles(null, 'income').grain; }, 20);
  safe('castleIncomeMins', function() { return Math.round(_gs.castles(null, 'incomeInterval') / 60000); }, 20);
  safe('castleDefBonus', function() { return _s.castles.defense_bonus; }, 2);
  safe('castleAllyBonus', function() { return _s.castles.ally_defense_bonus; }, 1.5);

  safe('unitBonus', function() { return _s.battles.unitBonusMultiplier; }, 1.5);
  safe('battleMins', function() { return Math.round(_gs.battles(null, 'battleInterval') / 60000); }, 4);
  safe('powerLost', function() { return _s.battles.battle_power_lost_per_round; }, 500);
  safe('winnerLossPct', function() { return round(_s.battles.battle_power_lost_winner_ratio * 100); }, 40);

  safe('percentToLords', function() { return round(_s.income.percentToLords * 100); }, 6);
  safe('maxToLords', function() { return round(_s.income.maxToLords * 100); }, 30);

  safe('capitalBonus', function() { return _s.capitals.battleBonus; }, 1.5);
  safe('capitalVillagePct', function() { return round(_gs.capitals(null, 'villagePercentageIncome') * 100); }, 10);

  ['footmen', 'archers', 'pikemen', 'cavalry', 'catapults'].forEach(function(unit) {
    safe(unit + 'Off', function() { return _s.armies.stats[unit].offense; }, 0);
    safe(unit + 'Def', function() { return _s.armies.stats[unit].defense; }, 0);
    safe(unit + 'Speed', function() { return _s.armies.stats[unit].speed; }, 0);
  });
  safe('catapultBonus', function() { return _s.armies.stats.catapults.bonus_against_buildings; }, 30);

  return v;
};


SEO.interp = function(md) {
  if (!md) return '';
  var v = SEO.vars();
  return String(md).replace(/\{\{(\w+)\}\}/g, function(whole, key) {
    return (v[key] === undefined || v[key] === null) ? whole : v[key];
  });
};


// Showdown is a global on both client and server via the `markdown` package.
// Note: it is Showdown v0, which has no table support - avoid markdown tables
// in SEO.content.
SEO.md2html = function(md) {
  try {
    return new Showdown.converter().makeHtml(SEO.interp(md));
  } catch (err) {
    return '<p>' + SEO.esc(SEO.interp(md)) + '</p>';
  }
};


SEO.robotsDirective = function(robots) {
  if (SEO.IS_DEV) return 'noindex, nofollow';
  if (robots === 'index') return 'index, follow, max-image-preview:large, max-snippet:-1';
  if (robots === 'noindex-follow') return 'noindex, follow';
  return 'noindex, nofollow';
};


SEO.renderHead = function(meta) {
  var e = SEO.esc;
  var out = [];
  var title = meta.title || 'Dominus - A free multiplayer social strategy game.';
  var desc = SEO.clamp(meta.description || SEO.DEFAULT_DESC, 300);
  var img = SEO.abs(meta.image || SEO.OG_IMAGE);
  var viewport = meta.viewport === 'game' ? SEO.VIEWPORT_GAME : SEO.VIEWPORT_SITE;

  out.push('<title>' + e(title) + '</title>');
  out.push('<meta name="description" content="' + e(desc) + '">');
  out.push('<meta name="robots" content="' + e(SEO.robotsDirective(meta.robots)) + '">');
  out.push('<link rel="canonical" href="' + e(meta.canonical) + '">');
  out.push('<meta id="viewport" name="viewport" content="' + e(viewport) + '">');
  out.push('<meta name="theme-color" content="' + e(SEO.THEME_COLOR) + '">');

  out.push('<meta property="og:type" content="website">');
  out.push('<meta property="og:site_name" content="' + e(SEO.SITE_NAME) + '">');
  out.push('<meta property="og:title" content="' + e(title) + '">');
  out.push('<meta property="og:description" content="' + e(desc) + '">');
  out.push('<meta property="og:url" content="' + e(meta.canonical) + '">');
  out.push('<meta property="og:image" content="' + e(img) + '">');
  out.push('<meta property="og:image:width" content="1200">');
  out.push('<meta property="og:image:height" content="628">');
  out.push('<meta property="og:image:alt" content="Dominus - a multiplayer browser strategy game">');
  out.push('<meta property="og:locale" content="en_US">');

  out.push('<meta name="twitter:card" content="summary_large_image">');
  out.push('<meta name="twitter:site" content="' + e(SEO.TWITTER) + '">');
  out.push('<meta name="twitter:title" content="' + e(title) + '">');
  out.push('<meta name="twitter:description" content="' + e(desc) + '">');
  out.push('<meta name="twitter:image" content="' + e(img) + '">');

  var ld = SEO.jsonLd(meta);
  if (ld) {
    // game names and usernames reach this JSON.  Escaping "<" closes the
    // </script> breakout; stripping U+2028/9 keeps it valid JS.
    var json = JSON.stringify(ld).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');
    out.push('<script type="application/ld+json">' + json + '<\/script>');
  }

  return out.join('\n');
};


// Real HTML for crawlers that don't run JavaScript.  Removed on the client once
// Blaze has rendered (see client/seo/seoClient.js).
//
// Never gate this on user agent and never hide it with CSS - both are cloaking.
SEO.renderBody = function(meta) {
  var content = meta.content || SEO.content[meta.body];
  if (!content) return '';

  var e = SEO.esc;
  var out = ['<div id="seoSsr" class="seoSsr">', '<div class="seoSsrInner">'];

  out.push('<nav class="seoSsrNav">' + SEO.NAV.map(function(link) {
    return '<a href="' + e(link[0]) + '">' + e(link[1]) + '</a>';
  }).join(' ') + '</nav>');

  out.push('<h1>' + e(SEO.interp(content.h1 || meta.title)) + '</h1>');
  if (content.lead) out.push('<p class="seoSsrLead">' + e(SEO.interp(content.lead)) + '</p>');
  if (content.md) out.push(SEO.md2html(content.md));

  (content.sections || []).forEach(function(section) {
    out.push('<h2 id="' + e(section.id) + '">' + e(section.title) + '</h2>');
    out.push(SEO.md2html(section.md));
  });

  if (content.links && content.links.length) {
    out.push('<ul class="seoSsrLinks">' + content.links.map(function(link) {
      return '<li><a href="' + e(link[0]) + '">' + e(link[1]) + '</a></li>';
    }).join('') + '</ul>');
  }

  out.push('</div>', '</div>');
  return out.join('\n');
};
