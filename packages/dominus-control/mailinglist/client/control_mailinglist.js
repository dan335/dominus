Template.control_mailinglist.events({
  'click #sendTemplateButton': function(event, template) {
    event.preventDefault();
    let input = template.find('#templateNameInput');
    Meteor.call('sendToMailingList', input.value);
  },

  'click #sendToOldProUsersTemplateButton': function(event, template) {
    event.preventDefault();
    let input = template.find('#sendToOldProUsersTemplateNameInput');
    Meteor.call('mailTemplateToOldProUsers', input.value);
  }
});
