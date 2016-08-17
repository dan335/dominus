armiesTestsStubPlayer = function(gameId) {
  Meteor.users.remove({});
  Meteor.users.insert({
    _id:'wee',
    admin:false,
    verifiedEmail:true,
    isNewUser:false,
    pro:false
  });

  Players.remove({});
  var player = {
    gameId:gameId,
    userId:'wee',
    username:'bewb',
    x:0,
    y:0,
    team:[],
    lord:null,
    king:null,
    vassals:[],
    allies_above:[],
    allies_below:[],
    castle_id:1,
    is_dominus:false
  };
  player._id = Players.insert(player);
  return player;
}
