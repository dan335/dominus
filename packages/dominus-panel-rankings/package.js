Package.describe({
  name: 'dominus-panel-rankings',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.2.1');
  api.use([
    'ecmascript',
    'blaze-html-templates',
    'less',
    'mongo',
    'danimal:readymanager',
    'ddp-rate-limiter',
    'dominus-settings',
    'dominus-queue',
    'meteorhacks:unblock@1.1.0',
    'dominus-rankings'
  ]);
  api.addFiles([
    'lib/collections.js'
  ]);
  api.addFiles([
    'server/publish.js',
    'lib/rankingsJob.js'
  ], 'server');
  api.addFiles([
    'client/rankings_panel.html',
    'client/rankings_panel.js',
    'client/rankings_panel.less'
  ], 'client');
  api.export([
    'RankingsCountries'
  ], 'client');
});
