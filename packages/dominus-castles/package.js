Package.describe({
  name: 'dominus-castles',
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
  //api.versionsFrom('1.2');
  api.use([
    'mongo',
    'accounts-base',
    'dominus-init',
    'dominus-mapmaker',
    'dominus-armies',
    'dominus-hexmap',
    //'dominus-manager',
    'dominus-capitols',
    'blaze-html-templates',
    'less',
    'momentjs:moment@2.18.1',
    'dominus-tree',
  ]);
  api.addFiles([
    'both/castleMethods.js'
  ]);
  api.addFiles([
    'server/castleFunctions.js',
    'server/publishCastles.js',
    'server/castleServerMethods.js',
  ], 'server');
  api.addFiles([
    'client/castleMapObject.html',
    'client/castleMapObject.js',
    'client/castleMapObject.less',
    'client/castleFlagMapObject.html',
    'client/castleFlagMapObject.js',
    'client/rp_info_castle.html',
    'client/rp_info_castle.js',
  ], 'client');
  api.export([
    'dCastles'
  ]);
});
