Package.describe({
  name: 'dominus-graphs',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2.1');
  api.use([
    'momentjs:moment@2.13.0',
    'blaze-html-templates',
    'less',
    'dominus-init',
    'danimal:readymanager',
    'random',
    'dominus-market'
  ]);
  api.addFiles('both/initGraphs.js');
  api.addFiles([
    'server/dailyStats.js',
    'server/numAllies.js',
    'server/publishGraphs.js',
  ], 'server');
  api.addFiles([
    'client/incomeGraph.html',
    'client/incomeGraph.js',
    'client/capitalIncomeGraph.html',
    'client/capitalIncomeGraph.js',
    'client/vassalIncomeGraph.html',
    'client/vassalIncomeGraph.js',
    'client/numVassalsGraph.html',
    'client/numVassalsGraph.js',
    'client/playersGraph.html',
    'client/playersGraph.js',
    'client/buildingIncomeGraph.html',
    'client/buildingIncomeGraph.js',
    'client/graphs.less',
    'client/stats_panel.html',
    'client/stats_panel.js',
    'client/stats_panel.less',
    'client/rankGraph.html',
    'client/rankGraph.js',
    'client/soldierWorthGraph.html',
    'client/soldierWorthGraph.js'
  ], 'client');
  api.export(['dGraphs']);
});


Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('dominus-graphs');
});
