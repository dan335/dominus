// The map, made the same way every time (upgrade PR 16, Oct 2026).
//
// A game's map grows country by country, with the seeded random source and
// fixed clock of the game simulation (server/lib/testRunnerSimulation.js):
// four countries, king of the hill adding to one of them, castle spots found
// with buildings put on them and one taken away, each country's border mask,
// the minimap, and each country baked to SVG. After each step the test checks
// what the step should have done, and compares every document, and the SVGs,
// with tests/golden/map.json, which was recorded from the code before the
// mapmaker, minimap and mapbaker became async.
//
// The map jobs run through their handlers (dTest.runJob); the baking stops at
// the SVGs, since the JPGs need a headless browser and the upload needs S3.
//
// A change meant to change how maps are made needs that file recorded again:
// each run writes what it got to .test-results/map/actual.json and each
// step's documents to .test-results/map/step-NN.json.
//
// It runs as part of runAllTests (server/lib/testRunner.js), so the same rule
// applies: only against a local development database.

if (Meteor.isServer) {

  var fs = Npm.require('fs');
  var path = Npm.require('path');
  var crypto = Npm.require('crypto');

  var SEED = 'dominus map';
  var START_AT = new Date(Date.UTC(2026, 0, 26, 9, 0, 0));
  var GOLDEN = 'tests/golden/map.json';

  var repoPath = function(file) {
    return path.join(dTest.appDir(), file);
  };

  var resultsDir = function() { return repoPath('.test-results/map'); };

  var countries = async function(sim) {
    return await Countries.find({gameId: sim.gameId}, {sort: {_id: 1}}).fetchAsync();
  };

  var hexCount = async function(sim, find) {
    return await Hexes.find(_.extend({gameId: sim.gameId}, find)).countAsync();
  };

  var facts = async function(sim) {
    return {
      countries: await await dTest.mapAsync(await countries(sim), async function(c) {
        return {
          _id: c._id,
          hexes: c.hexes.length,
          hexDocs: await Hexes.find({countryId: c._id}).countAsync(),
          borders: _.filter(c.hexes, function(h) { return h.isBorder; }).length,
          extents: _.pick(c, 'minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'),
          neighbors: _.clone(c.neighbors || []).sort(),
          paths: c.paths ? c.paths.map(function(p) { return p.length; }) : null
        };
      }),
      hexes: await hexCount(sim, {}),
      withBuilding: await hexCount(sim, {hasBuilding: true}),
      nearBuilding: await hexCount(sim, {nearbyBuildings: true})
    };
  };

  var at = {};

  var SCENARIO = [
    {name: 'four countries', run: async function(sim) {
      for (var i = 0; i < 4; i++) {
        at.added = (at.added || []).concat([await Mapmaker.addCountry(sim.gameId, true)]);
      }
    }},

    {name: 'king of the hill grows the first country', run: async function(sim) {
      at.grown = (await countries(sim))[0]._id;
      at.grownBy = await Mapmaker.addToCountry(sim.gameId, at.grown, true);
    }},

    {name: 'castle spots, with buildings on two and one taken away', run: async function(sim) {
      at.spots = [];
      for (var i = 0; i < 3; i++) {
        var spot = await Mapmaker.findHexForCastle(sim.gameId);
        if (!spot) throw new Error('FAIL: no castle spot ' + i);
        spot.countryId = await Mapmaker.coordsToCountryId(sim.gameId, spot.x, spot.y);
        at.spots.push(spot);
        if (i < 2) {
          await Capitals.insertAsync(_.extend({gameId: sim.gameId, x: spot.x, y: spot.y, countryId: spot.countryId, name: 'Map ' + i,
            created_at: dClock.now()}, dTest.soldierCounts({})));
        }
        await Mapmaker.buildingAdded(sim.gameId, spot.x, spot.y);
      }
      at.nearBeforeRemove = await hexCount(sim, {nearbyBuildings: true});
      await Mapmaker.buildingRemoved(sim.gameId, at.spots[2].x, at.spots[2].y);
      at.outside = await Mapmaker.coordsToCountryId(sim.gameId, 1000, 1000);
    }},

    {name: 'the countries\' masks and the minimap', run: async function(sim) {
      await dTest.eachAsync(await countries(sim), async function(c) {
        await dTest.runJob('createCountryMask', {countryId: c._id});
      });
      await dTest.runJob('generateGameMinimap', {gameId: sim.gameId});
      var border = await Hexes.find({gameId: sim.gameId, isBorder: true}, {sort: {x: 1, y: 1}, limit: 6}).fetchAsync();
      at.water = await dTest.mapAsync(border, async function(h) { return await Shorefinder.waterDirection(h); });
    }},

    {name: 'each country baked to SVG', run: async function(sim) {
      at.bakes = await await dTest.mapAsync(await countries(sim), async function(c) {
        var data = await Mapbaker.bakeCountry(c._id);
        if (!data) throw new Error('FAIL: ' + c._id + ' did not bake');
        var images = [data.imageObject, data.imageObjectWithCoords];
        var svgs = images.map(function(image) {
          var file = Mapbaker.imageSavePath + image.filename + '.svg';
          var svg = fs.readFileSync(file, 'utf8');
          fs.unlinkSync(file);
          // the hex images are named by their full path, which differs between checkouts
          svg = svg.split(Mapbaker.hexImagePath).join('game_images/');
          return {bytes: svg.length, sha1: crypto.createHash('sha1').update(svg).digest('hex')};
        });
        return {images: images.map(function(image) { return _.omit(image, 'created_at'); }), svgs: svgs};
      });
    }}
  ];

  var play = async function() {
    at = {};
    var sim = await dTest.simulation({seed: SEED, startAt: START_AT, dumpDir: resultsDir()});
    try {
      var game = await dTest.helpers.createTestGame({name: 'Map', startAt: dClock.now(), createdAt: dClock.now()});
      sim.gameId = game._id;
      await dTest.eachAsync(SCENARIO, async function(step) {
        await step.run(sim);
        await sim.endStep(step.name, facts);
      });
      return {steps: sim.steps, at: JSON.parse(JSON.stringify(at))};
    } finally {
      await sim.finish();
    }
  };

  Meteor.startup(function() {
    dTest.addSuite('map (server/mapTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;

      if (process.env.DOMINUS_WORKER != 'true') {
        await run('map: needs the worker', function() { return 'skip'; });
        return;
      }

      var played = null;
      var playedError = null;
      var playOnce = async function() {
        if (playedError) throw playedError;
        if (played) return played;
        try {
          played = await play();
          var record = {
            about: 'What the map test (server/mapTests.js) left behind after each step. ' +
              'Recorded from the code before the mapmaker, minimap and mapbaker became async; see that file before recording it again.',
            seed: SEED,
            startAt: START_AT.toISOString(),
            at: played.at,
            steps: played.steps
          };
          fs.writeFileSync(path.join(resultsDir(), 'actual.json'), JSON.stringify(record, null, 1) + '\n');
          return played;
        } catch (e) {
          playedError = e;
          throw e;
        }
      };

      var stepFacts = async function(name) {
        return _.findWhere((await playOnce()).steps, {step: name}).facts;
      };

      await run('map: four countries, each with its own hexes, its borders and its neighbours', async function() {
        var f = await stepFacts('four countries');
        equal(f.countries.length, 4, 'four countries');
        equal(JSON.stringify(_.pluck(f.countries, '_id')), JSON.stringify(_.clone((await playOnce()).at.added).sort()), 'the ones addCountry gave');
        f.countries.forEach(function(c) {
          assert(c.hexes >= _s.mapmaker.minHexesInCountry && c.hexes <= _s.mapmaker.maxHexesInCountry, c._id + ' has ' + c.hexes + ' hexes');
          equal(c.hexDocs, c.hexes, c._id + ': a hex document for each of its hexes');
          assert(c.borders > 0 && c.borders < c.hexes, c._id + ' has borders');
          assert(c.neighbors.length >= 1, c._id + ' has a neighbour');
          c.neighbors.forEach(function(n) {
            assert(_.contains(_.findWhere(f.countries, {_id: n}).neighbors, c._id), c._id + ' and ' + n + ' are each other\'s neighbours');
          });
        });
        equal(f.hexes, _.reduce(_.pluck(f.countries, 'hexes'), function(a, b) { return a + b; }, 0), 'no hex in two countries');
      });

      await run('map: king of the hill adds 200 hexes to the country', async function() {
        var before = _.findWhere((await stepFacts('four countries')).countries, {_id: (await playOnce()).at.grown});
        var after = _.findWhere((await stepFacts('king of the hill grows the first country')).countries, {_id: (await playOnce()).at.grown});
        equal((await playOnce()).at.grownBy, (await playOnce()).at.grown, 'addToCountry gives the country');
        equal(after.hexes, before.hexes + 200, '200 more hexes');
        equal(after.hexDocs, after.hexes, 'and their documents');
      });

      await run('map: castle spots are free grain hexes inside a country, and buildings mark the hexes around them', async function() {
        var a = (await playOnce()).at;
        var f = await stepFacts('castle spots, with buildings on two and one taken away');
        equal(a.spots.length, 3, 'three spots');
        a.spots.forEach(function(s) { assert(s.countryId, s.x + ',' + s.y + ' is in a country'); });
        equal(_.uniq(a.spots.map(function(s) { return s.x + ',' + s.y; })).length, 3, 'all different');
        equal(f.withBuilding, 2, 'the two buildings left have their hexes marked');
        assert(f.nearBuilding > 2 && f.nearBuilding < a.nearBeforeRemove, 'the hexes around the one taken away are no longer near a building (' +
          a.nearBeforeRemove + ' -> ' + f.nearBuilding + ')');
        equal(a.outside, null, 'no country off the map');
      });

      await run('map: each country gets its mask, and the game its map size and minimap', async function() {
        var f = await stepFacts('the countries\' masks and the minimap');
        f.countries.forEach(function(c) {
          assert(c.paths && c.paths.length >= 1 && c.paths[0] >= 6, c._id + ' has a border path');
        });
        assert(_.every((await playOnce()).at.water, function(d) { return d === false || (d >= 0 && d <= 5); }), 'water directions are 0 to 5 or false');
      });

      await run('map: each country bakes to two SVGs, one with the coordinates', async function() {
        await (await playOnce()).at.bakes.forEach(function(b) {
          equal(b.images[0].hasCoords, false, 'one without');
          equal(b.images[1].hasCoords, true, 'one with');
          assert(b.svgs[1].bytes > b.svgs[0].bytes, 'the one with coordinates is bigger');
        });
      });

      await run('map: every step matches the map recorded before (tests/golden/map.json)', async function() {
        var result = await playOnce();
        var goldenFile = repoPath(GOLDEN);
        if (!fs.existsSync(goldenFile)) {
          throw new Error('FAIL: no ' + GOLDEN + ' to compare with (record it from ' + path.join(resultsDir(), 'actual.json') + ')');
        }
        var golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'));
        equal(golden.seed, SEED, 'recorded with the same seed');
        equal(JSON.stringify(golden.at), JSON.stringify(result.at), 'the same spots, water and bakes');
        var changes = dTest.compareSimulation(golden.steps, JSON.parse(JSON.stringify(result.steps)));
        if (changes.length) {
          throw new Error('FAIL: the map came out differently from ' + GOLDEN + '. The documents of each step are in ' + resultsDir() +
            '.\n' + changes.slice(0, 6).join('\n'));
        }
      });
    });
  });
}
