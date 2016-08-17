dAlerts.alert_battleStart = function(gameId, playerId, unit_id, type, battle_id) {
    check(playerId, String)
    check(unit_id, String)
    check(type, String)
    check(battle_id, String);
    check(gameId, String);

    var vars = {unit_id:unit_id, type:type, battle_id:battle_id}
    newAlert(gameId, 'alert_battleStart', [playerId], vars)
}


dAlerts.alert_receivedGoldFrom = function(gameId, playerId, fromPlayerId, amount, tax) {
    check(playerId, String)
    check(fromPlayerId, String)
    check(amount, validNumber);
    check(tax, validNumber);
    check(gameId, String);

    var vars = {fromPlayerId:fromPlayerId, amount:amount, tax:tax};
    newAlert(gameId, 'alert_receivedGoldFrom', [playerId], vars)
}


dAlerts.alert_receivedArmy = function(gameId, playerId, fromPlayerId, army) {
    check(playerId, String)
    check(fromPlayerId, String)
    check(army, Object);
    check(gameId, String);

    var vars = {fromPlayerId:fromPlayerId, army:army}
    newAlert(gameId, 'alert_receivedArmy', [playerId], vars)
}


dAlerts.alert_addedToChatroom = function(gameId, playerId, addedByPlayerId, room_id) {
    check(playerId, String)
    check(addedByPlayerId, String)
    check(room_id, String);
    check(gameId, String);

    var vars = {addedByPlayerId:addedByPlayerId, room_id:room_id}
    newAlert(gameId, 'alert_addedToChatroom', [playerId], vars)
}


dAlerts.alert_kickedFromChatroom = function(gameId, playerId, room_id) {
    check(playerId, String)
    check(room_id, String);
    check(gameId, String);

    vars = {room_id:room_id}
    newAlert(gameId, 'alert_kickedFromChatroom', [playerId], vars)
}


dAlerts.alert_chatroomMadeAdmin = function(gameId, playerId, room_id) {
    check(playerId, String)
    check(room_id, String);
    check(gameId, String);

    vars = {room_id:room_id}
    newAlert(gameId, 'alert_chatroomMadeAdmin', [playerId], vars)
}


dAlerts.alert_chatroomRemovedFromAdmin = function(gameId, playerId, room_id) {
    check(playerId, String)
    check(room_id, String);
    check(gameId, String);

    vars = {room_id:room_id}
    newAlert(gameId, 'alert_chatroomRemovedFromAdmin', [playerId], vars)
}


dAlerts.alert_chatroomNowOwner = function(gameId, playerId, room_id) {
    check(playerId, String)
    check(room_id, String);
    check(gameId, String);
    vars = {room_id:room_id}
    newAlert(gameId, 'alert_chatroomNowOwner', [playerId], vars)
}


dAlerts.alert_vassalIsUnderAttack = function(gameId, arrayOfLordIds, vassalPlayerId, battle_id) {
    check(arrayOfLordIds, Array)
    check(vassalPlayerId, String)
    check(battle_id, String);
    check(gameId, String);
    var vars = {vassalPlayerId:vassalPlayerId, battle_id:battle_id}
    newAlert(gameId, 'alert_vassalIsUnderAttack', arrayOfLordIds, vars)
}


// joinedCastle is either null or the castle id
// same with village and army
dAlerts.alert_armyFinishedAllMoves = function(gameId, playerId, army_id, x, y, joinedCastle, joinedVillage, joinedArmy) {
    check(playerId, String)
    check(army_id, String)
    check(x, Match.Integer)
    check(y, Match.Integer)
    check(joinedCastle, Match.OneOf(null, String))
    check(joinedVillage, Match.OneOf(null, String))
    check(joinedArmy, Match.OneOf(null, String));
    check(gameId, String);
    var vars = {army_id:army_id, x:x, y:y, joinedCastle:joinedCastle, joinedVillage:joinedVillage, joinedArmy:joinedArmy}
    newAlert(gameId, 'alert_armyFinishedAllMoves', [playerId], vars)
}


