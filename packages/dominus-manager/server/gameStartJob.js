

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
      try {
        dManager.startGame(game);
      } catch (e) {
        // startGame only sets hasStarted:true at the very end, and nothing
        // else ever resets isStarting. If it throws partway (a createPlayer /
        // market / tree failure), the game is left hasStarted:false,
        // isStarting:true forever: the picker query skips isStarting:true, and
        // createNextGame won't create a replacement while a hasStarted:false
        // game exists -- so the whole auto-game rotation halts. Reset
        // isStarting so the job can retry.
        console.error('startGame failed, resetting isStarting', game._id, e);
        Games.update(game._id, {$set: {isStarting:false}});
        throw e;
      }
    }
    return Promise.resolve();
  }));
}




dManager.startGame = function(game, isTest) {
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
    if (playerId && !isTest) {
      Queues.add('initDailystatsForNewUser', {attempts:10, backoff:{type:'fixed', delay:3000}, playerId:playerId, userId:signup.userId, gameId:game._id}, {delay:0, timeout:1000*60*5}, playerId);
    }
  });

  if (!isTest) {
    Queues.add('setupEveryoneChatroom', {gameId:game._id}, {attempts:10, backoff:{type:'fixed', delay:3000}, delay:0, timeout:1000*60*5}, game._id);
    Queues.add('generateTree', {gameId:game._id}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60}, game._id);
  }

  // start game
  let update = {
    hasStarted: true,
    startedAt: new Date(),
    taxesCollected: 0
  };
  Games.update(game._id, {$set:update});

  if (!isTest) {
    // send email to players
    signups.forEach(function(signup) {
      Queues.add('sendGameStartedEmail', {gameName:game.name, gameId:game._id, userId:signup.userId}, {delay:0, timeout:1000*60*5}, false);
    });
  }

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

    // old mandrill stuff
    // let global_merge_vars = [
    //   {"name":"gameId", "content":gameId},
    //   {"name":"gameName", "content":gameName},
    //   {"name":"domain", "content":Meteor.absoluteUrl()}
    // ];
    // let to = [{
    //   "email": email,
    //   "name": user.username
    // }];

    //mandrillSendTemplate('game-started', to, global_merge_vars);

    var html = '<img src="https://dominusgame.net/emails/emailBanner.jpg"><br><br>The game ' +gameName+ ' that you signed up for just started.  Your castle has been created.<br><br><a href="https://dominusgame.net/game/' +gameId+ '">Click here to play</a><br><br><a href="https://dominusgame.net">Dominus</a>';

    var options = {
      from: 'Dominus <dan@dominusgame.net>',
      to: user.username + '<' + email + '>',
      subject: 'Game Started',
      html: html
    }

    Email.send(options);
  }
}
