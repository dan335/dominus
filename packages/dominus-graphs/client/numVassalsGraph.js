Template.numVassalsGraph.onRendered(function() {
  this.autorun(function() {
    var find = {};
    var options = {sort: {created_at: 1}, fields: {numVassals:1, created_at:1}};
    var data = Dailystats.find(find, options).fetch();

    data = _.filter(data, function(d) {
      return typeof d.numVassals != "undefined";
    });

    if (data && data.length) {
      var options = {
        top: 20,
        right: 15,
        data: data, // an array of objects, such as [{value:100,date:...},...]
        full_width: true,
        height: 300,
        target: '#numVassalsGraph', // the html element that the graphic is inserted in
        x_accessor: 'created_at',  // the key that accesses the x value
        legend_target: '#numVassalsGraphLegend',
        animate_on_load: true,
        interpolate: 'linear',
        y_extended_ticks:true,
        aggregate_rollover:true
      };

      options.y_accessor = ['numVassals'];
      options.legend = ['vassals'];

      MG.data_graphic(options);
    }
  })
});
