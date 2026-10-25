// Villages, sending gold and the in-game settings, with clicks in the game's
// panels (upgrade PR 11). Each of these methods runs a simulation in the
// browser and the rest on the server, so the tests check the page and what
// the server kept.
const { test, expect, server, signIn, openGame, openLeftPanel } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const J = JSON.stringify;
const findOne = (collection, selector) => server(`dTest.e2e.findOne(${J(collection)}, ${J(selector)})`);
const plenty = { gold: 5000, grain: 5000, lumber: 5000, ore: 5000, wool: 5000, clay: 5000, glass: 5000 };

test('build a village with an army on a grain hex, then upgrade and destroy a finished one', async ({ page }) => {
  const w = server("dTest.e2e.world(['reeve'])");
  const me = w.players.reeve;
  server(`dTest.e2e.setResources(${J(me.playerId)}, ${J(plenty)})`);
  const hex = server(`dTest.e2e.freeHexNear(${J(w.gameId)}, ${me.castle.x}, ${me.castle.y}, 2, 'grain')`);
  const army = server(`dTest.e2e.makeArmy(${J(me.playerId)}, {footmen: 3}, ${hex.x}, ${hex.y})`);

  await signIn(page, me.username);
  await openGame(page, w.gameId);

  // build: the army joins the new village, and the panel shows it
  await page.goto(`/game/${w.gameId}/army/${hex.x}/${hex.y}/${army}`);
  await expect(page.locator('#rp_info_army')).toBeVisible();
  await page.click('#build_village_button');
  await expect(page).toHaveURL(new RegExp(`/game/${w.gameId}/village/${hex.x}/${hex.y}/\\w+$`));
  const built = findOne('Villages', { playerId: me.playerId, x: hex.x, y: hex.y });
  expect(page.url().endsWith('/' + built._id)).toBe(true);
  expect([built.level, built.under_construction, built.footmen]).toEqual([0, true, 3]);
  expect(findOne('Armies', army)).toBeFalsy();
  const cost = server('_s.villages.cost.level1');
  const player = findOne('Players', me.playerId);
  expect([player.grain, player.glass, player.gold]).toEqual([5000 - cost.grain, 5000 - cost.glass, 5000]);

  // upgrade a finished village from its panel
  const at = server(`dTest.e2e.freeHexNear(${J(w.gameId)}, ${me.castle.x}, ${me.castle.y}, 2)`);
  const village = server(`dTest.e2e.makeVillage(${J(me.playerId)}, ${at.x}, ${at.y})`);
  await page.goto(`/game/${w.gameId}/village/${at.x}/${at.y}/${village}`);
  await expect(page.locator('#rp_info_village')).toBeVisible();
  await page.click('#rp_info_village #upgradeVillageButton');
  await expect(page.locator('#rp_village_upgrade')).toBeVisible();
  await page.click('#rp_village_upgrade #upgradeVillageButton');
  await expect(page.locator('#rp_info_village')).toBeVisible();
  // under construction, or already level 2 if the worker finished it (a fast game builds in seconds)
  await expect.poll(() => { const v = findOne('Villages', village); return v.under_construction || v.level == 2; }).toBe(true);
  expect(findOne('Players', me.playerId).grain).toBe(player.grain - server(`_gs.villages(${J(w.gameId)}, 'cost.level2.grain')`));

  // and destroy it
  await page.click('#destroy_village_button');
  await expect(page.locator('#rp_destroy_village_confirm')).toBeVisible();
  await page.click('#destroy_village_button_yes');
  await expect.poll(() => findOne('Villages', village), { timeout: 30000 }).toBeFalsy();
  expect(findOne('Hexes', { gameId: w.gameId, x: at.x, y: at.y }).hasBuilding).toBe(false);
});

