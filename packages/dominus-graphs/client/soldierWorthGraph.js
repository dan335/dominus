Template.soldierWorthGraph.onRendered(function() {
  this.autorun(function() {
    var find = {};
    var options = {sort: {created_at: 1}, fields: {soldierWorth:1, created_at:1}};
    let hasData = false;

    var data = Gamestats.find(find, options).map(function(stat) {
      let s = {};
      s.created_at = stat.created_at;
      _s.armies.types.forEach(function(type) {
        if (stat.soldierWorth) {
          hasData = true;
          s[type] = stat.soldierWorth[type];
        }
      });
      return s;
    })

    if (hasData && data && data.length) {
      var options = {
        top: 20,
        right: 15,
        data: data, // an array of objects, such as [{value:100,date:...},...]
        full_width: true,
        height: 300,
        target: '#soldierWorthGraph', // the html element that the graphic is inserted in
        x_accessor: 'created_at',  // the key that accesses the x value
        legend_target: '#soldierWorthGraphLegend',
        animate_on_load: true,
        interpolate: 'linear',
        y_extended_ticks:true,
        aggregate_rollover:true
      };

      options.y_accessor = _s.armies.types;
      options.legend = _s.armies.types;

      MG.data_graphic(options);
    }
  })
});
