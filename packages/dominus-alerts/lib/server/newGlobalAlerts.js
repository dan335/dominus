dAlerts.gAlert_nameChange = function(gameId, playerId, previousName, newName) {
    check(playerId, String)
    check(previousName, String)
    check(newName, String);
    check(gameId, String);

    var vars = {playerId:playerId, previousName:previousName, newName:newName}
    newGlobalAlert(gameId, 'ga_nameChange', vars)
}

dAlerts.gAlert_sentGold = function(gameId, fromPlayerId, toPlayerId, amount, tax) {
    check(fromPlayerId, String)
    check(toPlayerId, String)
    check(amount, validNumber);
    check(gameId, String);
    check(tax, validNumber);

    var vars = {fromPlayerId:fromPlayerId, toPlayerId:toPlayerId, amount:amount, tax:tax};
    newGlobalAlert(gameId, 'ga_sentGold', vars)
}


dAlerts.gAlert_sentArmy = function(gameId, fromPlayerId, toPlayerId, army) {
    check(fromPlayerId, String)
    check(toPlayerId, String)
    check(army, Object);
    check(gameId, String);

    var vars = {fromPlayerId:fromPlayerId, toPlayerId:toPlayerId, army:army}
    newGlobalAlert(gameId, 'ga_sentArmy', vars)
}


// x,y is location of country
// so that we can create link to country in alert
dAlerts.gAlert_mapExpanded = function(gameId, numHexes, numCountries, x, y) {
  check(numHexes, Match.Integer);
  check(numCountries, Match.Integer);
  check(gameId, String);
  var vars = {numHexes:numHexes, numCountries:numCountries, x:x, y:y};
  newGlobalAlert(gameId, 'ga_mapExpanded', vars)
}


dAlerts.gAlert_noLongerDominusNewUser = function(gameId, oldDominusPlayerId) {
    check(oldDominusPlayerId, String);
    check(gameId, String);
    var vars = {oldDominusPlayerId:oldDominusPlayerId}
    newGlobalAlert(gameId, 'ga_noLongerDominusNewUser', vars)
}


dAlerts.gAlert_newDominus = function(gameId, newDominusPlayerId, previousDominusPlayerId) {
    check(newDominusPlayerId, String)
    check(previousDominusPlayerId, Match.OneOf(null, String));
    check(gameId, String);
    var vars = {newDominusPlayerId:newDominusPlayerId, previousDominusPlayerId:previousDominusPlayerId}
    newGlobalAlert(gameId, 'ga_newDominus', vars)
}


dAlerts.gAlert_gameOver = function(gameId, winnerPlayerId) {
    check(winnerPlayerId, String);
    check(gameId, String);
    var vars = {winnerPlayerId:winnerPlayerId}
    newGlobalAlert(gameId, 'ga_gameOver', vars)
}


dAlerts.gAlert_accountDeleted = function(gameId, username) {
    check(username, String);
    check(gameId, String);
    var vars = {username:username};
    newGlobalAlert(gameId, 'ga_accountDeleted', vars);
};


dAlerts.gAlert_inactiveAccountDeleted = function(gameId, username) {
    check(username, String);
    check(gameId, String);
    var vars = {username:username};
    newGlobalAlert(gameId, 'ga_inactiveAccountDeleted', vars);
};

dAlerts.gAlert_playerReported = function(gameId, playerId, username, reason, reportedPlayerId, reportedUsername) {
    check(username, String);
    check(playerId, String);
    check(reason, String);
    check(reportedPlayerId, String);
    check(reporterUsername, String);
    check(gameId, String);
    var vars = {
      username:username,
      playerId:playerId,
      reason:reason,
      reportedPlayerId:reportedPlayerId,
      reporterUsername:reporterUsername
    };
    newGlobalAlert(gameId, 'ga_playerReported', vars);
};


// --------


var newGlobalAlert = function(gameId, alertType, vars) {
    check(alertType, String);
    check(gameId, String);

    GlobalAlerts.insert({
      gameId: gameId,
      created_at: new Date(),
      type: alertType,
      vars: vars
    });
};
