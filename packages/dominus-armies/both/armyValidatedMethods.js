// armies get latest last_move_at
// prevents bug where army has been at hex for a long time
// another army moves there then they combine
dArmies.methods.combineArmies = new ValidatedMethod({
  name: 'armies.combineArmies',
  validate: null,
  run({gameId, armyId}) {
    var self = this;
    var fields = {x:1, y:1, last_move_at:1};
    var army = Armies.findOne({_id:armyId, user_id:this.userId}, {fields:fields});
    if (army) {
      var soldiers = {};
      var fields = {}
			fields.last_move_at = 1

      _s.armies.types.forEach(function(type) {
				fields[type] = 1
        soldiers[type] = 0;
			});

      var latestMove = moment(new Date(army.last_move_at));

      var find = {_id:{$ne:army._id}, user_id:this.userId, x:army.x, y:army.y};
      var armies = Armies.find(find, {fields:fields});
      armies.forEach(function(otherArmy) {

        var otherArmyMoveAt = moment(new Date(otherArmy.last_move_at));
        if (otherArmyMoveAt.isAfter(latestMove)) {
          latestMove = otherArmyMoveAt;
        }

        _s.armies.types.forEach(function(type) {
          soldiers[type] += otherArmy[type];
        })

        if (!self.isSimulation) {
          dArmies.destroyArmy(otherArmy._id);
        }
      });

      Armies.update(armyId, {$inc:soldiers, $set:{speed:null, moveTime:null, last_move_at:latestMove.toDate()}});
      Armypaths.update({armyId:armyId}, {$set:{last_move_at:latestMove.toDate()}}, {multi:true});
    } else {
      throw new Meteor.Error('Army not found.');
    }
  }
});



dArmies.methods.joinBuilding = new ValidatedMethod({
  name: 'armies.joinBuilding',
  validate: new SimpleSchema({
    armyId: { type: String }
  }).validator(),
  run({armyId}) {
    // this.unblock();
    if (!this.isSimulation) {
      var buildingInfo = dArmies.joinBuilding(armyId);
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
    }
  }
});



dArmies.methods.returnToCastle = new ValidatedMethod({
  name: 'armies.returnToCastle',
  validate: new SimpleSchema({
    armyId: { type: String }
  }).validator(),
  run({armyId}) {
    // this.unblock();

    if (!this.isSimulation) {
      var armyOptions = {fields: {x:1, y:1, playerId:1, gameId:1}};
      var army = Armies.findOne({_id: armyId, user_id: this.userId}, armyOptions);
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
      let player = Players.findOne(find, options);

      var castleOptions = {fields: {x:1, y:1}};
      var castle = Castles.findOne({playerId:player._id}, castleOptions);
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
        var buildingInfo = dArmies.joinBuilding(army._id);
        return buildingInfo;
      } else {
        dArmies.methods.stopMoving.call({armyId: army._id});
        Meteor.call('addArmyPath', army.gameId, castle.x, castle.y, army._id);
        return {buildingId:army._id, buildingType:'army'};
      }
    }
  }
});
