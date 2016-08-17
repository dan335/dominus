Package.describe({
  name: 'dominus-queue',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2');
  api.use([
    'ecmascript',
    'underscore',
    'mongo',
    'dominus-collections',
    'ejson',
    'check',
    'momentjs:moment@2.13.0'
  ]);
  api.addFiles([
    'queue.js',
    'queueMethods.js'
  ], 'server');
  api.export([
    'Queues'
  ], 'server');
});

Npm.depends({
  "bull":"1.0.0",
  "bull-ui":"1.2.1"
});
