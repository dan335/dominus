Package.describe({
  name: 'dominus-init',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2');
  api.use([
    'dominus-settings',
    'mongo',
    'check',
    'danimal:checkvalidnumber@1.0.1',
    'underscore',
    'blaze-html-templates',
    'less',
    'dominus-market',
    'ecmascript',
    'mdg:validated-method@0.2.0',
    'mdg:validation-error@0.1.0',
    'aldeed:simple-schema@1.4.0',
    'ddp-rate-limiter',
    'random',
    'dominus-queue',
    'percolate:synced-cron@1.3.1'
  ]);
  api.addFiles([
    'both/namespace.js'
  ]);
  api.addFiles([
    'server/relation_finder.js',
    'server/relationships.js',
    'server/tree_change_enemy_check.js',
    'server/syncedCron.js'
  ], 'server');
  api.addFiles([
    'both/dFunc.js',
    'both/initFunctions.js',
  ]);
  api.addFiles([
    'client/globalHelpers.js',
    'client/initClientFunctions.js'
  ], 'client');
  api.addFiles([
    'client/variables.import.less',
    'client/colors.import.less'
  ], 'client', {isImport:true});
  api.addFiles('server/initServerFunctions.js', 'server');
  api.imply([
    'dominus-settings',
    'ecmascript',
    'underscore',
    'check',
    'danimal:checkvalidnumber',
    'mdg:validated-method',
    'mdg:validation-error',
    'aldeed:simple-schema',
    'ddp-rate-limiter',
    'dominus-queue',
    'percolate:synced-cron'
  ])
  api.export([
    'dInit',
    'dFunc'
  ]);
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use(['dominus-init', 'dominus-mapmaker', 'dominus-armies']);
  api.addFiles('tests/initTests-server.js', 'server');
});
