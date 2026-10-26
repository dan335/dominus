// A hex's hasBuilding and nearbyBuildings flags, and their copies in its
// country's hexes, after buildings are put on the map and taken away (Oct
// 2026). Castles look for a spot by them (Mapmaker.findHexForCastle), and so
// do capitals.
//
// The 12 hour soak of upgrade PR 13b found a hex marked as having a building
// with none on it: two villages fell in battles that ran at the same time
// (runBattle's concurrency is 5), and Mapmaker.buildingRemoved for the first
// one put hasBuilding back on the second one's hex, from a read made before
// the second battle took that village away. These check the flags after one
// removal, after that exact interleaving, and after many buildings come and go
// at once.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the same rule
// applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('building flags on the map (server/buildingFlagsTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;

      var w = await dTest.buildGameWorld({players: 1});
      var radius = _s.mapmaker.nearbyBuildingCheckRadius;
      var key = function(h) { return h.x + '_' + h.y; };

      // free hexes in the castle's country, the closest to it first, at least
      // `from` away from it
      async function spots(count, from) {
        var castle = await w.castle(0);
        var taken = {};
        for (const collection of [Castles, Villages, Capitals]) {
          (await collection.find({gameId: w.gameId}).fetchAsync()).forEach(function(b) { taken[key(b)] = true; });
        }
        var hexes = await Hexes.find({gameId: w.gameId, countryId: castle.countryId, isBorder: false}).fetchAsync();
        var free = hexes.filter(function(h) {
          return !taken[key(h)] && Hx.hexDistance(h.x, h.y, castle.x, castle.y) >= from;
        });
        free = _.sortBy(free, function(h) { return Hx.hexDistance(h.x, h.y, castle.x, castle.y) * 10000 + h.x * 100 + h.y; });
        if (free.length < count) throw new Error('FAIL: not enough free hexes in the test country');
        return free.slice(0, count).map(function(h) { return {x: h.x, y: h.y}; });
      }

      async function addVillage(at) {
        var countryId = await Mapmaker.coordsToCountryId(w.gameId, at.x, at.y);
        var id = await Villages.insertAsync(_.extend({gameId: w.gameId, x: at.x, y: at.y, countryId: countryId, playerId: w.players[0]._id,
          user_id: w.users[0]._id, username: w.players[0].username, name: 'Flagville', level: 1,
          under_construction: false, created_at: new Date()}, dTest.soldierCounts({})));
        await Mapmaker.buildingAdded(w.gameId, at.x, at.y);
        return id;
      }

      // what destroyVillage and a battle do: the village goes, then its hexes
      async function removeVillage(at) {
        await Villages.removeAsync({gameId: w.gameId, x: at.x, y: at.y});
        await Mapmaker.buildingRemoved(w.gameId, at.x, at.y);
      }

      // the hexes (and country copies) within reach of `around` (or of
      // anything, for 'everywhere') whose flags are not what the buildings
      // there make them
      async function wrongFlags(around) {
        var buildings = [];
        for (const collection of [Castles, Villages, Capitals]) {
          buildings = buildings.concat(await collection.find({gameId: w.gameId}, {fields: {x: 1, y: 1}}).fetchAsync());
        }
        var near = function(h) {
          return around == 'everywhere' || _.some(around, function(a) { return Hx.hexDistance(a.x, a.y, h.x, h.y) <= radius * 2; });
        };
        var expected = function(h) {
          return {
            hasBuilding: _.some(buildings, function(b) { return b.x == h.x && b.y == h.y; }),
            nearbyBuildings: _.some(buildings, function(b) { return Hx.hexDistance(b.x, b.y, h.x, h.y) <= radius; })
          };
        };
        var wrong = [];
        (await Hexes.find({gameId: w.gameId}).fetchAsync()).filter(near).forEach(function(h) {
          var e = expected(h);
          if (!!h.hasBuilding != e.hasBuilding || !!h.nearbyBuildings != e.nearbyBuildings) {
            wrong.push('hex ' + key(h) + ' ' + JSON.stringify(_.pick(h, 'hasBuilding', 'nearbyBuildings')) + ', should be ' + JSON.stringify(e));
          }
        });
        (await Countries.find({gameId: w.gameId}).fetchAsync()).forEach(function(c) {
          c.hexes.filter(near).forEach(function(h) {
            var e = expected(h);
            if (!!h.hasBuilding != e.hasBuilding || !!h.nearbyBuildings != e.nearbyBuildings) {
              wrong.push('country ' + c._id + ' hex ' + key(h) + ' ' + JSON.stringify(_.pick(h, 'hasBuilding', 'nearbyBuildings')) + ', should be ' + JSON.stringify(e));
            }
          });
        });
        return wrong;
      }

      var test = dTest.contractTest(run, async function() {
        for (const v of await Villages.find({gameId: w.gameId}).fetchAsync()) {
          await removeVillage(v);
        }
      });

      try {

        await test('building flags: a new village marks its hex and the hexes around it', async function() {
          var at = (await spots(1, radius + 3))[0];
          await addVillage(at);
          var hex = await Hexes.findOneAsync({gameId: w.gameId, x: at.x, y: at.y});
          equal(hex.hasBuilding, true, 'its hex has a building');
          equal(hex.nearbyBuildings, true, 'and a building nearby');
          equal((await wrongFlags([at])).join('; '), '', 'every hex around it is right');
        });

        await test('building flags: taking one of two villages away clears its hex, and keeps the other\'s marks', async function() {
          var at = await spots(2, radius + 3);
          await addVillage(at[0]);
          await addVillage(at[1]);
          assert(Hx.hexDistance(at[0].x, at[0].y, at[1].x, at[1].y) <= radius, 'the two are near each other');

          await removeVillage(at[0]);
          var gone = await Hexes.findOneAsync({gameId: w.gameId, x: at[0].x, y: at[0].y});
          var kept = await Hexes.findOneAsync({gameId: w.gameId, x: at[1].x, y: at[1].y});
          equal(gone.hasBuilding, false, 'the empty hex has no building');
          equal(gone.nearbyBuildings, true, 'but one nearby');
          equal(kept.hasBuilding, true, 'the other village\'s hex still has one');
          equal((await wrongFlags(at)).join('; '), '', 'every hex around them is right');

          await removeVillage(at[1]);
          equal((await wrongFlags(at)).join('; '), '', 'and after the second one goes too');
        });

        await test('building flags: two villages taken away at once, the second while the first one\'s hexes are being worked out (the 12 hour soak\'s stuck hex)', async function() {
          var at = await spots(2, radius + 3);
          await addVillage(at[0]);
          await addVillage(at[1]);

          // the first removal reads the villages, then the second village
          // goes and its removal runs to the end, then the first one carries on
          var find = Villages.find;
          var interleaved = false;
          Villages.find = function() {
            var cursor = find.apply(Villages, arguments);
            if (!interleaved) {
              interleaved = true;
              var fetch = cursor.fetchAsync;
              cursor.fetchAsync = async function() {
                var docs = await fetch.apply(cursor, arguments);
                await removeVillage(at[1]);
                return docs;
              };
            }
            return cursor;
          };
          try {
            await removeVillage(at[0]);
          } finally {
            Villages.find = find;
          }
          equal(interleaved, true, 'the second removal ran in the middle of the first');

          equal(await Villages.find({gameId: w.gameId}).countAsync(), 0, 'both villages are gone');
          var second = await Hexes.findOneAsync({gameId: w.gameId, x: at[1].x, y: at[1].y});
          equal(second.hasBuilding, false, 'the second village\'s hex has no building');
          equal((await wrongFlags(at)).join('; '), '', 'every hex around them is right');
        });

        await test('building flags: villages built and destroyed all at once, round after round, leave every hex as the buildings are', async function() {
          var at = await spots(12, radius + 3);
          var random = Random.createWithSeeds('building flags');
          var standing = {};
          for (var round = 0; round < 6; round++) {
            var changes = [];
            at.forEach(function(spot) {
              if (random.fraction() < 0.5) return;
              changes.push({spot: spot, add: !standing[key(spot)]});
              standing[key(spot)] = !standing[key(spot)];
            });
            await Promise.all(changes.map(function(change) {
              return change.add ? addVillage(change.spot) : removeVillage(change.spot);
            }));
            equal((await wrongFlags(at)).join('; '), '', 'round ' + round + ' (' + changes.length + ' changes at once)');
          }
        });

        await test('building flags: a country added next to the map gets its hexes marked from the buildings already there', async function() {
          // a village on every hex at the edge of the map, so the new country
          // starts next to one
          var hexes = await Hexes.find({gameId: w.gameId}, {fields: {x: 1, y: 1}}).fetchAsync();
          var onMap = {};
          hexes.forEach(function(h) { onMap[key(h)] = true; });
          var taken = {};
          for (const collection of [Castles, Villages, Capitals]) {
            (await collection.find({gameId: w.gameId}).fetchAsync()).forEach(function(b) { taken[key(b)] = true; });
          }
          var edge = hexes.filter(function(h) {
            return !taken[key(h)] && _.some(Hx.getSurroundingHexes(h.x, h.y, 1), function(n) { return !onMap[key(n)]; });
          });
          assert(edge.length > 0, 'the map has an edge');
          for (const h of edge) {
            await addVillage(h);
          }
          equal((await wrongFlags('everywhere')).join('; '), '', 'every hex is right before');

          var countries = await Countries.find({gameId: w.gameId}).countAsync();
          var countryId = await Mapmaker.addCountry(w.gameId, true);
          assert(countryId, 'a country was added');
          equal(await Countries.find({gameId: w.gameId}).countAsync(), countries + 1, 'there is one more country');
          var marked = await Hexes.find({gameId: w.gameId, countryId: countryId, nearbyBuildings: true}).countAsync();
          assert(marked > 0, 'some of its hexes are near a village');
          equal((await wrongFlags('everywhere')).join('; '), '', 'and every hex on the map is right after');
        });

      } finally {
        await w.cleanup();
      }
    });
  });
}
