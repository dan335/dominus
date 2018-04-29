Template.body.helpers({
  route: function() {

    // null or id of current game
    // so that we don't have to parse path every time
    Session.set('gameId', null);

    var path = SimpleRouter.path.get();
    if (path) {
      analytics.ready(function() {
        analytics.page(path);
      });

      switch (path) {
        case '/astroepatreon':
          return 'astroepatreon';
        case '/':
          return 'landing';
        case '/privacy':
          return 'privacy';
        case '/terms':
          return 'terms';
        case '/presskit':
          return 'presskit';
        case '/control':
          return 'control';
        case '/games':
          return 'landingGames';
        case '/results':
          return 'landingResults';
        case '/oldresults':
          return 'landingResultsOld';
        case '/rankings':
          return 'landingRankings';
        case '/settings':
          return 'landingSettings';
        case '/deleteAccount':
          return 'landingDeleteAccount';
        case '/signin':
          return 'landingSignin';
        case '/createaccount':
          return 'landingCreateaccount';
        case '/forgotpassword':
          return 'landingForgotPassword';
        case '/store':
          return 'landingStore';
      }

      var pathArray = path.split('/');
      switch (pathArray[1]) {
        case 'result':
          return 'landingResults';
        case 'profile':
          return 'landingProfile';
        case 'forum':
          return 'forum';
        case 'battle':
          return 'sharedBattle';
        case 'alert':
          return 'sharedGlobalAlert';
        case 'admin':
          return 'admin';
        case 'control':
          return 'control';
        case 'game':

          // if not logged in, send always
          if (!Meteor.userId()) {
            SimpleRouter.go('/');
            return;
          }

          // if no gameId then send to game list
          let gameId = pathArray[2];
          if (!gameId || gameId == 'null') {
            SimpleRouter.go('/games');
            return;
          }

          // set session var with gameId
          Session.set('gameId', gameId);

          // game / gameId / template
          //if (pathArray.length == 4) {
            switch (pathArray[3]) {
              case 'signup':
                return 'landingGameSignup';
              case 'join':
                return 'landingGameJoin';
              case 'alert':
                return 'sharedGlobalAlert';
              case 'battle':
                return 'sharedBattle';
            }
          //} else {
            return 'game';
          //}
      }
    }
  }
})
