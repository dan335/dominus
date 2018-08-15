Template.control_mailinglist.events({
  'click #sendTemplateButton': function(event, template) {
    event.preventDefault();
    let input = template.find('#templateNameInput');
    Meteor.call('sendToMailingList', input.value);
  }
});
