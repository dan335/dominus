Template.marketPriceChart.onRendered(function() {
  this.autorun(function() {
    let find = {};
    let options = {sort: {created_at: 1}, fields: {quantity:1, created_at:1}};
    let data = Markethistory.find(find, options).fetch();

    if (data && data.length) {
      let options = {
        top: 20,
        right: 15,
        data: data, // an array of objects, such as [{value:100,date:...},...]
        full_width: true,
        height: 300,
        target: '#marketVolumeChart', // the html element that the graphic is inserted in
        x_accessor: 'created_at',  // the key that accesses the x value
        legend_target: '#marketVolumeChartLegend',
        animate_on_load: true,
        interpolate: 'linear',
        y_extended_ticks:true,
        aggregate_rollover:true
      };

      options.y_accessor = ['quantity'];
      options.legend = ['volume'];

      MG.data_graphic(options);
    }
  })
});
