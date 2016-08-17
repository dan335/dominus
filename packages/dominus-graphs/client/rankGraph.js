Template.rankGraph.onRendered(function() {
  this.autorun(function() {
    var find = {};
    var options = {sort: {created_at: 1}, fields: {vassalRank:1, incomeRank:1, created_at:1}};
    var data = Dailystats.find(find, options).fetch();

    data = _.filter(data, function(d) {
      return typeof d.incomeRank != "undefined";
    });

    if (data && data.length) {
      var options = {
        top: 20,
        right: 15,
        data: data, // an array of objects, such as [{value:100,date:...},...]
        full_width: true,
        height: 300,
        target: '#rankGraph', // the html element that the graphic is inserted in
        x_accessor: 'created_at',  // the key that accesses the x value
        legend_target: '#rankGraphLegend',
        animate_on_load: true,
        interpolate: 'linear',
        y_extended_ticks:true,
        aggregate_rollover:true
      };

      options.y_accessor = ['incomeRank', 'vassalRank'];
      options.legend = ['Income', 'Vassals'];

      MG.data_graphic(options);
    }
  })
});
