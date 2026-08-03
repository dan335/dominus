// Public /guide page.
//
// Renders from SEO.content.guide (lib/seo/seoContent.js) - the exact same
// source strings the server injects for crawlers and serves at /llms-full.txt.
// Keeping one source is what stops the public guide from drifting away from
// the crawlable version.
//
// The numbers in the prose are interpolated from _s / _gs(null, ...) at render
// time, so they track real game settings.  _gs.getGame(null) returns {} and
// every accessor falls back to the _s defaults, which is why this works outside
// of a game.
//
// Unlike the in-game help panel this is not an accordion - collapsed content is
// down-weighted by search engines.

Template.guide.helpers({
  h1: function() {
    return SEO.content.guide.h1;
  },

  lead: function() {
    return SEO.content.guide.lead;
  },

  intro: function() {
    return new Spacebars.SafeString(SEO.md2html(SEO.content.guide.md));
  },

  sections: function() {
    return SEO.content.guide.sections.map(function(section) {
      return {
        id: section.id,
        title: section.title,
        html: new Spacebars.SafeString(SEO.md2html(section.md))
      };
    });
  }
});
