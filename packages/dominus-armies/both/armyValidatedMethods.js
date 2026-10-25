// what combining adds to the army: the other armies' soldiers, and the
// latest last_move_at of them all
var combinedArmy = function(army, otherArmies) {
  var soldiers = {};
  _s.armies.types.forEach(function(type) {
    soldiers[type] = 0;
  });

  var latestMove = moment(new Date(army.last_move_at));

  otherArmies.forEach(function(otherArmy) {
    var otherArmyMoveAt = moment(new Date(otherArmy.last_move_at));
    if (otherArmyMoveAt.isAfter(latestMove)) {
      latestMove = otherArmyMoveAt;
    }

    _s.armies.types.forEach(function(type) {
      soldiers[type] += otherArmy[type];
    })
  });

  return {soldiers:soldiers, last_move_at:latestMove.toDate()};
};

var combineOtherFields = function() {
  var fields = {}
  fields.last_move_at = 1
  _s.armies.types.forEach(function(type) {
    fields[type] = 1
  });
  return fields;
};

// armies get latest last_move_at
// prevents bug where army has been at hex for a long time
// another army moves there then they combine
Meteor.methods({
  'armies.combineArmies': function(params) {
    check(params, {gameId: Match.Optional(String), armyId: String});
    var armyId = params.armyId;
    var self = this;
    var fields = {x:1, y:1, last_move_at:1, gameId:1};
    var armyFind = {_id:armyId, user_id:this.userId};

    if (this.isSimulation) {
      var army = Armies.findOne(armyFind, {fields:fields});
      if (!army) {
        throw new Meteor.Error('Army not found.');
      }

      // client copies of armies may not have gameId
      var find = {_id:{$ne:army._id}, user_id:this.userId, x:army.x, y:army.y};
      var combined = combinedArmy(army, Armies.find(find, {fields:combineOtherFields()}).fetch());

      // the server removes the other armies
      Armies.update(armyId, {$inc:combined.soldiers, $set:{speed:null, moveTime:null, last_move_at:combined.last_move_at}});
      Armypaths.update({armyId:armyId}, {$set:{last_move_at:combined.last_move_at}}, {multi:true});
      return;
    }

    return (async () => {
      var army = await Armies.findOneAsync(armyFind, {fields:fields});
      if (!army) {
        throw new Meteor.Error('Army not found.');
      }

      var find = {_id:{$ne:army._id}, user_id:self.userId, x:army.x, y:army.y, gameId:army.gameId};
      var otherArmies = await Armies.find(find, {fields:combineOtherFields()}).fetchAsync();
      var combined = combinedArmy(army, otherArmies);

      for (const otherArmy of otherArmies) {
        await dArmies.destroyArmy(otherArmy._id);
      }

      await Armies.updateAsync(armyId, {$inc:combined.soldiers, $set:{speed:null, moveTime:null, last_move_at:combined.last_move_at}});
      await Armypaths.updateAsync({armyId:armyId}, {$set:{last_move_at:combined.last_move_at}}, {multi:true});
    })();
  },
});


if (Meteor.isServer) {
  Meteor.methods({
    'armies.joinBuilding': async function(params) {
      check(params, {armyId: String});
      var armyId = params.armyId;
      // this.unblock();
      // only the owner may join their army into a building -- dArmies.joinBuilding
      // looks the army up by _id only, so without this a player could force an
      // enemy army (sitting on its own building hex) to disband into the building.
      var ownArmy = await Armies.findOneAsync({_id:armyId, user_id:this.userId}, {fields: {_id:1}});
      if (!ownArmy) {
        var notOwnedError = [{
          name: 'armies.joinBuilding',
          type: 'You do not own this army.',
          details: {armyId}
        }];
        throw new ValidationError(notOwnedError);
      }
      var buildingInfo = await dArmies.joinBuilding(armyId);
      if (buildingInfo) {
        return buildingInfo;
      } else {
        var error = [{
          name: 'armies.joinBuilding',
          type: 'Could not join building.',
          details: {armyId}
        }];
        throw new ValidationError(error);
      }
    },



    'armies.returnToCastle': async function(params) {
      check(params, {armyId: String});
      var armyId = params.armyId;
      // this.unblock();

      var armyOptions = {fields: {x:1, y:1, playerId:1, gameId:1}};
      var army = await Armies.findOneAsync({_id: armyId, user_id: this.userId}, armyOptions);
      if (!army) {
        var error = [{
          name: 'returnToCastle',
          type: 'Could not find army.',
          details: {armyId}
        }];
        console.error(error)
        throw new ValidationError(error);
      }

      let find = {gameId:army.gameId, userId:this.userId};
      let options = {fields: {_id:1}};
      let player = await Players.findOneAsync(find, options);

      var castleOptions = {fields: {x:1, y:1}};
      var castle = await Castles.findOneAsync({playerId:player._id}, castleOptions);
      if (!castle) {
        var error = [{
          name: 'returnToCastle',
          type: 'Could not find castle.',
          details: {}
        }];
        console.error(error)
        throw new ValidationError(error);
      }

      if (!dFunc.isInt(castle.x) || !dFunc.isInt(castle.y)) {
        var error = [{
          name: 'returnToCastle',
          type: 'Castle does not have valid coordinates.',
          details: {}
        }];
        console.error(error)
        throw new ValidationError(error);
      }

      if (castle.x == army.x && castle.y == army.y) {
        var buildingInfo = await dArmies.joinBuilding(army._id);
        return buildingInfo;
      } else {
        await Meteor.callAsync('armies.stopMoving', {armyId: army._id});
        await Meteor.callAsync('addArmyPath', army.gameId, castle.x, castle.y, army._id);
        return {buildingId:army._id, buildingType:'army'};
      }
    }
  });
}
