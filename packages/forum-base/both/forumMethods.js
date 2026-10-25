// These methods run on the client too, so a change shows at once. Each stays a
// plain function: the simulation is sync and the server's part is async (see
// "Async conversion" in CLAUDE.md).

var moderatorFields = {fields:{admin:1, moderator:1}};

var checkModerator = function(user) {
  if (!user || (!user.admin && !user.moderator)) {
    throw new Meteor.Error('forumDeleteTopic', 'Must be admin or moderator.');
  }
};

// checks a new topic and returns its category id
var checkNewTopic = function(title, categoryId, text) {
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

  return categoryId;
};

var newTopicUserFields = {fields: {username:1, verifiedEmail:1, banned:1}};

var checkNewTopicUser = function(user) {
  if (!user || !user.verifiedEmail) {
    throw new Meteor.Error('No user found.');
  }

  if (user.banned) {
    throw new Meteor.Error('banned', 'Your account has been banned. If you think this is a mistake, contact us on Discord: https://discord.gg/b59g5pE');
  }
};

var newTopic = function(title, categoryId, user) {
  return {
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
};

var checkNewPost = function(text) {
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
};

var newPostUserFields = {fields: {username:1}};

var newPost = function(topicId, categoryId, user, text) {
  return {
    topicId: topicId,
    categoryId: categoryId,
    userId: user._id,
    username: user.username,
    text: text,
    createdAt: new Date()
  };
};

var lastPost = function(user) {
  return {$inc:{numPosts:1}, $set: {
    lastPostDate: new Date(),
    lastPostUserId: user._id,
    lastPostUsername: user.username
  }};
};

Meteor.methods({
  forumPinTopic: function(topicId) {
    check(topicId, String);
    this.unblock();
    if (this.isSimulation) {
      checkModerator(Meteor.users.findOne(this.userId, moderatorFields));
      Forumtopics.update(topicId, {$set: {isPinned:true}});
      return;
    }
    return (async () => {
      checkModerator(await Meteor.users.findOneAsync(this.userId, moderatorFields));
      await Forumtopics.updateAsync(topicId, {$set: {isPinned:true}});
    })();
  },

  forumUnpinTopic: function(topicId) {
    check(topicId, String);
    this.unblock();
    if (this.isSimulation) {
      checkModerator(Meteor.users.findOne(this.userId, moderatorFields));
      Forumtopics.update(topicId, {$set: {isPinned:false}});
      return;
    }
    return (async () => {
      checkModerator(await Meteor.users.findOneAsync(this.userId, moderatorFields));
      await Forumtopics.updateAsync(topicId, {$set: {isPinned:false}});
    })();
  },

  forumDeleteTopic: function(topicId) {
    check(topicId, String);
    this.unblock();
    if (this.isSimulation) {
      checkModerator(Meteor.users.findOne(this.userId, moderatorFields));
      Forumtopics.remove(topicId);
      return;
    }
    return (async () => {
      checkModerator(await Meteor.users.findOneAsync(this.userId, moderatorFields));
      await Forumtopics.removeAsync(topicId);
    })();
  },


  forumLockTopic: function(topicId) {
    check(topicId, String);
    this.unblock();
    if (this.isSimulation) {
      checkModerator(Meteor.users.findOne(this.userId, moderatorFields));
      Forumtopics.update(topicId, {$set: {isLocked:true}});
      return;
    }
    return (async () => {
      checkModerator(await Meteor.users.findOneAsync(this.userId, moderatorFields));
      await Forumtopics.updateAsync(topicId, {$set: {isLocked:true}});
    })();
  },

  forumUnlockTopic: function(topicId) {
    check(topicId, String);
    this.unblock();
    if (this.isSimulation) {
      checkModerator(Meteor.users.findOne(this.userId, moderatorFields));
      Forumtopics.update(topicId, {$set: {isLocked:false}});
      return;
    }
    return (async () => {
      checkModerator(await Meteor.users.findOneAsync(this.userId, moderatorFields));
      await Forumtopics.updateAsync(topicId, {$set: {isLocked:false}});
    })();
  },

  forumNewTopic: function(title, categoryId, text) {
    check(title, String);
    check(categoryId, Match.OneOf(String, Number));
    check(text, String);
    this.unblock();

    categoryId = checkNewTopic(title, categoryId, text);
    var userId = this.userId;

    if (this.isSimulation) {
      let user = Meteor.users.findOne(userId, newTopicUserFields);
      checkNewTopicUser(user);
      let topicId = Forumtopics.insert(newTopic(title, categoryId, user));
      Forumposts.insert(newPost(topicId, categoryId, user, text));
      return;
    }

    return (async () => {
      let user = await Meteor.users.findOneAsync(userId, newTopicUserFields);
      checkNewTopicUser(user);
      let topicId = await Forumtopics.insertAsync(newTopic(title, categoryId, user));
      if (!topicId) {
        throw new Meteor.Error('Unable to insert topic.');
      }
      await Forumposts.insertAsync(newPost(topicId, categoryId, user, text));
      return topicId;
    })();
  },


  forumNewPost: function(topicId, text) {
    check(topicId, String);
    check(text, String);
    this.unblock();

    checkNewPost(text);
    var userId = this.userId;

    if (this.isSimulation) {
      let user = Meteor.users.findOne(userId, newPostUserFields);
      if (!user) {
        throw new Meteor.Error('No user found.');
      }
      let topic = Forumtopics.findOne(topicId);
      if (!topic) {
        throw new Meteor.Error('Topic not found.');
      }
      Forumposts.insert(newPost(topicId, topic.categoryId, user, text));
      Forumtopics.update(topicId, lastPost(user));
      return;
    }

    return (async () => {
      let user = await Meteor.users.findOneAsync(userId, newPostUserFields);
      if (!user) {
        throw new Meteor.Error('No user found.');
      }

      let topic = await Forumtopics.findOneAsync(topicId);
      if (!topic) {
        throw new Meteor.Error('Topic not found.');
      }

      let postId = await Forumposts.insertAsync(newPost(topicId, topic.categoryId, user, text));
      if (!postId) {
        throw new Meteor.Error('Unable to insert post`.');
      }
      await Forumtopics.updateAsync(topicId, lastPost(user));
      return true;
    })();
  },


  // this is kind of slow, could remove db find if needed
  addPostView: function(topicId) {
    check(topicId, String);
    if (this.isSimulation) {
      Forumtopics.update(topicId, {$inc: {numViews:1}});
      return;
    }
    return (async () => {
      await Forumtopics.updateAsync(topicId, {$inc: {numViews:1}});
    })();
  }
})


if (Meteor.isServer) {
  Meteor.methods({
    // get list of topicIds, client creates cookies
    // (no simulation: the client waits for the server's list)
    forumMarkAllRead: async function() {
      let ids = [];
      let cutoff = moment().subtract(15, 'days').toDate();
      for (const topic of await Forumtopics.find({lastPostDate: {$gte:cutoff}}, {fields: {_id:1}}).fetchAsync()) {
        ids.push(topic._id);
      }
      return ids;
    }
  });
}
