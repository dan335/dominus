armiesTestsStubPlayer = async function(gameId) {
  await Meteor.users.removeAsync({});
  await Meteor.users.insertAsync({
    _id:'wee',
    admin:false,
    verifiedEmail:true,
    isNewUser:false,
    pro:false
  });

  await Players.removeAsync({});
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
  player._id = await Players.insertAsync(player);
  return player;
}
