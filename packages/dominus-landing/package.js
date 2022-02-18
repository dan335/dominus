Package.describe({
  name: 'dominus-landing',
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
    'danimal:accounts-templates',
    'accounts-base',
    'accounts-password',
    'momentjs:moment@2.18.1',
    'danimal:simplerouter@1.0.0',
    'dominus-init',
    'mongo',
    'reactive-var',
    'dominus-game',   // for deleteGameAccount
    'forum-base',     // change forum username in changeMainUsername function
    'classcraft:knox@0.9.11',
    'meteorhacks:unblock@1.1.0'
  ]);
  api.addFiles([
    'lib/namespace.js',
    'landingGameSignup/both/landingGameSignupMethods.js',
    'landingSettings/both/settingsMethods.js',
  ])
  api.addFiles([
    'lib/server/knox.js',
    'server/publishLandingGames.js',
    'server/publishProfile.js',
    'topNav/server/topNavPublish.js',
    'landingResults/server/landingResultsPublish.js',
    'landingResults/server/landingResultsOldPublish.js',
    'landingRankings/server/landingRankingsPublish.js',
    'landingProfile/server/landingProfilePublish.js',
    'landingStore/server/landingStoreMethods.js'
  ], 'server');
  api.addFiles([
    'landingResults/client/clientCollection.js',
    'client/accountsLanding.js',
    'client/landing.html',
    'client/landing.js',
    'client/landing.less',
    'topNav/client/topNav.html',
    'topNav/client/topNav.js',
    'topNav/client/topNav.less',
    'client/landingFooter.html',
    'landingGames/client/landingGames.html',
    'landingGames/client/landingGames.js',
    'landingGames/client/landingGames.less',
    'landingRankings/client/landingRankings.html',
    'landingRankings/client/landingRankings.js',
    'landingRankings/client/landingRankings.less',
    'landingResults/client/landingResults.html',
    'landingResults/client/landingResults.js',
    'landingResults/client/landingResults.less',
    'landingResults/client/landingResultsOld.html',
    'landingResults/client/landingResultsOld.js',
    'landingResults/client/landingResultsOld.less',
    'landingSettings/client/landingSettings.html',
    'landingSettings/client/landingSettings.js',
    'landingSettings/client/landingSettings.less',
    'landingSettings/client/landingDeleteAccount.html',
    'landingSettings/client/landingDeleteAccount.js',
    'landingSignin/client/landingSignin.html',
    'landingSignin/client/landingSignin.js',
    'landingCreateaccount/client/landingCreateaccount.html',
    'landingCreateaccount/client/landingCreateaccount.js',
    'landingForgotPassword/client/landingForgotPassword.html',
    'landingForgotPassword/client/landingForgotPassword.js',
    'landingGameSignup/client/landingGameSignup.html',
    'landingGameSignup/client/landingGameSignup.js',
    'landingGameJoin/client/landingGameJoin.html',
    'landingGameJoin/client/landingGameJoin.js',
    'landingStore/client/landingStore.html',
    'landingStore/client/landingStore.less',
    'landingStore/client/landingStorePro.html',
    'landingStore/client/landingStorePro.js',
    'landingStore/client/landingStoreShop.html',
    'landingStore/client/landingStoreShop.js',
    'landingStore/client/landingStoreDonate.html',
    'landingStore/client/landingStoreDonate.js',
    'landingProfile/client/landingProfile.html',
    'landingProfile/client/landingProfile.js',
    'landingProfile/client/landingProfile.less',
    'mailinglist/client/mailinglist.html',
    'mailinglist/client/mailinglist.js',
    'mailinglist/client/mailinglist.less'
  ], 'client');
  api.export([
    'dLanding',
    'SignupCounts'
  ]);
});


Npm.depends({
  gm: '1.21.1'
});
