Template.landingRankings.helpers({
  pro: function() {
    return OverallRankingsPro.find({"rankingPro.numGames": {$gt:0}}, {sort: {"rankingPro.overallRank":1}});
  },

  regular: function() {
    return OverallRankingsRegular.find({"rankingRegular.numGames": {$gt:0}}, {sort: {"rankingRegular.overallRank":1}});
  }
});

Template.landingRankings.events({
  'click .link': function(event, template) {
    event.preventDefault();
    var path = ($(event.currentTarget).attr('href'));
    SimpleRouter.go(path);
  },
})

Template.landingRankings.onCreated(function() {
  this.subscribe('overallRankingsRegular');
  this.subscribe('overallRankingsPro');
});
