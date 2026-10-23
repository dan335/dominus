// The soak test's bots (T8 of the Meteor upgrade plan, Oct 2026). Run by
// tests/soak/run.sh inside the soak's Docker network, never against a real
// site: they make accounts and games and play them.
//
//   node soak.js accounts   makes the admin and the bot accounts, then exits
//   node soak.js play       plays for MINUTES, then exits
//
// An admin makes a crazy fast game, most bots sign up before it starts and the
// rest join once it runs. They play the way people do over DDP: subscribe to
// what the game screen subscribes to, trade, hire, march on each other's
// castles, build villages, chat, look around the map, and now and then close
// the tab and come back. When a game ends the admin makes the next one and
// the bots move on to it. A few signed-out spectators watch.
//
// Every method result is counted. A refusal the game gives on purpose (not
// enough resources, too far, and so on) is fine. An internal server error or a
// call that gets no answer is what the soak is looking for, and is listed in
// bots.json with the call that got it.

const fs = require('fs');
const path = require('path');
const {Ddp} = require('./ddp');

const env = process.env;
const URL = env.SOAK_URL || 'ws://web/websocket';
const BOTS = Number(env.BOTS || 12);
const SPECTATORS = Number(env.SPECTATORS || 2);
const MINUTES = Number(env.MINUTES || 60);
const PASSWORD = env.SOAK_PASSWORD || 'soak-password-1';
const OUT = env.SOAK_OUT || '/out';
const SEED = Number(env.SEED || 1);
const MAX_GAMES = Number(env.MAX_GAMES || 20);
// how often a bot acts, in seconds (a random wait between these)
const ACT_MIN = Number(env.ACT_MIN || 4);
const ACT_MAX = Number(env.ACT_MAX || 15);

const ADMIN = 'soak_admin';
const botName = (i) => 'soak_bot' + String(i + 1).padStart(2, '0');

// a seeded random source, so a run can be repeated
let seed = SEED >>> 0;
const random = () => {
  seed = (seed + 0x6D2B79F5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + Math.floor(random() * (b - a + 1));
const pick = (list) => list[Math.floor(random() * list.length)];
const chance = (p) => random() < p;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const log = (event, data) => console.log(JSON.stringify(Object.assign({t: new Date().toISOString(), event}, data)));

// --- what happened, for the report ---

const stats = {
  startedAt: new Date().toISOString(),
  methods: {},         // name -> {ok, refused: {reason: n}}
  serverErrors: [],    // internal server errors and timeouts, with the call
  serverErrorCount: 0,
  subscriptions: {ok: 0, refused: {}},
  reconnects: 0,
  connectFailures: 0,
  games: [],
  lastSampleAt: null
};

const SOLDIERS = ['footmen', 'archers', 'pikemen', 'cavalry', 'catapults'];
const RESOURCES = ['grain', 'lumber', 'ore', 'wool', 'clay', 'glass'];
// each soldier costs 22 grain and 100 of one resource (packages/dominus-settings/settingsArmies.js)
const SOLDIER_COST = {footmen: 'ore', archers: 'lumber', pikemen: 'clay', cavalry: 'wool', catapults: 'glass'};
// a village costs 200 of each resource (settingsVillages.js)
const VILLAGE_COST = 200;

const isServerError = (e) => e && (e.error == 500 || e.error == 'timeout' || e.errorType == 'Meteor.Error' && e.error == 'internal-server-error');

const record = (method, error, params) => {
  const m = stats.methods[method] || (stats.methods[method] = {ok: 0, refused: {}});
  if (!error) {
    m.ok++;
    return;
  }
  if (isServerError(error)) {
    stats.serverErrorCount++;
    if (stats.serverErrors.length < 200) {
      stats.serverErrors.push({t: new Date().toISOString(), method, error: error.error, reason: error.message, params});
    }
    log('serverError', {method, error: error.error, reason: error.message, params});
    return;
  }
  const reason = String(error.reason || error.message || error.error).slice(0, 120);
  m.refused[reason] = (m.refused[reason] || 0) + 1;
};

const call = async (ddp, method, ...params) => {
  try {
    const result = await ddp.call(method, ...params);
    record(method, null, params);
    return {ok: true, result};
  } catch (e) {
    record(method, e, params);
    return {ok: false, error: e};
  }
};

const subscribe = async (ddp, name, ...params) => {
  try {
    const id = await ddp.subscribe(name, ...params);
    stats.subscriptions.ok++;
    return id;
  } catch (e) {
    const reason = name + ': ' + String(e.reason || e.message || e.error).slice(0, 100);
    stats.subscriptions.refused[reason] = (stats.subscriptions.refused[reason] || 0) + 1;
    return null;
  }
};

const connect = async (username) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const ddp = new Ddp(URL);
      await ddp.connect();
      if (username) await ddp.login(username, PASSWORD);
      return ddp;
    } catch (e) {
      stats.connectFailures++;
      log('connectFailed', {username, attempt, error: e.message});
      if (attempt >= 30) throw e;
      await sleep(5000);
    }
  }
};

