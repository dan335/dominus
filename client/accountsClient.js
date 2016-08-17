// taken from
// https://github.com/meteor/meteor/blob/devel/packages/accounts-ui-unstyled/login_buttons_dialogs.js#L18
delete Accounts._accountsCallbacks['verify-email'];
Accounts.onEmailVerificationLink(function (token, done) {
  Accounts.verifyEmail(token, function (error) {
    if (! error) {
      Accounts._loginButtonsSession.set('justVerifiedEmail', true);
      Meteor.call('onEmailVerified');
    }

    done();
    // XXX show something if there was an error.
  });
});
