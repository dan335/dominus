Template.forumNewTopic.helpers({
  forumSettings: function() {
    return forumSettings;
  },

  msgPreview: function() {
    return Session.get('msgPreview');
  }
})


Template.forumNewTopic.events({
  'input #topicTextarea': function(event, template) {
    Session.set('msgPreview', event.currentTarget.value);
  },

  'click #cancelNewTopicButton': function(event, template) {
    event.preventDefault();
    if (window.history.length) {
      window.history.back();
    } else {
      SimpleRouter.go('/forum')
    }
  },

  'click #saveNewTopicButton': function(event, template) {
    event.preventDefault();
    var title = template.find('#topicTitleInput').value;
    var tag = template.find('#topicTagSelect').value;
    var text = template.find('#topicTextarea').value;
    var alert = template.find('#topicAlert');
    var button = event.currentTarget;
    var buttonText = $(button).text();

    $(button).text('Creating Topic...');
    $(button).prop('disabled', true);
    $(alert).hide();

    Meteor.apply('forumNewTopic', [title, tag, text], {}, function(error, result) {
      $(button).text(buttonText);
      $(button).prop('disabled', false);

      if (error) {
        $(alert).show();
        $(alert).html(error.error);
      } else {
        markTopicRead(result);
        SimpleRouter.go('/forum');
      }
    });
  },
});


Template.forumNewTopic.onCreated(function() {
  Session.set('msgPreview', '');
});
