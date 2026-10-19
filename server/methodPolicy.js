// Who may call each Meteor method. Enforced for every client call by
// server/methodGate.js, and checked for completeness by server/spectatorTests.js.
//
// public - callable while logged out. Must never write game data.
// user   - requires a login. Only touches the caller's own data, or has its
//          own admin / moderator check.
// game   - requires a login AND a Players doc in the game being acted on.
//          `game(args)` returns {gameId, targets}: the gameId argument (if the
//          method takes one) and [Collection, id] pairs for the documents the
//          method acts on. Every target must exist and belong to the same game,
//          so a player of one game can't act on another game's objects.
//
// A method that isn't listed here (and isn't in METHOD_POLICY_CORE) is refused.

var PUBLIC = {access: 'public'};
var USER = {access: 'user'};
var game = function(resolve) {
  return {access: 'game', game: resolve};
};

// resolver for a method that takes a gameId and nothing else in the game
var gameArg = function(index) {
  return function(args) {
    return {gameId: args[index]};
  };
};

// policy for a method that acts on one document, optionally with a gameId argument
var target = function(collection, index, gameIndex) {
  return game(function(args) {
    return {gameId: gameIndex === undefined ? undefined : args[gameIndex], targets: [[collection, args[index]]]};
  });
};

// ValidatedMethods take a single object argument
var armyInObject = function(args) {
  let params = args[0] || {};
  return {gameId: params.gameId, targets: [[Armies, params.armyId]]};
};

var buildingCollection = function(type) {
  switch (type) {
    case 'castle':
      return Castles;
    case 'village':
      return Villages;
  }
  throw new Meteor.Error('not-authorized', 'Unknown building type.');
};

var unitCollection = function(type) {
  switch (type) {
    case 'capital':
      return Capitals;
    case 'castle':
      return Castles;
    case 'village':
      return Villages;
    case 'army':
      return Armies;
  }
  throw new Meteor.Error('not-authorized', 'Unknown unit type.');
};

var roomAndMember = function(args) {
  return {gameId: args[0], targets: [[Rooms, args[1]], [Players, args[2]]]};
};


// Meteor and package methods that are left alone. Collection mutators
// (/collection/insert etc) are skipped too; with no allow rules they refuse
// every client call.
METHOD_POLICY_CORE = [
  'login',
  'logout',
  'getNewToken',
  'removeOtherTokens',
  'createUser',
  'forgotPassword',
  'resetPassword',
  'verifyEmail',
  'changePassword',
  'configureLoginService'
];


