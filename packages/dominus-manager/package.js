Package.describe({
  name: 'dominus-manager',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.5.1');
  api.use([
    'ddp-client',
    'dominus-market',
    'dominus-init',
    'accounts-base',
    'email',
    'ejson',
    'mongo',
    'fongandrew:find-and-modify@0.2.1',
    'dominus-game',
    'dominus-armies'
  ]);
  api.addFiles([
    'both/namespace.js',
  ]);
  api.addFiles([
    'server/managerServerFunctions.js',
    'server/checkForDominus.js',
    'server/gameEndJob.js',
    'server/gameCloseJob.js',
    'server/deleteInactiveUsers.js',
    'server/managerMethods.js',
    'server/gameStartJob.js',
    'server/gamestats.js'
  ], 'server');
  api.addFiles([
    'client/managerClientFunctions.js'
  ], 'client');
  api.export([
    'dManager',
    'Profiles',
    'Prefs'
  ]);
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('dominus-manager');
});
