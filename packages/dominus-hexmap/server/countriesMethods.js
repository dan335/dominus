var countryFields = {minX:1, maxX:1, minY:1, maxY:1, minZ:1, maxZ:1, paths:1, image:1, imageWithCoords:1};

Meteor.methods({
  fetchCountriesOnScreen: function(countryIds) {
    this.unblock();
    check(countryIds, Array);
    return Countries.find({_id: {$in: countryIds}}, {fields: countryFields}).fetch();
  }
})
