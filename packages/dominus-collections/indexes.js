Meteor.startup(async function () {
  // [collection, keys, options]; a failure stops the server starting, as
  // _ensureIndex did before Meteor 3
  const INDEXES = [
    [Players, {_id:1, userId:1}],
    [Players, {gameId:1, userId:1}],
    [Players, {gameId:1, is_dominus:1}],
    [Players, {lord:1, username:1}],

    //Gamesignups._dropIndex({gameId:1, user_id:1})
    [Gamesignups, {gameId:1, user_id:1}],

    [Hexes, {gameId:1, x:1, y:1}, {unique:1}],

    [Castles, {playerId:1}],
    [Castles, {gameId:1, x:1, y:1}],
    [Castles, {countryId:1}],

    [Villages, {playerId:1}],
    [Villages, {gameId:1, x:1, y:1}],
    [Villages, {countryId:1}],

    [Armies, {playerId:1}],
    [Armies, {gameId:1, x:1, y:1}],
    [Armies, {countryId:1}],

    [Capitals, {gameId:1, x:1, y:1}],
    [Capitals, {countryId:1}],

    [Markers, {playerId:1, user_id:1}],
    [Dailystats, {playerId:1}],
    [Alerts, {"playerIds.playerId":1}],
    [GlobalAlerts, {gameId:1, created_at:1}],
    [Armypaths, {playerId:1}],
    [Armypaths, {armyId:1, user_id:1}],
    [Gamestats, {created_at:1}],

    [Battles2, {updatedAt:1}],
    [Battles2, {gameId:1, x:1, y:1, isOver:1}],
    [Battles2, {gameId:1, x:1, y:1, updatedAt:1}],
    [Battles2, {gameId:1, showBattle:1}],
    [Battles2, {isRunning:1, updatedAt:1}],

    [Roomchats, {room_id:1, created_at:1}],
    [Recentchats, {room_id:1}],

    [Rounds, {battle_id:1}],
    [Countries, {gameId:1, "hexes.x":1, "hexes.y":1}],
    [Countries, {gameId:1}]
  ];
  for (const [collection, keys, options] of INDEXES) {
    await collection.createIndexAsync(keys, options);
  }
});

// Server performance indexes (Oct 2026). Each was checked with explain() on
// MongoDB 6.0 and 8.0 against the exact queries that use it. Each call is
// wrapped so one failure is logged and the others are still created.
Meteor.startup(async function () {
  const ensure = async function(collection, name, keys) {
    try {
      await collection.createIndexAsync(keys);
    } catch (error) {
      console.error('index ' + name + ' failed', error);
    }
  };

  // top nav (every connection), profile, SEO and settings look players up by userId alone
  await ensure(Players, 'players userId', {userId:1});

  // myAlerts: sorted by created_at and limited, without an in-memory sort.
  // Replaces {"playerIds.playerId":1} above, which can be dropped once this one exists.
  await ensure(Alerts, 'alerts playerId created_at', {"playerIds.playerId":1, created_at:-1});

  // unreadAlerts, polled while oplog is disabled for alerts
  await ensure(Alerts, 'alerts playerId read', {"playerIds.playerId":1, "playerIds.read":1});

  // the marker update on every army step, and marker removal when units die
  await ensure(Markers, 'markers unitId unitType', {unitId:1, unitType:1});
});
