Meteor.startup(function () {
  Players._ensureIndex({_id:1, userId:1});
  Players._ensureIndex({gameId:1, userId:1});
  Players._ensureIndex({gameId:1, is_dominus:1});

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

  Roomchats._ensureIndex({room_id:1, created_at:1});
  Recentchats._ensureIndex({room_id:1});

  Rounds._ensureIndex({battle_id:1});
  Countries._ensureIndex({gameId:1, "hexes.x":1, "hexes.y":1});
  Countries._ensureIndex({gameId:1});
});
