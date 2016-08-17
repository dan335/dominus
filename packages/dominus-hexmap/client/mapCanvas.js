var canvas;
var ctx;
var width;
var height;
var countryIds;
var countries;
var capitals;
var castles;
var villages;
var countryImages = {};
var castleImages = {};
var villageImages = {};
var capitalimage;
var hexPos;
var ratio;
var subscriptionsReady = false;
var playerId;
var gameId;
var sp_show_coords = false;
var mapIsDirty = false;   // redraw map next loop
var hexScale = 1;
var countryIdsOnscreen = [];

mapPos = {x:0, y:0};
var prevMapPos = {x:0, y:0};



var canvasLoop = function() {
  // draw 20 fps
  //if (Date.now() - lastDrawTime > 50) {



    render();
  //}

  requestAnimationFrame(canvasLoop);
}

//var lastDrawTime = Date.now();

var render = function() {
  // if (!subscriptionsReady) {
  //   return;
  // }

  // if map hasen't moved and is not dirty then abort
  if (!mapIsDirty && mapPos.x == prevMapPos.x && mapPos.y == prevMapPos.y) {
    return;
  }

  if (!hexScale || !ratio) {
    mapIsDirty = true;
    return;
  }

  // let msSinceLast = Date.now() - lastDrawTime;
  // if (msSinceLast < 50) {
  //   return;
  // }
  // lastDrawTime = Date.now();

  prevMapPos = mapPos;
  mapIsDirty = false;

  //console.time('render');
  drawBgWater();
  drawMedWater();
  drawShallowWater();
  drawCountries();
  drawBuildings();
  drawCountryBorders();
  //console.timeEnd('render');
}



var drawBgWater = function() {
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle="#1b3a50";
  ctx.fillRect(0, 0, width, height);
}


var drawMedWater = function() {
  if (countries) {
    ctx.strokeStyle = '#204560';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 60 * hexScale;
    ctx.beginPath();
    countries.forEach(function(country) {
      if (_.contains(countryIdsOnscreen, country._id)) {
        if (country.paths) {
          country.paths.forEach(function(path) {
            var prevPoint;
            var first = true;
            path.forEach(function(point) {
              if (first) {
                ctx.moveTo(point.x * hexScale + mapPos.x, point.y * hexScale + mapPos.y);
                first = false;
              } else {
                ctx.lineTo(point.x * hexScale + mapPos.x, point.y * hexScale + mapPos.y);
              }
              prevPoint = point;
            })
            ctx.closePath();
          });
        }
      }
    });
    ctx.stroke();
  }
}



var drawShallowWater = function() {
  if (countries) {
    ctx.strokeStyle = '#336f99';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 22 * hexScale;
    ctx.beginPath();
    countries.forEach(function(country) {
      if (_.contains(countryIdsOnscreen, country._id)) {
        if (country.paths) {
          country.paths.forEach(function(path) {
            var prevPoint;
            var first = true;
            path.forEach(function(point) {
              if (first) {
                ctx.moveTo(point.x * hexScale + mapPos.x, point.y * hexScale + mapPos.y);
                first = false;
              } else {
                ctx.lineTo(point.x * hexScale + mapPos.x, point.y * hexScale + mapPos.y);
              }
              prevPoint = point;
            })
            ctx.closePath();
          });
        }
      }
    });
    ctx.stroke();
  }
}



var drawCountries = function() {
  if (gameId && countries) {
    countries.forEach(function(country) {
      if (_.contains(countryIdsOnscreen, country._id)) {
        let image = countryImages[country._id];
        if (image && country.paths) {
          if (sp_show_coords) {
            var x = country.imageWithCoords.posX * hexScale + mapPos.x;
            var y = country.imageWithCoords.posY * hexScale + mapPos.y;
            var w = country.imageWithCoords.width * hexScale;
            var h = country.imageWithCoords.height * hexScale;
          } else {
            var x = country.image.posX * hexScale + mapPos.x;
            var y = country.image.posY * hexScale + mapPos.y;
            var w = country.image.width * hexScale;
            var h = country.image.height * hexScale;
          }

          ctx.save();
          ctx.beginPath();
          country.paths.forEach(function(path) {
            var prevPoint;
            var first = true;
            path.forEach(function(point) {
              if (first) {
                ctx.moveTo(point.x * hexScale + mapPos.x, point.y * hexScale + mapPos.y);
                first = false;
              } else {
                ctx.lineTo(point.x * hexScale + mapPos.x, point.y * hexScale + mapPos.y);
              }
              prevPoint = point;
            })
            ctx.closePath();
          });

          ctx.clip();
          ctx.drawImage(image, x, y, w, h);
          ctx.restore();
        }
      }
    });
  }
}


