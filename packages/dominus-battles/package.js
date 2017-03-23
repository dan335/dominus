Package.describe({
  name: 'dominus-battles',
  version: '1.0.2',
  git: 'https://github.com/dan335/dominus-packages',
  documentation: 'README.md',
  summary: 'Battles for Dominus - https://dominusgame.net'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2');
  api.use([
    'mongo',
    'momentjs:moment@2.18.1'
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
