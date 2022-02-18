Package.describe({
  name: 'forum-ui-dominus',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.2.1');
  api.use([
    'ecmascript',
    'forum-base',
    'templating',
    'less',
    'danimal:simplerouter@1.0.0',
    'reactive-var',
    'steeve:reactive-cookie@0.0.8',
    'chuangbo:marked@0.3.5_1',
    'underscore',
    'ejson'
  ]);
  api.addFiles([
    'both/forumSettings.js'
  ]);
  api.addFiles([
    'client/forumFunctions.js',
    'client/forumList.html',
    'client/forumList.js',
    'client/forumBefore.html',
    'client/forumAfter.html',
    'client/forumContainer.html',
    'client/forumContainer.js',
    'client/forumNewTopic.html',
    'client/forumNewTopic.js',
    'client/forumTopic.html',
    'client/forumTopic.js',
    'client/forum.less'
  ], 'client');
  api.export([
    'forumSettings'
  ]);
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('forum-ui-dominus');
});
