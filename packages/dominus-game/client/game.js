// how long to wait for the createPlayer job after joining before spectating
var joiningTimeout = 1000 * 60 * 2;

// anyone who isn't a player in this game spectates
// only players get a playerId so everything that lets you act keys off it
// returns {mode:'loading'|'joining'|'player'|'spectator', playerId}
var getViewMode = function(gameId, playerSubReady) {
  if (Meteor.loggingIn()) {
    return {mode:'loading'};
  }

  let userId = Meteor.userId();
  if (!userId) {
    return {mode:'spectator'};
  }

  let user = Meteor.users.findOne(userId, {fields: {verifiedEmail:1, banned:1}});
  if (!user) {
    return {mode:'loading'};
  }

  if (user.banned || !user.verifiedEmail) {
    return {mode:'spectator'};
  }

  let player = Players.findOne({gameId:gameId, userId:userId}, {fields: {_id:1}});
  if (player) {
    return {mode:'player', playerId:player._id};
  }

  if (!playerSubReady) {
    return {mode:'loading'};
  }

  // createPlayer is a job so the player shows up a few seconds after joining
  let joining = Session.get('joiningGame');
  if (joining && joining.gameId == gameId && Date.now() - joining.at < joiningTimeout) {
    return {mode:'joining'};
  }

  return {mode:'spectator'};
};

var isSpectatorPanel = function(template) {
  return !!_.findWhere(_s.panels.leftPanels, {template:template, spectator:true});
};

Template.game.helpers({
  showGameUi: function() {
    let mode = Session.get('gameViewMode');
    return mode == 'player' || mode == 'spectator';
  },

  playerId: function() {
    return Session.get('playerId');
  },

  isPanelOpen: function(data) {
    let panel = data.hash.panel;
    if (dInit.isSpectating() && !isSpectatorPanel(panel)) {
      return false;
    }
    let panelsOpen = Session.get('leftPanelsOpen');
    return _.contains(panelsOpen, panel);
  },

  rp_template: function() {
		var template = Session.get('rp_template')
		if (template) {
			// spectators only get the info panels, never the action panels
			if (dInit.isSpectating() && !_.contains(_s.panels.spectatorRightPanels, template)) {
				return 'empty_template';
			}
			return template;
		} else {
			return 'empty_template';
		}
	},

	rp_template_data: function() {
		var selected = Session.get('selected');
    let gameId = Session.get('gameId');
		if (selected) {
			switch (selected.type) {
				case 'capital':
					return RightPanelCapitals.findOne(selected.id);
					break;
				case 'castle':
					return RightPanelCastle.findOne(selected.id);
					break;
				case 'village':
					return RightPanelVillages.findOne(selected.id);
					break;
				case 'army':
					// MyArmies contains info about movement
					// that is not in RightPanelArmies
					var army = RightPanelArmies.findOne(selected.id);
					if (army && army.user_id == Meteor.userId()) {
						return MyArmies.findOne(selected.id);
					} else {
						return army;
					}
					break;
				case 'hex':
					return Hexes.findOne({x:selected.x, y:selected.y});
					break;
				}
		}

		return {};
	},
})


