Package.describe({
  name: 'dominus-init',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.2');
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
    'mdg:validation-error@0.1.0',
    'ddp-rate-limiter',
    'random',
    'dominus-queue',
    // 2.1.0 runs ticks the way percolate:synced-cron did. From 2.2.0 it skips a
    // tick while an earlier one of the same cron has no finishedAt, and from
    // 2.2.1 it calls process.exit on SIGTERM, SIGINT, an uncaught exception
    // and an unhandled rejection, which would cut the worker's shutdown
    // (dominus-queue/shutdown.js) short.
    'quave:synced-cron@=2.1.0'
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
    'mdg:validation-error',
    'ddp-rate-limiter',
    'dominus-queue',
    'quave:synced-cron'
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
