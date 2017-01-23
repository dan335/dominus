Package.describe({
  name: 'dominus-help',
  version: '1.0.4',
  summary: 'Help for Dominus',
  git: 'https://github.com/dan335/dominus-packages',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.3.2.4');
  api.use([
    'ecmascript',
    'less',
    'blaze-html-templates',
    'markdown'
  ]);
  api.use('dominus-init@0.0.1', ['client', 'server'], {weak:true});
  api.addFiles([
    'client/help_armies.html',
    'client/help_armies.js',
    'client/help_battles.html',
    'client/help_battles.js',
    'client/help_capitals.html',
    'client/help_capitals.js',
    'client/help_castles.html',
    'client/help_castles.js',
    'client/help_colors.html',
    'client/help_dupes.html',
    'client/help_faq.html',
    'client/help_howToStart.html',
    'client/help_howToStart.js',
    'client/help_links.html',
    'client/help_market.html',
    'client/help_market.js',
    'client/help_objective.html',
    'client/help_panel.html',
    'client/help_panel.js',
    'client/help_panel.less',
    'client/help_tree.html',
    'client/help_tree.js',
    'client/help_tutorials.html',
    'client/help_villages.html',
    'client/help_villages.js',
    'client/help_winning.html',
    'client/help_winning.js'
  ], 'client');
});
