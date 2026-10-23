// Watching a game you aren't playing: anyone, even signed out, can open it
// and see it move, and nothing they do changes it (server/methodGate.js).
const { test, expect, server, signIn, openLeftPanel } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const ACTION_BUTTONS = ['#hire_army_from_castle_button', '#createArmycastleButton', '#send_gold_button'];

// what a spectator's calls could have changed
const gameState = (w) => {
  const p = w.players.watched;
  return server(`[dTest.e2e.findOne('Castles', ${JSON.stringify(p.castle._id)}), dTest.e2e.findOne('Players', ${JSON.stringify(p.playerId)}), dTest.e2e.findOne('Armies', {gameId: ${JSON.stringify(w.gameId)}})]`);
};

// opens the castle's panel by clicking it on the map, after centring the map
// on it (a spectator's map starts somewhere else, and the castle can end up
// under the spectator banner)
async function clickCastle(page, castle) {
  await page.evaluate(([x, y]) => dHexmap.centerOnHex(x, y), [castle.x, castle.y]);
  await page.locator(`.castle[data-id="${castle._id}"]`).click();
  await expect(page.locator('#rp_info_castle')).toBeVisible();
}

// calls a method from the page the way the panels do, and returns the error
function callFromPage(page, name, args) {
  return page.evaluate(([name, args]) => new Promise((resolve) => {
    Meteor.apply(name, args, {}, (error) => resolve(error ? {error: error.error, reason: error.reason} : null));
  }), [name, args]);
}

for (const who of ['signed out', 'signed in']) {
  test(`${who}, you can look at a castle but not act on it`, async ({ page }) => {
    server('dTest.e2e.reset()');
    const w = server("dTest.e2e.world(['watched'])");
    const castle = w.players.watched.castle;
    if (who == 'signed in') {
      server("dTest.e2e.user('onlooker')");
      await signIn(page, 'e2e_onlooker');
    }

    await page.goto('/game/' + w.gameId);
    await expect(page.locator('#spectatorBanner')).toContainText('Spectating E2E watched');
    expect(await page.evaluate(() => [Session.get('gameViewMode'), Session.get('playerId') || null])).toEqual(['spectator', null]);

    await clickCastle(page, castle);
    await expect(page.locator('#rp_info_castle')).toContainText(castle.name);
    await expect(page.locator('#rp_info_castle')).toContainText('e2e_watched');
    for (const button of ACTION_BUTTONS) await expect(page.locator(button)).toHaveCount(0);

    // the market shows its prices, but not the buy and sell form
    await openLeftPanel(page, 'fa-money', 'market_panel');
    await expect(page.locator('#market_panel')).toContainText('Current Prices');
    await expect(page.locator('#marketBuyButton')).toHaveCount(0);
    // and the panels that need a castle aren't offered
    await expect(page.locator('.gameLeftMenuPanelIcon .fa-comments')).toHaveCount(0);

    // calling the methods the hidden buttons would call is refused, and
    // changes nothing
    const before = gameState(w);
    const hire = await callFromPage(page, 'hireArmy', [w.gameId, {footmen: 1}, castle._id, 'castle']);
    const create = await callFromPage(page, 'createArmyFromBuilding', [w.gameId, 'castle', castle._id, {footmen: 1}]);
    const buy = await callFromPage(page, 'buy_resource', [w.gameId, 'ore', 10]);
    expect(hire && hire.error).toBe('not-authorized');
    expect(create && create.error).toBe('not-authorized');
    expect(buy && buy.error).toBe('not-authorized');
    expect(gameState(w)).toEqual(before);
  });
}

test('a spectator sees armies appear and move as they happen', async ({ page }) => {
  server('dTest.e2e.reset()');
  const w = server("dTest.e2e.world(['watched'])");
  const p = w.players.watched;
  await page.goto('/game/' + w.gameId);
  await expect(page.locator('#spectatorBanner')).toBeVisible();
  await expect(page.locator(`.castle[data-id="${p.castle._id}"]`)).toBeVisible();

  const armyId = server(`dTest.e2e.makeArmy(${JSON.stringify(p.playerId)}, {footmen: 4}, ${p.castle.x}, ${p.castle.y})`);
  const army = page.locator(`.armyMapObject[data-id="${armyId}"]`);
  await expect(army).toHaveAttribute('data-x', String(p.castle.x));
  await expect(army).toHaveAttribute('data-y', String(p.castle.y));

  const to = server(`dTest.e2e.freeHexNear(${JSON.stringify(w.gameId)}, ${p.castle.x}, ${p.castle.y}, 1)`);
  server(`dTest.e2e.sendArmy(${JSON.stringify(armyId)}, ${to.x}, ${to.y})`);
  await expect.poll(async () => {
    server(`dTest.e2e.hurryArmies(${JSON.stringify(w.gameId)})`);
    return [await army.getAttribute('data-x'), await army.getAttribute('data-y')];
  }, { timeout: 60000, intervals: [2000] }).toEqual([String(to.x), String(to.y)]);
});