var drawBuildings = function() {
  if (castles) {
    castles.forEach(function(castle) {
      if (_.contains(countryIdsOnscreen, castle.countryId)) {
        let image = castleImages[castle.image];
        if (image) {
          let grid = Hx.coordinatesToPos(castle.x, castle.y, _s.init.hexSize, _s.init.hexSquish);
          ctx.drawImage(image, (grid.x-63) * hexScale + mapPos.x, (grid.y-41) * hexScale + mapPos.y, 126 * hexScale, 83 * hexScale);
        }
      }
    });
  }

  if (capitals) {
    capitals.forEach(function(capital) {
      if (_.contains(countryIdsOnscreen, capital.countryId)) {
        let image = capitalimage;
        if (image) {
          let grid = Hx.coordinatesToPos(capital.x, capital.y, _s.init.hexSize, _s.init.hexSquish);
          ctx.drawImage(image, (grid.x-63)*hexScale+mapPos.x, (grid.y-41)*hexScale+mapPos.y, 126*hexScale, 83*hexScale);
        }
      }
    });
  }

  if (villages) {
    villages.forEach(function(village) {
      if (_.contains(countryIdsOnscreen, village.countryId)) {
        var image;
        if (village.under_construction) {
          image = villageImages['lvl'+(village.level+1)+'c'];
        } else {
          image = villageImages['lvl'+village.level];
        }
        if (image) {
          let grid = Hx.coordinatesToPos(village.x, village.y, _s.init.hexSize, _s.init.hexSquish);
          ctx.drawImage(image, (grid.x-63)*hexScale+mapPos.x, (grid.y-41)*hexScale+mapPos.y, 126*hexScale, 83*hexScale);
        }
      }
    });
  }
}



var drawCountryBorders = function() {
  if (countries) {
    ctx.strokeStyle = '#444';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8 * hexScale;
    ctx.beginPath();
    countries.forEach(function(country) {
      if (_.contains(countryIdsOnscreen, country._id)) {
        if (country.paths) {
          country.paths.forEach(function(path) {
            var prevPoint;
            var first = true;
            path.forEach(function(point) {
              if (first) {
                ctx.moveTo(point.x * hexScale + mapPos.x, point.y * hexScale + mapPos.y);
                first = false;
              } else {
                ctx.lineTo(point.x * hexScale + mapPos.x, point.y * hexScale+ mapPos.y);
              }
              prevPoint = point;
            })
            ctx.closePath();
          });
        }
      }
    });
    ctx.stroke();
  }
}


// --------------------------------



