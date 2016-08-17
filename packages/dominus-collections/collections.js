Alerts = new Mongo.Collection('alerts');
Armies = new Mongo.Collection('armies');
Armypaths = new Mongo.Collection('armypaths2');
Battles2 = new Mongo.Collection('battles2');
Capitals = new Mongo.Collection('capitals');
Castles = new Mongo.Collection('castles');
Charges = new Mongo.Collection('charges');
Countries = new Mongo.Collection('countries');
CountriesTemp = new Mongo.Collection('countriestemp');  // create country in advance then move to Countries when needed
Dailystats = new Mongo.Collection('dailystats');
Games = new Mongo.Collection('games');
Gamesignups = new Mongo.Collection('gamesignups');
Gamestats = new Mongo.Collection('gamestats');
GlobalAlerts = new Mongo.Collection('globalalerts');
Hexes = new Mongo.Collection('hexes');
Markers = new Mongo.Collection('markers');
MarkerGroups = new Mongo.Collection('markergroups');
Markethistory = new Mongo.Collection('markethistory')
Market = new Mongo.Collection('market')
Players = new Mongo.Collection('players');
Recentchats = new Mongo.Collection('recentchats');
Reports = new Mongo.Collection('reports');
Rooms = new Mongo.Collection('rooms');
Roomchats = new Mongo.Collection('roomchats');
Rounds = new Mongo.Collection('rounds');
Settings = new Mongo.Collection('settings');  // global settings
Villages = new Mongo.Collection('villages');

// results from old games
OldResults = new Mongo.Collection('oldresults');
OldProUsers = new Mongo.Collection('prousers');

KueStats = new Mongo.Collection('kuestats');

// mailing list, old mailing list + users
MailingList = new Mongo.Collection('newmailinglist');


if (Meteor.isClient) {
  //CountriesClient = new Mongo.Collection(null);
  CountryIndex = new Mongo.Collection('countryindex');

  MyArmies = new Mongo.Collection('myarmies');

  // this is used for new chat notifications
  // need to keep a list of which rooms you are in
  Roomlist = new Mongo.Collection('room_list');

	RightPanelCastle = new Mongo.Collection('right_panel_castle')
	RightPanelVillages = new Mongo.Collection('right_panel_villages')
	RightPanelArmies = new Mongo.Collection('right_panel_armies');
	RightPanelTreePlayers = new Mongo.Collection('right_panel_tree_players')
  RightPanelPlayers = new Mongo.Collection('right_panel_players');

  // used in topNav to show user's games
  Mygames = new Mongo.Collection('mygames');

  // user profile page
  ProfileUser = new Mongo.Collection('profileuser');

  OldResultsDetails = new Mongo.Collection('oldresultsdetails');

  // used in alerts, rankings and dominus popup
  DominusPlayer = new Mongo.Collection('dominusplayer');

  OverallRankingsRegular = new Mongo.Collection('overallrankingsregular');
  OverallRankingsPro = new Mongo.Collection('overallrankingspro');
}
