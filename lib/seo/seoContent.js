// Prose for every crawlable page, in one place.
//
// This is the single source of truth.  The same strings are rendered three ways:
//
//   server -> Showdown -> HTML -> data.dynamicBody   (crawlers)
//   client -> Showdown -> HTML -> Blaze SafeString   (humans, /guide)
//   Picker -> raw markdown                           (/llms-full.txt)
//
// Because everyone gets the same bytes there is no cloaking, and there is no
// second copy to keep in sync.
//
// {{placeholders}} are filled from _s / _gs(null, ...) by SEO.interp() so the
// numbers can never drift from actual game settings.  Placeholder names are
// defined in SEO.vars() in seoRender.js.
//
// The guide prose is lifted from packages/dominus-help/client/help_*.html.
// Markdown tables are avoided: the bundled Showdown is v0 and has no table
// support.

SEO.content = {};


SEO.content.home = {
  h1: 'Dominus',
  lead: 'A free multiplayer social strategy game.',
  md: [
    'Grow in power by conquering castles. Gain vassals until you can overthrow your lord and',
    'climb the tree to become the Dominus.',
    '',
    'Dominus is a slow strategy game. Army movement and resource gathering happen slowly over',
    'time. Login, give your armies their orders then check back in a few hours. Chat with other',
    'players to form alliances and conquer larger enemies.',
    '',
    'The game runs entirely in a web browser, is free to play, and supports any number of',
    'players &mdash; the map grows as more people join. Games last anywhere from a day to a month.',
    'When someone wins, the game ends and everyone starts a new game from scratch.'
  ].join('\n'),
  links: [
    ['/games', 'View open games'],
    ['/guide', 'How to play Dominus'],
    ['/results', 'Past game results'],
    ['/rankings', 'Player rankings'],
    ['/presskit', 'Press kit']
  ]
};


