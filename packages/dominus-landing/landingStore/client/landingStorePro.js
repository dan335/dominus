Template.landingStorePro.helpers({
  _sMarkers: function() {
    return _s.markers;
  },

  _sStore: function() {
    return _s.store;
  },

  hasPurchasedAllGames: function() {
    let user = Meteor.users.findOne(Meteor.userId(), {fields: {pro:1}});
    if (user) {
      return user.pro;
    }
  },

  numTokens: function() {
    let user = Meteor.users.findOne(Meteor.userId(), {fields: {proTokens:1}});
    if (user) {
      return user.proTokens;
    }
  }
})



Template.landingStorePro.events({
  'click .proButton': function(event, template) {
    event.preventDefault();
      var type = event.currentTarget.getAttribute('data-type');
      var button = event.currentTarget;
      var button_html = $(button).html();
      var errorAlert = template.find('#proError');
      var successAlert = template.find('#proSuccess');

      var amountInCents = _s.store.pro[type].amountInCents;
      var words = _s.store.pro[type].words;
      var priceString = _s.store.pro[type].priceString;

      check(amountInCents, Number);

      var email = AccountsEmail.extract(Meteor.user());

      $(errorAlert).hide();
      $(successAlert).hide();

      $(button).attr('disabled', true);
      $(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait');

      var handler = StripeCheckout.configure({
        key: Meteor.settings.public.stripe_publishable_key,
        image: '/stripe_logo.jpg',
        token: function(token, args) {
          Meteor.apply('stripeProCheckout', [type, token], {}, function(error, charge_id) {
            $(button).attr('disabled', false);
            $(button).html(button_html);

            if (error) {
              $(errorAlert).show();
              $(errorAlert).html('Error charging card.  Card declined.');
            } else {
              //log_gold_purchase(charge_id, amount_in_cents)
              $(successAlert).show();
              $(successAlert).html('Success! Pro puchased.');
            }
          });
        }
      });

      handler.open({
          name: 'Dominus',
          description: 'Purchase pro for '+words+' for $'+priceString,
          amount: amountInCents,
          email: email,
          closed: function() {
            $(button).attr('disabled', false);
            $(button).html(button_html);
          }
      });
  },
})
