Meteor.methods({
  stripeProCheckout: function(type, token) {
    var self = this;

    check(type, String);
    check(token, Object);

    var user = Meteor.users.findOne(self.userId);
    if (!user) {
      throw new Meteor.Error('User not found.');
    }
    var email = AccountsEmail.extract(user);

    var amountInCents = _s.store.pro[type].amountInCents;
    var fut = new Future();
    var stripe = StripeAPI(Meteor.settings.stripe_secret_key);

    var allGames;
    switch (type) {
      case 'singleGame':
        allGames = false;
        break;
      case 'allGames':
        allGames = true;
        break;
    }

    var charge = stripe.charges.create({
        amount: amountInCents,
        currency: "usd",
        card: token.id,
        description: email
    }, Meteor.bindEnvironment(function(err, charge) {

        if (err) {
            fut['return'](false);
        } else {

          if (allGames) {
            Meteor.users.update(self.userId, {$set: {pro:true}});
            Players.update({userId:self.userId}, {$set: {pro:true}}, {multi:true});
          } else {
            Meteor.users.update(self.userId, {$inc: {proTokens:1}});
          }

          var id = Charges.insert({
              created_at: new Date(),
              user_id: user._id,
              amount: amountInCents,
              type: 'pro_'+type+'_purchase',
              user_email: email,
              user_username: user.username,
              livemode: charge.livemode,
              stripe_charge_id: charge.id
          });

          fut['return'](id);
        }
    }));
    return fut.wait();
  },
  

  stripeDonationCheckout: function(amountInCents, token) {
    var self = this;

		check(amountInCents, validNumber);
		check(token, Object);

    var fut = new Future();
		var stripe = StripeAPI(Meteor.settings.stripe_secret_key);

		var user = Meteor.users.findOne(self.userId);
    if (!user) {
      throw new Meteor.Error('User not found.');
    }
    var email = AccountsEmail.extract(user);

		var charge = stripe.charges.create({
			amount: amountInCents,
			currency: "usd",
			card: token.id,
			description: email
		}, Meteor.bindEnvironment(function(err, charge) {
			//if (err && err.type === 'StripeCardError') {
			if (err) {
				fut['return'](false);
			} else {
				var id = Charges.insert({
					created_at: new Date(),
					user_id: self.userId,
					amount: amountInCents,
					type: 'donation',
					user_email: email,
					user_username: user.username,
					livemode: charge.livemode,
					stripe_charge_id: charge.id
				});

				fut['return'](id);
			}
		}));

		return fut.wait();
  },


  stripePurchaseCheckout: function(amount_in_cents, type, id, token) {
		var self = this;

		check(amount_in_cents, validNumber);
		check(type, String);
		check(id, String);
		check(token, Object);

		var fut = new Future();
		var stripe = StripeAPI(Meteor.settings.stripe_secret_key);

    var user = Meteor.users.findOne(self.userId);
    if (!user) {
      throw new Meteor.Error('User not found.');
    }
    var email = AccountsEmail.extract(user);

		var charge = stripe.charges.create({
			amount: amount_in_cents,
			currency: "usd",
			card: token.id,
			description: email
		}, Meteor.bindEnvironment(function(err, charge) {
			if (err) {
				fut['return'](false);
			} else {

				if (_s.store[type] && _s.store[type][id]) {
          var addToSet = {};
          addToSet['purchases.'+type] = id;
					Meteor.users.update(self.userId, {$addToSet:addToSet});
        }

				var chargeId = Charges.insert({
					created_at: new Date(),
					user_id: self.userId,
					amount: amount_in_cents,
					type: 'store_purchase',
          storeType: type,
          storeId: id,
					user_email: email,
					user_username: user.username,
					livemode: charge.livemode,
					stripe_charge_id: charge.id
				});

				fut['return'](chargeId);
			}
		}));
		return fut.wait();
	},
})