dAlerts.alert_villageDestroyed = function(gameId, playerId, battle_id, villageName) {
    check(playerId, String)
    check(battle_id, String)
    check(villageName, String);
    check(gameId, String);
    var vars = {battle_id:battle_id, villageName:villageName}
    newAlert(gameId, 'alert_villageDestroyed', [playerId], vars)
}


dAlerts.alert_armyDestroyed = function(gameId, playerId, battle_id, armyName) {
    check(playerId, String)
    check(battle_id, String)
    check(armyName, String);
    check(gameId, String);
    var vars = {battle_id:battle_id, armyName:armyName}
    newAlert(gameId, 'alert_armyDestroyed', [playerId], vars)
}


dAlerts.alert_lostVassal = function(gameId, playerId, lostVassalPlayerId, vassalsNewLordPlayerId) {
    check(playerId, String)
    check(lostVassalPlayerId, String)
    check(vassalsNewLordPlayerId, String);
    check(gameId, String);
    var vars = {lostVassalPlayerId:lostVassalPlayerId, vassalsNewLordPlayerId:vassalsNewLordPlayerId}
    newAlert(gameId, 'alert_lostVassal', [playerId], vars)
}


dAlerts.alert_lostCapital = function(gameId, playerId, capitalId) {
    check(playerId, String);
    check(capitalId, String);
    check(gameId, String);
    var vars = {capitalId:capitalId};
    newAlert(gameId, 'alert_lostCapital', [playerId], vars);
}


dAlerts.alert_gainedVassal = function(gameId, playerId, newVassalPlayerId, vassalsNewLordPlayerId) {
    check(playerId, String)
    check(newVassalPlayerId, String)
    check(vassalsNewLordPlayerId, String);
    check(gameId, String);
    var vars = {newVassalPlayerId:newVassalPlayerId, vassalsNewLordPlayerId:vassalsNewLordPlayerId}
    newAlert(gameId, 'alert_gainedVassal', [playerId], vars)
}


dAlerts.alert_capturedCapital = function(gameId, playerId, capital_id) {
  check(playerId, String);
  check(capital_id, String);
  check(gameId, String);
  var vars = {capital_id:capital_id};
  newAlert(gameId, 'alert_capturedCapital', [playerId], vars);
}


dAlerts.alert_newLord = function(gameId, playerId, lordPlayerId) {
    check(playerId, String)
    check(lordPlayerId, String);
    check(gameId, String);
    var vars = {lordPlayerId:lordPlayerId}
    newAlert(gameId, 'alert_newLord', [playerId], vars)
}


dAlerts.alert_newKingChatroom = function(gameId, playerId) {
    check(playerId, String);
    check(gameId, String);
    var vars = {}
    newAlert(gameId, 'alert_newKingChatroom', [playerId], vars)
}


dAlerts.alert_noLongerDominus = function(gameId, playerId) {
    check(playerId, String);
    check(gameId, String);
    var vars = {}
    newAlert(gameId, 'alert_noLongerDominus', [playerId], vars)
}


dAlerts.alert_noLongerDominusNewUser = function(gameId, playerId) {
    check(playerId, String);
    check(gameId, String);
    var vars = {}
    newAlert(gameId, 'alert_noLongerDominusNewUser', [playerId], vars)
}


dAlerts.alert_youAreDominus = function(gameId, playerId) {
    check(playerId, String);
    check(gameId, String);
    var vars = {}
    newAlert(gameId, 'alert_youAreDominus', [playerId], vars)
}

// --------



var newAlert = function(gameId, alertType, playerIds, vars) {
    check(alertType, String);
    check(gameId, String);

    var playerData = []

    _.each(playerIds, function(pid) {
        playerData.push({playerId:pid, read:false})
    })

    Alerts.insert({
      gameId: gameId,
      created_at: new Date(),
      type: alertType,
      vars: vars,
      playerIds: playerData
    });
}
