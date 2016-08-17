Meteor.methods({
  hideAlertMine: function(playerId, alertType) {
    this.unblock();
    check(alertType, String);
    check(playerId, String);

    var alertTypes = _.pluck(myAlertList, 'type');
    if (!_.contains(alertTypes, alertType)) {
      throw new Meteor.Error('Alert type not found.');
    }

    Players.update({_id:playerId, userId:this.userId}, {$addToSet:{hideAlertsMine:alertType}});
  },

  showAlertMine: function(playerId, alertType) {
    this.unblock();
    check(alertType, String);
    check(playerId, String);

    var alertTypes = _.pluck(myAlertList, 'type');
    if (!_.contains(alertTypes, alertType)) {
      throw new Meteor.Error('Alert type not found.');
    }

    Players.update({_id:playerId, userId:this.userId}, {$pull:{hideAlertsMine:alertType}});
  },

  markAlertAsRead: function(gameId, alert_id) {
    this.unblock();
    check(gameId, String);
    check(alert_id, String);

    let player = Players.findOne({gameId:gameId, userId:this.userId});
    if (!player) {
      throw new Meteor.Error('No player found.');
    }

    Alerts.update({_id:alert_id, "playerIds.playerId":player._id}, {$set:{"playerIds.$.read":true}})
  },

  markAllAlertsAsRead: function(playerId) {
    this.unblock();
    check(playerId, String);

    let player = Players.findOne({_id:playerId, userId:this.userId});
    if (!player) {
      throw new Meteor.Error('No player found.');
    }

    Alerts.update({"playerIds.playerId":playerId}, {$set:{"playerIds.$.read":true}}, {multi:true})
  }
})
