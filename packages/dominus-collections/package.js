Package.describe({
  name: 'dominus-collections',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.2');
  api.use([
    'ecmascript',
    'mongo'
  ]);
  api.addFiles('collections.js');
  api.addFiles('indexes.js', 'server');
  api.export([
    'Castles',
    'Villages',
    'Countries',
    'CountriesTemp',
    'Hexes',
    'Armies',
    'Armypaths',
    'Settings',
    'Markers', 'MarkerGroups',
    'Alerts', 'GlobalAlerts',
    'Rooms', 'Roomchats', 'Recentchats',
    'Charges',
    'Dailystats',
    'Gamestats',
    'Reports',
    'Battles2',
    'Rounds',
    'Capitals',
    'Players',
    'Games',
    'Gamesignups',
    'Market',
    'Markethistory',
    'OldResults',
    'OldProUsers',
    'MailingList',
    'KueStats',
    'Settings'
  ]);
  api.export([
    'MyArmies',
    'Roomlist',
    'RightPanelCastle',
    'RightPanelVillages',
    'RightPanelArmies',
    'RightPanelTreePlayers',
    'RightPanelPlayers',
    'CountryIndex',
    'Mygames',
    'ProfileUser',
    'OldResultsDetails',
    'DominusPlayer',
    'OverallRankingsRegular',
    'OverallRankingsPro',
  ], 'client');
});
