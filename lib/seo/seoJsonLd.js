// schema.org structured data, emitted as a single @graph in <head>.
//
// Which nodes appear on a page is driven by the `jsonld` array on each entry in
// SEO.routes.

SEO.jsonLdNodes = {

  org: function() {
    return {
      '@type': 'Organization',
      '@id': SEO.ORIGIN + '/#organization',
      name: 'Dominus',
      url: SEO.ORIGIN + '/',
      logo: { '@type': 'ImageObject', url: SEO.abs(SEO.LOGO) },
      email: 'dan@dominusgame.net',
      founder: { '@type': 'Person', name: 'Daniel Phillips' },
      foundingDate: '2014-03-23',
      sameAs: SEO.SOCIAL
    };
  },

  website: function() {
    return {
      '@type': 'WebSite',
      '@id': SEO.ORIGIN + '/#website',
      url: SEO.ORIGIN + '/',
      name: 'Dominus',
      description: 'A free multiplayer social strategy game.',
      inLanguage: 'en',
      publisher: { '@id': SEO.ORIGIN + '/#organization' }
    };
  },

  game: function() {
    return {
      '@type': 'VideoGame',
      '@id': SEO.ORIGIN + '/#game',
      name: 'Dominus',
      url: SEO.ORIGIN + '/',
      description: 'Conquer castles, gain vassals and climb the feudal tree to become the Dominus. ' +
        'A slow, browser based multiplayer strategy game.',
      image: SEO.abs(SEO.OG_IMAGE),
      screenshot: SEO.abs(SEO.SCREENSHOT),
      applicationCategory: 'GameApplication',
      gamePlatform: ['Web Browser'],
      operatingSystem: 'Any (web browser)',
      browserRequirements: 'Requires JavaScript.',
      playMode: 'MultiPlayer',
      genre: ['Strategy', 'Massively Multiplayer', '4X'],
      numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 2 },
      inLanguage: 'en',
      datePublished: '2014-06-07',
      author: { '@type': 'Person', name: 'Daniel Phillips' },
      publisher: { '@id': SEO.ORIGIN + '/#organization' },
      isAccessibleForFree: true,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: SEO.ORIGIN + '/games'
      }
    };
  },

  howto: function() {
    return {
      '@type': 'HowTo',
      '@id': SEO.ORIGIN + '/guide#howto',
      name: 'How to Play Dominus',
      description: 'Build villages, hire armies, conquer castles and gain vassals until you become the Dominus.',
      totalTime: 'PT10M',
      step: [
        { '@type': 'HowToStep', name: 'Build a village',
          url: SEO.ORIGIN + '/guide#start',
          text: 'Find a grain hex near your castle, create a cavalry army, move it there and click Build Village. Villages collect resources from the six hexes around them.' },
        { '@type': 'HowToStep', name: 'Hire soldiers',
          url: SEO.ORIGIN + '/guide#armies',
          text: 'Use your income to hire footmen, archers, pikemen, cavalry and catapults to defend your castle and villages.' },
        { '@type': 'HowToStep', name: 'Conquer a castle',
          url: SEO.ORIGIN + '/guide#castles',
          text: "Attack another player's castle. If you win, they become your vassal and send you part of their income." },
        { '@type': 'HowToStep', name: 'Become the Dominus',
          url: SEO.ORIGIN + '/guide#winning',
          text: 'When every other player in the game is your vassal, or a vassal of your vassal, you become the Dominus and win the game.' }
      ]
    };
  },

  crumb: function(meta) {
    var trail = meta.crumb;
    if (!trail || !trail.length) return null;
    return {
      '@type': 'BreadcrumbList',
      itemListElement: trail.map(function(entry, i) {
        var item = { '@type': 'ListItem', position: i + 1, name: entry[1] };
        // google's guidance: the current page (last item) omits `item`
        if (entry[0]) item.item = SEO.ORIGIN + entry[0];
        return item;
      })
    };
  }
};


SEO.jsonLd = function(meta) {
  if (!meta || !meta.jsonld || !meta.jsonld.length) return null;

  var graph = [];
  meta.jsonld.forEach(function(key) {
    var builder = SEO.jsonLdNodes[key];
    if (!builder) return;
    var node = builder(meta);
    if (node) graph.push(node);
  });

  if (!graph.length) return null;
  return { '@context': 'https://schema.org', '@graph': graph };
};
