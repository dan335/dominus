Package.describe({
  name: 'dominus-rankings',
  version: '1.0.2',
  git: 'https://github.com/dan335/dominus-packages',
  documentation: 'README.md',
  summary: 'Overall player rankings for Dominus - https://dominusgame.net'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2.1');
  api.use([
    'ecmascript'
  ]);
  api.addFiles([
    'findPlayerRankings.js'
  ], 'server');
  api.export([
    'dRankings'
  ], 'server');
});
