Template.marketPriceChart.onRendered(function() {
  this.autorun(function() {
    let find = {};
    var options = {sort: {created_at: 1}, fields: {created_at:1, price:1}};
    let data = Markethistory.find(find, options).map(function(stat) {
      _s.market.types.forEach(function(type) {
        stat[type] = stat.price[type];
      });
      return stat;
    })

    if (data && data.length) {
      var options = {
        top: 20,
        right: 15,
        data: data, // an array of objects, such as [{value:100,date:...},...]
        full_width: true,
        height: 300,
        target: '#marketPriceChart', // the html element that the graphic is inserted in
        x_accessor: 'created_at',  // the key that accesses the x value
        legend_target: '#marketPriceChartLegend',
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
