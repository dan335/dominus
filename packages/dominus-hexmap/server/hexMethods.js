Meteor.methods({
  coords_to_id: async function(gameId, x, y, type) {
    check(gameId, String);
    check(x, validNumber);
    check(y, validNumber);
    check(type, String);

    var id = false;

    switch (type) {
      case 'hex':
        var h = await Hexes.findOneAsync({gameId: gameId, x: x, y: y}, {fields: {_id: 1}});
        if (h) {
          id = h._id;
        }
        break;
    }

    return id;
},


// return the resources that a village here would gather
getResourcesGatheredAtHex: async function(gameId, x, y) {
  check(x, Match.Integer);
  check(y, Match.Integer);
  check(gameId, String);

  var resources = await dVillages.resourcesFromSurroundingHexes(gameId, x, y, _s.villages.num_rings_village);
  return resources;
},
})



if (Meteor.isServer) {
  // var getWorthOfHexRule = {
  //   userId: function() {return true;},
  //   type: 'method',
  //   name: 'getWorthOfHex'
  // }
  // DDPRateLimiter.addRule(getWorthOfHexRule, 3, 2000);

  var getResourcesGatheredAtHexRule = {
    userId: function() {return true;},
    connectionId: function() {return true;},
    type: 'method',
    name: 'getResourcesGatheredAtHex'
  }
  DDPRateLimiter.addRule(getResourcesGatheredAtHexRule, 6, 2000);
}
