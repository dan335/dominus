Accounts.ui.config({
  passwordSignupFields: 'USERNAME_AND_EMAIL'
});

// Meteor.startup(function() {
//     Tracker.autorun(function(c) {
//         if (Meteor.userId()) {
//             try {
//                 UserStatus.startMonitor({
//                     threshold: 1000 * 60 * 5,
//                     interval: 1000 * 20,
//                     idleOnBlur: false
//                 });
//             } catch (error) {}
//         }
//     });
// });
