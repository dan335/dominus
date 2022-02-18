Meteor.methods({
    hide_welcome_screen: function(gameId) {
      //this.unblock();
      let find = {gameId:gameId, userId:this.userId};
      Players.update(find, {$set: {show_welcome_screen: false}})
    }
})
