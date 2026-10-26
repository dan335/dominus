dAlerts.alert_battleStart = async function(gameId, playerId, unit_id, type, battle_id) {
    check(playerId, String)
    check(unit_id, String)
    check(type, String)
    check(battle_id, String);
    check(gameId, String);

    var vars = {unit_id:unit_id, type:type, battle_id:battle_id}
    await newAlert(gameId, 'alert_battleStart', [playerId], vars)
}


dAlerts.alert_receivedGoldFrom = async function(gameId, playerId, fromPlayerId, amount, tax) {
    check(playerId, String)
    check(fromPlayerId, String)
    check(amount, validNumber);
    check(tax, validNumber);
    check(gameId, String);

    var vars = {fromPlayerId:fromPlayerId, amount:amount, tax:tax};
    await newAlert(gameId, 'alert_receivedGoldFrom', [playerId], vars)
}


dAlerts.alert_receivedArmy = async function(gameId, playerId, fromPlayerId, army) {
    check(playerId, String)
    check(fromPlayerId, String)
    check(army, Object);
    check(gameId, String);

    var vars = {fromPlayerId:fromPlayerId, army:army}
    await newAlert(gameId, 'alert_receivedArmy', [playerId], vars)
}


dAlerts.alert_addedToChatroom = async function(gameId, playerId, addedByPlayerId, room_id) {
    check(playerId, String)
    check(addedByPlayerId, String)
    check(room_id, String);
    check(gameId, String);

    var vars = {addedByPlayerId:addedByPlayerId, room_id:room_id}
    await newAlert(gameId, 'alert_addedToChatroom', [playerId], vars)
}


dAlerts.alert_kickedFromChatroom = async function(gameId, playerId, room_id) {
    check(playerId, String)
    check(room_id, String);
    check(gameId, String);

    vars = {room_id:room_id}
    await newAlert(gameId, 'alert_kickedFromChatroom', [playerId], vars)
}


dAlerts.alert_chatroomMadeAdmin = async function(gameId, playerId, room_id) {
    check(playerId, String)
    check(room_id, String);
    check(gameId, String);

    vars = {room_id:room_id}
    await newAlert(gameId, 'alert_chatroomMadeAdmin', [playerId], vars)
}


dAlerts.alert_chatroomRemovedFromAdmin = async function(gameId, playerId, room_id) {
    check(playerId, String)
    check(room_id, String);
    check(gameId, String);

    vars = {room_id:room_id}
    await newAlert(gameId, 'alert_chatroomRemovedFromAdmin', [playerId], vars)
}


dAlerts.alert_chatroomNowOwner = async function(gameId, playerId, room_id) {
    check(playerId, String)
    check(room_id, String);
    check(gameId, String);
    vars = {room_id:room_id}
    await newAlert(gameId, 'alert_chatroomNowOwner', [playerId], vars)
}


dAlerts.alert_vassalIsUnderAttack = async function(gameId, arrayOfLordIds, vassalPlayerId, battle_id) {
    check(arrayOfLordIds, Array)
    check(vassalPlayerId, String)
    check(battle_id, String);
    check(gameId, String);
    var vars = {vassalPlayerId:vassalPlayerId, battle_id:battle_id}
    await newAlert(gameId, 'alert_vassalIsUnderAttack', arrayOfLordIds, vars)
}


// joinedCastle is either null or the castle id
// same with village and army
dAlerts.alert_armyFinishedAllMoves = async function(gameId, playerId, army_id, x, y, joinedCastle, joinedVillage, joinedArmy) {
    check(playerId, String)
    check(army_id, String)
    check(x, Match.Integer)
    check(y, Match.Integer)
    check(joinedCastle, Match.OneOf(null, String))
    check(joinedVillage, Match.OneOf(null, String))
    check(joinedArmy, Match.OneOf(null, String));
    check(gameId, String);
    var vars = {army_id:army_id, x:x, y:y, joinedCastle:joinedCastle, joinedVillage:joinedVillage, joinedArmy:joinedArmy}
    await newAlert(gameId, 'alert_armyFinishedAllMoves', [playerId], vars)
}


