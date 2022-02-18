Package.describe({
  name: 'dominus-control',
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
  //api.versionsFrom('1.2.1');
  api.use([
    'ecmascript',
    'blaze-html-templates',
    'less',
    'momentjs:moment@2.18.1',
    'dominus-init'
  ]);
  api.addFiles([
    'both/namespace.js',
    'games/both/gamesMethods.js'
  ]);
  api.addFiles([
    'games/server/controlGamesPublish.js',
    'mailinglist/server/mailinglistMethods.js',
    'onlineUsers/server/control_onlineUsersPublish.js',
    'kuestats/server/kuestatsPublish.js',
    'kuestats/server/control_queueMethods.js',
    'bans/server/bansMethods.js',
    'bans/server/bansPublish.js',
    'moderators/server/moderatorsPublish.js',
    'moderators/server/moderatorsMethods.js'
  ], 'server');
  api.addFiles([
    'client/control.html',
    'client/control.js',
    'client/control.less',
    'client/controlMenu.html',
    'client/controlMenu.js',
    'games/client/control_games.html',
    'games/client/control_games.js',
    'games/client/control_gamesAdd.html',
    'games/client/control_gamesAdd.js',
    'games/client/control_gamesEdit.html',
    'games/client/control_gamesEdit.js',
    'login/client/control_login.html',
    'mailinglist/client/control_mailinglist.html',
    'mailinglist/client/control_mailinglist.js',
    'onlineUsers/client/control_onlineUsers.html',
    'onlineUsers/client/control_onlineUsers.js',
    'kuestats/client/control_kuestats.html',
    'kuestats/client/control_kuestats.js',
    'bans/client/bans.html',
    'bans/client/bans.js',
    'moderators/client/moderators.html',
    'moderators/client/moderators.js'
  ], 'client');
  api.export('dControl');
});
