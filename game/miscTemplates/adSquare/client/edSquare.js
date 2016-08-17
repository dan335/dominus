Template.edSquare.helpers({
  hide: function() {
    let playerId = Session.get('playerId');
    if (playerId) {
      let player = Players.findOne(playerId, {fields: {pro:1}});
      if (player) {
        return player.pro;
      }
    }
  }
});


Template.edSquare.onRendered(function() {
  this.autorun(function() {
    let playerId = Session.get('playerId');
    if (playerId) {
      let player = Players.findOne(playerId, {fields: {pro:1}});
      if (player) {
        if (!player.pro) {
          $.getScript("//pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", function() {
            var ads, adsbygoogle;ads = '<ins class="adsbygoogle" style="display:inline-block;width:250px;height:250px" data-ad-client="ca-pub-3932000594707687" data-ad-slot="6768509647"></ins>';
            $('#edSquareContainer').html(ads);
            return (adsbygoogle = window.adsbygoogle || []).push({});
          });
        }
      }
    }
  });
});



Template.edSquare.events({
  'click #edSquareHideAdsButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/store');
  }
});
