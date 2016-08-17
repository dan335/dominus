Template.roundTitle.helpers({
  isOpen: function() {
    return Template.instance().isOpen.get()
  },

  round: function() {
    return Rounds.findOne(this._id)
  }
})



Template.roundTitle.events({
  'click .roundOpenButton': function(event, template) {
    event.preventDefault();
    if (Template.instance().isOpen.get()) {
      Template.instance().isOpen.set(false)
    } else {
      Template.instance().isOpen.set(true)
    }
  }
})




Template.roundTitle.onCreated(function() {
  var self = this

  self.isOpen = new ReactiveVar(false);

  self.autorun(function() {
    if (self.isOpen.get()) {
      self.subscribe('fight', Template.currentData()._id);
    }
  })
})
