Template.incomeGraph.onRendered(function() {
  this.autorun(function() {
    const options = {sort: {created_at: 1}, fields: {totalIncome:1, castleIncome:1, capitalIncome:1, villageIncome:1, vassalIncome:1, created_at:1}};
    let data = Dailystats.find({}, options).fetch();

    data = _.filter(data, function(d) {
      return (typeof(d.created_at) != "undefined" && typeof(d.totalIncome) != "undefined");
    });

    if (data && data.length) {

      const options = {
        top: 20,
        right: 15,
        data: data, // an array of objects, such as [{value:100,date:...},...]
        full_width: true,
        height: 300,
        target: '#incomeGraph', // the html element that the graphic is inserted in
        x_accessor: 'created_at',  // the key that accesses the x value
        legend_target: '#incomeGraphLegend',
        animate_on_load: true,
        interpolate: 'linear',
        y_extended_ticks:true,
        aggregate_rollover:true
      };

      options.legend = ['Total', 'Castle', 'Capitals', 'Villages', 'Vassals'];
      options.y_accessor = ['totalIncome', 'castleIncome', 'capitalIncome', 'villageIncome', 'vassalIncome'];

      MG.data_graphic(options);
    }
  })
});
