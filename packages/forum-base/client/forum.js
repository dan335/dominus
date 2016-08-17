Template.forum.helpers({
  hasAccess: function() {
    let userId = Meteor.userId();
    if (userId) {
      let user = Meteor.users.findOne(userId, {fields: {verifiedEmail:1, banned:1}})
      if (!user) {
        return false;
      }

      if (!user.verifiedEmail || user.banned) {
        return false;
      }

      return true;
    }
  }
})

Template.forum.onCreated(function() {
  Session.setDefault('forumTemplate', 'forumList');

  // router
  this.autorun(function() {
    var path = SimpleRouter.path.get();
    if (path) {
      var pathArray = path.split('/');

      if (pathArray.length == 2) {
        Session.set('forumTemplate', 'forumList');
        return;
      }

      switch(pathArray[2]) {
        case 'newtopic':
          Session.set('forumTemplate', 'forumNewTopic');
          return;
        case 'topic':
          Session.set('forumTemplate', 'forumTopic');
      }
    }
  })
})
