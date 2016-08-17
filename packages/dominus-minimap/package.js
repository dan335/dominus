Package.describe({
  name: 'dominus-minimap',
  version: '0.0.1',
  summary: 'Minimap for Dominus',
  git: 'https://github.com/dan335/dominus',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2');
  api.use([
    'blaze-html-templates',
    'dominus-init',
    'less'
  ]);
  //api.use('tracker', 'client');
  api.addFiles([
    'both/namespace.js',
    'both/minimapFunctions.js'
  ]);
  api.addFiles([
    'server/publishMinimap.js',
    'server/minimap.js',
    'server/generateMinimap.js'
  ], 'server');
  api.addFiles('client/minimap.html', 'client');
  api.addFiles('client/minimap.js', 'client');
  api.addFiles('client/minimap.less', 'client');
  api.export('Minimap');
});

Npm.depends({
  'simplify-js': '1.2.1'
});