const writeStats = () => {
  stats.lastSampleAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'bots.json'), JSON.stringify(stats, null, 2));
};

// --- accounts ---

// the verification link in the email the soak's mail server kept (tests/soak/mail.js)
const verificationToken = async (email) => {
  const dir = path.join(OUT, 'mail');
  for (let i = 0; i < 60; i++) {
    for (const file of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      // quoted-printable: undo soft line breaks and =3D
      const text = fs.readFileSync(path.join(dir, file), 'utf8').replace(/=\r?\n/g, '').replace(/=3D/g, '=');
      if (!new RegExp('^To: .*' + email.replace(/[.]/g, '\\.'), 'mi').test(text)) continue;
      const m = /verify-email\/([A-Za-z0-9_-]+)/.exec(text);
      if (m) return m[1];
    }
    await sleep(1000);
  }
  throw new Error('no verification email for ' + email);
};

// Signs each account up and verifies its email the way a person does: sign
// up, open the link in the email (verifyEmail), and the page then calls
// onEmailVerified (client/accountsClient.js).
const makeAccounts = async () => {
  const names = [ADMIN].concat(Array.from({length: BOTS}, (_, i) => botName(i)));
  for (const name of names) {
    const email = name + '@example.com';
    const ddp = new Ddp(URL);
    await ddp.connect();
    try {
      await ddp.createUser(name, email, PASSWORD);
    } catch (e) {
      if (!/already exists/i.test(e.message)) throw e;
      log('account', {name, existed: true});
      ddp.close();
      continue;
    }
    ddp.close();
    const token = await verificationToken(email);
    const link = new Ddp(URL);
    await link.connect();
    await link.call('verifyEmail', token);
    await link.call('onEmailVerified');
    link.close();
    log('account', {name, verified: true});
  }
};

// --- the admin, who makes the games ---

const shared = {gameId: null, game: null, gameNumber: 0, done: false};

const startAtString = (date) => date.toISOString().slice(0, 16).replace('T', ' ');

const admin = async () => {
  const ddp = await connect(ADMIN);
  let gameSub = null;
  const newGame = async () => {
    shared.gameNumber++;
    // the start cron runs every minute; two minutes gives the bots time to sign up
    const startAt = new Date(Date.now() + 3 * 60 * 1000);
    const name = 'Soak ' + shared.gameNumber;
    const r = await call(ddp, 'addOrEditGame', name, 'soak test game', BOTS + 10, startAtString(startAt),
      false, false, true, false, false, false, null);
    if (!r.ok) throw new Error('could not make a game: ' + r.error.message);
    if (gameSub) ddp.unsubscribe(gameSub);
    gameSub = await subscribe(ddp, 'game', r.result);
    shared.gameId = r.result;
    stats.games.push({_id: r.result, name, createdAt: new Date().toISOString()});
    log('newGame', {gameId: r.result, name, startAt});
  };
  await newGame();
  while (!shared.done) {
    await sleep(15000);
    if (ddp.closed) return;
    const game = ddp.collection('games').get(shared.gameId);
    shared.game = game || shared.game;
    const entry = stats.games[stats.games.length - 1];
    if (game) {
      if (game.hasStarted && !entry.startedAt) entry.startedAt = new Date().toISOString();
      if (game.dominusAchieved && !entry.dominusAt) entry.dominusAt = new Date().toISOString();
      if (game.hasEnded && !entry.endedAt) {
        entry.endedAt = new Date().toISOString();
        entry.winner = game.winningPlayer && game.winningPlayer.username;
        log('gameEnded', {gameId: shared.gameId, winner: entry.winner});
        if (shared.gameNumber < MAX_GAMES) await newGame();
      }
    }
  }
  ddp.close();
};

