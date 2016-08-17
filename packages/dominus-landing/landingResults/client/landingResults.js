Template.landingResults.helpers({
  games: function() {
    return Games.find({hasEnded:true}, {sort: {endDate:-1}});
  }
});


Template.landingResults.events({
  'click #oldGameLink': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/oldresults');
  }
})



Template.landingResults.onCreated(function() {
  this.subscribe('landingResultTitles');
});



Template.landingResult.helpers({
  gameDuration: function() {
    let data = Template.currentData();
    if (data) {
      return moment(new Date(data.endDate)).from(moment(new Date(data.startedAt)), true);
    }
  },

  showDetails: function() {
    let instance = Template.instance();
    if (instance) {
      return instance.showDetails.get();
    }
  },

  isOpen: function() {
    let instance = Template.instance();
    if (instance) {
      if (instance.showDetails.get()) {
        return 'openDetails'
      }
    }
  }
});


Template.landingResult.events({
  'click .link': function(event, template) {
    event.preventDefault();
    var path = ($(event.currentTarget).attr('href'));
    SimpleRouter.go(path);
  },

  'click .toggleDetailsButton': function(event, template) {
    event.preventDefault();
    let instance = Template.instance();
    let showDetails = instance.showDetails.get();
    instance.showDetails.set(!showDetails);
    if (!showDetails) {
      SimpleRouter.go('/result/'+template.data._id);
    }
  }
});


Template.landingResult.onCreated(function() {
  this.showDetails = new ReactiveVar(false);
});


Template.landingResult.onRendered(function() {
  let data = Template.currentData();
  var path = SimpleRouter.path.get();
  var pathArray = path.split('/');
  if (pathArray[1] == 'result') {
    let gameId = pathArray[2];
    if (data._id == gameId) {
      this.showDetails.set(true);
      document.getElementById(gameId).scrollIntoView();
    }
  }
});



Template.landingResultDetails.helpers({
  details: function() {
    let data = Template.currentData();
    if (data) {
      return GameResult.findOne(data._id);
    }
  },

  hasDescription: function() {
    let data = Template.currentData();
    if (data) {
      let game = GameResult.findOne(data._id);
      if (game) {
        return (game.desc && game.desc.length > 0);
      }
    }
  }
});


Template.landingResultDetails.onCreated(function() {
  this.autorun(function() {
    let data = Template.currentData();
    if (data) {
      Meteor.subscribe('landingResult', data._id);
    }
  })
});
