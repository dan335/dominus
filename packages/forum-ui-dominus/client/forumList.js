Template.forumList.helpers({
  topics: function() {
    let sort = {createdAt: -1};
    return Forumtopics.find({}, {sort:sort});
  },

  topics: function() {
      var sort = {};
      switch(Session.get('forumSort')) {
        case 'post':
          sort['lastPostDate'] = -1;
          break;
        case 'topic':
          sort['createdAt'] = -1;
          break;
        case 'numPosts':
          sort['numPosts'] = -1;
          break;
      }

      return Forumtopics.find({}, {sort:sort});
    },

  forumSettings: function() {
    return forumSettings;
  },

  isSelectedCategory: function() {
    if (Session.get('forumCategory') == this._id) {
      return 'selected';
    }
  },

  isAllSelectedCategory: function() {
    if (Session.get('forumCategory') == 'all') {
      return 'selected';
    }
  },

  isNewPostsSelected: function() {
    if (Session.get('forumSort') == 'post') {
      return 'active';
    }
  },

  isNewTopicsSelected: function() {
    if (Session.get('forumSort') == 'topic') {
      return 'active';
    }
  },

  isMostPostsSelected: function() {
    if (Session.get('forumSort') == 'numPosts') {
      return 'active';
    }
  },
})

Template.forumList.events({
  'click #newTopicButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/forum/newtopic');
  },

  'click #showMoreButton': function(event, template) {
    event.preventDefault();
    var numShow = Session.get('forumNumShow');
    if (numShow && numShow < 200) {
      Session.set('forumNumShow', numShow+5);
    }
  },

  'change #forumCategorySelect': function(event, template) {
    var categoryId = event.currentTarget.value
    if (categoryId != 'all') {
      categoryId = parseInt(categoryId);
    }
    Session.set('forumCategory', categoryId);
  },

  'click #forumLatestButton': function(event, template) {
    event.preventDefault();
    Session.set('forumSort', 'post');
  },

  'click #forumNewButton': function(event, template) {
    event.preventDefault();
    Session.set('forumSort', 'topic');
  },

  'click #forumTopButton': function(event, template) {
    event.preventDefault();
    Session.set('forumSort', 'numPosts');
  },

  'click #markAllReadButton': function(event, template) {
    event.preventDefault();
    Meteor.call('forumMarkAllRead', function(error, topicIds) {
      topicIds.forEach(function(topicId) {
        markTopicRead(topicId);
      })
    });
  }
});


Template.forumList.onCreated(function() {
  var self = this;

  // post, topic, numPosts
  Session.setDefault('forumSort', 'post');

  // all or tagId
  Session.setDefault('forumCategory', 'all');

  // all, pastMonth
  Session.setDefault('forumFilter', 'all');

  // pagination
  Session.setDefault('forumNumShow', 10);

  this.autorun(function() {
    Meteor.subscribe('forumTopics',
      Session.get('forumSort'),
      Session.get('forumNumShow'),
      Session.get('forumCategory'),
      Session.get('forumFilter')
    );
  });
})


Template.forumListTopic.helpers({
  topic: function() {
    var self = this;
    return _.find(forumSettings.categories, function(category) {
      return category.id == self.categoryId;
    })
  },

  isUnread: function() {
    let topic = Template.currentData();
    if (topic) {
      let isRead = isTopicRead(topic._id, topic.lastPostDate);
      return !isRead;
    }
  }
});


Template.forumListTopic.events({
  'click .forumTopicLink': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/forum/topic/'+template.data._id);
  }
})
