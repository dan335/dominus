// Job tests: map baking, country masks and the minimap (Oct 2026).
//
// Same approach as server/armyJobTests.js: each queue job's handler is run
// directly (dTest.runJob) in a real started game, and the jobs it adds are
// recorded rather than run (dTest.recordJobs). The tests describe what the
// jobs do today.
//
// bakeCountry runs with Mapbaker.createJpgImage replaced (it needs a headless
// browser) and Mapbaker.uploadToS3 replaced, so nothing reaches S3 even if
// the settings say to serve bakes from it. The tests of those helpers replace
// S3 (Mapbaker.knox), svgexport and fetch (Mapbaker.fetch).
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  var fs = Npm.require('fs');
  var os = Npm.require('os');
  var path = Npm.require('path');

  Meteor.startup(function() {
    dTest.addSuite('jobs: map and minimap (server/mapJobTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var runJob = dTest.runJob;

      // --- the mapbaker's S3, JPG and image check helpers, with S3, the
      // headless browser and the network replaced ---

      var replaced = [];
      var replace = function(obj, key, value) {
        var original = obj[key];
        obj[key] = value;
        replaced.push(function() { obj[key] = original; });
      };
      var putBack = function() {
        while (replaced.length) replaced.pop()();
      };
      var quietErrors = function() {
        var errors = [];
        replace(console, 'error', function() { errors.push(_.map(arguments, function(a) { return a instanceof Error ? a.message : String(a); }).join(' ')); });
        return errors;
      };
      var answer = function(status) {
        return Promise.resolve({status: status, arrayBuffer: function() { return Promise.resolve(new ArrayBuffer(0)); }});
      };
      var tempFile = function(content) {
        var file = path.join(os.tmpdir(), 'dominus-map-test-' + Random.id(6) + '.jpg');
        fs.writeFileSync(file, content);
        return file;
      };

      await run('imageExists: true for a 200, false for a 404 or a network error, and true without asking in development', async function() {
        var urls = [];
        try {
          var errors = quietErrors();
          replace(process.env, 'NODE_ENV', 'production');
          replace(Mapbaker, 'fetch', function(url) {
            urls.push(url);
            if (/gone/.test(url)) return answer(404);
            if (/down/.test(url)) return Promise.reject(new Error('connect ECONNREFUSED'));
            return answer(200);
          });
          equal(await Mapbaker.imageExists('https://bakes.example.invalid/a.jpg'), true, '200');
          equal(await Mapbaker.imageExists('https://bakes.example.invalid/gone.jpg'), false, '404');
          equal(await Mapbaker.imageExists('https://down.example.invalid/a.jpg'), false, 'network error');
          equal(errors.length, 2, 'the two failures logged');
          assert(/404/.test(errors[0]), 'with the status: ' + errors[0]);
          process.env.NODE_ENV = 'development';
          equal(await Mapbaker.imageExists('https://bakes.example.invalid/dev.jpg'), true, 'development');
          equal(urls.length, 3, 'development asks nothing');
          assert(await dTest.throws(function() { return Mapbaker.imageExists(5); }), 'a url that is not a string is refused');
        } finally {
          putBack();
        }
      });

      await run('uploadToS3: puts the file with its size and a year\'s caching, then checks it is there', async function() {
        var file = tempFile('jpeg bytes');
        var puts = [];
        var image = {gameId: 'mapGame', filename: 'mapCountry'};
        var url = Meteor.settings.public.s3.url + Meteor.settings.public.s3.bakePath + 'mapGame/mapCountry.jpg';
        var putResult = {statusCode: 200};
        var exists = true;
        try {
          var errors = quietErrors();
          replace(Mapbaker, 'knox', {putFile: function(from, to, headers, callback) {
            puts.push({from: from, to: to, headers: headers});
            setTimeout(function() { putResult.error ? callback(putResult.error) : callback(null, putResult); }, 5);
          }});
          replace(Mapbaker, 'imageExists', async function(u) { return u == url && exists; });

          equal(await Mapbaker.uploadToS3(file, image), url, 'the image\'s url');
          equal(puts[0].from, file, 'the file');
          equal(puts[0].to, Meteor.settings.public.s3.bakePath + 'mapGame/mapCountry.jpg', 'under the game\'s bakes');
          equal(puts[0].headers['Content-Length'], 10, 'its size');
          equal(puts[0].headers['Content-Type'], 'image/jpg', 'a jpg');
          equal(puts[0].headers['Cache-Control'], 'max-age=31557600', 'cached for a year');

          exists = false;
          equal(await Mapbaker.uploadToS3(file, image), false, 'not there after the put');
          exists = true;
          putResult = {statusCode: 403};
          equal(await Mapbaker.uploadToS3(file, image), false, 'a 403');
          putResult = {error: new Error('socket hang up')};
          equal(await Mapbaker.uploadToS3(file, image), false, 'a put that fails');
          var before = puts.length;
          equal(await Mapbaker.uploadToS3(file + '.missing', image), false, 'a missing file');
          equal(await Mapbaker.uploadToS3(os.tmpdir(), image), false, 'a folder');
          equal(puts.length, before, 'neither is put');
          equal(errors.length, 5, 'each failure logged');
        } finally {
          putBack();
          fs.unlinkSync(file);
        }
      });

      await run('createJpgImage: the JPG when svgexport makes it, false when it fails or makes nothing', async function() {
        var out = tempFile('');
        fs.unlinkSync(out);
        var renders = [];
        try {
          var errors = quietErrors();
          replace(Mapbaker, 'svgexport', {render: function(list, callback) {
            renders.push(list);
            var output = list[0].output;
            setTimeout(function() {
              if (/fail/.test(list[0].input)) return callback(new Error('phantomjs died'));
              if (!/nothing/.test(list[0].input)) fs.writeFileSync(output.split(' ')[0], 'jpg');
              callback(null);
            }, 5);
          }});
          equal(await Mapbaker.createJpgImage('in.svg', out, 'jpg', '90%'), out, 'the JPG');
          equal(renders[0][0].output, out + ' jpg 90%', 'with its type and quality');
          equal((fs.statSync(out).mode & 0o777).toString(8), '755', 'readable by all');
          fs.unlinkSync(out);
          equal(await Mapbaker.createJpgImage('fail.svg', out, 'jpg', '90%'), false, 'svgexport fails');
          equal(await Mapbaker.createJpgImage('nothing.svg', out, 'jpg', '90%'), false, 'no file made');
          equal(errors.length, 2, 'the failure logged');
        } finally {
          putBack();
          if (fs.existsSync(out)) fs.unlinkSync(out);
        }
      });

      await run('deleteS3BakesForGame: deletes every file under the game\'s bakes, and gives false when S3 fails', async function() {
        var listed = [];
        var deleted = [];
        var fail = {};
        try {
          var errors = quietErrors();
          replace(Mapbaker, 'knox', {
            list: function(opts, callback) {
              listed.push(opts.prefix);
              setTimeout(function() {
                fail.list ? callback(new Error('list failed')) : callback(null, {Contents: [{Key: opts.prefix + 'a.jpg'}, {Key: opts.prefix + 'b.jpg'}]});
              }, 5);
            },
            deleteMultiple: function(keys, callback) {
              deleted.push(keys);
              setTimeout(function() { fail.delete ? callback(new Error('delete failed')) : callback(null, {statusCode: 200}); }, 5);
            }
          });
          equal(await Mapbaker.deleteS3BakesForGame('mapGame'), true, 'deleted');
          equal(listed[0], 'bakes/mapGame/', 'the game\'s bakes');
          equal(JSON.stringify(deleted[0]), JSON.stringify(['bakes/mapGame/a.jpg', 'bakes/mapGame/b.jpg']), 'each file');
          fail.delete = true;
          equal(await Mapbaker.deleteS3BakesForGame('mapGame'), false, 'the delete fails');
          fail.list = true;
          equal(await Mapbaker.deleteS3BakesForGame('mapGame'), false, 'the list fails');
          equal(deleted.length, 2, 'nothing deleted when the list fails');
          equal(errors.length, 2, 'each failure logged');
          assert(await dTest.throws(function() { return Mapbaker.deleteS3BakesForGame(5); }), 'a game id that is not a string is refused');
        } finally {
          putBack();
        }
      });

      if (process.env.DOMINUS_WORKER != 'true') {
        await run('map jobs: need the worker', function() { return 'skip'; });
        return;
      }

      var w = await dTest.buildGameWorld({players: 2});
      var test = dTest.contractTest(run);

      async function country() {
        return await Countries.findOneAsync({gameId: w.gameId});
      }

      try {

        await test('bakeCountries: queues a bakeCountry for each of the game\'s countries and reports progress', async function() {
          var countries = await Countries.find({gameId: w.gameId}).fetchAsync();
          assert(countries.length >= 1, 'the world has countries');
          var job;
          var jobs = await dTest.recordJobs(async function() {
            await runJob('bakeCountries', {gameId: w.gameId}, {job: function(j) { job = j; }});
          });
          var bakes = dTest.jobsNamed(jobs, 'bakeCountry');
          equal(JSON.stringify(_.pluck(bakes, 'uniqueId').sort()), JSON.stringify(_.pluck(countries, '_id').sort()), 'one per country, unique by country');
          equal(_.last(job.progressed), 100, 'progress ends at 100');
          equal(job.progressed.length, countries.length, 'progress after each country');

          jobs = await dTest.recordJobs(async function() { await runJob('bakeCountries', {}); });
          equal(jobs.length, 0, 'no gameId: nothing queued');
        });

        await test('bakeCountry: writes the country\'s two SVGs, makes JPGs of them and queues finishImage for each, without S3', async function() {
          var c = await country();
          var made = [];
          var uploads = [];
          var baked = null;
          var createJpg = Mapbaker.createJpgImage;
          var upload = Mapbaker.uploadToS3;
          var bake = Mapbaker.bakeCountry;
          Mapbaker.createJpgImage = function(inFile, outFile) { made.push({inFile: inFile, outFile: outFile}); return outFile; };
          Mapbaker.uploadToS3 = function(file) { uploads.push(file); return 'https://example.invalid/' + file; };
          Mapbaker.bakeCountry = async function(countryId) { baked = await bake.apply(this, arguments); return baked; };
          var jobs;
          try {
            jobs = await dTest.recordJobs(async function() {
              await runJob('bakeCountry', {countryId: c._id});
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
          jobs = await dTest.recordJobs(async function() { await runJob('bakeCountry', {countryId: 'noSuchCountry'}); });
          equal(jobs.length, 0, 'missing country: nothing queued');
        });

        await test('finishImage: saves the image on its country, with or without coordinates', async function() {
          var c = await country();
          var image = {filename: 'f1', posX: 1, posY: 2, width: 30, height: 40, created_at: new Date(), hasCoords: false,
            gameId: w.gameId, countryId: c._id};
          await runJob('finishImage', {imageObject: image});
          await runJob('finishImage', {imageObject: _.extend({}, image, {filename: 'f2', hasCoords: true})});
          var after = await Countries.findOneAsync(c._id);
          equal(after.image.filename, 'f1', 'image');
          equal(after.image.width, 30, 'image width');
          equal(after.imageWithCoords.filename, 'f2', 'imageWithCoords');
          equal(after.image.countryId, undefined, 'only the image fields are kept');
        });

        await test('createCountryMask: traces the country\'s border into paths and queues the game\'s minimap', async function() {
          var c = await country();
          await Countries.updateAsync(c._id, {$unset: {paths: ''}});
          var jobs = await dTest.recordJobs(async function() {
            await runJob('createCountryMask', {countryId: c._id});
          });
          var paths = (await Countries.findOneAsync(c._id)).paths;
          assert(paths && paths.length >= 1, 'at least one path');
          assert(_.every(paths, function(path) { return path.length >= 6 && _.has(path[0], 'x') && _.has(path[0], 'y'); }), 'each a ring of points');
          for (var i = 1; i < paths.length; i++) {
            assert(paths[i].length <= paths[0].length, 'the outer border first');
          }
          var minimap = dTest.jobsNamed(jobs, 'generateGameMinimap');
          equal(minimap.length, 1, 'generateGameMinimap queued');
          equal(minimap[0].uniqueId, w.gameId, 'once per game');
        });

        await test('generateAllMinimaps and generateGameMinimap: each running game gets its map size and a minimap of its countries', async function() {
          var jobs = await dTest.recordJobs(async function() { await runJob('generateAllMinimaps', {}); });
          assert(_.contains(_.pluck(dTest.jobsNamed(jobs, 'generateGameMinimap'), 'uniqueId'), w.gameId), 'queued for the world');

          var c = await country();
          if (!c.paths) await runJob('createCountryMask', {countryId: c._id});
          await Games.updateAsync(w.gameId, {$unset: {minimap: '', map_size: ''}});
          await runJob('generateGameMinimap', {gameId: w.gameId});
          var game = await Games.findOneAsync(w.gameId);
          var border = await Hexes.find({gameId: w.gameId, isBorder: true}, {fields: {x: 1}}).fetchAsync();
          equal(game.map_size.minX, _.min(_.pluck(border, 'x')), 'map_size.minX from the border hexes');
          equal(game.map_size.maxX, _.max(_.pluck(border, 'x')), 'map_size.maxX');
          equal(game.minimap.length, await Countries.find({gameId: w.gameId}).countAsync(), 'one entry per country');
          assert(game.minimap[0].country.length >= 1 && /^( -?[0-9.]+,-?[0-9.]+)+$/.test(game.minimap[0].country[0].points),
            'SVG points (' + (game.minimap[0].country[0] && game.minimap[0].country[0].points.slice(0, 40)) + ')');

          // a missing game fails the job, so Bull retries it
          assert(await dTest.throws(function() { return runJob('generateGameMinimap', {gameId: 'noSuchGame'}); }), 'a missing game fails the job');
        });

      } finally {
        await w.cleanup();
      }
    });
  });
}
