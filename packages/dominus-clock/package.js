Package.describe({
  name: 'dominus-clock',
  version: '0.0.1',
  summary: 'One clock and one random source for game code',
  git: '',
  documentation: null
});

Package.onUse(function(api) {
  api.use([
    'ecmascript',
    'underscore',
    'random'
  ]);
  api.addFiles([
    'clock.js',
    'random.js'
  ]);
  api.export([
    'dClock',
    'dRandom'
  ]);
});
