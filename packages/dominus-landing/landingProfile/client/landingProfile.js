Template.landingProfile.helpers({
  user: function() {
    let userId = Template.instance().userId.get();
    if (userId) {
      return ProfileUser.findOne(userId);
    }
  },

  imageUrl: function () {
    let userId = Template.instance().userId.get();
    if (userId) {
      let user = Meteor.users.findOne(userId, {fields: {avatarFilename:1}});
      if (user && user.avatarFilename) {
        return Meteor.settings.public.s3.url + Meteor.settings.public.s3.avatarPath + user.avatarFilename;
      }
    }
  },

  games: function() {
    return Games.find({hasEnded:true}, {sort: {endDate:-1}});
  },

  numGamesWon: function() {
    let userId = Template.instance().userId.get();
    if (userId) {
      return Players.find({userId:userId, wonGame:true}).count();
    }
  },

  numGamesPlayed: function() {
    let userId = Template.instance().userId.get();
    if (userId) {
      return Players.find({userId:userId}).count();
    }
  }
});



Template.landingProfile.events({
  'click .link': function(event, template) {
    event.preventDefault();
    var path = ($(event.currentTarget).attr('href'));
    SimpleRouter.go(path);
  },
})



Template.landingProfile.onCreated(function() {
  var self = this;
  this.userId = new ReactiveVar(null);

  this.autorun(function() {
    let path = SimpleRouter.path.get();
    if (path) {
      let pathArray = path.split('/');
      let userId = pathArray[2];
      if (userId) {
        Meteor.subscribe('userProfile', userId);
        self.userId.set(userId);
      }
    }
  });

  this.autorun(function() {
    let userId = self.userId.get();
    if (userId) {
      Meteor.subscribe('userImageForProfile', userId);
    }
  });
});



Template.landingProfileGame.helpers({
  player: function() {
    let data = Template.currentData();
    if (data) {
      return Players.findOne({gameId:data._id});
    }
  },
});
