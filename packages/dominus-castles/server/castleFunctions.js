dCastles = {};




dCastles.create = function(gameId, user_id, isTest) {
  check(user_id, String);
  check(gameId, String);

  if (Castles.find({gameId:gameId, user_id:user_id}).count()) {
    console.error('user already has a castle', gameId, user_id, isTest)
    return false;
  }

  let player = Players.findOne({gameId:gameId, userId:user_id}, {fields: {username:1}});
  if (!player) {
    console.error('user does not have player in castles.create', gameId, user_id, isTest);
    return false;
  }

  let game = Games.findOne(gameId, {fields: {isKingOfHill:1}});
  if (!game) {
    console.error('No game found in dCastles.create');
    return false;
  }

  let user = Meteor.users.findOne(user_id, {fields: {male:1}})
  if (!user) {
    console.error('create_castle called but no user found for this id', gameId, user_id, isTest);
    return false;
  }

  var countryId = null;

  // find a spot for castle
  var coords = Mapmaker.findHexForCastle(gameId);

  // expand map if no room for castle
  if (!coords) {

    if (game.isKingOfHill) {

      var country = Countries.findOne({gameId:gameId});

      if (country) {
        var result = Mapmaker.addToCountry(gameId, country._id, isTest);
      } else {
        countryId = Mapmaker.addCountry(gameId, false);

        // create capital if country was added
        if (countryId) {
          var capital = dCapitals.createCapital(gameId, countryId);
          if (capital) {
            Mapmaker.buildingAdded(gameId, capital.x, capital.y);
          }
        }
      }

    } else {

      countryId = Mapmaker.addCountry(gameId, isTest);

      // create capital if country was added
      if (countryId) {
        var capital = dCapitals.createCapital(gameId, countryId);
        if (capital) {
          Mapmaker.buildingAdded(gameId, capital.x, capital.y);
        }
      }

    }

    coords = Mapmaker.findHexForCastle(gameId);
  }

  if (!coords) {
    console.error('could not find coords after expanding map in dCastles.create', gameId, user_id, isTest);
    return false;
  }

  var castle = {
    gameId:gameId,
    playerId:player._id,
    name: dCastles.createName(),
    x: coords.x,
    y: coords.y,
    created_at: new Date(),
    user_id: user._id,
    username: player.username,
    image: _s.castles.startingImage,
    countryId: Mapmaker.coordsToCountryId(gameId, coords.x,coords.y),
    male: user.male
  }

  _s.armies.types.forEach(function(type) {
    castle[type] = _gs.castles(gameId, 'startingGarrison.'+type);
  })

  castle._id = Castles.insert(castle);

  if (!castle._id) {
    console.error('could not insert castle in dCastles.create');
    return false;
  }

  Players.update(player._id, {$set: {x:coords.x, y:coords.y, castle_id:castle._id}});

  Mapmaker.buildingAdded(gameId, coords.x, coords.y);

  return castle._id;
}



dCastles.createName = function() {
  return _s.castles.names.part1[_.random(_s.castles.names.part1.length-1)] + _s.castles.names.part2[_.random(_s.castles.names.part2.length-1)];
}






