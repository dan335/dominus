Template.alerts_battles.helpers({
    battles: function() {
        return AlertBattleTitles.find({isOver:false}, {sort:{updatedAt:-1}})
    },

    finishedBattles: function() {
        return AlertBattleTitles.find({isOver:true}, {sort:{updatedAt:-1}})
    }
})

Template.alerts_battles.events({
    'click #showMoreButton': function(event, template) {
      event.preventDefault();
      Template.instance().numShow.set(Template.instance().numShow.get() + 5)
    }
})

Template.alerts_battles.created = function() {
    var self = this

    self.numShow = new ReactiveVar(10)

    self.autorun(function() {
        Meteor.subscribe('battleAlertTitles', Session.get('gameId'), Math.min(self.numShow.get(), 150))
    })
}
