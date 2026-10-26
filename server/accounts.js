Accounts.validateNewUser(function(user) {
	// #TODO:100 fix this
	// var bannedEmails = EJSON.parse(process.env.BANNED_EMAILS);
	// if (_.contains(bannedEmails, user.emails[0].address)) {
	// 	throw new Meteor.Error('403', 'User banned.');
	// } else {
	// 	return true;
	// }

	// if (user.emails[0].address == null) {
	// 	throw new Meteor.Error(403, 'Email is null, must be valid.');
	// }

	var email = AccountsEmail.extract(user);
	if (!email) {
		throw new Meteor.Error(403, 'Email is null, must be valid.');
	}

	// admin can always create account
	if (email == process.env.DOMINUS_ADMIN_EMAIL) {
		return true;
	}

	return true;
});



// this is called before validateNewUser()
// don't do anything here except setup user object
// async: accounts-base waits for it (Meteor.wrapFn on 2.16, await on Meteor 3)
Accounts.onCreateUser(async function(options, user) {
	if (options.profile) {
		user.profile = options.profile;
	} else {
		user.profile = {};
	}

	// set admin
	user.admin = false;
	user.moderator = false;

	// has user's email been verified
	user.verifiedEmail = false;

	// use chipcastledotcom:accounts-email instead
	// if using a service to sign in put that email into user.emails
	// create username
	if (user.services) {
		if (user.services.google) {
			user.username = user.profile.name;

			if (user.services.google.email === process.env.DOMINUS_ADMIN_EMAIL) {
				user.admin = true;
			}

			user.verifiedEmail = user.services.google.verified_email;
		}

		if (user.services.facebook) {
			user.username = user.profile.name;
			user.verifiedEmail = true;
		}
	}

	// limit username to 25 character
	if (user.username.length > 25) {
		user.username = user.username.substring(0,25);
	}

	// check for duplicate names
	// (sync on 2.16, a promise on Meteor 3: awaiting it works on both)
	let dupeNameUser = await Accounts.findUserByUsername(user.username);
	if (dupeNameUser) {
		user.username = user.username + Math.floor(Math.random() * 100);
	}

	// results holds results from past Games
	// not used?
	user.results = [];

	user.purchases = { castles: ['castle_02_keep']};

	user.createdAt = new Date();

	// true until user logs in for the first time
	// used to tell first time someone logs in
	user.isNewUser = true;

	if (Meteor.isServer && process.env.NODE_ENV == 'development') {
		user.verifiedEmail = true;

		if (user.services && user.services.password) {
			user.emails[0].verified = true;
		}
	}

	user.avatarFilename = null;

	user.pro = false;
	user.proTokens = 0;	// tokens that user can redeem for single game pro
	user.male = true;

	user.rankingRegular = {
		 wins: 0,
		 numVassalsRank: 0,
		 incomeRank: 0,
		 lostSoldiersRank: 0,
		 villagesRank: 0,
		 numGames: 0,
		 overall: 0
	};

	user.rankingPro = {
		wins: 0,
		numVassalsRank: 0,
		incomeRank: 0,
		lostSoldiersRank: 0,
		villagesRank: 0,
		numGames: 0,
		overall: 0
	};

	// add to mailing list
	let email = AccountsEmail.extract(user);
	if (email) {
		await Queues.addAsyncOrLog('addToMailingList', {name:user.username, email:email}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, email);
	} else {
		console.error('User does not have an email in onCreateUser');
	}

	return user;
});



// check when user logs in if they have a castle
// if not then they are a new user
// this gets called multiple times per user, careful
var onLogin = async function(data) {
	//if (data.user && data.user.isNewUser) {
		let email = AccountsEmail.extract(data.user);

		// temp
		// did user have pro in old server
		// (only with an address to look up: {email: undefined} matches any
		// document, which made every account without an email pro)
		let pref = null;
		if (typeof email === 'string' && email.length) {
			pref = await OldProUsers.findOneAsync({email:email}, {fields: {purchases:1}});
		}
		if (pref) {
			await Meteor.users.updateAsync(data.user._id, {$set: {pro:true}});
			await Players.updateAsync({userId:data.user._id}, {$set: {pro:true}}, {multi:true});
		}

		// temp
		// update purchases
		if (pref && pref.purchases && pref.purchases.castles) {
			if (pref.purchases.castles.length > 1) {
				let castles = _.union(data.user.purchases.castles, pref.purchases.castles);
				let purchases = {castles:castles};
				await Meteor.users.updateAsync(data.user._id, {$set: {purchases:purchases}});
			}
		}

		if (data.user.isNewUser) {
			await Meteor.users.updateAsync(data.user._id, {$set:{isNewUser:false}});
		}
	//}




	// if (data.user && !data.user.castle_id) {
	// 	onCreateUser(data.user._id);
	// }

	// reset this
	// flag for has notification that your account will soon been deleted been sent to this user
	//Meteor.users.update(data.user._id, {$set:{accountDelNotificationSent:false}});
};

// accounts-base 3 awaits each onLogin hook (_successfulLogin), so the login
// waits for this one before the client hears it succeeded.
Accounts.onLogin(onLogin);



Meteor.startup(async function() {
	if (process.env.DOMINUS_WORKER == 'true') {
		await Accounts.loginServiceConfiguration.removeAsync({service:'google'});
		await Accounts.loginServiceConfiguration.removeAsync({service:'facebook'});
		await Accounts.loginServiceConfiguration.insertAsync(Meteor.settings.googleLogin);
		await Accounts.loginServiceConfiguration.insertAsync(Meteor.settings.facebookLogin);
	}
});


Accounts.config({
	sendVerificationEmail:true,
	loginExpirationInDays:1000,
	// accounts 3 answers every failed login and signup with "Something went
	// wrong. Please check your credentials." unless this is false; false
	// keeps the messages players have always seen (Incorrect password,
	// Username already exists.), as accounts 2 did by default
	ambiguousErrorMessages:false
});

Accounts.emailTemplates.siteName = 'Dominus';
Accounts.emailTemplates.from = 'Dominus <dan@dominusgame.net>';
Accounts.emailTemplates.verifyEmail.subject = function(user) {
	return 'Email verification for Dominus';
};

Accounts.emailTemplates.verifyEmail.html = function(user, url) {
	var email = '<div><img src="https://dominusgame.net/emails/emailBanner.jpg" style="max-width:100%;max-height:283px;"><br><br><p>Hello,</p><p>To verify your email, simply click the link below.</p><p><a href="'+url+'">'+url+'</a></p><p>Thanks.</p><p><a href="https://dominusgame.net">Dominus</a></p></div>';
	return email;
};
