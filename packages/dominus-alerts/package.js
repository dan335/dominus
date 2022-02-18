Package.describe({
  name: 'dominus-alerts',
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
    'mongo',
    'blaze-html-templates',
    'less',
    'reactive-var',
    'dominus-init',
    'dominus-hexmap'
  ]);
  api.addFiles([
    'lib/namespace.js',
    'lib/collections.js',
    'lib/methods.js',
    'lib/myAlertList.js'
  ]);
  api.addFiles([
    'lib/server/newAlerts.js',
    'lib/server/newGlobalAlerts.js',
    'lib/server/publish.js'
  ], 'server');
  api.addFiles([
    'lib/client/alerts.js',
  ], 'client');
  api.addFiles([
    'client/alerts/alert_addedToChatroom.html',
    'client/alerts/alert_addedToChatroom.js',
    'client/alerts/alert_armyDestroyed.html',
    'client/alerts/alert_armyDestroyed.js',
    'client/alerts/alert_armyFinishedAllMoves.html',
    'client/alerts/alert_armyFinishedAllMoves.js',
    'client/alerts/alert_battleStart.html',
    'client/alerts/alert_battleStart.js',
    'client/alerts/alert_chatroomMadeAdmin.html',
    'client/alerts/alert_chatroomMadeAdmin.js',
    'client/alerts/alert_chatroomNowOwner.html',
    'client/alerts/alert_chatroomNowOwner.js',
    'client/alerts/alert_chatroomRemovedFromAdmin.html',
    'client/alerts/alert_chatroomRemovedFromAdmin.js',
    'client/alerts/alert_gainedVassal.html',
    'client/alerts/alert_gainedVassal.js',
    'client/alerts/alert_kickedFromChatroom.html',
    'client/alerts/alert_kickedFromChatroom.js',
    'client/alerts/alert_lostVassal.html',
    'client/alerts/alert_lostVassal.js',
    'client/alerts/alert_lostCapital.html',
    'client/alerts/alert_lostCapital.js',
    'client/alerts/alert_newKingChatroom.html',
    'client/alerts/alert_newKingChatroom.js',
    'client/alerts/alert_newLord.html',
    'client/alerts/alert_newLord.js',
    'client/alerts/alert_noLongerDominus.html',
    'client/alerts/alert_noLongerDominus.js',
    'client/alerts/alert_noLongerDominusNewUser.html',
    'client/alerts/alert_noLongerDominusNewUser.js',
    'client/alerts/alert_receivedArmy.html',
    'client/alerts/alert_receivedArmy.js',
    'client/alerts/alert_receivedGoldFrom.html',
    'client/alerts/alert_receivedGoldFrom.js',
    'client/alerts/alert_titleTemplate.html',
    'client/alerts/alert_vassalIsUnderAttack.html',
    'client/alerts/alert_vassalIsUnderAttack.js',
    'client/alerts/alert_villageDestroyed.html',
    'client/alerts/alert_villageDestroyed.js',
    'client/alerts/alert_youAreDominus.html',
    'client/alerts/alert_youAreDominus.js',
    'client/alerts/alert_capturedCapital.html',
    'client/alerts/alert_capturedCapital.js',
    'client/globalAlerts/ga_accountDeleted.html',
    'client/globalAlerts/ga_accountDeleted.js',
    'client/globalAlerts/ga_gameOver.html',
    'client/globalAlerts/ga_gameOver.js',
    'client/globalAlerts/ga_inactiveAccountDeleted.html',
    'client/globalAlerts/ga_inactiveAccountDeleted.js',
    'client/globalAlerts/ga_mapExpanded.html',
    'client/globalAlerts/ga_mapExpanded.js',
    'client/globalAlerts/ga_nameChange.html',
    'client/globalAlerts/ga_nameChange.js',
    'client/globalAlerts/ga_newDominus.html',
    'client/globalAlerts/ga_newDominus.js',
    'client/globalAlerts/ga_noLongerDominusNewUser.html',
    'client/globalAlerts/ga_noLongerDominusNewUser.js',
    'client/globalAlerts/ga_playerReported.html',
    'client/globalAlerts/ga_playerReported.js',
    'client/globalAlerts/ga_sentArmy.html',
    'client/globalAlerts/ga_sentArmy.js',
    'client/globalAlerts/ga_sentGold.html',
    'client/globalAlerts/ga_sentGold.js',
    'client/globalAlerts/ga_titleTemplate.html',
    'client/globalAlerts/globalAlertShareLink.html',
    'client/globalAlerts/globalAlertShareLink.js',
    'client/alerts.less',
    'client/alerts_battle.html',
    'client/alerts_battle.js',
    'client/alerts_battles.html',
    'client/alerts_battles.js',
    'client/alerts_global.html',
    'client/alerts_global.js',
    'client/alerts_mine.html',
    'client/alerts_mine.js',
    'client/alerts_panel.html',
    'client/alerts_panel.js',
    'client/alerts_panel.less'
  ], 'client');
  api.export([
    'dAlerts',
    'myAlertList'
  ]);
  api.export([
    'AlertUsers',
    'AlertChatrooms',
    'AlertArmies',
    'AlertCastles',
    'AlertVillages',
    'AlertBattleTitles',
    'UnreadAlerts',
  ], 'client');
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('dominus-alerts');
});