test('send gold to a vassal from their castle\'s panel; too much is refused with a message', async ({ page }) => {
  const w = server("dTest.e2e.world(['liege', 'thane'])");
  const me = w.players.liege;
  const vassal = w.players.thane;
  expect(server(`dTest.e2e.makeVassal(${J(me.playerId)}, ${J(vassal.playerId)})`)).toContain(vassal.playerId);
  server(`dTest.e2e.setResources(${J(me.playerId)}, {gold: 500})`);
  server(`dTest.e2e.setResources(${J(vassal.playerId)}, {gold: 0})`);

  await signIn(page, me.username);
  await openGame(page, w.gameId);
  await page.goto(`/game/${w.gameId}/castle/${vassal.castle.x}/${vassal.castle.y}/${vassal.castle._id}`);
  await expect(page.locator('#rp_info_castle')).toBeVisible();
  // The send gold panel reads the castle from the map's castles. The test
  // game's map isn't baked, so the map doesn't load them here; the castle
  // panel's own subscription stops when the panel closes. Hold one open.
  await page.evaluate((c) => { Meteor.subscribe('gamePiecesAtHex', c.gameId, c.x, c.y); }, { gameId: w.gameId, x: vassal.castle.x, y: vassal.castle.y });
  await expect.poll(() => page.evaluate((id) => !!Castles.findOne(id), vassal.castle._id)).toBe(true);
  await page.click('#send_gold_button');
  await expect(page.locator('#how_much_input')).toBeVisible();

  await page.fill('#how_much_input', '501');
  await page.click('#send_gold_submit_button');
  await expect(page.locator('#send_gold_error_alert')).toHaveText('You do not have enough gold.');
  expect(findOne('Players', me.playerId).gold).toBe(500);

  await page.fill('#how_much_input', '100');
  await page.click('#send_gold_submit_button');
  await expect(page.locator('#rp_info_castle')).toBeVisible();
  // the vassal gets it less the tax
  const tax = server('_s.income.sendToVassalTax');
  await expect.poll(() => findOne('Players', vassal.playerId).gold).toBe(100 - 100 * tax);
  expect(findOne('Players', me.playerId).gold).toBe(400);
});

test('in-game settings: rename yourself, toggle the coordinates and the mini-map, and activate a pro token', async ({ page }) => {
  const w = server("dTest.e2e.world(['steward', 'bailiff'])");
  const me = w.players.steward;
  server(`dTest.e2e.setUser(${J(me.userId)}, {proTokens: 1})`);
  const mine = () => findOne('Players', me.playerId);

  await signIn(page, me.username);
  await openGame(page, w.gameId);
  await openLeftPanel(page, 'fa-wrench', 'settings_panel');

  // coordinates and mini-map
  const before = mine();
  await page.click('#toggle_coords_button');
  await expect.poll(() => mine().sp_show_coords).toBe(!before.sp_show_coords);
  await page.click('#toggle_minimap_button');
  await expect.poll(() => mine().sp_show_minimap).toBe(!before.sp_show_minimap);
  await page.click('#toggle_coords_button');
  await expect.poll(() => mine().sp_show_coords).toBe(!!before.sp_show_coords);

  // a name another player has is refused by the server, with its message
  await page.fill('#change_username_input', w.players.bailiff.username);
  await page.click('#change_username_button');
  await expect(page.locator('#change_username_alert')).toHaveText('A player exists with this username, try another.');
  expect(mine().username).toBe(me.username);

  // a new name is copied to the castle
  await page.fill('#change_username_input', 'e2e Steward Two');
  await page.click('#change_username_button');
  await expect.poll(() => mine().username).toBe('e2e Steward Two');
  await expect(page.locator('#change_username_alert')).toBeHidden();
  expect(findOne('Castles', me.castle._id).username).toBe('e2e Steward Two');

  // a pro token makes you pro in this game
  await page.click('#activateProButton');
  await expect(page.locator('#settings_panel')).toContainText('Pro account already activated in this game.');
  await expect.poll(() => mine().pro).toBe(true);
  expect(findOne('users', me.userId).proTokens).toBe(0);
});
