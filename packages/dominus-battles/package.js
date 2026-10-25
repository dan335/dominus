Package.describe({
  name: 'dominus-battles',
  version: '1.0.2',
  git: 'https://github.com/dan335/dominus-packages',
  documentation: 'README.md',
  summary: 'Battles for Dominus - https://dominusgame.net'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.2');
  api.use([
    // compiles its async functions so each await resumes in a fiber; without
    // it, a sync Meteor call after an await throws "Can't wait without a fiber"
    'ecmascript',
    'mongo',
    'momentjs:moment@2.18.1',
    'dominus-clock'
  ]);
  api.addFiles([
    'calculator/armies.js',
    'calculator/rounds.js'
  ]);
  api.export([
    'BattleArmy',
    'BattleRound'
  ])
});
