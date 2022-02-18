Package.describe({
  name: 'dominus-markers',
  version: '0.0.1',
  summary: 'Markers for Dominus',
  git: 'https://github.com/dan335/dominus',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  //api.versionsFrom('1.2');
  api.use([
    'blaze-html-templates',
    'dominus-init',
    'dominus-armies',
    'less',
    'mongo',
    'dominus-manager'
  ]);
  api.addFiles([
    'lib/methodsMarkers.js'
  ]);
  api.addFiles('lib/server/methodsMarkers.js', 'server');
  api.addFiles('lib/server/publishMarkers.js', 'server');
  api.addFiles([
    'client/drawMarkersOnMap.html',
    'client/drawMarkersOnMap.js',
    'client/drawMarkersOnMap.less',
    'client/infoPanelMarkerButton.html',
    'client/infoPanelMarkerButton.js'
  ], 'client');
  api.addFiles('client/markerBox.html', 'client');
  api.addFiles('client/markerBox.js', 'client');
  api.addFiles('client/markerGroup.html', 'client');
  api.addFiles('client/markerGroup.js', 'client');
  api.addFiles('client/markersPanel.html', 'client');
  api.addFiles('client/markersPanel.js', 'client');
  api.addFiles('client/markersPanel.less', 'client');
  api.addFiles('client/rp_infoMarker.html', 'client');
  api.addFiles('client/rp_infoMarker.js', 'client');
  api.addFiles('client/rp_infoMarkerGroup.html', 'client');
  api.addFiles('client/rp_infoMarkerGroup.js', 'client');
});
