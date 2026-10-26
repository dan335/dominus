// dCapitals.createCapital (Oct 2026): a capital is put on a free hex in its
// country and turns that hex into grain. The country keeps its own copy of
// each of its hexes (Countries.hexes), and that copy used to keep the hex's
// old type. In king of the hill the one country grows by addToCountry, which
// saves its hexes again from that copy, so the capital's hex went back to its
// old resource.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the same rule
// applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('capitals (server/capitalTests.js)', async function(run, t) {
      var equal = t.equal;

      var w = await dTest.buildGameWorld({players: 1});
      var made = null;

      try {

        await run('createCapital: the capital\'s hex becomes grain, in the hexes and in its country\'s copy of them', async function() {
          var country = await Countries.findOneAsync({gameId: w.gameId});
          equal(await Capitals.find({countryId: country._id}).countAsync(), 0, 'the test country has no capital yet');

          // every hex the capital can go on is large clay, in both places
          var spots = {countryId: country._id, isBorder: false, hasBuilding: false, nearbyBuildings: false};
          var candidates = await Hexes.find(spots).fetchAsync();
          equal(candidates.length > 0, true, 'there are hexes for it');
          await Hexes.updateAsync(spots, {$set: {type: 'clay', large: true}}, {multi: true});
          var isCandidate = {};
          candidates.forEach(function(h) { isCandidate[h.x + '_' + h.y] = true; });
          country.hexes.forEach(function(h) {
            if (isCandidate[h.x + '_' + h.y]) {
              h.type = 'clay';
              h.large = true;
            }
          });
          await Countries.updateAsync(country._id, {$set: {hexes: country.hexes}});

          var capital = await dCapitals.createCapital(w.gameId, country._id);
          equal(!!capital, true, 'a capital was made');
          made = capital;

          var hex = await Hexes.findOneAsync({gameId: w.gameId, x: capital.x, y: capital.y});
          equal(JSON.stringify(_.pick(hex, 'type', 'large')), JSON.stringify({type: 'grain', large: false}), 'its hex is grain');
          var copy = _.find((await Countries.findOneAsync(country._id)).hexes, function(h) { return h.x == capital.x && h.y == capital.y; });
          equal(JSON.stringify(_.pick(copy, 'type', 'large')), JSON.stringify({type: 'grain', large: false}), 'and so is the country\'s copy');

          // and every other hex in the country still matches its copy
          var docs = {};
          (await Hexes.find({countryId: country._id}).fetchAsync()).forEach(function(h) { docs[h.x + '_' + h.y] = h; });
          var different = (await Countries.findOneAsync(country._id)).hexes.filter(function(h) {
            var doc = docs[h.x + '_' + h.y];
            return !doc || doc.type != h.type || !!doc.large != !!h.large;
          });
          equal(different.map(function(h) { return h.x + '_' + h.y; }).join(','), '', 'no hex differs from its copy');
        });

        await run('createCapital: in king of the hill, the capital\'s hex is still grain after the country grows', async function() {
          // addToCountry saves the country's hexes again from its copy of them
          var capital = made;
          equal(!!capital, true, 'the test above made a capital');
          var country = await Countries.findOneAsync(capital.countryId);
          var before = (await Countries.findOneAsync(country._id)).hexes.length;

          var result = await Mapmaker.addToCountry(w.gameId, country._id, true);
          equal(result, country._id, 'the country grew');
          equal((await Countries.findOneAsync(country._id)).hexes.length > before, true, 'it has more hexes');

          var hex = await Hexes.findOneAsync({gameId: w.gameId, x: capital.x, y: capital.y});
          equal(JSON.stringify(_.pick(hex, 'type', 'large')), JSON.stringify({type: 'grain', large: false}), 'the capital\'s hex is still grain');
        });

      } finally {
        await w.cleanup();
      }
    });
  });
}
