markTopicRead = function(id) {
  //
  // if (!id) {
  //   return false;
  // }
  //
  // let topicData = {id:id, date:new Date()};
  //
  // let topics = ReactiveCookie.get('topics');
  //
  // if (topics) {
  //   var topicArray = EJSON.parse(topics);
  // } else {
  //   var topicArray = [];
  // }
  //
  // topicArray = _.reject(topicArray, function(data) {
  //   return data.id == id;
  // })
  //
  // topicArray = _.union(topicArray, topicData);
  //
  // let topicString = EJSON.stringify(topicArray);
  // ReactiveCookie.set('topics', topicString, {years:1});
  ReactiveCookie.set('thread'+id, new Date(), {days:15});
}


isTopicRead = function(id, lastPostJsDate) {
  // let topics = ReactiveCookie.get('topics');
  //
  // if (!topics) {
  //   return false;
  // }
  //
  // let topicArray = EJSON.parse(topics);
  //
  // let topicData = _.findWhere(topicArray, {id:id});
  //
  // if (topicData) {
  //   let viewDate = moment(new Date(topicData.date));
  //   let postDate = moment(new Date(lastPostJsDate));
  //
  //   return viewDate.isAfter(postDate);
  // } else {
  //   return false;
  // }
  let data = ReactiveCookie.get('thread'+id);
  if (data) {
    let viewDate = moment(new Date(data));
    let postDate = moment(new Date(lastPostJsDate));
    return viewDate.isAfter(postDate);
  } else {
    return false;
  }
}


isTopicViewed = function(id) {
  // if (!id) {
  //   return true;
  // }
  //
  // let topics = ReactiveCookie.get('topics');
  // if (!topics) {
  //   return false;
  // }
  //
  // let topicArray = EJSON.parse(topics);
  // let topicData = _.findWhere(topicArray, {id:id});
  //
  // if (topicData) {
  //   return true;
  // } else {
  //   return false;
  // }
  let data = ReactiveCookie.get('thread'+id);
  if (data) {
    return true;
  } else {
    return false;
  }
}
