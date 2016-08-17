Package.describe({
  name: 'dominus-admin',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2.1');
  api.use([
    'blaze-html-templates',
    'less',
    'dominus-init',
    'facts',
    'mongo',
    'reactive-var'
  ]);
  api.addFiles([
    'client/admin.html',
    'client/admin.js',
    'client/admin.less',
    'client/adminMenu.html',
    'client/adminMenu.js',
    'client/adminLogin.html',
    'charges/client/admin_charges.html',
    'charges/client/admin_charges.js',
    'chatrooms/client/admin_chatrooms.html',
    'chatrooms/client/admin_chatrooms.js',
    'chatrooms/client/admin_chatroom.html',
    'chatrooms/client/admin_chatroom.js',
    'chatrooms/client/admin_chatroomsCollections.js',
    'commands/client/admin_commands.html',
    'commands/client/admin_commands.js',
    'facts/client/admin_facts.html',
    'facts/client/admin_facts.js',
    'gamestats/client/admin_gamestats.html',
    'gamestats/client/admin_gamestats.js',
    'reports/client/admin_reports.html',
    'reports/client/admin_reports.js',
    'usersonline/client/admin_usersonline.html',
    'usersonline/client/admin_usersonline.js',
  ], 'client');
  api.addFiles([
    //'server/gamestats.js',
    'server/publish.js',
    'server/startup.js'
  ], 'server');
});
