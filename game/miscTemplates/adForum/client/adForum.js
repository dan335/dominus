Template.adForum.helpers({
  hide: function() {
    var userId = Meteor.userId();
    if (userId) {
      var user = Meteor.users.findOne(userId, {fields: {pro:1}});
      if (user) {
        return user.pro;
      }
    }
  }
})


Template.adForum.onRendered(function() {
  this.autorun(function() {
    var userId = Meteor.userId();
    if (userId) {
      var user = Meteor.users.findOne(userId, {fields: {pro:1}});
      if (user) {
        if (!user.pro) {
          $.getScript("//pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", function() {
            var ads, adsbygoogle;ads = '<ins class="adsbygoogle" style="display:inline-block;width:728px;height:90px" data-ad-client="ca-pub-3932000594707687" data-ad-slot="6473108041"></ins>';
            $('#adForum').html(ads);
            return (adsbygoogle = window.adsbygoogle || []).push({});
          });
        }
      }
    }
  });
});
