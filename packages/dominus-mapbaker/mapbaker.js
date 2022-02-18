// temp files written to /opt/#/programs/server/hexes/ on server

Future = Npm.require('fibers/future');


Mapbaker = {
  fs: Npm.require('fs'),
  imageSavePath: 'hexes/',
  hexImagePath: process.cwd() + '/../web.browser/app/game_images/',
  svgexport: require('svgexport'),
  knox: Knox.createClient({
    key: process.env.S3ACCESSKEYID,
    secret: process.env.S3SECRETACCESSKEY,
    bucket: Meteor.settings.public.s3.bucket,
    region: Meteor.settings.public.s3.region
  }),
  hexWidth: _s.mapmaker.hexSize,
  hexHeight: _s.mapmaker.hexSize * (Math.sqrt(3) / 2 * _s.mapmaker.hexSquish),
};

// not used but remember
// Mapbaker.meteorPublicPath = process.cwd() + '/../web.browser/app/hexBakes/';

if (process.env.NODE_ENV == 'development') {
  Mapbaker.imageSavePath = process.cwd() + '/../../../../../public/hexBakes/';
  Mapbaker.hexImagePath = process.cwd() + '/../../../../../public/game_images/'
}

// create save directory
Meteor.startup(function() {
  Mapbaker.resetLocalSavePath();
});

// old?
// Meteor.startup(function() {
//   // half
//   Mapbaker.hexWidth = _s.mapmaker.hexSize;
//   Mapbaker.hexHeight = _s.mapmaker.hexSize * (Math.sqrt(3) / 2 * _s.mapmaker.hexSquish);
// })



Mapbaker.deleteS3BakesForGame = function(gameId) {
  check(gameId, String);

  var self = this;

  // don't return until done
  var fut = new Future();

  // delete all files on s3
  let previx = 'bakes/'+gameId+'/'
  Mapbaker.knox.list({ prefix:previx }, function(error, data) {
    if (error) {
      console.error(error);
      fut['return'](false);

    } else {
      var list = [];

      for (var i=0; i<data.Contents.length; i++) {
        var name = data.Contents[i].Key;
        if (name != self.s3prefix) {
          list.push(name);
        }
      }

      Mapbaker.knox.deleteMultiple(list, function(error, result) {
        if (error) {
          console.error(error);
          fut['return'](false);
        } else {
          fut['return'](true);
        }
      });
    }
  });

  return fut.wait();
};



Mapbaker.findTopAndBottomHexesInImage = function(country) {
  var topHex = null;
  var bottomHex = null;
  var topPos = 9999999;
  var bottomPos = -9999999;

  _.each(country.hexes, function(h) {
    var p = Hx.coordinatesToPos(h.x, h.y, _s.mapmaker.hexSize, _s.mapmaker.hexSquish);

    if (p.y < topPos) {
      topHex = h;
      topPos = p.y
    }

    if (p.y > bottomPos) {
      bottomHex = h;
      bottomPos = p.y
    }
  })

  if (!topHex || !bottomHex) {
    console.error('no tophex found');
    return false;
  }

  return {topHex:topHex, bottomHex:bottomHex, topPos:topPos, bottomPos:bottomPos};
}


Mapbaker.findTopLeftHexInImage = function(country, extents) {
  var numHexesFromLeft = extents.topHex.x - country.minX;
  var yAtLeft = extents.topHex.y + numHexesFromLeft;
  var numUp = Math.ceil((yAtLeft - extents.topHex.y) / 2);

  var topLeftY = Math.floor(yAtLeft - numUp);
  var topLeftCoord = {x:country.minX, y:topLeftY};

  return topLeftCoord;
}







if (process.env.DOMINUS_WORKER == 'true') {
  Queues.bakeCountries.process(Meteor.bindEnvironment(function(job) {
    if (job.data.gameId) {
      const query = Countries.find({gameId:job.data.gameId}, {fields:{_id:1}});
      const numCountries = query.count();
      let numBaked = 0;
      query.forEach(function(country) {
        Queues.add('bakeCountry', {countryId:country._id}, {backoff:{type:'fixed', delay:30000}, attempts:10, delay:0, timeout:1000*60*5}, country._id);
        numBaked++;
        job.progress(100 / numCountries * numBaked);
      })
    }
    return Promise.resolve();
  }));
}


// if (process.env.DOMINUS_WORKER == 'true') {
//   Queues.bakeCountry.process(5, function(job, done) {
//     console.log('start')
//     //let bakeCountrySync = Meteor.wrapAsync(Mapbaker.bakeCountry);
//     //console.log('asdf')
//     //let result = bakeCountrySync(job.data.countryId);
//     //console.log('result');
//     done(Error('with with error like bull site'));
//   });
// }

