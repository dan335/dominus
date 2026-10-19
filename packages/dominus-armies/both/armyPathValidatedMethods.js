dArmies.methods.stopMoving = new ValidatedMethod({
  name: 'armies.stopMoving',
  validate: new SimpleSchema({armyId: { type: String }}).validator(),
  run({armyId}) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in.');
    }
    Armypaths.remove({user_id:this.userId, armyId:armyId});
  }
})
