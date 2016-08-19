Package.describe({
  name: 'dominus-game',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2');
  api.use([
    'ecmascript',
    'blaze-html-templates',
    'dominus-settings',
    'less',
    'underscore',
    'ddp-rate-limiter',
    'steeve:reactive-cookie@0.0.8',
    'dominus-castles',
    'dominus-init',
    'dominus-alerts'
  ]);
  api.addFiles([
    'both/namespace.js',
    'both/gameMethods.js'
  ]);
  api.addFiles([
    'client/game.html',
    'client/game.js',
    'client/game.less',
    'client/gameLeftMenu.html',
    'client/gameLeftMenu.js',
    'client/gameLeftMenu.less'
  ], 'client');
  api.addFiles([
    'server/publishGame.js',
    'server/publishRightPanel.js',
    'server/numPlayers.js',
    'server/numCountries.js',
    'server/numVillages.js',
    'server/gameServerFunctions.js'
  ], 'server');
  api.export([
    'dGame'
  ]);
});
