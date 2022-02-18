Package.describe({
  name: 'dominus-income',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.2.1');
  api.use([
    'momentjs:moment@2.18.1',
    'dominus-init',
    'dominus-market',
    'dominus-castles',
    'dominus-villages',
    'dominus-capitols',
    'mongo',
    'ejson'
  ]);
  api.addFiles([
    'server/namespace.js',
    'server/villageIncomeJob.js',
    'server/castleIncomeJob.js',
    'server/capitalIncomeJob.js',
    'server/incomeJobs.js',
    'server/spendTaxes.js'
  ], 'server');
  api.export('dIncome', 'server');
});


Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use([
    'dominus-income',
    'dominus-init',
    'dominus-market',
  ]);
  api.addFiles('tests/server/incomeTests.js', 'server');
});