SEO.content.guide = {
  h1: 'How to Play Dominus',
  lead: 'A beginner’s guide to villages, armies, castles, battles and vassals.',
  md: [
    'Dominus is a free multiplayer browser strategy game. You start with one castle and grow by',
    'building villages, hiring soldiers and conquering other players. This guide covers everything',
    'you need to go from your first village to becoming the Dominus.'
  ].join('\n'),
  sections: [
    {
      id: 'objective',
      title: 'Game Objective',
      md: [
        'Become the Dominus to win the game.',
        '',
        '> **Dominus** /doˈ-mi-nus/ — Latin for emperor, master or owner.',
        '',
        'To become the Dominus, everyone else in the game must be your vassal.',
        '',
        '> **Vassal** /va\'-səl/ — A person in the past who received protection and land from a lord',
        '> in return for loyalty and service.',
        '',
        'To gain a vassal, attack someone\'s castle. If you win then you become their lord and they',
        'become your vassal. Lords receive extra income for having vassals.'
      ].join('\n')
    },
    {
      id: 'start',
      title: 'How to Start Playing',
      md: [
        'Dominus is a slow strategy game that does not require a lot of time to play. Give your',
        'armies their orders then come back in a few hours to check on them.',
        '',
        'Games last anywhere from a day to a month. When someone wins, the game ends and everyone',
        'can start a new game from scratch.',
        '',
        '#### Build a village',
        '',
        'When you start playing you should focus on building up your income. The best way to do',
        'that in the early game is to build villages. A village collects resources from the ring of',
        'hexes surrounding it. Villages are built using armies.',
        '',
        '* Find a good hex to build your village at. You can only build villages on grain hexes,',
        '  those are the light green ones. Find a grain hex near your castle that is surrounded by',
        '  hexes other than grain.',
        '* Click on your castle.',
        '* Click the "Create Army" button.',
        '* Move one or more sliders to the right and click "Create Army". Cavalry are best for this task.',
        '* Click "Move Army" and click on the hex where you want to build your village.',
        '',
        'When your army reaches their destination they will have a "Build Village" button which you',
        'can click on to build your village.',
        '',
        '#### Next steps',
        '',
        'Continue building villages to gain more income. You can have up to {{maxVillages}} villages',
        'at one time. Hire soldiers to protect your castle and villages. After you have an army, try',
        'attacking a capital or someone\'s castle.'
      ].join('\n')
    },
    {
      id: 'resources',
      title: 'Resources and the Market',
      md: [
        'There are six different types of resources: grain, lumber, ore, wool, clay and glass.',
        'Resources are used to hire soldiers and build villages. Each hex produces a different type',
        'of resource.',
        '',
        '#### Collecting resources',
        '',
        'Resources are collected at your castle and villages.',
        '',
        'Your castle collects {{castleGold}} gold and {{castleGrain}} of each resource. Everyone\'s',
        'castle collects the same resources. Villages collect resources from the 6 hexes surrounding',
        'them. Resources are collected every {{castleIncomeMins}} minutes.',
        '',
        'Villages collect from the surrounding hexes even if there is another building on the hex.',
        'It is fine to build villages next to each other or next to a castle, capital or other village.',
        '',
        '#### Large resource hexes',
        '',
        'Some hexes produce {{largeResourceMultiplier}}x the resources of a normal hex. These hexes',
        'have small buildings on them.',
        '',
        '#### The market',
        '',
        'The market is where you can exchange resources and gold. Prices for resources go up and down',
        'based on demand. If grain is in high demand because many people bought grain then the price',
        'will go up. Taxes from the market are evenly distributed to castles every resource update.'
      ].join('\n')
    },
    {
      id: 'castles',
      title: 'Castles',
      md: [
        'Your castle is the center of your kingdom. Everyone has one castle and they cannot be destroyed.',
        '',
        'Castles are very defensive. They have a {{castleDefBonus}}x defense bonus.',
        '',
        'If you attack someone\'s castle and win then you become their lord and they become your vassal.',
        '',
        'If your army stops on the same hex as your castle then they will join your castle\'s garrison.',
        '',
        'Castles produce {{castleGold}} gold and {{castleGrain}} of each resource, and collect vassal',
        'income, every {{castleIncomeMins}} minutes.'
      ].join('\n')
    },
    {
      id: 'villages',
      title: 'Villages',
      md: [
        'Villages give you resources. They produce resources from the 6 surrounding hexes every',
        '{{villageIncomeMins}} minutes. You can build up to {{maxVillages}} villages at one time.',
        '',
        'Building a village costs {{villageCost1}} of each resource. Level 1 villages can hire only',
        'archers. They can be upgraded to produce more types of soldiers.',
        '',
        'Upgrading a village to level 2 costs {{villageCost2}} of each resource. Level 2 villages can',
        'hire footmen, archers and pikemen.',
        '',
        'Upgrading a village to level 3 costs {{villageCost3}} of each resource. Level 3 villages can',
        'hire soldiers of any type.',
        '',
        'While upgrading, villages do not receive resources and cannot hire soldiers.',
        '',
        'Villages have a {{villageDefBonus}}x defense bonus. If an army of yours is stopped on the same',
        'hex as your village then they will join the village\'s garrison.'
      ].join('\n')
    },
    {
      id: 'armies',
      title: 'Armies and Soldiers',
      md: [
        'Use armies to protect your buildings and to gain vassals. There are five kinds of soldier.',
        '',
        '* **Footmen** — offense {{footmenOff}}, defense {{footmenDef}}, speed {{footmenSpeed}} hexes/hour.',
        '  Good all-around soldiers. Bonus against pikemen.',
        '* **Archers** — offense {{archersOff}}, defense {{archersDef}}, speed {{archersSpeed}} hexes/hour.',
        '  Good at defense. Bonus against footmen.',
        '* **Pikemen** — offense {{pikemenOff}}, defense {{pikemenDef}}, speed {{pikemenSpeed}} hexes/hour.',
        '  Good at defense. Bonus against cavalry.',
        '* **Cavalry** — offense {{cavalryOff}}, defense {{cavalryDef}}, speed {{cavalrySpeed}} hexes/hour.',
        '  Good at offense. Bonus against archers and footmen.',
        '* **Catapults** — offense {{catapultsOff}}, defense {{catapultsDef}}, speed {{catapultsSpeed}} hexes/hour.',
        '  Offense becomes {{catapultBonus}} when attacking a castle, capital or village.',
        '',
        'If your army enters a hex that is also occupied by an enemy army, village or castle then they',
        'will attack it.',
        '',
        '#### Bonuses',
        '',
        'Footmen receive a bonus against pikemen. Archers receive a bonus against footmen. Pikemen',
        'receive a bonus against cavalry. Cavalry receive a bonus against archers and footmen.',
        'Catapults receive a bonus against buildings.',
        '',
        'When an archer fights a footman, because the archer has a bonus against footmen, the archer is',
        '{{unitBonus}}x as powerful. Your army\'s base power is multiplied by {{unitBonus}}, multiplied',
        'by the percentage of the opposing army composed of soldiers you get a bonus against. The',
        'in-game calculator will do this math for you.',
        '',
        '#### Speed',
        '',
        'Army speed is measured in hexes per hour, and an army moves at the speed of its slowest unit.',
        'An army of cavalry travels {{cavalrySpeed}} hexes per hour, but an army of cavalry and footmen',
        'travels at {{footmenSpeed}} hexes per hour.',
        '',
        '#### Ally bonuses',
        '',
        'Armies on the same hex as your vassal\'s castle or village get a {{castleAllyBonus}}x location bonus.'
      ].join('\n')
    },
    {
      id: 'capitals',
      title: 'Capitals',
      md: [
        'Capitals are another way to gain income.',
        '',
        'The map is divided into countries. Each country has one capital. To capture a country, send an',
        'army to its capital building. If there is an army there then they will battle. If you win you',
        'become the ruler of that country.',
        '',
        'Unlike other hexes, any army on a capital building will battle any other army even if they are',
        'allies.',
        '',
        'If you are ruler of a country then you get {{capitalVillagePct}}% of each village\'s income in',
        'that country, plus resources every {{castleIncomeMins}} minutes.',
        '',
        'Capital buildings give a {{capitalBonus}}x location bonus to their ruler\'s armies.'
      ].join('\n')
    },
    {
      id: 'battles',
      title: 'Battles',
      md: [
        'When a unit is on the same hex as an enemy they will battle. Every {{battleMins}} minutes all',
        'units in the battle lose soldiers. Losers lose {{powerLost}} power worth of soldiers. Winners',
        'lose {{winnerLossPct}}% of what losers lose. Larger armies and more people in a battle cause',
        'losses to go up.',
        '',
        '#### Attackers and defenders',
        '',
        'In battle, units are either attackers or defenders. Buildings are always defenders. If an army',
        'is on the same hex as their castle or village, or their ally\'s castle or village, then they are',
        'a defender. Otherwise the defender is the first army to arrive at the hex.',
        '',
        '#### Power',
        '',
        'Every round, if your units\' power plus your allies\' power is greater than your enemies\'',
        'combined power then you are a winner that round. Defenders use their defense power; attackers',
        'use their offense power.',
        '',
        'Armies inside a castle receive a {{castleDefBonus}}x bonus. Armies inside a village receive a',
        '{{villageDefBonus}}x bonus. Armies on a vassal\'s castle or village receive a {{castleAllyBonus}}x',
        'bonus, as do armies on the same hex as their own castle or village but outside it.',
        '',
        '#### Who gets the spoils',
        '',
        'Multiple armies can attack a castle at the same time. If they win, the castle goes to the first',
        'army to arrive that is still alive.'
      ].join('\n')
    },
    {
      id: 'tree',
      title: 'Vassals, Lords and Kings',
      md: [
        'If you attack someone\'s castle and win then you become their lord and they become your vassal.',
        '',
        'Lords receive {{percentToLords}}% of their vassals\' income. If a vassal has more than 5 people',
        'above them, each lord gets {{maxToLords}}% of the vassal\'s income divided by the number of lords',
        'that vassal has.',
        '',
        'Vassals do not lose the resources that their lords receive. If someone takes your castle and',
        'becomes your lord then your income stays the same.',
        '',
        'You can send gold or soldiers to your vassals, but not to enemies or anyone above you in the',
        'tree. Gold transfers and buying soldiers for vassals are public — everyone can see alerts for',
        'these in the global alerts panel.',
        '',
        'If you do not have a lord then you are a king. If you have a lord and you attack their castle and',
        'win, then their lord becomes your lord. If you attack your king\'s castle and win then they become',
        'your vassal and you become the king.',
        '',
        'You cannot attack anyone below you in the tree. You can attack the castle of people above you in',
        'the tree, but not their armies or villages.'
      ].join('\n')
    },
    {
      id: 'colors',
      title: 'Unit Colors',
      md: [
        'The color of a unit\'s flag or square is based on its relationship to you.',
        '',
        '* **Green** — your own units.',
        '* **Red** — enemy units. Solid red means a different king than you; red and light red means the',
        '  same king but a different branch of the tree. Gain vassals by attacking these units\' castles.',
        '* **Blue and purple** — units above you in the tree. Purple belongs to your king. You can attack',
        '  their castles but not their armies or villages.',
        '* **Yellow and orange** — units below you in the tree. You cannot attack these units.'
      ].join('\n')
    },
    {
      id: 'winning',
      title: 'Winning the Game',
      md: [
        'When someone becomes the Dominus a countdown starts. If nobody else becomes the Dominus before',
        'the countdown ends then the last person who was the Dominus wins the game. If someone new becomes',
        'the Dominus then the countdown restarts. The current countdown is shown in a panel in the top',
        'right of the screen.',
        '',
        'While you are the Dominus your armies can attack anyone else\'s armies, but you cannot attack',
        'their villages or castles.',
        '',
        'After someone wins, the game ends and everything is deleted after a few days. You can start a new',
        'game from the game list.'
      ].join('\n')
    },
    {
      id: 'accounts',
      title: 'Accounts and Duplicate Accounts',
      md: [
        'Duplicate accounts are not allowed. If you wish to start another account, please first delete',
        'your current account.',
        '',
        'To delete your account in a single game, open the settings panel by clicking the wrench on the',
        'left side of the screen, then click "Delete Account". To delete your entire account across all',
        'games, use the Settings link in the top right of the screen.',
        '',
        'Email verification is required to join a game when an account is created with a password. It is',
        'not required for Google or Facebook logins.'
      ].join('\n')
    },
    {
      id: 'strategy',
      title: 'Strategy Tips',
      md: [
        '* When you gain a vassal it is usually a good idea to place an army on their castle to prevent an',
        '  enemy from stealing your vassal.',
        '* It is not always a bad thing if someone takes your castle. Having a lord gives you protection, an',
        '  ally, and they can send you soldiers or gold.',
        '* Always combine your armies when in battle. Each army in a battle takes losses, so having two',
        '  armies in a battle will cause you to lose twice as many soldiers.'
      ].join('\n')
    }
  ],
  links: [
    ['/games', 'Join a game'],
    ['/results', 'Past game results'],
    ['/rankings', 'Player rankings'],
    ['/', 'Home']
  ]
};