Template.game.onCreated(function() {

  // router
  // select object when URL changes
  this.autorun(function() {
    let path = SimpleRouter.path.get();
    if (path) {
      let pathArray = path.split('/');
      if (pathArray[1] == 'game') {
        if (pathArray.length == 3) {
          // nothing is selected

          Session.set('selected', null);
        	Session.set('rp_template', null);

        } else {

          let type = pathArray[3];
          let x = parseInt(pathArray[4]);
          let y = parseInt(pathArray[5]);

          // id is null for hexes
          let id = null;
          if (pathArray[6]) {
            id = pathArray[6];
          }

          // if army moves we need to update position but not template
          // so that if player is in move template or other template
          // it doesn't switch back to army info template

          let updateTemplate = true;

          if (type == 'army') {
            let prevSelected = Session.get('selected');
            if (prevSelected && id == prevSelected.id) {
              updateTemplate = false;
            }
          }

          Session.set('selected', {type:type, x:x, y:y, id:id});

          if (updateTemplate) {
            switch (type) {
              case 'army':
                Session.set('rp_template', 'rp_info_army');
                break;
              case 'hex':
                Session.set('rp_template', 'rp_info_hex');
                break;
              case 'village':
                Session.set('rp_template', 'rp_info_village');
                break;
              case 'castle':
                Session.set('rp_template', 'rp_info_castle');
                break;
              case 'capital':
                Session.set('rp_template', 'rp_info_capital');
                break;
              case 'marker':
                Session.set('rp_template', 'rp_infoMarker');
                break;
              case 'markerGroup':
                Session.set('rp_template', 'rp_infoMarkerGroup');
                break;
            }
          }
        }
      }
    }
  });


  // always subscribe to markers
  this.autorun(function() {
    let playerId = Session.get('playerId');
    if (playerId) {
      Meteor.subscribe('myMarkers', playerId);
    }
  });


  // playing or spectating
  // store playerId in session variable, null unless playing
  var self = this;
  Session.setDefault('playerId', null);
  Session.set('gameViewMode', 'loading');
  self.playerSubReady = new ReactiveVar(false);
  self.joiningTimer = null;
  let prevMode = null;

  this.autorun(function() {
    let gameId = Session.get('gameId');
    let view = getViewMode(gameId, self.playerSubReady.get());

    if (view.mode == 'player') {
      Session.set('joiningGame', null);
    }

    // a stale joining flag falls back to spectating
    if (view.mode == 'joining' && !self.joiningTimer) {
      let joining = Session.get('joiningGame');
      self.joiningTimer = Meteor.setTimeout(function() {
        self.joiningTimer = null;
        Session.set('joiningGame', null);
      }, Math.max(joiningTimeout - (Date.now() - joining.at), 0));
    }

    if (view.mode == 'spectator') {
      Session.set('mouse_mode', 'default');
    }

    // went from spectating or joining to playing (logging in passes through
    // loading), let the hexmap center on the player's castle
    if (view.mode == 'player' && (prevMode == 'spectator' || prevMode == 'joining')) {
      Session.set('hexScale', undefined);
    }
    if (view.mode != 'loading') {
      prevMode = view.mode;
    }

    Session.set('playerId', view.playerId || null);
    Session.set('gameViewMode', view.mode);
  })

  // if gameId is not set send to game list
  let gameId = Session.get('gameId');
  if (!gameId) {
    console.error('no gameId in game.onCreated');
    SimpleRouter.go('/games');
  }

  // creates player and castle if user doesn't have one
  // Meteor.call('joinGame', gameId, null, function(error, result) {
  //   if (error) {
  //     console.error(error);
  //     SimpleRouter.go('/games');
  //   }
  // });


  // needed for settings
  this.autorun(function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      Meteor.subscribe('game', gameId);
    }
  });

  // user's player for this game, spectators don't have one
  this.autorun(function() {
    let gameId = Session.get('gameId');
    if (gameId && Meteor.userId()) {
      let handle = Meteor.subscribe('player', gameId);
      self.playerSubReady.set(handle.ready());
    } else {
      self.playerSubReady.set(false);
    }
  });


  Session.setDefault('rightPanelInfoLoaded', false);
	this.autorun(function() {
		var selected = Session.get('selected');

		if (selected && selected.id && selected.type) {
			switch (selected.type) {
				case 'castle':
					var infoHandle = Meteor.subscribe('castleForHexInfo', selected.id);
					Session.set('rightPanelInfoLoaded', infoHandle.ready());
					break;
				case 'army':
					var infoHandle = Meteor.subscribe('armyForHexInfo', selected.id);
					Session.set('rightPanelInfoLoaded', infoHandle.ready());
					break;
				case 'village':
					var infoHandle = Meteor.subscribe('villageForHexInfo', selected.id);
					Session.set('rightPanelInfoLoaded', infoHandle.ready());
					break;
				case 'capital':
					var infoHandle = Meteor.subscribe('capitalForHexInfo', selected.id);
					Session.set('rightPanelInfoLoaded', infoHandle.ready());
					break;
			}
		}
	});


  this.autorun(function() {
    let gameId = Session.get('gameId');
    if (gameId) {
      let playerId = Session.get('playerId');
      if (playerId) {
        Meteor.subscribe('room_list', gameId, playerId);
      }
    }
  });


  this.autorun(function() {
    let gameId = Session.get('gameId');
    if (gameId) {

  		Meteor.subscribe('market', gameId);

      // the rest is the user's own stuff
      if (Meteor.userId()) {
    		// villages must always be loaded
    		// so that we know how many villages a player has
    		Meteor.subscribe('left_panel_villages', gameId);
    		Meteor.subscribe('left_panel_castle', gameId);

        Meteor.subscribe('myArmies', gameId);

        Meteor.subscribe('myArmyPaths', gameId);
      }
    }
	});

  // keep track of how many villages you have
	this.autorun(function() {
		let playerId = Session.get('playerId');
		if (playerId) {
			let numVillages = LeftPanelVillages.find({playerId:playerId}).count();
			Session.set('num_villages', numVillages);
		} else {
			Session.set('num_villages', 0);
		}
	});


  this.autorun(function() {
		var roomsImIn = Roomlist.find({}, {fields:{_id:1}}).fetch();
		var ids = _.pluck(roomsImIn, '_id');
		if (ids.length > 0) {
			Meteor.subscribe('recentchats', ids);
		}
	})
});


Template.game.onRendered(function() {
  window.onresize = function() {
    onResizeWindow();
  }
  onResizeWindow();
})


let onResizeWindow = _.debounce(function() {
  let width = $(window).outerWidth(true);
  let height = $(window).outerHeight(true);
  Session.set('canvas_size', {width: width, height: height});

  // 30 is height of topMenu
  $('#leftPanels').css('height', height - 30);
  $('#rightPanels').css('height', height - 30);
}, 500);



Template.game.onDestroyed(function() {
  if (this.joiningTimer) {
    Meteor.clearTimeout(this.joiningTimer);
  }
  Session.set('gameViewMode', undefined);
  Session.set('playerId', undefined);
  Session.get('gameId', undefined);
  Session.set('hexScale', undefined);
  Session.set('countryIdsOnscreen', []);
  Session.get('center_hex', {x:0, y:0});
});
