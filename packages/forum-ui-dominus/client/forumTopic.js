Template.forumTopic.helpers({

  topic: function() {
    let topicId = Template.instance().topicId.get();
    if (topicId) {
      return Forumtopics.findOne(topicId);
    }
  },

  posts: function() {
    let topicId = Template.instance().topicId.get();
    if (topicId) {
      return Forumposts.find({topicId:topicId}, {sort: {createdAt:1}});
    }
  },

  category: function() {
    let topicId = Template.instance().topicId.get();
    if (topicId) {
      let topic = Forumtopics.findOne(topicId, {fields: {categoryId:1}});;
      if (topic && topic.categoryId) {
        let category = _.find(forumSettings.categories, function(category) {
          return category.id == topic.categoryId;
        });
        if (category) {
          return category.name;
        }
      }
    }
  }
});


Template.forumTopic.events({
  'click .toTopicListButton': function(event, template) {
    event.preventDefault();
    let topicId = Template.instance().topicId.get();
    if (topicId) {
      markTopicRead(topicId);
    }
    SimpleRouter.go('/forum');
  },

  'input #newPostTextarea': function(event, template) {
    Session.set('msgPreview', event.currentTarget.value);
  },
});



Template.forumTopicPost.helpers({
  imageUrl: function() {
    let data = Template.currentData();
    if (data) {
      let user = Meteor.users.findOne(data.userId, {fields: {avatarFilename:1}});
      if (user && user.avatarFilename) {
        return Meteor.settings.public.s3.url + Meteor.settings.public.s3.avatarPath + user.avatarFilename;
      }
    }
  }
})



Template.forumTopicPost.events({
  'click .userProfileLink': function(event, template) {
    event.preventDefault();
    let post = Template.currentData();
    if (post) {
      markTopicRead(post.topicId);
    }
    SimpleRouter.go('/profile/'+template.data.userId);
  }
});


Template.forumNewPost.events({
  'click #newPostButton': function(event, template) {
    event.preventDefault();
    var textarea = template.find('#newPostTextarea');
    var text = textarea.value;
    var alert = template.find('#newPostAlert');
    var button = event.currentTarget;
    var buttonText = $(button).text();

    $(button).text('Creating Post...');
    $(button).prop('disabled', true);
    $(alert).hide();

    Meteor.apply('forumNewPost', [template.data._id, text], {}, function(error, result) {
      $(button).text(buttonText);
      $(button).prop('disabled', false);

      if (error) {
        $(alert).show();
        $(alert).text(error.error);
      } else {
        $(textarea).val('');
        markTopicRead(template.data._id);
        Session.set('msgPreview', '');
      }
    });
  }
})


Template.forumTopic.onCreated(function() {
  var self = this;
  this.topicId = new ReactiveVar(null);

  this.autorun(function() {
    let path = SimpleRouter.path.get();
    if (path) {
      let pathArray = path.split('/');
      let topicId = pathArray[3];
      Meteor.subscribe('forumTopic', topicId);
      self.topicId.set(topicId);
    }
  });

  this.autorun(function() {
    let topicId = self.topicId.get();
    if (topicId) {
      Tracker.nonreactive(function() {
        if (!isTopicViewed(topicId)) {
          markTopicRead(topicId);
          Meteor.call('addPostView', topicId);
        }
      });
    }
  });

  this.autorun(function() {
    let userId = Meteor.userId();
    let userIds = [];
    Forumposts.find().forEach(function(post) {
      if (post.userId != userId) {
        userIds.push(post.userId);
      }
    });
    Meteor.subscribe('userImages', userIds);
  })
});


Template.forumNewPost.helpers({
  msgPreview: function() {
    return Session.get('msgPreview');
  }
})


Template.forumNewPost.onCreated(function() {
  Session.set('msgPreview', '');
});
