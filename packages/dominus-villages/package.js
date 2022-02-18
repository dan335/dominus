Package.describe({
  name: 'dominus-villages',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.2');
  api.use([
    'blaze-html-templates',
    'less',
    'dominus-init',
    'dominus-armies',
    'dominus-market',
    'dominus-mapmaker',
    'danimal:hx@1.0.9',
    'momentjs:moment@2.18.1'
  ])
  api.addFiles([
    'both/villageMethods.js'
  ]);
  api.addFiles([
    'client/villageMapObject.html',
    'client/villageMapObject.js',
    'client/villageFlagMapObject.html',
    'client/villageFlagMapObject.js',
    'client/villageMapObject.less',
    'client/rp_village_upgrade.html',
    'client/rp_village_upgrade.js',
    'client/rp_info_village.html',
    'client/rp_info_village.js',
    'client/rp_destroy_village_confirm.html',
    'client/rp_destroy_village_confirm.js',
  ], 'client');
  api.addFiles([
    'server/villageBuildUpgradeJob.js',
    'server/villageServerFunctions.js',
    'server/publishVillages.js'
  ], 'server');
  api.export([
    'dVillages'
  ]);
});

Package.onTest(function(api) {
  api.use([
    'tinytest',
    'dominus-villages',
    // 'dominus-init',
    // 'dominus-market',
    // 'dominus-armies',
    // 'dominus-mapmaker'
  ]);
  api.addFiles([
    //'server/villageServerFunctionsTests.js'
  ], 'server');
});