// --- a bot ---

const hexDistance = (x1, y1, x2, y2) => Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs((x1 + y1) - (x2 + y2)));

const randomHexNear = (x, y, r) => {
  for (;;) {
    const dx = between(-r, r);
    const dy = between(-r, r);
    if (Math.abs(dx + dy) <= r && (dx || dy)) return {x: x + dx, y: y + dy};
  }
};

class Bot {
  constructor(index) {
    this.username = botName(index);
    this.lateJoiner = index % 4 == 3;  // a quarter join after the game starts
    this.signedUpFor = {};
    this.gameId = null;
  }

  async run() {
    while (!shared.done) {
      this.ddp = await connect(this.username);
      this.subscribed = null;
      // how long before this bot closes the tab and comes back
      const sessionEnds = Date.now() + between(20, 90) * 60 * 1000;
      while (!shared.done && !this.ddp.closed && Date.now() < sessionEnds) {
        try {
          await this.tick();
        } catch (e) {
          log('botError', {bot: this.username, error: e.stack || e.message});
        }
        await sleep(between(ACT_MIN, ACT_MAX) * 1000);
      }
      if (this.ddp.closed && !shared.done) log('disconnected', {bot: this.username});
      this.ddp.close();
      if (shared.done) return;
      stats.reconnects++;
      await sleep(between(5, 30) * 1000);
    }
  }

  get me() {
    return this.ddp.findOne('players', (p) => p.gameId == this.gameId && p.userId == this.ddp.userId);
  }

  async tick() {
    const game = shared.game;
    if (!shared.gameId || !game || game._id != shared.gameId) return;

    // The admin makes a new game once the last one has ended. Go to it the
    // way a player does: a fresh page, so nothing of the old game stays
    // subscribed.
    if (this.gameId != shared.gameId) {
      const reload = !!this.subscribed;
      this.gameId = shared.gameId;
      if (reload) {
        this.ddp.close();
        return;
      }
    }

    if (!game.hasStarted) {
      if (!this.lateJoiner && !this.signedUpFor[this.gameId]) {
        const r = await call(this.ddp, 'signupForGame', this.ddp.userId, this.gameId, this.username);
        if (r.ok || /already signed up/i.test(r.error.message)) this.signedUpFor[this.gameId] = true;
      }
      return;
    }

    if (!this.subscribed) await this.subscribeGame();
    const me = this.me;
    if (!me) {
      // the game page calls joinGame when it opens (managerMethods.js), once
      if (!this.subscribed.joined && !game.hasEnded && !game.dominusAchieved) {
        this.subscribed.joined = true;
        await call(this.ddp, 'joinGame', this.gameId, null);
      }
      return;
    }
    if (!this.subscribed.player) await this.subscribePlayer(me);
    if (game.hasEnded) return;

    await this.act(me);
  }

  // what the game screen subscribes to (packages/dominus-game/client/game.js and the panels)
  async subscribeGame() {
    const ddp = this.ddp;
    const gameId = this.gameId;
    this.subscribed = {countries: []};
    await Promise.all([
      subscribe(ddp, 'game', gameId),
      subscribe(ddp, 'player', gameId),
      subscribe(ddp, 'market', gameId),
      subscribe(ddp, 'myArmies', gameId),
      subscribe(ddp, 'myArmyPaths', gameId),
      subscribe(ddp, 'countryIndex', gameId),
      subscribe(ddp, 'everyoneChatroom', gameId),
      subscribe(ddp, 'globalAlerts', gameId, 10)
    ]);
  }

