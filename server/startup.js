// BrowserPolicy.content.allowOriginForAll("http://www.google-analytics.com")
// BrowserPolicy.content.allowOriginForAll("http://netdna.bootstrapcdn.com")
// BrowserPolicy.content.allowOriginForAll("https://*.stripe.com")
// BrowserPolicy.content.allowOriginForAll("http://*.facebook.net")
// BrowserPolicy.content.allowOriginForAll("https://*.facebook.com")
// BrowserPolicy.content.allowOriginForAll("https://*.doubleclick.net")
// BrowserPolicy.content.allowOriginForAll("https://engine.kadiro.io")
// BrowserPolicy.content.allowEval("https://*.stripe.com")


// addArmyPath used to accept any armyId, so a path could be added to someone
// else's army. Remove paths whose owner or game doesn't match their army.
// Safe to run on every start; does nothing once clean.
removeForeignArmyPaths = async function() {
  let paths = await Armypaths.find({}, {fields: {armyId:1, user_id:1, gameId:1}}).fetchAsync();
  if (!paths.length) {
    return 0;
  }

  let armies = {};
  let armyIds = _.uniq(_.pluck(paths, 'armyId'));
  for (let army of await Armies.find({_id: {$in:armyIds}}, {fields: {user_id:1, gameId:1}}).fetchAsync()) {
    armies[army._id] = army;
  }

  let badIds = [];
  paths.forEach(function(path) {
    let army = armies[path.armyId];
    if (!path.user_id) {
      badIds.push(path._id);
    } else if (army && (army.user_id !== path.user_id || army.gameId !== path.gameId)) {
      badIds.push(path._id);
    }
  });

  if (badIds.length) {
    await Armypaths.removeAsync({_id: {$in:badIds}});
    console.log('removeForeignArmyPaths: removed ' + badIds.length + ' army paths that did not belong to their army');
  }

  return badIds.length;
};

Meteor.startup(async function() {
  if (process.env.DOMINUS_WORKER == 'true') {
    await removeForeignArmyPaths();
  }
});


// Logged out visitors (spectators) all have userId null, so give them a
// generous cap per IP address on top of each publication's own rate limit.
// HTTP_FORWARDED_COUNT is set in the Dockerfile so clientAddress is the
// visitor's real address.
DDPRateLimiter.addRule({
  userId: function(userId) {return !userId;},
  clientAddress: function() {return true;},
  type: 'subscription'
}, 300, 10000);

DDPRateLimiter.addRule({
  userId: function(userId) {return !userId;},
  clientAddress: function() {return true;},
  type: 'method'
}, 100, 10000);
