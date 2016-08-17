Package.describe({
  name: 'dominus-popups',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2');
  api.use([
    'ecmascript',
    'blaze-html-templates',
    'dominus-init'
  ]);
  api.addFiles([
    'dominusPopup/server/dominusPopupPublish.js'
  ], 'server');
  api.addFiles([
    'dominusPopup/client/dominusPopup.html',
    'dominusPopup/client/dominusPopup.js'
  ], 'client');
});
