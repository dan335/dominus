Meteor.methods({
  // for marking hexes
  // client doesn't know hex id only x,y
  addMarkerCoords: function(gameId, unitType, x, y) {
    var self = this;

    check(x, Match.Integer);
    check(y, Match.Integer);

    let player = Players.findOne({userId:this.userId, gameId:gameId}, {fields:{pro:1}});
    if (!player) {
      console.error('No player found in addMarkerCoords');
    }

    var numCurrent = Markers.find({playerId:player._id}).count();
    var max = 0;
    if (player.pro) {
      max = _s.markers.maxMarkersPro;
    } else {
      max = _s.markers.maxMarkersNonPro;
    }
    if (numCurrent >= max)
    {
      throw new Meteor.Error('Only '+max+' markers allowed.');
    }

    var markerData = {
      name: "",
      x:0,
      y:0,
      description: "",
      unitType: null,
      unitId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user_id: this.userId,
      order: numCurrent,
      groupId:0,   // 0 is always default group
      gameId:gameId,
      playerId:player._id
    };

    switch(unitType) {
      case 'hex':
        var unit = Hexes.findOne({gameId:gameId, x:x, y:y}, {fields:{x:1, y:1}});
        if (!unit) {
          throw new Meteor.Error('no unit found');
        }
        markerData.name = "hex "+unit.x+","+unit.y;
        markerData.x = unit.x;
        markerData.y = unit.y;
        markerData.unitType = 'hex';
        markerData.unitId = unit._id;
        break;
    }

    addMarker(markerData);
  },

  // for everything but hexes
  addMarker: function(gameId, unitType, unitId) {
    var self = this;

    check(unitType, String);
    check(unitId, String);

    let player = Players.findOne({userId:this.userId, gameId:gameId}, {fields:{pro:1}});
    if (!player) {
      console.error('no player found in addMarkerCoords');
    }

    var numCurrent = Markers.find({playerId:player._id}).count();
    var max = 0;
    if (player.pro) {
      max = _s.markers.maxMarkersPro;
    } else {
      max = _s.markers.maxMarkersNonPro;
    }
    if (numCurrent >= max)
    {
      throw new Meteor.Error('Only '+max+' markers allowed.');
    }

    var markerData = {
      name: "",
      x:0,
      y:0,
      description: "",
      unitType: null,
      unitId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user_id: this.userId,
      order: numCurrent,
      groupId:0,   // 0 is always default group
      gameId:gameId,
      playerId:player._id
    };

    switch(unitType) {
      case 'capital':
        var unit = Capitals.findOne(unitId, {fields:{name:1, x:1, y:1}});
        if (!unit) {
          throw new Meteor.Error('no unit found');
        }
        markerData.name = unit.name;
        markerData.x = unit.x;
        markerData.y = unit.y;
        markerData.unitType = 'capital';
        markerData.unitId = unit._id;

        if (!markerData.name) {
          markerData.name = 'Capital';
        }

        break;
      case 'castle':
        var unit = Castles.findOne(unitId, {fields:{name:1, username:1, x:1, y:1}});
        if (!unit) {
          throw new Meteor.Error('no unit found');
        }
        markerData.name = unit.username + "'s castle";
        markerData.x = unit.x;
        markerData.y = unit.y;
        markerData.unitType = 'castle';
        markerData.unitId = unit._id;
        break;
      case 'village':
        var unit = Villages.findOne(unitId, {fields:{name:1, username:1, x:1, y:1}});
        if (!unit) {
          throw new Meteor.Error('no unit found');
        }
        markerData.name = unit.username + "'s village";
        markerData.x = unit.x;
        markerData.y = unit.y;
        markerData.unitType = 'village';
        markerData.unitId = unit._id;
        break;
      case 'army':
        var unit = Armies.findOne(unitId, {fields:{name:1, username:1, x:1, y:1}});
        if (!unit) {
          throw new Meteor.Error('no unit found');
        }
        markerData.name = unit.username + "'s army";
        markerData.x = unit.x;
        markerData.y = unit.y;
        markerData.unitType = 'army';
        markerData.unitId = unit._id;
        break;
      case 'hex':
        var unit = Hexes.findOne(unitId, {fields:{x:1, y:1}});
        if (!unit) {
          throw new Meteor.Error('no unit found');
        }
        markerData.name = "hex "+unit.x+","+unit.y;
        markerData.x = unit.x;
        markerData.y = unit.y;
        markerData.unitType = 'hex';
        markerData.unitId = unit._id;
        break;
    }

    addMarker(markerData);
  }
})


var addMarker = function(markerData) {
  if (markerData.name.length > 35) {
    markerData.name = markerData.name.substring(0,35);
  }

  var selector = {unitType: markerData.unitType, unitId: markerData.unitId, user_id:markerData.user_id};

  if (Markers.find(selector).count()) {
    throw new Meteor.Error('You already have a marker here.');
  }

  var newMarkerId = Markers.insert(markerData);

  // return the marker id
  if (newMarkerId) {
    return newMarkerId;
  } else {
    return null;
  }
}


if (Meteor.isServer) {
  var addMarkerCoordsRule = {
    userId: function() {return true;},
    type: 'method',
    name: 'addMarkerCoords'
  }
  DDPRateLimiter.addRule(addMarkerCoordsRule, 5, 5000);
}


var addMarkerRule = {
  userId: function() {return true;},
  type: 'method',
  name: 'addMarker'
}
DDPRateLimiter.addRule(addMarkerRule, 5, 5000);
