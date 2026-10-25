// Charges the card. Resolves with the charge, or with null when Stripe
// refuses it.
var createCharge = function(stripe, options) {
  return new Promise(function(resolve) {
    stripe.charges.create(options, function(err, charge) {
      resolve(err ? null : charge);
    });
  });
};

Meteor.methods({
  stripeProCheckout: async function(type, token) {
    var self = this;

    check(type, String);
    check(token, Object);

    var user = await Meteor.users.findOneAsync(self.userId);
    if (!user) {
      throw new Meteor.Error('User not found.');
    }
    var email = AccountsEmail.extract(user);

    var amountInCents = _s.store.pro[type].amountInCents;
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

    var charge = await createCharge(stripe, {
        amount: amountInCents,
        currency: "usd",
        card: token.id,
        description: email
    });

    if (!charge) {
      return false;
    }

    if (allGames) {
      await Meteor.users.updateAsync(self.userId, {$set: {pro:true}});
      await Players.updateAsync({userId:self.userId}, {$set: {pro:true}}, {multi:true});
    } else {
      await Meteor.users.updateAsync(self.userId, {$inc: {proTokens:1}});
    }

    return await Charges.insertAsync({
        created_at: new Date(),
        user_id: user._id,
        amount: amountInCents,
        type: 'pro_'+type+'_purchase',
        user_email: email,
        user_username: user.username,
        livemode: charge.livemode,
        stripe_charge_id: charge.id
    });
  },
  

  stripeDonationCheckout: async function(amountInCents, token) {
    var self = this;

		check(amountInCents, validNumber);
		check(token, Object);

		var stripe = StripeAPI(Meteor.settings.stripe_secret_key);

		var user = await Meteor.users.findOneAsync(self.userId);
    if (!user) {
      throw new Meteor.Error('User not found.');
    }
    var email = AccountsEmail.extract(user);

		var charge = await createCharge(stripe, {
			amount: amountInCents,
			currency: "usd",
			card: token.id,
			description: email
		});

		//if (err && err.type === 'StripeCardError') {
		if (!charge) {
			return false;
		}

		return await Charges.insertAsync({
			created_at: new Date(),
			user_id: self.userId,
			amount: amountInCents,
			type: 'donation',
			user_email: email,
			user_username: user.username,
			livemode: charge.livemode,
			stripe_charge_id: charge.id
		});
  },


  stripePurchaseCheckout: async function(amount_in_cents, type, id, token) {
		var self = this;

		check(amount_in_cents, validNumber);
		check(type, String);
		check(id, String);
		check(token, Object);

		var stripe = StripeAPI(Meteor.settings.stripe_secret_key);

    var user = await Meteor.users.findOneAsync(self.userId);
    if (!user) {
      throw new Meteor.Error('User not found.');
    }
    var email = AccountsEmail.extract(user);

		var charge = await createCharge(stripe, {
			amount: amount_in_cents,
			currency: "usd",
			card: token.id,
			description: email
		});

		if (!charge) {
			return false;
		}

		if (_s.store[type] && _s.store[type][id]) {
      var addToSet = {};
      addToSet['purchases.'+type] = id;
			await Meteor.users.updateAsync(self.userId, {$addToSet:addToSet});
    }

		return await Charges.insertAsync({
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
	},
})