SEO.content.games = {
  h1: 'Dominus Game List',
  lead: 'Games starting soon and games in progress.',
  md: [
    'Dominus runs many games at once. Each game starts with its own map and its own set of players,',
    'and ends when someone becomes the Dominus. Joining is free and takes a few seconds.',
    '',
    'Games come in several speeds. Relaxed games move slowly and suit players checking in once or twice',
    'a day. Speed and crazy fast games compress the same mechanics into hours instead of weeks. Pro',
    'games are limited to players with a pro account.',
    '',
    'Sign up for a game that has not started yet and you will get an email when it begins.'
  ].join('\n'),
  links: [
    ['/guide', 'How to play'],
    ['/results', 'Past game results'],
    ['/createaccount', 'Create a free account'],
    ['/', 'Home']
  ]
};


SEO.content.results = {
  h1: 'Dominus Game Results',
  lead: 'Winners and final standings from completed games.',
  md: [
    'Every completed game of Dominus keeps a permanent record: who won, how many players took part, and',
    'the final standing of everyone in the feudal tree.',
    '',
    'A game ends when one player becomes the Dominus — when every other player in the game is their',
    'vassal, or a vassal of their vassal — and holds that position until the countdown expires.'
  ].join('\n'),
  links: [
    ['/rankings', 'Overall player rankings'],
    ['/games', 'Join a game'],
    ['/guide', 'How to play'],
    ['/', 'Home']
  ]
};


