

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.checkForGameStart.process(Meteor.bindEnvironment(function(job) {
    // findAndModify no longer works, mongo 3.2?
    // maybe only works if game is found, if result is empty doesn't work
    // let game = Games.findAndModify({
    //     query: {hasStarted:false, isStarting:false, startAt:{$lte:new Date()}},
    //     update: {$set:{isStarting:true}},
    //     upsert: false
    // });
    //
    // if (game) {
    //   console.log(game)
    //   startGame(game);
    // }
    let game = Games.findOne({hasStarted:false, isStarting:false, startAt:{$lte:new Date()}});

    if (game) {
      Games.update(game._id, {$set: {isStarting:true}});
      startGame(game);
    }
    return Promise.resolve();
  }));
}




let startGame = function(game) {
  check(game.name, String);

  console.log('--- starting game '+ game.name +' ---');

  dMarket.createMarket(game._id);

  // get players who signed up
  let signups = Gamesignups.find({gameId:game._id}).fetch();

  // randomize order
  dFunc.shuffleArray(signups);

  // createPlayer creates player, castles, countries
  signups.forEach(function(signup) {
    let makePro = false;
    if (signup.usedToken) {
      makePro = true;
    }
    let playerId = dCastles.createPlayer(game._id, signup.userId, signup.username, makePro);
    if (playerId) {
      Queues.add('initDailystatsForNewUser', {attempts:10, backoff:{type:'fixed', delay:3000}, playerId:playerId, userId:signup.userId, gameId:game._id}, {delay:0, timeout:1000*60*5}, playerId);
    }
  });

  Queues.add('setupEveryoneChatroom', {gameId:game._id}, {attempts:10, backoff:{type:'fixed', delay:3000}, delay:0, timeout:1000*60*5}, game._id);
  Queues.add('generateTree', {gameId:game._id}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60}, game._id);

  // start game
  let update = {
    hasStarted: true,
    startedAt: new Date(),
    taxesCollected: 0
  };
  Games.update(game._id, {$set:update});

  // send email to players
  signups.forEach(function(signup) {
    Queues.add('sendGameStartedEmail', {gameName:game.name, gameId:game._id, userId:signup.userId}, {delay:0, timeout:1000*60*5}, false);
  });

  Gamesignups.remove({gameId:game._id});
}






if (process.env.DOMINUS_WORKER == 'true') {
  Queues.sendGameStartedEmail.process(Meteor.bindEnvironment(function(job) {
    sendGameStartedEmail(job.data.gameId, job.data.gameName, job.data.userId);
    return Promise.resolve();
  }));
}

var sendGameStartedEmail = function(gameId, gameName, userId) {
  check(gameId, String);
  check(gameName, String);
  check(userId, String);

  let user = Meteor.users.findOne(userId);
  let email = AccountsEmail.extract(user);

  if (user && email) {
    let global_merge_vars = [
      {"name":"gameId", "content":gameId},
      {"name":"gameName", "content":gameName},
      {"name":"domain", "content":Meteor.absoluteUrl()}
    ];
    let to = [{
      "email": email,
      "name": user.username
    }];

    mandrillSendTemplate('game-started', to, global_merge_vars);
  }
}
