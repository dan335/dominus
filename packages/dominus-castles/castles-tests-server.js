// run at the beginning of tests
stubTestGame = function() {
  Games.remove({});
  let game = {
    _id: 'testgamecastles',
    isSpeed: false,
    hasEnded: false,
    maxPlayers: 200
  }
  game._id = Games.insert(game);
  return game._id;
}


Tinytest.add('castles.create', function (test) {
  let gameId = stubTestGame();

  Mapmaker.eraseMap(gameId);
  Meteor.users.remove({});
  Castles.remove({});
  _s.mapmaker.minHexesInCountry = 100;
  _s.mapmaker.maxHexesInCountry = 200;

  var user = {verifiedEmail:true, username:'bewb', pro:true, male:true};
  user._id = Meteor.users.insert(user);

  dCastles.createPlayer(gameId, user._id, 'bewb', false);

  test.equal(Castles.find({gameId:gameId}).count(), 1, 'castle was created');
  test.isNotNull(Castles.findOne({gameId:gameId}).countryId);
});


Tinytest.add('castles.createName', function(test) {
  var name = dCastles.createName();
  test.equal(typeof name, 'string', 'is name a string');
})


// Tinytest.add('castles.create.performance', function(test) {
//   Mapmaker.eraseMap();
//   Meteor.users.remove({});
//   for (n=0;n<100;n++) {
//     var user = {username:'blah'+n, emails:[{address:'blah'+n+'@blah.com', verified:true}]};
//     user._id = Meteor.users.insert(user);
//     dCastles.create(user._id, true);
//   }
//   console.log('timing done')
// })
