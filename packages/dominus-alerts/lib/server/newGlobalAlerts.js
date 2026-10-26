dAlerts.gAlert_nameChange = async function(gameId, playerId, previousName, newName) {
    check(playerId, String)
    check(previousName, String)
    check(newName, String);
    check(gameId, String);

    var vars = {playerId:playerId, previousName:previousName, newName:newName}
    await newGlobalAlert(gameId, 'ga_nameChange', vars)
}

dAlerts.gAlert_sentGold = async function(gameId, fromPlayerId, toPlayerId, amount, tax) {
    check(fromPlayerId, String)
    check(toPlayerId, String)
    check(amount, validNumber);
    check(gameId, String);
    check(tax, validNumber);

    var vars = {fromPlayerId:fromPlayerId, toPlayerId:toPlayerId, amount:amount, tax:tax};
    await newGlobalAlert(gameId, 'ga_sentGold', vars)
}


dAlerts.gAlert_sentArmy = async function(gameId, fromPlayerId, toPlayerId, army) {
    check(fromPlayerId, String)
    check(toPlayerId, String)
    check(army, Object);
    check(gameId, String);

    var vars = {fromPlayerId:fromPlayerId, toPlayerId:toPlayerId, army:army}
    await newGlobalAlert(gameId, 'ga_sentArmy', vars)
}


// x,y is location of country
// so that we can create link to country in alert
dAlerts.gAlert_mapExpanded = async function(gameId, numHexes, numCountries, x, y) {
  check(numHexes, Match.Integer);
  check(numCountries, Match.Integer);
  check(gameId, String);
  var vars = {numHexes:numHexes, numCountries:numCountries, x:x, y:y};
  await newGlobalAlert(gameId, 'ga_mapExpanded', vars)
}


dAlerts.gAlert_noLongerDominusNewUser = async function(gameId, oldDominusPlayerId) {
    check(oldDominusPlayerId, String);
    check(gameId, String);
    var vars = {oldDominusPlayerId:oldDominusPlayerId}
    await newGlobalAlert(gameId, 'ga_noLongerDominusNewUser', vars)
}


dAlerts.gAlert_newDominus = async function(gameId, newDominusPlayerId, previousDominusPlayerId) {
    check(newDominusPlayerId, String)
    check(previousDominusPlayerId, Match.OneOf(null, String));
    check(gameId, String);
    var vars = {newDominusPlayerId:newDominusPlayerId, previousDominusPlayerId:previousDominusPlayerId}
    await newGlobalAlert(gameId, 'ga_newDominus', vars)
}


dAlerts.gAlert_gameOver = async function(gameId, winnerPlayerId) {
    check(winnerPlayerId, String);
    check(gameId, String);
    var vars = {winnerPlayerId:winnerPlayerId}
    await newGlobalAlert(gameId, 'ga_gameOver', vars)
}


dAlerts.gAlert_accountDeleted = async function(gameId, username) {
    check(username, String);
    check(gameId, String);
    var vars = {username:username};
    await newGlobalAlert(gameId, 'ga_accountDeleted', vars);
};


dAlerts.gAlert_inactiveAccountDeleted = async function(gameId, username) {
    check(username, String);
    check(gameId, String);
    var vars = {username:username};
    await newGlobalAlert(gameId, 'ga_inactiveAccountDeleted', vars);
};

dAlerts.gAlert_playerReported = async function(gameId, playerId, username, reason, reportedPlayerId, reportedUsername) {
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
    await newGlobalAlert(gameId, 'ga_playerReported', vars);
};


// --------


var newGlobalAlert = async function(gameId, alertType, vars) {
    check(alertType, String);
    check(gameId, String);

    await GlobalAlerts.insertAsync({
      gameId: gameId,
      created_at: dClock.now(),
      type: alertType,
      vars: vars
    });
};
