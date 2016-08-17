Template.landingResultsOld.helpers({
  results: function() {
    return OldResults.find({}, {sort: {createdAt:-1}});
  }
});


Template.landingResultsOld.events({
  'click #resultsLink': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/results');
  }
})


Template.landingResultsOld.onCreated(function() {
  this.subscribe('oldResultsTitles');
})


Template.pastGame.helpers({
  showDetails: function() {
    return Template.instance().showDetails.get();
  },

  details: function() {
    let data = Template.currentData();
    if (data) {
      return OldResultsDetails.findOne(data._id);
    }
  }
})


Template.pastGame.events({
  'click .showGameLink': function(event, template) {
    event.preventDefault();
    let showDetails = Template.instance().showDetails.get();
    if (showDetails) {
      Template.instance().showDetails.set(false);
    } else {
      Template.instance().showDetails.set(true);
    }
  }
})


Template.pastGame.onCreated(function() {
  var self = this;
  this.showDetails = new ReactiveVar(false);

  this.autorun(function() {
    if (self.showDetails.get()) {
      let data = Template.currentData();
      if (data) {
        Meteor.subscribe('oldResultsDetails', data._id);
      }
    }
  })
});
