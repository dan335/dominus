Package.describe({
  name: 'dominus-chat',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.2.1');
  api.use([
    'dominus-init',
    'mongo',
    'less',
    'blaze-html-templates',
    'dominus-hexmap',
    'mdg:validation-error@0.1.0',
    'steeve:reactive-cookie@0.0.8'
  ]);
  api.addFiles([
    'lib/namespace.js',
    'lib/methodsChat.js'
  ]);
  api.addFiles([
    'server/functions.js',
    'server/methods.js',
    'server/publish.js',
    'server/recentChats.js'
  ], 'server');
  api.addFiles([
    'client/chatroom_list.html',
    'client/chatroom_list.js',
    'client/chatroom_member.html',
    'client/chatroom_member.js',
    'client/chatroom_open.html',
    'client/chatroom_open.js',
    'client/chatrooms_panel.html',
    'client/chatrooms_panel.js',
    'client/chatrooms.less'
  ], 'client');
  api.export([
    'dChat'
  ]);
});
