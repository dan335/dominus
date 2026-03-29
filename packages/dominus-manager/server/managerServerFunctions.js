
dManager.createNextGame = function() {
  // don't create if there's already a pending game
  let pendingGame = Games.findOne({hasStarted: false, hasClosed: false});
  if (pendingGame) {
    return null;
  }

  // determine game number from highest existing "Game N" name
  let num = 1;
  let games = Games.find({name: /^Game \d+$/}, {fields: {name: 1}, sort: {createdAt: -1}}).fetch();
  games.forEach(function(g) {
    let match = g.name.match(/^Game (\d+)$/);
    if (match) {
      let n = parseInt(match[1]);
      if (n >= num) {
        num = n + 1;
      }
    }
  });

  let data = {
    name: 'Game ' + num,
    desc: '',
    maxPlayers: 50,
    startAt: moment().add(72, 'hours').toDate(),
    isRelaxed: false,
    isSpeed: false,
    isCrazyFast: false,
    isProOnly: false,
    isKingOfHill: false,
    isNoLargeResources: false,
    createdAt: new Date(),
    hasEnded: false,
    hasStarted: false,
    isStarting: false,
    hasClosed: false,
    closeDate: null,
    endDate: null,
    lastDominusPlayerId: null,
    taxesCollected: 0,
    tree: null,
    map_size: null,
    minimapBgPath: null,
    numPlayers: 0,
    dominusAchieved: false,
    minimap: null
  };

  let gameId = Games.insert(data);
  console.log('--- auto-created next game: ' + data.name + ' (starts ' + moment(data.startAt).format('YYYY-MM-DD HH:mm') + ' UTC) ---');
  return gameId;
}