if (process.env.DOMINUS_WORKER == 'true') {
  Queues.createPlayer.process(Meteor.bindEnvironment(function(job) {
    check(job.data.gameId, String);

    let playerId = dCastles.createPlayer(job.data.gameId, job.data.userId, job.data.username, job.data.makePro);
    if (playerId) {
      Queues.add('removeDominus', {gameId:job.data.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, job.data.gameId);
      Queues.add('initDailystatsForNewUser', {playerId:playerId, userId:job.data.userId, gameId:job.data.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, false);
      Queues.add('setupEveryoneChatroom', {gameId:job.data.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, job.data.gameId);
      Queues.add('generateTree', {gameId:job.data.gameId}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, job.data.gameId);
    }

    return Promise.resolve();
  }));
}



// creates player then castle
// called from join game method when someone joins game after it has started
// also called from startGame just before game has started
// makePro = true will make player pro even if user is not pro
dCastles.createPlayer = function(gameId, userId, username, makePro) {
  check(gameId, String);
  check(userId, String);
  check(username, String);
  check(makePro, Boolean);

  let game = Games.findOne(gameId, {fields: {dominusAchieved:1, isProOnly:1, name:1}});
	if (!game) {
		console.error('No game found in dCastles.createPlayer', userId, gameId)
		return false;
	}

  if (game.dominusAchieved) {
    console.error('Cannot join a game that has a Dominus.');
    return false;
  }

  // make sure user doesn't already have player for this Game
  let alreadyInGame = Players.find({userId:userId, gameId:gameId}).count();
  if (alreadyInGame) {
		console.error('Player is already in game in dCastles.createPlayer', userId, gameId)
    return false;
  }

  let user = Meteor.users.findOne(userId, {fields:{male:1, pro:1, username:1, verifiedEmail:1}});

	if (!user) {
		console.error('No user found in dCastles.createPlayer', userId, gameId)
		return false;
	}

	if (!user.verifiedEmail) {
		console.error('Email must be verified before joining a game.', userId, gameId)
		return false
	}

  let player = {
    username: username,
    userId: userId,
    gameId: gameId,
    gameName: game.name,
    createdAt: new Date(),

    gold: _s.init.startingResources.gold,
    grain: _s.init.startingResources.grain,
    lumber: _s.init.startingResources.lumber,
    ore: _s.init.startingResources.ore,
    clay: _s.init.startingResources.clay,
    glass: _s.init.startingResources.glass,
    wool: _s.init.startingResources.wool,

    lord: null,
    vassals: [],
    allies_below: [],
    allies_above: [],
    team: [],
    is_king: true,
    king: null,
    is_dominus: false,
    show_welcome_screen: true,
    num_vassals: 0,
    num_allies_below: 0,
    num_allies_above: 0,
    lp_show_armies: true,
    lp_show_lords: true,
    lp_show_allies: true,
    hex_scale: 1,
    income: 0,
    losses: {},
    losses_worth: 0,
    losses_num: 0,
    sp_show_coords: false,
    sp_show_minimap: true,
    lastActive: new Date(),

    // flag for has notification that your account will soon been deleted been sent to this user
    //accountDelNotificationSent: false,

    possibleDupe: false,

    // array of my alerts to not show
    // set in settings panel
    hideAlertsMine: [],

    x:null, // filled in by createCastle
    y:null, // filled in by createCastle
    castle_id:null, // filled in by createCastle

		male:user.male,
		gameIsOver:false,
    gameIsClosed:false, // used in topNav

    lastIncomeUpdate: new Date(),   // last date income ran

    // income graphs
    totalIncome:0,
    castleIncome:0,
    capitalIncome:0,
    villageIncome:0,
    vassalIncome:0
  };

  if (!makePro) {
    makePro = user.pro;
  }
  player.pro = makePro;

  // collection tracking
  // updated after each income collection
  player.vassalIncome = {};
  player.villageIncome = {};
  player.castleIncome = {};
  player.capitalIncome = {};

  // cached income
  // village and capitals update this
  // then castleIncome updates other income variables
  player.incomeFromVillages = {};
  player.incomeFromCapitals = {};
  player.incomeFromVassals = {};   // cached income from vassals

  _s.market.types_plus_gold.forEach(function(type) {
    player.vassalIncome[type] = 0;
    player.villageIncome[type] = 0;
    player.castleIncome[type] = 0;
    player.capitalIncome[type] = 0;

    player.incomeFromVillages[type] = 0;
    player.incomeFromCapitals[type] = 0;
    player.incomeFromVassals[type] = 0;
  });

  if (game.isProOnly) {
    if (!player.pro) {
      console.error('Pro account required to join game.', userId, gameId, player)
  		return false;
    }
  }

  player._id = Players.insert(player);

  if (!player._id) {
    console.error('Error inserting player.', gameId, userId, username);
    return false;
  }

  let castleId = dCastles.create(gameId, userId, false);

  if (!castleId) {
    Players.remove(player._id);
    console.error('Error creating castle.', gameId, userId, username)
    return false;
  }

  return player._id;
}
