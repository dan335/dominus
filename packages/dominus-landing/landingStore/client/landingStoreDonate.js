Template.landingStoreDonate.events({
  'click .store_donate_button': function(event, template) {
		event.preventDefault();
		var button = $(event.currentTarget);
		var button_html = $(button).html();
		var error_alert = template.find('#donation_error_alert');
		var success_alert = template.find('#donation_success_alert');
		var amount = event.currentTarget.getAttribute('data-amount');

		$(error_alert).hide();
		$(success_alert).hide();

		$(button).attr('disabled', true);
		$(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait');

    var email = AccountsEmail.extract(Meteor.user());

		var handler = StripeCheckout.configure({
			key: Meteor.settings.public.stripe_publishable_key,
			image: '/stripe_logo.jpg',
			bitcoin: true,
			token: function(token) {
				Meteor.apply('stripeDonationCheckout', [amount * 100, token], {}, function(error, charge_id) {
					if (error) {
						$(button).attr('disabled', false);
						$(button).html(button_html);
						$(error_alert).show();
						$(error_alert).html('Error charging card.  Card declined.');
					} else {
						$(button).attr('disabled', false);
						$(button).html(button_html);
						$(success_alert).show();
						$(success_alert).html('Donated $'+amount+'. Thanks!');
					}
				});
			}
		});

		handler.open({
			name: 'Dominus',
			description: 'Donate $'+amount+' to Dominus',
			amount: amount * 100,
			email: email
		});
	}
})
