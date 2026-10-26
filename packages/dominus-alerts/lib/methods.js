Meteor.methods({
  hideAlertMine: function(playerId, alertType) {
    //this.unblock();
    check(alertType, String);
    check(playerId, String);

    var alertTypes = _.pluck(myAlertList, 'type');
    if (!_.contains(alertTypes, alertType)) {
      throw new Meteor.Error('Alert type not found.');
    }

    var find = {_id:playerId, userId:this.userId};
    if (this.isSimulation) {
      Players.update(find, {$addToSet:{hideAlertsMine:alertType}});
      return;
    }
    return (async () => {
      await Players.updateAsync(find, {$addToSet:{hideAlertsMine:alertType}});
    })();
  },

  showAlertMine: function(playerId, alertType) {
    //this.unblock();
    check(alertType, String);
    check(playerId, String);

    var alertTypes = _.pluck(myAlertList, 'type');
    if (!_.contains(alertTypes, alertType)) {
      throw new Meteor.Error('Alert type not found.');
    }

    var find = {_id:playerId, userId:this.userId};
    if (this.isSimulation) {
      Players.update(find, {$pull:{hideAlertsMine:alertType}});
      return;
    }
    return (async () => {
      await Players.updateAsync(find, {$pull:{hideAlertsMine:alertType}});
    })();
  },

  markAlertAsRead: function(gameId, alert_id) {
    //this.unblock();
    check(gameId, String);
    check(alert_id, String);

    var playerFind = {gameId:gameId, userId:this.userId};
    var alertFind = function(player) { return {_id:alert_id, "playerIds.playerId":player._id}; };
    if (this.isSimulation) {
      let player = Players.findOne(playerFind);
      if (!player) {
        throw new Meteor.Error('No player found.');
      }
      Alerts.update(alertFind(player), {$set:{"playerIds.$.read":true}});
      return;
    }
    return (async () => {
      let player = await Players.findOneAsync(playerFind);
      if (!player) {
        throw new Meteor.Error('No player found.');
      }

      await Alerts.updateAsync(alertFind(player), {$set:{"playerIds.$.read":true}});
    })();
  },

  markAllAlertsAsRead: function(playerId) {
    //this.unblock();
    check(playerId, String);

    var playerFind = {_id:playerId, userId:this.userId};
    var alertFind = {"playerIds.playerId":playerId};
    if (this.isSimulation) {
      let player = Players.findOne(playerFind);
      if (!player) {
        throw new Meteor.Error('No player found.');
      }
      Alerts.update(alertFind, {$set:{"playerIds.$.read":true}}, {multi:true});
      return;
    }
    return (async () => {
      let player = await Players.findOneAsync(playerFind);
      if (!player) {
        throw new Meteor.Error('No player found.');
      }

      await Alerts.updateAsync(alertFind, {$set:{"playerIds.$.read":true}}, {multi:true});
    })();
  }
})