dAlerts.alert_villageDestroyed = async function(gameId, playerId, battle_id, villageName) {
    check(playerId, String)
    check(battle_id, String)
    check(villageName, String);
    check(gameId, String);
    var vars = {battle_id:battle_id, villageName:villageName}
    await newAlert(gameId, 'alert_villageDestroyed', [playerId], vars)
}


dAlerts.alert_armyDestroyed = async function(gameId, playerId, battle_id, armyName) {
    check(playerId, String)
    check(battle_id, String)
    check(armyName, String);
    check(gameId, String);
    var vars = {battle_id:battle_id, armyName:armyName}
    await newAlert(gameId, 'alert_armyDestroyed', [playerId], vars)
}


dAlerts.alert_lostVassal = async function(gameId, playerId, lostVassalPlayerId, vassalsNewLordPlayerId) {
    check(playerId, String)
    check(lostVassalPlayerId, String)
    check(vassalsNewLordPlayerId, String);
    check(gameId, String);
    var vars = {lostVassalPlayerId:lostVassalPlayerId, vassalsNewLordPlayerId:vassalsNewLordPlayerId}
    await newAlert(gameId, 'alert_lostVassal', [playerId], vars)
}


dAlerts.alert_lostCapital = async function(gameId, playerId, capitalId) {
    check(playerId, String);
    check(capitalId, String);
    check(gameId, String);
    var vars = {capitalId:capitalId};
    await newAlert(gameId, 'alert_lostCapital', [playerId], vars);
}


dAlerts.alert_gainedVassal = async function(gameId, playerId, newVassalPlayerId, vassalsNewLordPlayerId) {
    check(playerId, String)
    check(newVassalPlayerId, String)
    check(vassalsNewLordPlayerId, String);
    check(gameId, String);
    var vars = {newVassalPlayerId:newVassalPlayerId, vassalsNewLordPlayerId:vassalsNewLordPlayerId}
    await newAlert(gameId, 'alert_gainedVassal', [playerId], vars)
}


dAlerts.alert_capturedCapital = async function(gameId, playerId, capital_id) {
  check(playerId, String);
  check(capital_id, String);
  check(gameId, String);
  var vars = {capital_id:capital_id};
  await newAlert(gameId, 'alert_capturedCapital', [playerId], vars);
}


dAlerts.alert_newLord = async function(gameId, playerId, lordPlayerId) {
    check(playerId, String)
    check(lordPlayerId, String);
    check(gameId, String);
    var vars = {lordPlayerId:lordPlayerId}
    await newAlert(gameId, 'alert_newLord', [playerId], vars)
}


dAlerts.alert_newKingChatroom = async function(gameId, playerId) {
    check(playerId, String);
    check(gameId, String);
    var vars = {}
    await newAlert(gameId, 'alert_newKingChatroom', [playerId], vars)
}


dAlerts.alert_noLongerDominus = async function(gameId, playerId) {
    check(playerId, String);
    check(gameId, String);
    var vars = {}
    await newAlert(gameId, 'alert_noLongerDominus', [playerId], vars)
}


dAlerts.alert_noLongerDominusNewUser = async function(gameId, playerId) {
    check(playerId, String);
    check(gameId, String);
    var vars = {}
    await newAlert(gameId, 'alert_noLongerDominusNewUser', [playerId], vars)
}


dAlerts.alert_youAreDominus = async function(gameId, playerId) {
    check(playerId, String);
    check(gameId, String);
    var vars = {}
    await newAlert(gameId, 'alert_youAreDominus', [playerId], vars)
}

// --------



var newAlert = async function(gameId, alertType, playerIds, vars) {
    check(alertType, String);
    check(gameId, String);

    var playerData = []

    _.each(playerIds, function(pid) {
        playerData.push({playerId:pid, read:false})
    })

    await Alerts.insertAsync({
      gameId: gameId,
      created_at: dClock.now(),
      type: alertType,
      vars: vars,
      playerIds: playerData
    });
}
