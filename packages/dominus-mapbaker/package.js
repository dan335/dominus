Package.describe({
  name: 'dominus-mapbaker',
  version: '0.0.1',
  summary: 'Mapbaker for Dominus',
  git: 'https://github.com/dan335/dominus',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2');
  api.use([
    'dominus-init',
    'dominus-mapmaker',
    'dominus-settings',
    'danimal:hx@1.0.9',
    'classcraft:knox@0.9.11',
    'dominus-minimap',
    'ejson'
  ]);
  api.addFiles([
    'mapbaker.js',
  ], 'server');
  api.export('Mapbaker', 'server');
});

Package.onTest(function(api) {
  api.use(['tinytest', 'underscore']);
  api.use('dominus-init');
  api.use('dominus-mapbaker');
  api.use('dominus-mapmaker', 'server');
  api.addFiles('mapbaker-tests.js', 'server');
});

// Npm.depends({
//   svgexport: 'https://github.com/dan335/svgexport/tarball/4b36e13013b9e6d095137d92a2b8c6a0413985ef'
// });

// Npm.depends({
//   //svgexport: 'https://github.com/dan335/svgexport/tarball/2b95cfe36f9e7b22bbf6c4fdac5e80a3753fb789'
//   svgexport: '0.3.0'
// });
