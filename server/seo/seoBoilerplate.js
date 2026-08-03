// Injects per-route <head> and crawlable <body> content into the HTML that
// Meteor serves for every request.
//
// This is what makes the site legible to crawlers that don't run JavaScript
// (GPTBot, ClaudeBot, PerplexityBot, Bingbot's first pass).  Before this, every
// URL served an empty <body> and one hardcoded <title>.
//
// How the injection points work (verified in webapp 1.13.1 /
// boilerplate-generator 1.7.1):
//
//   data.dynamicHead  -> appended at the end of <head>
//   data.dynamicBody  -> appended into <body> after data.body, before the
//                        bundle <script> tags.  For Blaze apps data.body is
//                        empty (the <body> of client/index.html compiles into
//                        Template.body), so this is the only body HTML in the
//                        served source.
//   data.statusCode   -> used verbatim by res.writeHead
//   data.headers      -> merged over {'Content-Type': 'text/html; charset=utf-8'}
//
// DANGER: if this callback throws or rejects, webapp catches it and returns
// HTTP 500 for EVERY page on the site.  Everything below is wrapped in
// try/catch with a constant fallback, and client/index.html no longer carries a
// static <title>, so the fallback is what keeps a failure survivable.


// Deliberately a constant string with no dependency on SEO.* - if the SEO
// modules are what broke, this still has to work.
var FALLBACK_HEAD = [
  '<title>Dominus - A free multiplayer social strategy game.</title>',
  '<meta name="description" content="Grow in power by conquering castles. Gain vassals until you can overthrow your lord and climb the tree to become the Dominus.">',
  '<meta id="viewport" name="viewport" content="width=850 user-scalable=no">'
].join('\n');


WebApp.addHtmlAttributeHook(function() {
  return { lang: 'en' };
});


WebAppInternals.registerBoilerplateDataCallback('dominusSeo', function(request, data, arch) {
  try {
    var meta = SEO.resolve(request.path);

    data.dynamicHead = (data.dynamicHead || '') + '\n' + SEO.renderHead(meta);
    data.dynamicBody = (data.dynamicBody || '') + SEO.renderBody(meta);

    if (SEO.SOFT_404 && meta.statusCode && meta.statusCode !== 200) {
      data.statusCode = meta.statusCode;
    }

    // Belt and braces alongside the robots meta tag: a header works even for
    // non-HTML responses and is honoured by more crawlers.
    if (meta.robots !== 'index' || SEO.IS_DEV) {
      data.headers = _.extend({}, data.headers, {
        'X-Robots-Tag': SEO.robotsDirective(meta.robots)
      });
    }
  } catch (err) {
    console.error('[seo] boilerplate callback failed for', request && request.path, err && err.stack ? err.stack : err);
    data.dynamicHead = (data.dynamicHead || '') + '\n' + FALLBACK_HEAD;
  }

  return true;
});