MethodPolicy = {

  // --- public: read only, used by the map and info panels while spectating ---
  coords_to_id: PUBLIC,
  getResourcesGatheredAtHex: PUBLIC,
  getGameInfo: PUBLIC,
  fetchCountriesOnScreen: PUBLIC,

  // forum, readable while logged out
  addPostView: PUBLIC,
  forumMarkAllRead: PUBLIC,


  // --- user: account, store, signups, admin, forum ---
  changeMainUsername: USER,
  setGender: USER,
  deleteAvatar: USER,
  uploadAvatarToS3: USER,
  deleteEntireAccount: USER,
  rensendEmailVerification: USER,
  onEmailVerified: USER,
  stripeProCheckout: USER,
  stripeDonationCheckout: USER,
  stripePurchaseCheckout: USER,
  daysSincePlayerActive: USER,

  signupForGame: USER,
  cancelSignupForGame: USER,
  joinGame: USER,

  // markers are private to their owner; every selector includes user_id
  setMarkerOrder: USER,
  saveMarkerInfo: USER,
  saveMarkerGroupInfo: USER,
  moveMarkerGroupUp: USER,
  moveMarkerGroupDown: USER,
  fixMarkerGroupOrder: USER,
  removeMarkerGroup: USER,
  removeMarker: USER,

  // admin / moderator checks are inside each method
  banUser: USER,
  unbanUser: USER,
  addOrEditGame: USER,
  removeGame: USER,
  resetQueueStats: USER,
  sendToMailingList: USER,
  addMod: USER,
  pauseJobQueue: USER,
  resumeJobQueue: USER,
  clearUniqueIdsForJob: USER,
  runBullJob: USER,
  runGameCreationTests: USER,

  forumPinTopic: USER,
  forumUnpinTopic: USER,
  forumDeleteTopic: USER,
  forumLockTopic: USER,
  forumUnlockTopic: USER,
  forumNewTopic: USER,
  forumNewPost: USER,


  // --- game: caller must be a player in the game ---

  // armies
  hireArmy: game(function(args) {
    return {gameId: args[0], targets: [[buildingCollection(args[3]), args[2]]]};
  }),
  disbandArmy: target(Armies, 1, 0),
  splitArmy: target(Armies, 1, 0),
  createArmyFromBuilding: game(function(args) {
    return {gameId: args[0], targets: [[buildingCollection(args[1]), args[2]]]};
  }),
  'armies.combineArmies': game(armyInObject),
  'armies.joinBuilding': game(armyInObject),
  'armies.returnToCastle': game(armyInObject),
  'armies.stopMoving': game(armyInObject),

  // army paths
  addArmyPath: target(Armies, 3, 0),
  removeArmyPath: target(Armypaths, 0),
  decreasePathIndex: target(Armypaths, 0),
  increasePathIndex: target(Armypaths, 0),
  pauseMovement: target(Armies, 0),
  resumeMovement: target(Armies, 0),

  // castles, villages, market
  send_gold_to: target(Players, 1, 0),
  set_unit_image: target(Castles, 0, 3),
  buildVillage: game(gameArg(0)),
  upgradeVillage: target(Villages, 1, 0),
  destroyVillage: target(Villages, 0),
  buy_resource: game(gameArg(0)),
  sell_resource: game(gameArg(0)),

  // names and player settings
  edit_name: game(function(args) {
    return {targets: [[unitCollection(args[0]), args[1]], [Players, args[3]]]};
  }),
  change_username: target(Players, 0),
  reportPlayer: target(Players, 0),
  setHexScale: target(Players, 0),
  activateProToken: game(gameArg(0)),
  deleteGameAccount: game(gameArg(0)),
  hide_welcome_screen: game(gameArg(0)),
  show_castle: game(gameArg(0)),
  hide_castle: game(gameArg(0)),
  show_villages: game(gameArg(0)),
  hide_villages: game(gameArg(0)),
  show_armies: game(gameArg(0)),
  hide_armies: game(gameArg(0)),
  show_lords: game(gameArg(0)),
  hide_lords: game(gameArg(0)),
  show_allies: game(gameArg(0)),
  hide_allies: game(gameArg(0)),
  show_coords: target(Players, 0),
  hide_coords: target(Players, 0),
  show_minimap: target(Players, 0),
  hide_minimap: target(Players, 0),

  // alerts
  hideAlertMine: target(Players, 0),
  showAlertMine: target(Players, 0),
  markAlertAsRead: target(Alerts, 1, 0),
  markAllAlertsAsRead: target(Players, 0),

  // markers that create something in a game
  addMarker: game(gameArg(0)),
  addMarkerCoords: game(gameArg(0)),
  addMarkerGroup: game(gameArg(0)),

  // chat
  addChatToRoom: target(Rooms, 1, 0),
  startChatroomWith: game(gameArg(0)),
  leaveChatroom: target(Rooms, 1, 0),
  renameChatroom: target(Rooms, 1, 0),
  inviteToChatroom: target(Rooms, 1, 0),
  chatroomMakeOwner: game(roomAndMember),
  chatroomMakeAdmin: game(roomAndMember),
  chatroomRemoveAdmin: game(roomAndMember),
  kickFromChatroom: game(roomAndMember)
};
