Package.describe({
  name: 'dominus-armies',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.2');
  api.use(['templating', 'less'], 'client');
  api.use([
    'dominus-init',
    'dominus-mapmaker',
    'dominus-mappather',
    'ejson',
    'danimal:hx@1.0.9',
    'momentjs:moment@2.18.1',
    'dominus-alerts',
    'reactive-var',
    'tracker',
    'ejson',
  ]);
  api.addFiles(['both/namespace.js']);
  api.addFiles([
    'server/publishArmyPaths.js',
    'server/armyServerFunctions.js',
    'server/moveArmiesJob2.js',
    'server/publishArmies.js',
    'server/expirePastMovesJob.js',
    'server/armyPathObservers.js',
  ], 'server');
  api.addFiles([
    'both/armyValidatedMethods.js',
    'both/armyMethods.js',
    'both/armyPathMethods.js',
    'both/armyPathValidatedMethods.js',
    'both/armyFunctions.js',
  ]);
  api.addFiles([
    'client/rightPanel/rp_moveArmy.html',
    'client/rightPanel/rp_moveArmy.js',
    'client/rightPanel/rp_createArmy.html',
    'client/rightPanel/rp_createArmy.js',
    'client/rightPanel/rp_info_army.html',
    'client/rightPanel/rp_info_army.js',
    'client/rightPanel/rp_info_army.less',
    'client/rightPanel/rp_info_army_paths.html',
    'client/rightPanel/rp_info_army_paths.js',
    'client/rightPanel/rp_disbandArmy.html',
    'client/rightPanel/rp_disbandArmy.js',
    'client/rightPanel/rp_armies.less',
    'client/rightPanel/rp_split_armies.html',
    'client/rightPanel/rp_split_armies.js',
    'client/rightPanel/rp_hire_army.html',
    'client/rightPanel/rp_hire_army.js',
    'client/rightPanel/rp_hire_army.less'
  ], 'client');
  api.addFiles([
    'client/armyPathHighlights.html',
    'client/armyPathHighlights.js',
    'client/armyPathHighlights.less'
  ], 'client');
  api.addFiles([
    'client/armyMapObject.html',
    'client/armyMapObject.js',
    'client/armyMapObject.less',
    'client/armyFlagMapObject.html',
    'client/armyFlagMapObject.js',
    'client/armyPastMoves.html',
    'client/armyPastMoves.js',
    'client/armyPastMoves.less'
  ], 'client');
  api.export([
    'dArmies'
  ]);
  api.export(['ClientArmyPathFunctions'], 'client');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use([
    'dominus-init',
    'dominus-mapmaker',
    'dominus-armies',
    'momentjs:moment@2.18.1',
    'dominus-castles'
  ]);
  api.addFiles([
    'tests/armiesTests-server.js',
    'tests/armiesTests-stubs.js',
    'tests/armiesTests-server-armyPaths.js',
    'server/expirePastMovesTests.js'
    ], 'server');
});
