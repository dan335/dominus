Template.game.helpers({
  hasAccess: function() {
    let userId = Meteor.userId();
    if (userId) {
      let user = Meteor.users.findOne(userId, {fields: {verifiedEmail:1, banned:1}});
      if (user) {
        if (user.banned || !user.verifiedEmail) {
          return false;
        }
        return true;
      }
      return false;
    }
  },

  playerId: function() {
    return Session.get('playerId');
  },

  isPanelOpen: function(data) {
    let panel = data.hash.panel;
    let panelsOpen = Session.get('leftPanelsOpen');
    return _.contains(panelsOpen, panel);
  },

  rp_template: function() {
		var template = Session.get('rp_template')
		if (template) {
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


  // store playerId in session variable
  Session.setDefault('playerId', null);
  this.autorun(function() {
    let userId = Meteor.userId();
    let gameId = Session.get('gameId');
    if (userId && gameId) {
      let player = Players.findOne({gameId:gameId, userId:userId}, {fields: {_id:1}});
      if (player) {
        Session.set('playerId', player._id);
      }
    }
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
      Meteor.subscribe('player', gameId); // user's player for this game
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

  		// villages must always be loaded
  		// so that we know how many villages a player has
  		Meteor.subscribe('left_panel_villages', gameId);
  		Meteor.subscribe('left_panel_castle', gameId);

      Meteor.subscribe('myArmies', gameId);

      Meteor.subscribe('myArmyPaths', gameId);
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
  Session.set('playerId', undefined);
  Session.get('gameId', undefined);
  Session.set('hexScale', undefined);
  Session.set('countryIdsOnscreen', []);
  Session.get('center_hex', {x:0, y:0});
});
