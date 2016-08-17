Package.describe({
  name: 'dominus-hexmap',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: '',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2.0.2');
  api.use([
    'less',
    'danimal:mapmover',
    'blaze-html-templates',
    'dominus-init',
    'meteorhacks:unblock@1.1.0'
  ]);
  api.addFiles([
    'both/namespace.js',
    'both/hexmapFunctions.js'
  ]);
  api.addFiles([
    'server/publishHexmap.js',
    'server/hexMethods.js',
    'server/countriesMethods.js'
  ], 'server');
  api.addFiles([
    'client/mapmover.js',
    'client/hexmapClientFunctions.js',
    'client/hexmap.html',
    'client/hexmap.js',
    'client/hexmap.less',
    'client/drawCountries.html',
    'client/drawCountries.js',
    'client/drawCountryBorders.html',
    'client/drawCountryBorders.js',
    'client/mapCanvas.html',
    'client/mapCanvas.js'
  ], 'client');
  api.addFiles([
    'both/hexmapMethods.js'
  ])
  api.export('dHexmap');
});

// Package.onTest(function(api) {
//   api.use('ecmascript');
//   api.use('tinytest');
//   api.use('dominus-hexmap');
// });
