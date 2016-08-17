Meteor.methods({
  forumNewTopic: function(title, categoryId, text) {
    var self = this;
    self.unblock();

    // can't chat if you have reports
    // var find = {user_id:Meteor.userId(), active:true};
    // var numReports = Reports.find(find).count();
    // if (numReports && numReports > 0) {
    //     throw new Meteor.Error('Cannot post in forums after you have been reported.');
    // }

    if (!categoryId || categoryId == 'false') {
      throw new Meteor.Error('Select a category.');
    }

    categoryId = parseInt(categoryId);
    let category = _.find(forumSettings.categories, function(category) {
      return category.id == categoryId;
    })
    if (!category) {
      throw new Meteor.Error('Select a category.');
    }

    if (title.length < 1) {
      throw new Meteor.Error('Title too short.');
    }

    if (text.length < 1) {
      throw new Meteor.Error('Text too short.');
    }

    if (title.length > 100) {
      throw new Meteor.Error('Title too long, 100 characters max.');
    }

    if (text.length > 5000) {
      throw new Meteor.Error('Text too long, 5000 characters max.');
    }

    let user = Meteor.users.findOne(Meteor.userId(), {fields: {username:1, verifiedEmail:1, banned:1}});
    if (!user || !user.verifiedEmail || user.banned) {
      throw new Meteor.Error('No user found.');
    }

    let topic = {
      title: title,
      categoryId: categoryId,
      numPosts: 1,
      numViews: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastPostDate: new Date(),
      lastPostUsername: user.username,
      lastPostUserId: user._id
    };

    topic._id = Forumtopics.insert(topic);

    let post = {
      topicId: topic._id,
      categoryId: categoryId,
      userId: user._id,
      username: user.username,
      text: text,
      createdAt: new Date()
    };

    if (topic._id) {
      Forumposts.insert(post);
      return topic._id;
    }

    if (this.isSimulation) {
      markTopicRead(topic._id);
    }

    throw new Meteor.Error('Unable to insert topic.');
  },


  forumNewPost: function(topicId, text) {
    var self = this;
    self.unblock();

    // can't chat if you have reports
    // var find = {user_id:Meteor.userId(), active:true};
    // var numReports = Reports.find(find).count();
    // if (numReports && numReports > 0) {
    //     throw new Meteor.Error('Cannot post in forums after you have been reported.');
    // }

    if (text.length < 1) {
        throw new Meteor.Error('Text too short.');
    }

    if (text.length > 5000) {
        throw new Meteor.Error('Text too long, 5000 characters max.');
    }

    let user = Meteor.users.findOne(Meteor.userId(), {fields: {username:1}});
    if (!user) {
      throw new Meteor.Error('No user found.');
    }

    let topic = Forumtopics.findOne(topicId);
    if (!topic) {
      throw new Meteor.Error('Topic not found.');
    }

    let post = {
      topicId: topicId,
      categoryId: topic.categoryId,
      userId: user._id,
      username: user.username,
      text: text,
      createdAt: new Date()
    };

    post._id = Forumposts.insert(post);
    if (post._id) {

      Forumtopics.update(topicId, {$inc:{numPosts:1}, $set: {
        lastPostDate: new Date(),
        lastPostUserId: user._id,
        lastPostUsername: user.username
      }})

      return true;
    }

    if (this.isSimulation) {
      markTopicRead(topicId);
    }

    throw new Meteor.Error('Unable to insert post`.');
  },


  // this is kind of slow, could remove db find if needed
  addPostView: function(topicId) {
    Forumtopics.update(topicId, {$inc: {numViews:1}});
  },


  // get list of topicIds, client creates cookies
  forumMarkAllRead: function() {
    let ids = [];
    let cutoff = moment().subtract(15, 'days').toDate();
    Forumtopics.find({lastPostDate: {$gte:cutoff}}, {fields: {_id:1}}).forEach(function(topic) {
      ids.push(topic._id);
    });
    return ids;
  }
})
