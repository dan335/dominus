// Job tests: map baking, country masks and the minimap (Oct 2026).
//
// Same approach as server/armyJobTests.js: each queue job's handler is run
// directly (dTest.runJob) in a real started game, and the jobs it adds are
// recorded rather than run (dTest.recordJobs). The tests describe what the
// jobs do today.
//
// bakeCountry runs with Mapbaker.createJpgImage replaced (it needs a headless
// browser) and Mapbaker.uploadToS3 replaced, so nothing reaches S3 even if
// the settings say to serve bakes from it.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('jobs: map and minimap (server/mapJobTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var runJob = dTest.runJob;

      if (process.env.DOMINUS_WORKER != 'true') {
        run('map jobs: need the worker', function() { return 'skip'; });
        return;
      }

      var w = dTest.buildGameWorld({players: 2});
      var test = dTest.contractTest(run);

      function country() {
        return Countries.findOne({gameId: w.gameId});
      }

      try {

        test('bakeCountries: queues a bakeCountry for each of the game\'s countries and reports progress', function() {
          var countries = Countries.find({gameId: w.gameId}).fetch();
          assert(countries.length >= 1, 'the world has countries');
          var job;
          var jobs = dTest.recordJobs(function() {
            runJob('bakeCountries', {gameId: w.gameId}, {job: function(j) { job = j; }});
          });
          var bakes = dTest.jobsNamed(jobs, 'bakeCountry');
          equal(JSON.stringify(_.pluck(bakes, 'uniqueId').sort()), JSON.stringify(_.pluck(countries, '_id').sort()), 'one per country, unique by country');
          equal(_.last(job.progressed), 100, 'progress ends at 100');
          equal(job.progressed.length, countries.length, 'progress after each country');

          jobs = dTest.recordJobs(function() { runJob('bakeCountries', {}); });
          equal(jobs.length, 0, 'no gameId: nothing queued');
        });

        test('bakeCountry: writes the country\'s two SVGs, makes JPGs of them and queues finishImage for each, without S3', function() {
          var c = country();
          var made = [];
          var uploads = [];
          var baked = null;
          var createJpg = Mapbaker.createJpgImage;
          var upload = Mapbaker.uploadToS3;
          var bake = Mapbaker.bakeCountry;
          Mapbaker.createJpgImage = function(inFile, outFile) { made.push({inFile: inFile, outFile: outFile}); return outFile; };
          Mapbaker.uploadToS3 = function(file) { uploads.push(file); return 'https://example.invalid/' + file; };
          Mapbaker.bakeCountry = function(countryId) { baked = bake.apply(this, arguments); return baked; };
          var jobs;
          try {
            jobs = dTest.recordJobs(function() {
              runJob('bakeCountry', {countryId: c._id});
            });
          } finally {
            Mapbaker.createJpgImage = createJpg;
            Mapbaker.uploadToS3 = upload;
            Mapbaker.bakeCountry = bake;
          }

          assert(baked, 'bakeCountry returned the images');
          var files = [baked.imageObject, baked.imageObjectWithCoords].map(function(image) {
            return Mapbaker.imageSavePath + image.filename;
          });
          files.forEach(function(file) {
            assert(Mapbaker.fs.existsSync(file + '.svg'), file + '.svg written');
            assert(Mapbaker.fs.readFileSync(file + '.svg', 'utf8').indexOf('<svg') == 0, 'an SVG');
          });
          equal(JSON.stringify(_.pluck(made, 'outFile')), JSON.stringify(files.map(function(f) { return f + '.jpg'; })), 'a JPG of each');
          equal(baked.imageObject.hasCoords, false, 'one without coordinates');
          equal(baked.imageObjectWithCoords.hasCoords, true, 'one with');
          equal(baked.imageObject.countryId, c._id, 'for the country');
          equal(uploads.length, Meteor.settings.public.s3.serveBakesFromS3 ? 2 : 0, 'uploaded only when bakes are served from S3');
          var finish = dTest.jobsNamed(jobs, 'finishImage');
          equal(finish.length, 2, 'two finishImage jobs');
          equal(JSON.stringify(_.pluck(_.pluck(finish, 'data'), 'imageObject').map(function(i) { return i.filename; })),
            JSON.stringify([baked.imageObject.filename, baked.imageObjectWithCoords.filename]), 'one per image');

          // a country that doesn't exist bakes nothing
          jobs = dTest.recordJobs(function() { runJob('bakeCountry', {countryId: 'noSuchCountry'}); });
          equal(jobs.length, 0, 'missing country: nothing queued');
        });

        test('finishImage: saves the image on its country, with or without coordinates', function() {
          var c = country();
          var image = {filename: 'f1', posX: 1, posY: 2, width: 30, height: 40, created_at: new Date(), hasCoords: false,
            gameId: w.gameId, countryId: c._id};
          runJob('finishImage', {imageObject: image});
          runJob('finishImage', {imageObject: _.extend({}, image, {filename: 'f2', hasCoords: true})});
          var after = Countries.findOne(c._id);
          equal(after.image.filename, 'f1', 'image');
          equal(after.image.width, 30, 'image width');
          equal(after.imageWithCoords.filename, 'f2', 'imageWithCoords');
          equal(after.image.countryId, undefined, 'only the image fields are kept');
        });

        test('createCountryMask: traces the country\'s border into paths and queues the game\'s minimap', function() {
          var c = country();
          Countries.update(c._id, {$unset: {paths: ''}});
          var jobs = dTest.recordJobs(function() {
            runJob('createCountryMask', {countryId: c._id});
          });
          var paths = Countries.findOne(c._id).paths;
          assert(paths && paths.length >= 1, 'at least one path');
          assert(_.every(paths, function(path) { return path.length >= 6 && _.has(path[0], 'x') && _.has(path[0], 'y'); }), 'each a ring of points');
          for (var i = 1; i < paths.length; i++) {
            assert(paths[i].length <= paths[0].length, 'the outer border first');
          }
          var minimap = dTest.jobsNamed(jobs, 'generateGameMinimap');
          equal(minimap.length, 1, 'generateGameMinimap queued');
          equal(minimap[0].uniqueId, w.gameId, 'once per game');
        });

        test('generateAllMinimaps and generateGameMinimap: each running game gets its map size and a minimap of its countries', function() {
          var jobs = dTest.recordJobs(function() { runJob('generateAllMinimaps', {}); });
          assert(_.contains(_.pluck(dTest.jobsNamed(jobs, 'generateGameMinimap'), 'uniqueId'), w.gameId), 'queued for the world');

          var c = country();
          if (!c.paths) runJob('createCountryMask', {countryId: c._id});
          Games.update(w.gameId, {$unset: {minimap: '', map_size: ''}});
          runJob('generateGameMinimap', {gameId: w.gameId});
          var game = Games.findOne(w.gameId);
          var border = Hexes.find({gameId: w.gameId, isBorder: true}, {fields: {x: 1}}).fetch();
          equal(game.map_size.minX, _.min(_.pluck(border, 'x')), 'map_size.minX from the border hexes');
          equal(game.map_size.maxX, _.max(_.pluck(border, 'x')), 'map_size.maxX');
          equal(game.minimap.length, Countries.find({gameId: w.gameId}).count(), 'one entry per country');
          assert(game.minimap[0].country.length >= 1 && /^( -?[0-9.]+,-?[0-9.]+)+$/.test(game.minimap[0].country[0].points),
            'SVG points (' + (game.minimap[0].country[0] && game.minimap[0].country[0].points.slice(0, 40)) + ')');

          // a missing game fails the job, so Bull retries it
          assert(dTest.throws(function() { return runJob('generateGameMinimap', {gameId: 'noSuchGame'}); }), 'a missing game fails the job');
        });

      } finally {
        w.cleanup();
      }
    });
  });
}
