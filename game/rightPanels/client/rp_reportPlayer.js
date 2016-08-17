Template.rp_reportPlayer.events({
    'click #reportPlayerButton': function(event, template) {
      event.preventDefault();
      var reason = template.find('#reasonText');
      var alert = template.find('#reportPlayerAlert');
      var button = template.find('#reportPlayerButton');

      $(alert).hide();

      var button_html = $(button).html();
      $(button).attr('disabled', true);
      $(button).html('Please Wait');

      // Meteor.apply('reportPlayer', [this.user_id, reason.value], {}, function(error, result) {
      //     $(button).attr('disabled', false);
      //     $(button).html(button_html);
      //
      //     if (error) {
      //         $(alert).show();
      //         $(alert).html(error.error);
      //     } else {
      //         Session.set('rp_template', 'rp_info_castle');
      //     }
      // });
    },

    'click #cancelButton': function(event, template) {
      event.preventDefault();
      Session.set('rp_template', 'rp_info_castle');
    }
});