Template.mapCanvas.onCreated(function() {
  var self = this;

  /// load country images
  this.autorun(function() {
    playerId = Session.get('playerId');
    let player = Players.findOne(playerId, {fields: {sp_show_coords:1}});
    if (player) {
      sp_show_coords = player.sp_show_coords;
      mapIsDirty = true;
    }

    Countries.find().forEach(function(country) {

      // image url
      let url = '';
      if (Meteor.settings.public.s3.serveBakesFromS3)
      {
        url += Meteor.settings.public.s3.url + Meteor.settings.public.s3.bakePath;
        url += gameId + '/';
      } else {
        url += '/hexBakes/';
      }

      if (sp_show_coords) {
        url += country.imageWithCoords.filename;
      } else {
        url += country.image.filename;
      }

      url += '.jpg?';
      if (sp_show_coords) {
        url += new Date(country.imageWithCoords.created_at).getTime();
      } else {
        url += new Date(country.image.created_at).getTime();
      }

      let image = new Image();
      image.onload = function() {
        countryImages[country._id] = image;
        mapIsDirty = true;
      }
      image.src = url;
    });
  });


  // load castle images
  if (!_s.store.castles.types) {
    console.log('--- no castle types ---');
  }
  _s.store.castles.types.forEach(function(type) {
    let image = new Image();
    image.onload = function() {
      castleImages[type] = image;
      mapIsDirty = true;
    }
    image.src = '/game_images/' + _s.store.castles[type].image;
  })


  // load village images
  var vImages = {};
  for (let l=1; l<=3; l++)
  {
    vImages['lvl'+l] = new Image();
    vImages['lvl'+l].onload = function() {
      villageImages['lvl'+l] = vImages['lvl'+l];
      mapIsDirty = true;
    }
    vImages['lvl'+l].src = '/game_images/' + 'village_lvl0'+l+'.png';

    vImages['lvl'+l+'c'] = new Image();
    vImages['lvl'+l+'c'].onload = function() {
      villageImages['lvl'+l+'c'] = vImages['lvl'+l+'c'];
      mapIsDirty = true;
    }
    vImages['lvl'+l+'c'].src = '/game_images/' + 'village_construction_lvl0'+l+'.png';
  }

  // load capital image
  let image = new Image();
  image.onload = function() {
    capitalimage = image;
    mapIsDirty = true;
  }
  image.src = '/game_images/' + 'capital_01.png';

  this.autorun(function() {
    countryIdsOnscreen = _.pluck(Session.get('countryIdsOnscreen'), '_id');
    mapIsDirty = true;
  });

  this.autorun(function() {
    hexScale = Session.get('hexScale');
    mapIsDirty = true;
  });


  this.autorun(function() {
    gameId = Session.get('gameId');
    mapIsDirty = true;
  });

  this.autorun(function() {
    var canvas_size = Session.get('canvas_size');
		if (canvas_size) {
			width = canvas_size.width;
			height = canvas_size.height;
      mapIsDirty = true;
    }
  });

  this.autorun(function() {
    countries = Countries.find().fetch();
    mapIsDirty = true;
  });

  this.autorun(function() {
    villages = Villages.find().fetch();
    mapIsDirty = true;
  });

  this.autorun(function() {
    capitals = Capitals.find().fetch();
    mapIsDirty = true;
  });

  this.autorun(function() {
    castles = Castles.find().fetch();
    mapIsDirty = true;
  });

  this.autorun(function() {
    hexPos = Session.get('hexes_pos');
    mapIsDirty = true;
  });

  this.cachedIds = [];
  this.autorun(function()
  {
    var gameId = Session.get('gameId');
		var countries = Session.get('countryIdsOnscreen');

    let newCachedIds = [];
    countries.forEach(function(c) {
      newCachedIds.push({id:c._id, date:new Date(), gameId:c.gameId})
    });

    // combine
    self.cachedIds = self.cachedIds.concat(newCachedIds);

    // remove with wrong gameId
    self.cachedIds = _.filter(self.cachedIds, function(data) {
      return data.gameId == gameId;
    });

    // sort by date
    self.cachedIds = _.sortBy(self.cachedIds, function(data) {
      return data.date.getTime() * -1;
    });

    // remove dupes
    self.cachedIds = _.uniq(self.cachedIds, false, function(data) {
      return data.id;
    });

    // remove older than 20 min
    let cutoff = moment().subtract(15, 'minutes');
    self.cachedIds = _.filter(self.cachedIds, function(data) {
      return moment(new Date(data.date)).isAfter(cutoff);
    })

    // keep 20 newest
    if (self.cachedIds.length > 20) {
      self.cachedIds = self.cachedIds.slice(0, 20);
    }

    // subscribes to countryes, capitals, armies, villages and castles on map
    if (self.cachedIds && self.cachedIds.length) {
      self.cachedIds.forEach(function(country) {
        self.subscribe('countryOnScreen', country.id);
      })
    }
	});

  this.autorun(function() {
    subscriptionsReady = Template.instance().subscriptionsReady();
    mapIsDirty = true;
  })
})



Template.mapCanvas.onRendered(function() {
  canvas = document.getElementById('mapCanvas');
  ctx = canvas.getContext('2d');
  ratio = window.devicePixelRatio || 1;

  this.autorun(function() {
		var canvas_size = Session.get('canvas_size');
		if (canvas_size) {
      $('#mapCanvas').attr('width', canvas_size.width * ratio);
      $('#mapCanvas').attr('height', canvas_size.height * ratio);
      $('#mapCanvas').css('width', canvas_size.width);
      $('#mapCanvas').css('height', canvas_size.height);
      ctx.scale(ratio, ratio);
		}
	});

  canvasLoop();
});
