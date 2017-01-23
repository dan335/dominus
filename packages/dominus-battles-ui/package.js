Package.describe({
  name: 'dominus-battles-ui',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: '',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2');
  api.use('ecmascript');
  api.use([
    'blaze-html-templates',
    'less',
    'mongo',
    'accounts-base',
    'momentjs:moment@2.13.0',
    'dominus-armies',
    'dominus-castles',
    'dominus-villages',
    'dominus-capitols',
    'dominus-init',
    'dominus-hexmap',
    'dominus-alerts',
    'dominus-mapmaker',
    'dominus-battles',
    'dominus-queue'
  ]);
  api.addFiles([
    'lib/collectionsBattles.js',
    'lib/namespace.js'
  ]);
  api.addFiles([
    'server/publishBattles.js',
    'server/battle.js',
    'server/jobBattle.js',
    'calculatorPanel/server/publishCalc.js',
    'server/removeStuckBattlesJob.js'
  ], 'server');
  api.addFiles([
    'reports/client/battleReport.html',
    'reports/client/battleReport.js',
    'reports/client/battleReport.less',
    'reports/client/battleReportUnit.html',
    'reports/client/battleReportUnit.js',
    'reports/client/battleReportUnitInfo.html',
    'reports/client/battleReportUnitInfo.js',
    'reports/client/roundTitle.html',
    'reports/client/roundTitle.js',
    'battleReport/client/battle.html',
    'battleReport/client/battle.js',
    'battleReport/client/battle.less',
    'calculatorPanel/client/calc_army.html',
    'calculatorPanel/client/calc_army.js',
    'calculatorPanel/client/calculatorPanel.html',
    'calculatorPanel/client/calculatorPanel.js',
    'calculatorPanel/client/calculatorPanel.less',
    'calculatorPanel/client/collectionsCalc.js',
  ], 'client');
  api.export([
    'Battles2',
    'Rounds',
    'BattleArmy',
    'BattleRound',
    'dBattles'
  ]);
  api.export([
    'Roundtitles',
    'Calcplayers'
  ], 'client');
  api.export('BattleJob', 'server');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use([
    'dominus-init',
    'dominus-battles',
    'dominus-armies',
    'dominus-mapmaker'
  ]);
  api.addFiles([
    'tests/battleTests-server-rounds.js',
    'tests/battleTests-server-armies.js',
    'tests/battleTests-server.js'
  ], 'server');
});