if (process.env.DOMINUS_WORKER == 'true') {
  Queues.bakeCountry.process(Meteor.bindEnvironment(function(job) {
    // can't get returning an error to work
    // because of meteor.bindEnvironment and promises i think
    // so just return true for now
    // maybe try bee-queue instead

    //job.progress(1);

    const data = Mapbaker.bakeCountry(job.data.countryId);
    //job.progress(12);

    if (!data) {
      //return Promise.reject(new Error('No data return from bakeCountry.'));
      console.error(job.data.countryId, 'failed to bake');
      //return Promise.resolve();
    }

    const file = Mapbaker.imageSavePath + data.imageObject.filename;
    //job.progress(24);

    const fileWithCoords = Mapbaker.imageSavePath + data.imageObjectWithCoords.filename;
    //job.progress(36);

    if (!Mapbaker.fs.existsSync(file+'.svg') || !Mapbaker.fs.existsSync(fileWithCoords+'.svg')) {
      //return Promise.reject(new Error('svg file not created in bakeCountry.'));
      console.error(job.data.countryId, 'failed to bake');
      //return Promise.resolve();
    }

    Mapbaker.fs.chmodSync(file+'.svg', 0755);
    Mapbaker.fs.chmodSync(fileWithCoords+'.svg', 0755);

    const jpgFile = Mapbaker.createJpgImage(file+'.svg', file+'.jpg', 'jpg', '90%');
    //job.progress(48);

    const jpgFileWithCoords = Mapbaker.createJpgImage(fileWithCoords+'.svg', fileWithCoords+'.jpg', 'jpg', '90%');
    //job.progress(60);

    if (!jpgFile || !jpgFileWithCoords) {
      //return Promise.reject(new Error('Error creating jpg image.'));
      console.error(job.data.countryId, 'failed to bake');
      //return Promise.resolve();
    }

    if (Meteor.settings.public.s3.serveBakesFromS3) {
      if (process.env.DOMINUS_TEST == 'false') {
        let imageUrl = Mapbaker.uploadToS3(jpgFile, data.imageObject);
        //job.progress(72);

        let imageUrlWithCoords = Mapbaker.uploadToS3(jpgFileWithCoords, data.imageObjectWithCoords);
        //job.progress(84);

        if (!imageUrl || !imageUrlWithCoords) {
          //return Promise.reject(new Error('Error uploading to s3.'));
          console.error(job.data.countryId, 'failed to bake');
          //return Promise.resolve();
        }
      }
    }

    Queues.add('finishImage', {imageObject: data.imageObject}, {delay:0, timeout:1000*60*5}, false);
    Queues.add('finishImage', {imageObject: data.imageObjectWithCoords}, {delay:0, timeout:1000*60*5}, false);
    //job.progress(100);

    return Promise.resolve();
  }));
}


