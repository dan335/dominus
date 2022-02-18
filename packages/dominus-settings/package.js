Package.describe({
  name: 'dominus-settings',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.2.1');
  api.use([
    'ecmascript',
    'dominus-collections',
    'underscore',
    'ejson',
    'mongo',
    'momentjs:moment@2.18.1'
  ]);
  api.addFiles([
    'namespace.js',
    'settingsArmies.js',
    'settingsBattles.js',
    'settingsCapitals.js',
    'settingsCastles.js',
    'settingsGraphs.js',
    'settingsIncome.js',
    'settingsInit.js',
    'settingsMapmaker.js',
    'settingsMarkers.js',
    'settingsMarket.js',
    'settingsMinimap.js',
    'settingsPanels.js',
    'settingsStore.js',
    'settingsVillages.js',
    'settingMethods.js'
  ]);
  api.imply([
    'dominus-collections'
  ])
  api.export([
    '_s',
    '_gs'
  ]);
});
