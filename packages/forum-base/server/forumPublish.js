Meteor.publish('forumTopics', function(sort, numShow, categoryId, filter) {
  if (!this.userId) {
    return this.ready();
  }

  let user = Meteor.users.findOne(this.userId, {fields: {verifiedEmail:1, banned:1}})
  if (!user || !user.verifiedEmail || user.banned) {
    return this.ready();
  }

  let sortBy = {};
  switch(sort) {
    case 'post':
      sortBy.lastPostDate = -1;
      break;
    case 'topic':
      sortBy.createdAt = -1;
      break;
    case 'numPosts':
      sortBy.numPosts = -1;
      break;
  }

  let find = {};

  if (categoryId != 'all') {
    find.categoryId = categoryId;
  }

  switch(filter) {
    case 'all':
      break;
    case 'pastMonth':
      let cutoff = moment.subtract(1, 'months').toDate();
      find.updatedAt = {$gte:cutoff};
      break;
  }

  return Forumtopics.find(find, {limit:numShow, sort:sortBy});
});

var forumTopicsSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'forumTopics'
}
DDPRateLimiter.addRule(forumTopicsSubRule, 5, 5000);




Meteor.publish('forumTopic', function(topicId) {
  if (!this.userId) {
    return this.ready();
  }

  return [
    Forumtopics.find(topicId),
    Forumposts.find({topicId:topicId})
  ]
});

var forumTopicSubRule = {
  userId: function() {return true;},
  type: 'subscription',
  name: 'forumTopic'
}
DDPRateLimiter.addRule(forumTopicSubRule, 5, 5000);
