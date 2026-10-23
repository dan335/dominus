// Playing: hiring soldiers, making an army and marching it, all with clicks
// in the game's panels. The server fixtures (server/lib/testRunnerE2e.js)
// make the game and read back what the clicks did.
const { test, expect, server, signIn, openGame, openLeftPanel } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const castleOf = (castleId) => server(`dTest.e2e.findOne('Castles', ${JSON.stringify(castleId)})`);

test('hire soldiers, make an army and march it to another hex', async ({ page }) => {
  const w = server("dTest.e2e.world(['general'])");
  const me = w.players.general;
  server(`dTest.e2e.setResources(${JSON.stringify(me.playerId)}, {gold: 1000, grain: 1000, lumber: 1000, ore: 1000, wool: 1000, clay: 1000, glass: 1000})`);
  const footmenBefore = castleOf(me.castle._id).footmen;

  await signIn(page, me.username);
  await openGame(page, w.gameId);

  // hire 5 footmen
  await page.click('#hire_army_from_castle_button');
  await expect(page.locator('#rp_hire_army')).toBeVisible();
  const hireRow = page.locator('#rp_hire_army tr', { hasText: 'Footmen' }).first();
  await hireRow.locator('.hireUnitsInput').fill('5');
  await expect(hireRow).toContainText('selected: 5');
  await page.click('#hire_army_hire_button');
  await expect(page.locator('#rp_info_castle')).toBeVisible();
  await expect.poll(() => castleOf(me.castle._id).footmen).toBe(footmenBefore + 5);
  const player = server(`dTest.e2e.findOne('Players', ${JSON.stringify(me.playerId)})`);
  // footmen cost 22 grain and 100 ore each (packages/dominus-settings/settingsArmies.js)
  expect([player.grain, player.ore, player.gold]).toEqual([1000 - 5 * 22, 1000 - 5 * 100, 1000]);

  // an army of 3 of them
  await page.click('#createArmycastleButton');
  await expect(page.locator('#rp_createArmy')).toBeVisible();
  const armyRow = page.locator('#rp_createArmy tr', { hasText: 'Footmen' }).first();
  await armyRow.locator('.setNumSoldierInput').fill('3');
  await expect(armyRow).toContainText('selected: 3');
  await page.click('#createArmyButton');
  await expect(page.locator('#rp_info_army')).toBeVisible();
  const army = server(`dTest.e2e.findOne('Armies', {playerId: ${JSON.stringify(me.playerId)}})`);
  expect(army.footmen).toBe(3);
  expect([army.x, army.y]).toEqual([me.castle.x, me.castle.y]);
  await expect.poll(() => castleOf(me.castle._id).footmen).toBe(footmenBefore + 2);

  // march it two hexes away by typing the coordinates
  const to = server(`dTest.e2e.freeHexNear(${JSON.stringify(w.gameId)}, ${me.castle.x}, ${me.castle.y}, 2)`);
  await page.click('#move_army_button');
  await expect(page.locator('#rp_moveArmy')).toBeVisible();
  await page.fill('#xCoordInput', String(to.x));
  await page.fill('#yCoordInput', String(to.y));
  await page.click('#coordSubmitButton');
  await expect.poll(() => server(`dTest.e2e.findOne('Armypaths', {armyId: ${JSON.stringify(army._id)}, x: ${to.x}, y: ${to.y}})`)).toBeTruthy();

  // the worker moves it once its moves are due
  await expect.poll(() => {
    server(`dTest.e2e.hurryArmies(${JSON.stringify(w.gameId)})`);
    const a = server(`dTest.e2e.findOne('Armies', ${JSON.stringify(army._id)})`);
    return [a.x, a.y];
  }, { timeout: 60000, intervals: [2000] }).toEqual([to.x, to.y]);
});

test('buy and sell at the market, and the price moves', async ({ page }) => {
  const w = server("dTest.e2e.world(['trader'])");
  const me = w.players.trader;
  server(`dTest.e2e.setResources(${JSON.stringify(me.playerId)}, {gold: 1000, grain: 1000, lumber: 1000, ore: 1000, wool: 1000, clay: 1000, glass: 1000})`);
  const playerDoc = () => server(`dTest.e2e.findOne('Players', ${JSON.stringify(me.playerId)})`);
  const orePrice = () => server(`dTest.e2e.findOne('Market', {gameId: ${JSON.stringify(w.gameId)}, type: 'ore'})`).price;

  await signIn(page, me.username);
  await openGame(page, w.gameId);
  await openLeftPanel(page, 'fa-money', 'market_panel');
  const priceCell = page.locator('#market_panel td', { hasText: /^Ore$/ }).locator('xpath=following-sibling::td[1]');
  const shownPrice = async () => parseFloat(await priceCell.innerText());
  const priceBefore = orePrice();
  expect(await shownPrice()).toBeCloseTo(priceBefore, 2);

  // buy 10 ore
  await page.check('.resourseTypeRadio[value="ore"]');
  await page.fill('#marketQuantityInput', '10');
  const offer = page.locator('.marketText').first();
  await expect(offer).toContainText('Buy 10 ore for');
  const quoted = parseFloat((await offer.innerText()).match(/for ([\d.]+) gold/)[1]);
  await page.click('#marketBuyButton');
  await expect(page.locator('#marketSuccessAlert')).toContainText('Bought 10 ore for');
  let p = playerDoc();
  expect(p.ore).toBe(1010);
  expect(1000 - p.gold).toBeCloseTo(quoted, 1);

  // buying pushed the price up, and the panel shows the new price
  const priceAfter = orePrice();
  expect(priceAfter).toBeGreaterThan(priceBefore);
  await expect.poll(shownPrice).toBeCloseTo(priceAfter, 2);

  // sell 10 wool
  const goldBefore = p.gold;
  await page.check('.resourseTypeRadio[value="wool"]');
  await page.fill('#marketQuantityInput', '10');
  await page.click('#marketSellButton');
  await expect(page.locator('#marketSuccessAlert')).toContainText('Sold 10 wool for');
  p = playerDoc();
  expect(p.wool).toBe(990);
  expect(p.gold).toBeGreaterThan(goldBefore);
});
