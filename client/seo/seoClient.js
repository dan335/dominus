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
function hasPainted(block) {
  // make sure Blaze actually rendered something before pulling the fallback
  var children = document.body.children;
  for (var i = 0; i < children.length; i++) {
    var node = children[i];
    if (node === block) continue;
    if (node.tagName === 'SCRIPT' || node.tagName === 'LINK') continue;
    return true;
  }
  return false;
}


// Returns true once there is no block left to remove.
function removeSsrBlock() {
  var block = document.getElementById('seoSsr');
  if (!block || !block.parentNode) return true;
  if (!hasPainted(block)) return false;
  block.parentNode.removeChild(block);
  return true;
}


// Data pages (waitForData in seoRoutes.js) paint their heading at once and
// their data only when the DDP subscriptions are ready.  Pulling the block on
// first paint left a heading and a loading spinner, and that is exactly what
// Googlebot indexed: it does not support WebSockets, so its subscriptions may
// never become ready.  Keep the block until they are.
//
// DDP._allSubscriptionsReady is what spiderable used for the same question.
// If it is ever missing, fall back to the old remove-on-paint behaviour.
function dataReady() {
  if (!Meteor.status().connected) return false;
  if (typeof DDP === 'undefined' || typeof DDP._allSubscriptionsReady !== 'function') return true;
  return DDP._allSubscriptionsReady();
}


var initialPath = null;
var waitTimer = null;

function stopWaiting() {
  if (waitTimer) Meteor.clearInterval(waitTimer);
  waitTimer = null;
}

function removeSsrBlockWhenDataReady() {
  // two ready checks in a row, so Blaze has had a flush to render what the
  // subscriptions delivered
  var readyTicks = 0;
  waitTimer = Meteor.setInterval(function() {
    readyTicks = dataReady() ? readyTicks + 1 : 0;
    if (readyTicks >= 2 && removeSsrBlock()) stopWaiting();
  }, 250);
}


Meteor.startup(function() {
  Tracker.autorun(function() {
    var path = SimpleRouter.path.get();
    if (path === null || path === undefined) return;

    var meta = SEO.resolve(path);

    // The server already wrote the right head for the URL the page was loaded
    // on, and for /result and /profile it is richer than anything the client
    // can build (SEO.dynamic is server only).  Overwriting it on load replaced
    // "Game 365 Results - Won by ..." with a generic "Game Results | Dominus"
    // in the rendered page Google indexes.  Only touch the head after a
    // navigation.
    //
    // The crawlable block describes that same URL, so once the user navigates
    // away it is stale.
    if (initialPath === null) {
      initialPath = SEO.normalizePath(path);
      if (initialPath === SEO.normalizePath(window.location.pathname)) return;
    } else if (SEO.normalizePath(path) !== initialPath) {
      stopWaiting();
      removeSsrBlock();
    }

    var viewportMode = meta.viewport === 'game' ? 'game' : 'site';

    // The game map needs a fixed 850px viewport; marketing pages want
    // device-width. Swap the meta tag in place - do NOT force a page reload to
    // cross that boundary. Reloading on the way into a game meant re-parsing
    // the whole bundle, re-establishing every subscription and rebuilding the
    // map from scratch, which made opening the map noticeably slower.
    //
    // Cold loads (bookmarks, refreshes, crawlers, external links) get the right
    // viewport from the server, and that is what search engines evaluate.

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
  });

  Tracker.afterFlush(function() {
    if (SEO.resolve(window.location.pathname).waitForData) removeSsrBlockWhenDataReady();
    else removeSsrBlock();
  });
});
