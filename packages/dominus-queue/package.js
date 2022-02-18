Package.describe({
  name: 'dominus-queue',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.2');
  api.use([
    'ecmascript',
    'underscore',
    'mongo',
    'dominus-collections',
    'ejson',
    'check',
    'momentjs:moment@2.18.1'
  ]);
  api.addFiles([
    'queue.js',
    'queueMethods.js',
    'shutdown.js'
  ], 'server');
  api.export([
    'Queues'
  ], 'server');
});

Npm.depends({
  "bull":"2.2.6",
  //"bull-ui":"1.2.1"
});
