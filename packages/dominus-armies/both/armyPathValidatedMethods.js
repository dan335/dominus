dArmies.methods.stopMoving = new ValidatedMethod({
  name: 'armies.stopMoving',
  validate: new SimpleSchema({armyId: { type: String }}).validator(),
  run({armyId}) {
    Armypaths.remove({user_id:this.userId, armyId:armyId});
  }
})
