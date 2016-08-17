Package.describe({
  name: 'dominus-tree',
  version: '0.0.1',
  summary: 'Tree for Dominus',
  git: 'https://github.com/dan335/dominus',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2');
  api.use([
    'blaze-html-templates',
    'less',
    'ecmascript',
    'reactive-var',
    'underscore',
    'dominus-queue',
    'check',
    'dominus-collections'
  ]);
  api.addFiles([
    'client/tree_panel.html',
    'client/tree_panel.js',
    'client/tree_panel.less',
    'client/treeUser.html',
    'client/treeUser.js',
    'client/rightPanelTree.html',
    'client/rightPanelTree.js'
  ], 'client');
  api.addFiles('lib/server/generateTree.js', 'server');
});
