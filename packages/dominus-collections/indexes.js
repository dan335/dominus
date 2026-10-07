Meteor.startup(function () {
  Players._ensureIndex({_id:1, userId:1});
  Players._ensureIndex({gameId:1, userId:1});
  Players._ensureIndex({gameId:1, is_dominus:1});
  Players._ensureIndex({lord:1, username:1});

  //Gamesignups._dropIndex({gameId:1, user_id:1})
  Gamesignups._ensureIndex({gameId:1, user_id:1});

  Hexes._ensureIndex({gameId:1, x:1, y:1}, {unique:1});

  Castles._ensureIndex({playerId:1});
  Castles._ensureIndex({gameId:1, x:1, y:1});
  Castles._ensureIndex({countryId:1});

  Villages._ensureIndex({playerId:1});
  Villages._ensureIndex({gameId:1, x:1, y:1});
  Villages._ensureIndex({countryId:1});

  Armies._ensureIndex({playerId:1});
  Armies._ensureIndex({gameId:1, x:1, y:1});
  Armies._ensureIndex({countryId:1});

  Capitals._ensureIndex({gameId:1, x:1, y:1});
  Capitals._ensureIndex({countryId:1});

  Markers._ensureIndex({playerId:1, user_id:1});
  Dailystats._ensureIndex({playerId:1});
  Alerts._ensureIndex({"playerIds.playerId":1});
  GlobalAlerts._ensureIndex({gameId:1, created_at:1})
  Armypaths._ensureIndex({playerId:1});
  Armypaths._ensureIndex({armyId:1, user_id:1});
  Gamestats._ensureIndex({created_at:1});

  Battles2._ensureIndex({updatedAt:1});
  Battles2._ensureIndex({gameId:1, x:1, y:1, isOver:1});
  Battles2._ensureIndex({gameId:1, x:1, y:1, updatedAt:1});
  Battles2._ensureIndex({gameId:1, showBattle:1});
  Battles2._ensureIndex({isRunning:1, updatedAt:1});

  Roomchats._ensureIndex({room_id:1, created_at:1});
  Recentchats._ensureIndex({room_id:1});

  Rounds._ensureIndex({battle_id:1});
  Countries._ensureIndex({gameId:1, "hexes.x":1, "hexes.y":1});
  Countries._ensureIndex({gameId:1});
});


// Server performance indexes (Oct 2026). Each was checked with explain() on
// MongoDB 6.0 and 8.0 against the exact queries that use it. Each call is
// wrapped so one failure is logged and the others are still created.
Meteor.startup(function () {
  const ensure = function(collection, name, keys) {
    try {
      collection._ensureIndex(keys);
    } catch (error) {
      console.error('index ' + name + ' failed', error);
    }
  };

  // top nav (every connection), profile, SEO and settings look players up by userId alone
  ensure(Players, 'players userId', {userId:1});

  // myAlerts: sorted by created_at and limited, without an in-memory sort.
  // Replaces {"playerIds.playerId":1} above, which can be dropped once this one exists.
  ensure(Alerts, 'alerts playerId created_at', {"playerIds.playerId":1, created_at:-1});

  // unreadAlerts, polled while oplog is disabled for alerts
  ensure(Alerts, 'alerts playerId read', {"playerIds.playerId":1, "playerIds.read":1});

  // the marker update on every army step, and marker removal when units die
  ensure(Markers, 'markers unitId unitType', {unitId:1, unitType:1});
});