// also write svg to disk
Mapbaker.bakeCountry = function(countryId) {
  var self = this;

  var country = Countries.findOne(countryId);

  if (!country) {
    console.error('no country found in bakeCountry', countryId);
    return false;
  }

  var extents = Mapbaker.findTopAndBottomHexesInImage(country);
  var topLeftCoord = Mapbaker.findTopLeftHexInImage(country, extents);

  // how many hexes are in the image
  // used to find size of image
  var numHexesWideInImage = country.maxX - country.minX + 1;
  var numHexesHighInImage = extents.bottomHex.y - extents.topHex.y + 1;

  // find size of image
  var svgWidth = Math.ceil(Hx.coordinatesToPos(numHexesWideInImage, 0, _s.mapmaker.hexSize, _s.mapmaker.hexSquish).x + _s.mapmaker.hexSize / 2);
  var p = Hx.coordinatesToPos(topLeftCoord.x, topLeftCoord.y, _s.mapmaker.hexSize, _s.mapmaker.hexSquish);
  var svgHeight = Math.ceil(extents.bottomPos - p.y + self.hexHeight * 2);

  // create svg
  var svgBefore = '<svg width="'+svgWidth+'" height="'+svgHeight+'" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink= "http://www.w3.org/1999/xlink">';

  // background
  svgBefore += '<rect width="'+svgWidth+'" height="'+svgHeight+'" fill="#444" />';
  svgBefore += '<g transform="translate('+self.hexWidth+','+self.hexHeight+')">';

  var filename = country._id;
  var filenameWithCoords = filename+'_withcoords';

  // save to file
  // creating a really long string failed for some reason
  self.fs.writeFileSync(self.imageSavePath+filename+'.svg', svgBefore);
  self.fs.writeFileSync(self.imageSavePath+filenameWithCoords+'.svg', svgBefore);

  // svg for each hex
  //var hexes = Hexes.find({gameId:country.gameId, x: {$gte:country.minX, $lte:country.maxX}, y: {$gte:country.minY, $lte:country.maxY}});
  var hexes = Hexes.find({countryId:countryId});
  var svgData = '';
  var svgDataWithCoords = '';
  hexes.forEach(function(hex) {
    svgData += self.createSvg(hex, topLeftCoord.x, topLeftCoord.y, false);
    svgDataWithCoords += self.createSvg(hex, topLeftCoord.x, topLeftCoord.y, true);
  });
  self.fs.appendFileSync(self.imageSavePath+filename+'.svg', svgData);
  self.fs.appendFileSync(self.imageSavePath+filenameWithCoords+'.svg', svgDataWithCoords);

  // close <svg>
  self.fs.appendFileSync(self.imageSavePath+filename+'.svg', '</g></svg>');
  self.fs.appendFileSync(self.imageSavePath+filenameWithCoords+'.svg', '</g></svg>');
  self.fs.chmodSync(self.imageSavePath+filename+'.svg', 0755);
  self.fs.chmodSync(self.imageSavePath+filenameWithCoords+'.svg', 0755);

  var pos = Hx.coordinatesToPos(topLeftCoord.x, topLeftCoord.y, _s.mapmaker.hexSize, _s.mapmaker.hexSquish);
  var imageObject = {
    gameId:country.gameId,
    countryId: country._id,
    minX: country.minX,
    minY: country.minY,
    maxX: country.maxX,
    maxY: country.maxY,
    filename: filename,
    posX: Math.round(pos.x + self.hexWidth * -1),
    posY: Math.round(pos.y + self.hexHeight * -1),
    width: svgWidth,
    height: svgHeight,
    created_at: new Date(),
    hasCoords: false
  };

  var imageObjectWithCoords = EJSON.clone(imageObject);
  imageObjectWithCoords.filename = filenameWithCoords;
  imageObjectWithCoords.hasCoords = true;

  var data = {
    imageObject:imageObject,
    imageObjectWithCoords:imageObjectWithCoords
  };

  return data;
}

Mapbaker.createSvg = function(hex, x, y, withCoords) {
  var svgString = '';

  var pos = Hx.coordinatesToPos(hex.x-x, hex.y-y, _s.mapmaker.hexSize, _s.mapmaker.hexSquish);
  var points = Hx.getHexPolygonVerts(pos.x, pos.y, _s.mapmaker.hexSize, _s.mapmaker.hexSquish, false);

  // image
  var imageName = '';
  if (hex.large) {
    imageName = 'hex_'+hex.type+'_large_'+hex.tileImage+'.png';
  } else {
    imageName = 'hex_'+hex.type+'_'+hex.tileImage+'.png';
  }
  //imageName = Meteor.absoluteUrl()+'game_images/'+imageName;
  imageName = Mapbaker.hexImagePath + imageName;

  var imageX = pos.x - 63;
  var imageY = pos.y - 41;
  svgString += '<image x="'+imageX+'" y="'+imageY+'" width="126" height="83" xlink:href="'+imageName+'" />';

  // outline
  svgString += '<polygon stroke="#3c6048" stroke-linejoin="round" stroke-opacity="0.15" stroke-width="2" fill-opacity="0" points="'+points+'"></polygon>';

  if (withCoords) {
    var textX = pos.x - 9;
    var textY = pos.y + 34;
    svgString += '<text x="'+textX+'" y="'+textY+'" fill="#000" fill-opacity="0.75" style="font-size:9px;">'+hex.x+','+hex.y+'</text>';
  }

  return svgString;
};




//
// if (process.env.DOMINUS_WORKER == 'true') {
//   Queues.createJpgImage.process(Meteor.bindEnvironment(function(job) {
//
//     const jpgFile = Mapbaker.createJpgImage(job.data.inFile, job.data.outFile, job.data.outFileType, job.data.quality);
//
//     if (jpgFile) {
//       Queues.add('uploadToS3', {jpgFile: jpgFile, imageObject: job.data.imageObject}, {delay:0, timeout:1000*60*5}, false);
//       return Promise.resolve();
//     } else {
//       return Promise.reject(new Error('Error creating jpg image.'));
//     }
//
//   }));
// }



Mapbaker.createJpgImage = function(inFile, outFile, outFileType, quality) {
  var self = this;
  var fut = new Future();
  Mapbaker.svgexport.render([{
    'input': inFile,
    'output': outFile+' '+outFileType+' '+quality
  }], function(error, result) {
    if (error) {
      console.error('error creating jpg image');
      console.error(error);
      fut['return'](false);
    } else {
      if (Mapbaker.fs.existsSync(outFile)) {
        Mapbaker.fs.chmod(outFile, 0755, () => {
          fut['return'](outFile);
        });
      } else {
        fut['return'](false);
      }
    }
  });
  return fut.wait();
};





