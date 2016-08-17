Meteor.methods({
  coords_to_id: function(x, y, type) {
    check(x, validNumber);
    check(y, validNumber);
    check(type, String);

    var id = false;

    switch (type) {
      case 'hex':
        var h = Hexes.findOne({x: x, y: y}, {fields: {_id: 1}});
        if (h) {
          id = h._id;
        }
        break;
    }

    return id;
},


// return the resources that a village here would gather
getResourcesGatheredAtHex: function(gameId, x, y) {
  check(x, Match.Integer);
  check(y, Match.Integer);
  check(gameId, String);

  var resources = dVillages.resourcesFromSurroundingHexes(gameId, x, y, _s.villages.num_rings_village);
  return resources;
},

  doesHexExist: function(x,y) {
      return Hexes.find({x:x, y:y}).count() == 1
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
    type: 'method',
    name: 'getResourcesGatheredAtHex'
  }
  DDPRateLimiter.addRule(getResourcesGatheredAtHexRule, 6, 2000);
}
