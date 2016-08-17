Package.describe({
  name: 'dominus-market',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2.1');
  api.use([
    'ecmascript',
    'mongo',
    'danimal:checkvalidnumber',
    'check',
    'dominus-settings',
    'blaze-html-templates',
    'less',
    'dominus-collections',
    'ddp-rate-limiter',
    'momentjs:moment@2.13.0',
    'underscore',
    'dominus-queue'
  ]);
  api.addFiles([
    'both/initMarket.js',
    'both/marketFunctions.js'
  ]);
  api.addFiles([
    'server/marketServerFunctions.js',
    'server/publishMarket.js',
    'server/marketServerMethods.js'
  ], 'server');
  api.addFiles([
    'client/market_panel.html',
    'client/market_panel.js',
    'client/market_panel.less',
    'client/marketPriceChart.html',
    'client/marketPriceChart.js',
    'client/marketVolumeChart.html',
    'client/marketVolumeChart.js',
    'client/marketBuySell.html',
    'client/marketBuySell.js'
  ], 'client');
  api.export([
    'dMarket'
  ]);
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use([
    'dominus-market',
    'dominus-mapmaker'
  ]);
  api.addFiles('server/marketServerTests.js', 'server');
});
