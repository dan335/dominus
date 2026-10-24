Meteor.methods({
  'armies.stopMoving': function(params) {
    check(params, {armyId: String});
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in.');
    }
    Armypaths.remove({user_id:this.userId, armyId:params.armyId});
  }
});
