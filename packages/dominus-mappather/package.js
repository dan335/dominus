Package.describe({
  name: 'dominus-mappather',
  version: '0.0.1',
  summary: 'Map pathfinding for dominus',
  git: 'https://github.com/dan335/dominus',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.1.0.2');
  api.use([
    'danimal:hx@1.0.9',
    'dominus-mapmaker',
    'dominus-init',
    'mongo'
  ]);
  api.addFiles([
    'server/namespace.js',
    'server/mappather.js',
    'server/countryPather.js'
  ], 'server');
  api.export('Mappather', 'server')
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use([
    'dominus-mappather',
    'underscore',
    'danimal:hx@1.0.9',
    'dominus-init',
    'dominus-mapmaker'
  ]);
  api.addFiles('tests/mappather-tests-server.js', 'server')
});
