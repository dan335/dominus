Template.welcome_screen.helpers({
  show: function() {
    let find = {gameId:Session.get('gameId'), userId:Meteor.userId()};
    let player = Players.findOne(find, {fields: {show_welcome_screen: 1}})
    if (player && player.show_welcome_screen) {
      return true;
    }
  },
})


Template.welcome_screen.events({
    'click #close_welcome_screen_button': function(event, template) {
      event.preventDefault();
      Meteor.call('hide_welcome_screen', Session.get('gameId'));
    }
});


Template.welcome_screen.rendered = function() {
    var _fbq = window._fbq || (window._fbq = []);
    if (!_fbq.loaded) {
        var fbds = document.createElement('script');
        fbds.async = true;
        fbds.src = '//connect.facebook.net/en_US/fbds.js';
        var s = document.getElementsByTagName('script')[0];
        s.parentNode.insertBefore(fbds, s);
        _fbq.loaded = true;
    }

    window._fbq = window._fbq || [];
    window._fbq.push(['track', '6020229310431', {'value':'0.00','currency':'USD'}]);
}