SEO.content.rankings = {
  h1: 'Dominus Player Rankings',
  lead: 'Overall rankings across all completed games.',
  md: [
    'Player rankings are calculated from performance across every completed game of Dominus. Regular and',
    'pro games are ranked separately.',
    '',
    'Rankings reward consistency as well as wins — finishing high in the feudal tree counts, not just',
    'becoming the Dominus.'
  ].join('\n'),
  links: [
    ['/results', 'Past game results'],
    ['/games', 'Join a game'],
    ['/guide', 'How to play'],
    ['/', 'Home']
  ]
};


SEO.content.presskit = {
  h1: 'Dominus Press Kit',
  lead: 'Fact sheet, history, features, logos and screenshots.',
  md: [
    'Dominus is a multiplayer browser strategy game. Players grow in power by attacking another player\'s',
    'castle. Conquering someone\'s castle makes them your vassal. Vassals send their lord part of their',
    'income. If everyone in the game is your vassal, or a vassal of your vassal, then you are the Dominus.',
    '',
    'Dominus is a slow strategy game designed to not require a lot of time to play. Army movement and',
    'resource gathering happen slowly over time. Login, give your armies their orders then check back in a',
    'few hours.',
    '',
    'The game supports any number of people. As more people join, the map grows, creating a larger',
    'gameplay space.',
    '',
    '**Developer:** Daniel Phillips, based in Seattle, Washington.',
    '**Platform:** Web browser. **Price:** Free, with in-game cosmetic upgrades that have no effect on',
    'gameplay.',
    '',
    'Development started on March 23, 2014. The goal was to create a multiplayer strategy game that did',
    'not require a lot of time to play. Inspiration came from an old BBS game called Barren Realms Elite,',
    'and from Settlers of Catan. The first public game started on June 7, 2014.'
  ].join('\n'),
  links: [
    ['/', 'Home'],
    ['/guide', 'How to play'],
    ['/games', 'Join a game']
  ]
};