  async subscribePlayer(me) {
    const ddp = this.ddp;
    this.subscribed.player = me._id;
    await Promise.all([
      subscribe(ddp, 'room_list', this.gameId, me._id),
      subscribe(ddp, 'user_buildings_for_minimap', me._id),
      subscribe(ddp, 'myAlerts', me._id, 20, null),
      subscribe(ddp, 'unreadAlerts', me._id, null),
      subscribe(ddp, 'myNormalChatrooms', this.gameId, me._id),
      subscribe(ddp, 'myKingChatrooms', this.gameId, me._id)
    ]);
    const room = ddp.findOne('rooms', (r) => r.gameId == this.gameId && r.type == 'everyone');
    if (room) await subscribe(ddp, 'roomchats', room._id);
    await this.lookAround(me);
  }

  // the countries on screen: the bot's own and a few others, changed now and then
  async lookAround(me) {
    const ddp = this.ddp;
    const countries = ddp.find('countryindex', (c) => c.gameId == this.gameId);
    if (!countries.length) return;
    const castle = this.castle(me);
    const home = castle && castle.countryId;
    for (const id of this.subscribed.countries.splice(0)) ddp.unsubscribe(id);
    const ids = new Set(home ? [home] : []);
    for (let i = 0; i < 3; i++) ids.add(pick(countries)._id);
    for (const countryId of ids) {
      const id = await subscribe(ddp, 'countryOnScreen', countryId);
      if (id) this.subscribed.countries.push(id);
    }
  }

  castle(me) {
    return this.ddp.findOne('left_panel_castle', (c) => c.playerId == me._id) ||
      this.ddp.findOne('castles', (c) => c.playerId == me._id);
  }

  myArmies(me) {
    return this.ddp.find('myarmies', (a) => a.playerId == me._id || a.user_id == this.ddp.userId && a.gameId == this.gameId);
  }

  isMoving(army) {
    return !!this.ddp.findOne('armypaths2', (p) => p.armyId == army._id);
  }

  soldiersIn(doc) {
    return SOLDIERS.reduce((sum, type) => sum + (doc[type] || 0), 0);
  }

