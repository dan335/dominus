Package.describe({
  name: 'dominus-mapmaker',
  version: '0.0.1',
  summary: 'Map maker for Dominus',
  git: 'https://github.com/dan335/dominus',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.1.0.2');
  api.use([
    'mongo',
    'ejson',
    'dominus-init',
    'dominus-minimap',
    'dominus-alerts',
    'dominus-capitols',
    'danimal:hx@1.0.9',
    'dominus-collections',
    'random'
  ]);
  api.addFiles('server/mapmaker.js', 'server');
  api.addFiles('server/masker.js', 'server');
  api.addFiles('server/publishMap.js', 'server');
  api.addFiles('server/shorefinder.js', 'server');
  api.addFiles('client/mapmakerClient.js', 'client');
  api.export(['Mapmaker']);
  api.export('Shorefinder', 'server');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use([
    'dominus-init',
    'dominus-mapmaker',
    'dominus-minimap',
    'underscore',
    'ejson',
    'danimal:hx@1.0.9',
  ]);
  api.addFiles('server/mapmaker-tests-server.js', 'server');
  api.addFiles('server/shorefinder-tests-server.js', 'server');
});
