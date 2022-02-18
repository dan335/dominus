Package.describe({
  name: 'dominus-capitols',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.2.1');
  api.use([
    'dominus-init',
    'blaze-html-templates',
    'less',
    'mongo',
    'dominus-market',
    'dominus-alerts'
  ]);
  api.addFiles([
    'both/namespace.js'
  ]);
  api.addFiles([
    'server/capitolServerFunctions.js',
    'server/publishCapitols.js'
  ], 'server');
  api.addFiles([
    'client/capitolMapObject.html',
    'client/capitolMapObject.js',
    'client/capitolMapObject.less',
    'client/rp_info_capitol.html',
    'client/rp_info_capitol.js',
    'client/rp_info_capitol.less',
    'client/rightPanelCollection.js',
    'client/capitolFlagMapObject.html',
    'client/capitolFlagMapObject.js'
  ], 'client');
  api.export('RightPanelCapitals', 'client');
  api.export([
    'dCapitals'
  ]);
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('dominus-capitols');
});