  async act(me) {
    const ddp = this.ddp;
    const gameId = this.gameId;
    const castle = this.castle(me);
    const armies = this.myArmies(me);
    const idle = armies.filter((a) => !this.isMoving(a));
    // the minimap's copy has no level or under_construction; the map's has
    const villages = ddp.find('left_panel_villages', (v) => v.playerId == me._id)
      .map((v) => Object.assign({}, v, ddp.collection('villages').get(v._id)));

    const actions = [
      [3, 'buy', async () => {
        if (me.gold < 100) return;
        const type = pick(RESOURCES);
        const market = ddp.findOne('market', (m) => m.type == type);
        const most = market && market.price > 0 ? Math.floor(me.gold / market.price / 2) : 20;
        if (most < 1) return;
        await call(ddp, 'buy_resource', gameId, type, Math.max(1, Math.min(most, between(10, 200))));
      }],
      [1, 'sell', async () => {
        const type = pick(RESOURCES);
        if (me[type] < 300) return;
        await call(ddp, 'sell_resource', gameId, type, between(10, 100));
      }],
      [4, 'hire', async () => {
        if (!castle) return;
        const soldiers = {};
        SOLDIERS.forEach((t) => { soldiers[t] = 0; });
        const type = pick(SOLDIERS);
        // keep enough back for a village (200 of each) while there are few
        const reserve = villages.length < 4 ? VILLAGE_COST : 0;
        const n = Math.min(Math.floor((me.grain - reserve) / 22), Math.floor((me[SOLDIER_COST[type]] - reserve) / 100), between(5, 40));
        if (n < 1) return;
        soldiers[type] = n;
        const village = villages.length && chance(0.2) && pick(villages);
        if (village && !village.under_construction) {
          await call(ddp, 'hireArmy', gameId, soldiers, village._id, 'village');
        } else {
          await call(ddp, 'hireArmy', gameId, soldiers, castle._id, 'castle');
        }
      }],
      [3, 'muster', async () => {
        if (!castle || this.soldiersIn(castle) < 10 || armies.length >= 8) return;
        const soldiers = {};
        SOLDIERS.forEach((t) => { soldiers[t] = Math.floor((castle[t] || 0) * (0.5 + random() / 2)); });
        if (this.soldiersIn(soldiers) < 1) return;
        await call(ddp, 'createArmyFromBuilding', gameId, 'castle', castle._id, soldiers);
      }],
      [6, 'march', async () => {
        if (!idle.length || !castle) return;
        const army = pick(idle);
        let target;
        const enemyCastles = ddp.find('castles', (c) => c.playerId != me._id && hexDistance(army.x, army.y, c.x, c.y) <= 40);
        const enemyVillages = ddp.find('villages', (v) => v.playerId != me._id && hexDistance(army.x, army.y, v.x, v.y) <= 40);
        const roll = random();
        if (roll < 0.45 && enemyCastles.length && this.soldiersIn(army) >= 20) {
          target = enemyCastles.reduce((a, b) => hexDistance(army.x, army.y, a.x, a.y) <= hexDistance(army.x, army.y, b.x, b.y) ? a : b);
        } else if (roll < 0.6 && enemyVillages.length) {
          target = pick(enemyVillages);
        } else if (roll < 0.7 && enemyCastles.length) {
          target = pick(enemyCastles);
        } else {
          target = randomHexNear(castle.x, castle.y, between(2, 8));
        }
        await call(ddp, 'addArmyPath', gameId, target.x, target.y, army._id);
      }],
      [3, 'village', async () => {
        const away = idle.filter((a) => !castle || a.x != castle.x || a.y != castle.y);
        if (!away.length || villages.length >= 6) return;
        const army = pick(away);
        // buy what is missing first, as a player would
        for (const type of RESOURCES) {
          if (me[type] < VILLAGE_COST) await call(ddp, 'buy_resource', gameId, type, VILLAGE_COST + 20 - Math.floor(me[type]));
        }
        await call(ddp, 'buildVillage', gameId, army.x, army.y);
      }],
      [1, 'upgrade', async () => {
        const ready = villages.filter((v) => !v.under_construction && (v.level || 1) < 3);
        if (!ready.length) return;
        await call(ddp, 'upgradeVillage', gameId, pick(ready)._id);
      }],
      [1, 'home', async () => {
        const away = idle.filter((a) => castle && (a.x != castle.x || a.y != castle.y));
        if (!away.length) return;
        await call(ddp, 'armies.returnToCastle', {armyId: pick(away)._id});
      }],
      [1, 'garrison', async () => {
        const home = idle.filter((a) => castle && a.x == castle.x && a.y == castle.y);
        if (!home.length) return;
        await call(ddp, 'armies.joinBuilding', {armyId: pick(home)._id});
      }],
      [0.5, 'split', async () => {
        const big = idle.filter((a) => a.footmen >= 4 || a.cavalry >= 4);
        if (!big.length) return;
        const army = pick(big);
        await call(ddp, 'splitArmy', gameId, army._id, {footmen: Math.floor((army.footmen || 0) / 2), cavalry: Math.floor((army.cavalry || 0) / 2)});
      }],
      [0.5, 'combine', async () => {
        const stacked = idle.filter((a) => idle.some((b) => b._id != a._id && b.x == a.x && b.y == a.y));
        if (!stacked.length) return;
        await call(ddp, 'armies.combineArmies', {gameId, armyId: pick(stacked)._id});
      }],
      [0.3, 'halt', async () => {
        const moving = armies.filter((a) => this.isMoving(a));
        if (!moving.length) return;
        await call(ddp, 'armies.stopMoving', {armyId: pick(moving)._id});
      }],
      [0.1, 'disband', async () => {
        const small = idle.filter((a) => this.soldiersIn(a) <= 3);
        if (!small.length) return;
        await call(ddp, 'disbandArmy', gameId, pick(small)._id);
      }],
      [1, 'chat', async () => {
        const rooms = ddp.find('rooms', (r) => r.gameId == gameId);
        if (!rooms.length) return;
        const room = pick(rooms);
        await call(ddp, 'addChatToRoom', gameId, room._id, pick(['hello', 'gg', 'nice try', 'come at me', 'truce?', 'my castle is not for sale']) + ' #' + between(1, 9999));
      }],
      [0.2, 'room', async () => {
        const others = ddp.find('castles', (c) => c.playerId != me._id && c.username);
        if (!others.length) return;
        await call(ddp, 'startChatroomWith', gameId, pick(others).username);
      }],
      [0.5, 'gold', async () => {
        // the game only lets gold go down to vassals
        const to = me.vassals && me.vassals.length && pick(me.vassals);
        if (!to || me.gold < 50) return;
        await call(ddp, 'send_gold_to', gameId, to, between(1, 20));
      }],
      [0.5, 'alerts', async () => {
        await call(ddp, 'markAllAlertsAsRead', me._id);
      }],
      [1, 'click', async () => {
        // look at someone's castle the way the right panel does, then close it
        const others = ddp.find('castles', (c) => c.playerId != me._id);
        if (!others.length) return;
        const c = pick(others);
        const ids = await Promise.all([
          subscribe(ddp, 'castleForHexInfo', c._id),
          subscribe(ddp, 'gamePiecesAtHex', gameId, c.x, c.y),
          subscribe(ddp, 'rightPanelPlayers', c.playerId),
          subscribe(ddp, 'battle_notifications_at_hex', gameId, c.x, c.y)
        ]);
        await sleep(between(2, 8) * 1000);
        ids.forEach((id) => id && ddp.unsubscribe(id));
      }],
      [0.5, 'scroll', async () => {
        await this.lookAround(me);
      }]
    ];

    const total = actions.reduce((sum, a) => sum + a[0], 0);
    let roll = random() * total;
    for (const [weight, name, fn] of actions) {
      roll -= weight;
      if (roll <= 0) {
        await fn();
        return name;
      }
    }
  }
}

