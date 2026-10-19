Accounts.onLogin(function() {
  var path = SimpleRouter.path.get();

  // set when a spectator clicks sign in, so a shared link isn't lost
  var afterSignInPath = Session.get('afterSignInPath') || '/';
  Session.set('afterSignInPath', null);

  if (path == '/signin') {
    SimpleRouter.go(afterSignInPath);
  }

  if (path == '/createaccount') {
    SimpleRouter.go(afterSignInPath);
  }

  if (path == '/forgotpassword') {
    SimpleRouter.go(afterSignInPath);
  }
})