//
// if (process.env.DOMINUS_WORKER == 'true') {
//   Queues.uploadToS3.process(4, Meteor.bindEnvironment(function(job) {
//
//     if (Meteor.settings.public.s3.serveBakesFromS3) {
//       if (process.env.DOMINUS_TEST == 'false') {
//         let imageUrl = Mapbaker.uploadToS3(job.data.jpgFile, job.data.imageObject);
//         if (!imageUrl) {
//           return Promise.reject(new Error('Error uploading to s3.'));
//         }
//       }
//     }
//
//     Queues.add('finishImage', {imageObject: job.data.imageObject}, {delay:0, timeout:1000*60*5}, false);
//
//     return Promise.resolve();
//   }));
// }


Mapbaker.uploadToS3 = function(file, imageObject) {
    var self = this;
    var fut = new Future();

    var destination = Meteor.settings.public.s3.bakePath + imageObject.gameId + '/' + imageObject.filename + '.jpg';
    var imageUrl = Meteor.settings.public.s3.url + destination;

    Mapbaker.fs.stat(file, Meteor.bindEnvironment(function(error, stat) {
      if (error) {
        console.error(error);
        fut['return'](false);
      } else {

        if (!stat.isFile()) {
          console.error('stat is not a file');
          fut['return'](false);
        } else {
          let expireDate = moment().add(1, 'years').toDate().toUTCString();

          Mapbaker.knox.putFile(file, destination, {
            'Content-Length': stat.size,
            'Content-Type': 'image/jpg',
            'Expires': expireDate,
            'Cache-Control': 'max-age=31557600'
          }, Meteor.bindEnvironment(function(error, res) {
            if (error) {
              console.error(error);
              fut['return'](false);

            } else {

              if (res.statusCode == 200 && Mapbaker.imageExists(imageUrl)) {
                fut['return'](imageUrl);
              } else {
                var err = 'Check of '+imageUrl+' failed, retrying. Status code: '+res.statusCode;
                console.error(err);
                fut['return'](false);
              }
            }
          }));

        }
      }
    }));

    return fut.wait();
};





if (process.env.DOMINUS_WORKER == 'true') {
  Queues.finishImage.process(4, Meteor.bindEnvironment(function(job) {

    var data = {
      filename: job.data.imageObject.filename,
      posX: job.data.imageObject.posX,
      posY: job.data.imageObject.posY,
      width: job.data.imageObject.width,
      height: job.data.imageObject.height,
      created_at: job.data.imageObject.created_at,
      hasCoords: job.data.imageObject.hasCoords,
      gameId: job.data.imageObject.gameId    // might not be needed because it's inside country
    }

    if (job.data.imageObject.hasCoords) {
      var set = {imageWithCoords:data};
    } else {
      var set = {image:data};
    }

    Countries.update(job.data.imageObject.countryId, {$set:set});

    return Promise.resolve();
  }));
}



// Mapbaker.deleteVolumeFiles = function() {
//   if (Meteor.isServer && process.env.NODE_ENV != 'development') {
//     var self = this;
//     var dir = '/hexBakes/hexBakes';
//     if (self.fs.existsSync(dir)) {
//       // delete all files in temp directory
//       self.fs.readdirSync(dir).forEach(function(file, index) {
//         var curPath = dir + '/' + file;
//         self.fs.unlinkSync(curPath);
//       });
//     } else {
//       // create directory
//       self.fs.mkdirSync(dir);
//     }
//   }
// }



Mapbaker.resetLocalSavePath = function() {
  var self = this;

  if (process.env.DOMINUS_TEST == 'false') {
    // if does not exist
    if (!Mapbaker.fs.existsSync(self.imageSavePath)) {
      // create directory
      Mapbaker.fs.mkdirSync(self.imageSavePath);
    }
  }
};


//
// Mapbaker.deleteLocalHexFiles = function() {
//   var self = this;
//
//   if (self.fs.existsSync(self.meteorPublicPath)) {
//     // delete all files in public/hexes directory
//     self.fs.readdirSync(self.meteorPublicPath).forEach(function(file, index) {
//       var curPath = self.meteorPublicPath + '/' + file;
//       self.fs.unlinkSync(curPath);
//     });
//   } else {
//     // create directory
//     self.fs.mkdirSync(self.meteorPublicPath);
//   }
// };



Mapbaker.imageExists = function(image_url){
  check(image_url, String);

  if (Meteor.isServer && process.env.NODE_ENV == 'development') {
    return true;
  }

  try {
    var result = HTTP.get(image_url);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};
