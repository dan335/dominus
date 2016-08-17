Template.rightEdPanel.helpers({
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


Template.rightEdPanel.onRendered(function() {
    this.autorun(function() {
      let playerId = Session.get('playerId');
      if (playerId) {
        let player = Players.findOne(playerId, {fields: {pro:1}});
        if (player) {
          if (!player.pro) {
            $.getScript("//pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", function() {
                var ads, adsbygoogle;ads = '<ins class="adsbygoogle" style="display:inline-block;width:160px;height:600px" data-ad-client="ca-pub-3932000594707687" data-ad-slot="6908110447"></ins>';
                $('#rightEdContainer').html(ads);
                return (adsbygoogle = window.adsbygoogle || []).push({});
            });
          }
        }
      }
    });
});


Template.rightEdPanel.events({
  'click #rightEdPanelHideAdsButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/store');
  }
});
