Template.vassalIncomeGraph.onRendered(function() {
  this.autorun(function() {
    var find = {};
    var options = {sort: {created_at: 1}, fields: {vassalInc:1, created_at:1}};
    var data = Dailystats.find(find, options).map(function(stat) {
      var s = {created_at: stat.created_at};
      _s.market.types.forEach(function(type) {
        if (stat.vassalInc && stat.vassalInc[type]) {
          s[type] = stat.vassalInc[type];
        } else {
          s[type] = 0;
        }
      })
      return s;
    });

    if (data && data.length) {
      var options = {
        top: 20,
        right: 15,
        data: data, // an array of objects, such as [{value:100,date:...},...]
        full_width: true,
        height: 300,
        target: '#vassalIncomeGraph', // the html element that the graphic is inserted in
        x_accessor: 'created_at',  // the key that accesses the x value
        legend_target: '#vassalIncomeGraphLegend',
        animate_on_load: true,
        interpolate: 'linear',
        y_extended_ticks:true,
        aggregate_rollover:true
      };

      options.y_accessor = _s.market.types;
      options.legend = _s.market.types;

      MG.data_graphic(options);
    }
  })
});
