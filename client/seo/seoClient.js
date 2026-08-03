// Keeps <head> correct across client side navigation, and clears the server
// rendered SEO block once Blaze has taken over.
//
// The server injects the right head for the initial page load.  This handles
// every SPA navigation after that, reusing the same SEO.resolve() table from
// lib/seo/seoRoutes.js so the two can't disagree.


function setMeta(selector, attrName, attrValue, content) {
  var el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}


function setLink(rel, href) {
  var el = document.head.querySelector('link[rel="' + rel + '"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}


// iOS Safari caches viewport state and mutating `content` in place is
// unreliable, so replace the node instead.
function setViewport(content) {
  var existing = document.getElementById('viewport');
  if (existing && existing.getAttribute('content') === content) return false;
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  var meta = document.createElement('meta');
  meta.id = 'viewport';
  meta.name = 'viewport';
  meta.setAttribute('content', content);
  document.head.appendChild(meta);
  return true;
}


// The server rendered block is real content, not hidden text, so it stays
// visible until Blaze has actually painted.  If the JS bundle fails to load it
// never gets removed, which is strictly better than the blank page this app
// used to serve.
function removeSsrBlock() {
  var block = document.getElementById('seoSsr');
  if (!block || !block.parentNode) return;

  // make sure Blaze actually rendered something before pulling the fallback
  var painted = false;
  var children = document.body.children;
  for (var i = 0; i < children.length; i++) {
    var node = children[i];
    if (node === block) continue;
    if (node.tagName === 'SCRIPT' || node.tagName === 'LINK') continue;
    painted = true;
    break;
  }

  if (painted) block.parentNode.removeChild(block);
}


Meteor.startup(function() {
  var booted = false;
  var lastViewportMode = null;

  Tracker.autorun(function() {
    var path = SimpleRouter.path.get();
    if (path === null || path === undefined) return;

    var meta = SEO.resolve(path);
    var viewportMode = meta.viewport === 'game' ? 'game' : 'site';

    // The game map needs a fixed 850px viewport; marketing pages want
    // device-width. Browsers are unreliable about re-laying out an existing
    // page when the viewport changes underneath them (iOS Safari especially),
    // so cross that boundary with a real page load. Entering a game already
    // triggers a heavy subscription load, so a reload costs little there.
    if (booted && lastViewportMode && lastViewportMode !== viewportMode) {
      window.location.reload();
      return;
    }
    lastViewportMode = viewportMode;

    document.title = meta.title;
    setMeta('meta[name="description"]', 'name', 'description', meta.description || '');
    setMeta('meta[name="robots"]', 'name', 'robots', SEO.robotsDirective(meta.robots));
    setMeta('meta[property="og:title"]', 'property', 'og:title', meta.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', meta.description || '');
    setMeta('meta[property="og:url"]', 'property', 'og:url', meta.canonical);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', meta.title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', meta.description || '');
    setLink('canonical', meta.canonical);
    setViewport(viewportMode === 'game' ? SEO.VIEWPORT_GAME : SEO.VIEWPORT_SITE);

    booted = true;
  });

  Tracker.afterFlush(removeSsrBlock);
});
