Accounts.onLogin(function() {
  var path = SimpleRouter.path.get();

  if (path == '/signin') {
    SimpleRouter.go('/');
  }

  if (path == '/createaccount') {
    SimpleRouter.go('/');
  }

  if (path == '/forgotpassword') {
    SimpleRouter.go('/');
  }
})