SEO.content.privacy = {
  h1: 'Privacy Policy',
  lead: 'How Dominus collects, uses and stores your data.',
  md: 'The full privacy policy for Dominus is shown on this page.',
  links: [['/terms', 'Terms of Service'], ['/', 'Home']]
};


SEO.content.terms = {
  h1: 'Terms of Service',
  lead: 'Terms of service for playing Dominus.',
  md: 'The full terms of service for Dominus are shown on this page.',
  links: [['/privacy', 'Privacy Policy'], ['/', 'Home']]
};


SEO.content.auth = {
  h1: 'Dominus',
  lead: 'A free multiplayer social strategy game.',
  md: [
    'Conquer castles, gain vassals and climb the feudal tree to become the Dominus. Accounts are free.'
  ].join('\n'),
  links: [
    ['/', 'Home'],
    ['/guide', 'How to play'],
    ['/games', 'View open games']
  ]
};


SEO.content.notFound = {
  h1: 'Page Not Found',
  lead: 'That page does not exist.',
  md: 'The page you asked for could not be found. Try one of the links below.',
  links: [
    ['/', 'Home'],
    ['/games', 'Game list'],
    ['/guide', 'How to play'],
    ['/results', 'Past game results'],
    ['/rankings', 'Player rankings']
  ]
};


// content key -> canonical path, used by llms-full.txt
SEO.pathForContent = function(key) {
  var map = {
    home: '/',
    guide: '/guide',
    games: '/games',
    results: '/results',
    rankings: '/rankings',
    presskit: '/presskit',
    privacy: '/privacy',
    terms: '/terms'
  };
  return map[key] || '/';
};
