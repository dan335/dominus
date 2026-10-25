var countryFields = {minX:1, maxX:1, minY:1, maxY:1, minZ:1, maxZ:1, paths:1, image:1, imageWithCoords:1};

Meteor.methods({
  fetchCountriesOnScreen: async function(countryIds) {
    //this.unblock();
    check(countryIds, [String]);
    return await Countries.find({_id: {$in: countryIds}}, {fields: countryFields}).fetchAsync();
  }
})
