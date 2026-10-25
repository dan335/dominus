// Armies and their moves, with clicks in the army panel (upgrade PR 13a).
// hireArmy and the path methods run a simulation in the browser and the rest
// on the server; splitArmy and disbandArmy only run on the server. The tests
// check the page and what the server kept.
const { test, expect, server, signIn, openGame } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const J = JSON.stringify;
const findOne = (collection, selector) => server(`dTest.e2e.findOne(${J(collection)}, ${J(selector)})`);
const soldiers = (doc) => [doc.footmen, doc.archers];

test('split an army in two, refuse a split that takes every soldier, and disband the new one', async ({ page }) => {
  const w = server("dTest.e2e.world(['captain'])");
  const me = w.players.captain;
  const hex = server(`dTest.e2e.freeHexNear(${J(w.gameId)}, ${me.castle.x}, ${me.castle.y}, 2)`);
  const army = server(`dTest.e2e.makeArmy(${J(me.playerId)}, {footmen: 4, archers: 2}, ${hex.x}, ${hex.y})`);

  await signIn(page, me.username);
  await openGame(page, w.gameId);
  await page.goto(`/game/${w.gameId}/army/${hex.x}/${hex.y}/${army}`);
  await expect(page.locator('#rp_info_army')).toBeVisible();

  // the split panel starts at half of each type
  await page.click('#split_armies_button');
  await expect(page.locator('#rp_split_armies')).toBeVisible();
  await page.click('#split_confirm_button');
  await expect(page).not.toHaveURL(new RegExp(`/${army}$`));
  const newId = page.url().split('/').pop();
  const made = findOne('Armies', newId);
  expect(soldiers(made)).toEqual([2, 1]);
  expect([made.x, made.y]).toEqual([hex.x, hex.y]);
  expect(soldiers(findOne('Armies', army))).toEqual([2, 1]);
  await expect(page.locator('#rp_info_army')).toBeVisible();

  // taking every soldier is refused, with the server's message
  await page.click('#split_armies_button');
  await expect(page.locator('#rp_split_armies')).toBeVisible();
  await page.locator('.split_units_slider[data-type=footmen]').fill('2');
  await page.locator('.split_units_slider[data-type=archers]').fill('1');
  await page.click('#split_confirm_button');
  await expect(page.locator('#split_error')).toHaveText('Could not split army.');
  expect(soldiers(findOne('Armies', newId))).toEqual([2, 1]);
  await page.click('#split_cancel_button');
  await expect(page.locator('#rp_info_army')).toBeVisible();

  // disband it
  await page.click('#disband_army_button');
  await expect(page.locator('#rp_disbandArmy')).toBeVisible();
  await page.click('#disband_army_button_yes');
  await expect.poll(() => findOne('Armies', newId)).toBeFalsy();
  expect(soldiers(findOne('Armies', army))).toEqual([2, 1]);
});

test('the move list: reorder, remove, delay and resume an army\'s moves', async ({ page }) => {
  const w = server("dTest.e2e.world(['pathfinder'])");
  const me = w.players.pathfinder;
  const start = server(`dTest.e2e.freeHexNear(${J(w.gameId)}, ${me.castle.x}, ${me.castle.y}, 2)`);
  const army = server(`dTest.e2e.makeArmy(${J(me.playerId)}, {footmen: 2}, ${start.x}, ${start.y})`);
  // three far away moves, so the army doesn't get to the first while the test runs
  const to = [4, 5, 6].map((d) => server(`dTest.e2e.freeHexNear(${J(w.gameId)}, ${start.x}, ${start.y}, ${d})`));
  const ids = to.map((h) => server(`dTest.e2e.sendArmy(${J(army)}, ${h.x}, ${h.y})`));
  const order = () => server(`dTest.e2e.paths(${J(army)})`).map((p) => ids.indexOf(p._id) + ':' + p.index);
  const rows = page.locator('#rp_info_army_paths tbody tr').filter({ has: page.locator('.removeArmyPathButton') });
  const listed = (n) => to[n].x + ', ' + to[n].y;

  await signIn(page, me.username);
  await openGame(page, w.gameId);
  await page.goto(`/game/${w.gameId}/army/${start.x}/${start.y}/${army}`);
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('0. ' + listed(0));

  // first move down: the first two swap
  await rows.nth(0).locator('.downArmyPathButton').click();
  await expect(rows.nth(0)).toContainText('0. ' + listed(1));
  await expect(rows.nth(1)).toContainText('1. ' + listed(0));
  await expect.poll(order).toEqual(['1:0', '0:1', '2:2']);

  // last move up: the last two swap
  await rows.nth(2).locator('.upArmyPathButton').click();
  await expect(rows.nth(1)).toContainText('1. ' + listed(2));
  await expect.poll(order).toEqual(['1:0', '2:1', '0:2']);

  // remove the first: the rest are numbered from 0 again
  await rows.nth(0).locator('.removeArmyPathButton').click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('0. ' + listed(2));
  await expect.poll(order).toEqual(['2:0', '0:1']);

  // delay the next move, then resume
  await page.click('#pauseMovementButton');
  await expect(page.locator('#resumeMovementButton')).toBeVisible();
  await expect.poll(() => server(`dTest.e2e.paths(${J(army)})`).map((p) => p.paused)).toEqual([true, true]);
  await page.click('#resumeMovementButton');
  await expect(page.locator('#pauseMovementButton')).toBeVisible();
  await expect.poll(() => server(`dTest.e2e.paths(${J(army)})`).map((p) => p.paused)).toEqual([false, false]);
});

test('hire what you are short of resources for: the shortfall is bought with gold, and with no gold the panel offers none', async ({ page }) => {
  const w = server("dTest.e2e.world(['quartermaster'])");
  const me = w.players.quartermaster;
  const castle = () => findOne('Castles', me.castle._id);
  const footmenBefore = castle().footmen;
  server(`dTest.e2e.setResources(${J(me.playerId)}, {gold: 100000, grain: 1000, ore: 40})`);

  await signIn(page, me.username);
  await openGame(page, w.gameId);

  const footmenRow = () => page.locator('#rp_hire_army tr', { hasText: 'Footmen' }).first();
  const openHire = async () => {
    await page.click('#hire_army_from_castle_button');
    await expect(page.locator('#rp_hire_army')).toBeVisible();
  };

  // a footman costs 100 ore: 60 are bought on the market
  await openHire();
  await footmenRow().locator('.hireUnitsInput').fill('1');
  await expect(footmenRow()).toContainText('selected: 1');
  await page.click('#hire_army_hire_button');
  await expect(page.locator('#rp_info_castle')).toBeVisible();
  await expect.poll(() => castle().footmen).toBe(footmenBefore + 1);
  const player = findOne('Players', me.playerId);
  expect([player.ore, player.grain]).toEqual([0, 1000 - 22]);
  expect(player.gold).toBeLessThan(100000);

  // with no gold to buy the ore, the panel offers no footmen (the server's
  // refusal is in server/armyContractTests.js)
  server(`dTest.e2e.setResources(${J(me.playerId)}, {gold: 0, grain: 1000, ore: 40})`);
  await openHire();
  await expect(footmenRow()).toContainText('max: 0');
});
