Package.describe({
  name: 'forum-base',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2.1');
  api.use([
    'ecmascript',
    'danimal:simplerouter@1.0.0',
    'blaze-html-templates',
    'mongo',
    'ddp-rate-limiter',
    'steeve:reactive-cookie@0.0.8',
    'underscore'
  ]);
  api.addFiles([
    'both/namespace.js',
    'both/forumCollections.js',
    'both/forumFunctions.js',
    'both/forumMethods.js'
  ]);
  api.addFiles([
    'server/forumPublish.js'
  ], 'server');
  api.addFiles([
    'client/forum.html',
    'client/forum.js'
  ], 'client');
  api.export([
    'Forumposts',
    'Forumtopics'
  ]);
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('forum-base');
});
