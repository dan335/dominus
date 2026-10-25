Meteor.methods({
  daysSincePlayerActive: async function(userId) {
    check(userId, Match.OneOf(String, null));
    let options = {fields: {presence:1}};
    let user = await Meteor.users.findOneAsync(userId, options);
    if (user) {
      let date = null;
      if (user.presence && user.presence.status == 'online') {
        return 0;
      } else {
        date = new Date(user.presence.updatedAt);
      }

      var numDays = moment(dClock.now()).diff(date, 'days');
      return Math.floor(numDays);
    }
    return null;
  },


  // server only since upgrade PR 17: the browser doesn't call it
  // (game/rightPanels/client/rp_reportPlayer.js)
  reportPlayer: async function(playerId, reason) {
    check(playerId, String);
    check(reason, String);

    let gameId = Session.get('gameId');

    if (reason.length < 6) {
      throw new Meteor.Error('Please give a reason why you are reporting this player.');
    }

    if (reason.length > 300) {
      throw new Meteor.Error('Reason too long.  300 characters max.');
    }

    // make sure user isn't reporting too often
    let find = {gameId:gameId, userId:this.userId};
    var fields = {lastReportDate:1, username:1, admin:1};
    var player = await Players.findOneAsync(find, {fields:fields});

    if (!player) { return; }

    var rFields = {username:1, userId:1};
    rPlayer = await Players.findOneAsync(find, {fields:rFields});

    if (!rPlayer) { return; }

    // limit reports
    if (!player.admin) {
      if (player.lastReportDate) {
        var lastReportDate = moment(new Date(player.lastReportDate));

        if (moment(dClock.now()) - lastReportDate < _s.init.canReportEvery) {
          var dur = moment.duration(_s.init.canReportEvery);
          throw new Meteor.Error('Can only make a report once '+dur.humanize()+'.');
        }
      }
    }

    // create report
    var report = {
      playerId: playerId,
      userId: player.userId,
      username: player.username,
      reason: reason,
      createdAt: dClock.now(),
      reportedPlayerId: rPlayer._id,
      reportedUserId: rPlayer.userId,
      reportedUsername: rPlayer.username,
      active:true,
      gameId:gameId
    };

    if (player.admin) {
      report.username = 'Admin';
    }

    await Reports.insertAsync(report);

    // global alert
    dAlerts.gAlert_playerReported(gameId, player._id, player.username, reason, rPlayer._id, rPlayer.username);

    // record date
    // users can only report once every ...
    await Players.updateAsync(player._id, {$set: {lastReportDate: dClock.now()}});
  }
});
