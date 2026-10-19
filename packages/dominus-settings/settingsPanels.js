_s.panels = {
  leftPanels: [
    {name: 'Help', template: 'help_panel', icon:'fa-question', spectator:true},
    {name: 'Summary', template: 'left_panel', icon:'fa-bars'},
    {name: 'Alerts', template: 'alerts_panel', icon:'fa-bullhorn', spectator:true},
    {name: 'Market', template: 'market_panel', icon:'fa-money', spectator:true},
    {name: 'Graphs', template: 'stats_panel', icon:'fa-line-chart', spectator:true},
    {name: 'Chatrooms', template: 'chatrooms_panel', icon:'fa-comments'},
    {name: 'Rankings', template: 'rankings_panel', icon:'fa-trophy', spectator:true},
    {name: 'Tree', template: 'tree_panel', icon:'fa-sitemap', spectator:true},
    {name: 'Calculator', template: 'calculatorPanel', icon:'fa-calculator', spectator:true},
    {name: 'Markers', template: 'markersPanel', icon:'fa-map-marker'},
    {name: 'Settings', template: 'settings_panel', icon:'fa-wrench'},
  ],
  // spectator:true panels above are the only left panels shown when spectating
  // and these are the only right panels
  spectatorRightPanels: ['empty_template', 'rp_info_army', 'rp_info_hex', 'rp_info_village', 'rp_info_castle', 'rp_info_capital'],
  rankings: {
    perPage: 10
  }
}