// --- spectators: signed out, watching the map ---

const spectator = async (index) => {
  while (!shared.done) {
    const ddp = await connect(null);
    const until = Date.now() + between(5, 20) * 60 * 1000;
    let subs = [];
    while (!shared.done && !ddp.closed && Date.now() < until) {
      if (shared.gameId) {
        subs.forEach((id) => ddp.unsubscribe(id));
        subs = [await subscribe(ddp, 'game', shared.gameId), await subscribe(ddp, 'countryIndex', shared.gameId)];
        const countries = ddp.find('countryindex', (c) => c.gameId == shared.gameId);
        for (let i = 0; i < 3 && countries.length; i++) subs.push(await subscribe(ddp, 'countryOnScreen', pick(countries)._id));
        subs = subs.filter(Boolean);
      }
      await sleep(between(30, 90) * 1000);
    }
    ddp.close();
    if (!shared.done) await sleep(between(5, 30) * 1000);
  }
};

const play = async () => {
  const endAt = Date.now() + MINUTES * 60 * 1000;
  log('play', {bots: BOTS, spectators: SPECTATORS, minutes: MINUTES, seed: SEED});
  const sampler = setInterval(() => {
    writeStats();
    log('sample', {serverErrors: stats.serverErrorCount, reconnects: stats.reconnects, games: stats.games.length,
      calls: Object.values(stats.methods).reduce((sum, m) => sum + m.ok + Object.values(m.refused).reduce((a, b) => a + b, 0), 0)});
  }, 60000);
  const adminDone = admin().catch((e) => { log('adminError', {error: e.stack || e.message}); stats.adminError = e.message; });
  const bots = Array.from({length: BOTS}, (_, i) => new Bot(i).run().catch((e) => log('botFailed', {bot: botName(i), error: e.stack || e.message})));
  const watchers = Array.from({length: SPECTATORS}, (_, i) => spectator(i).catch((e) => log('spectatorFailed', {error: e.message})));
  while (Date.now() < endAt) await sleep(5000);
  shared.done = true;
  await Promise.race([Promise.all([adminDone].concat(bots, watchers)), sleep(120000)]);
  clearInterval(sampler);
  stats.endedAt = new Date().toISOString();
  writeStats();
  log('done', {serverErrors: stats.serverErrorCount});
  process.exit(0);
};

const mode = process.argv[2];
(mode == 'accounts' ? makeAccounts() : mode == 'play' ? play() : Promise.reject(new Error('usage: node soak.js accounts|play')))
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
  });
