Template.lp_countries.helpers({
  countries: function() {
    let playerId = Session.get('playerId');
    if (playerId) {
      return LeftPanelCapitals.find({playerId:playerId}, {sort: {name:1}});
    }
  }
});



Template.lp_countries.onCreated(function() {
  this.autorun(function() {
    let playerId = Session.get('playerId');
    let gameId = Session.get('gameId');
    Meteor.subscribe('left_panel_capitals', gameId, playerId);
  })
})


Template.lp_country.helpers({
  worth: function() {
    var country = Template.currentData();
    if (country && country.income && country.income.worth) {
      return country.income.worth;
    }
  }
});
