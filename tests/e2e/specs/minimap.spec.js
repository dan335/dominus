// The minimap (upgrade PR 16). The worker draws it, as it does when a country
// is added: each country's border mask job, then the game's minimap job, which
// also sets the game's map size. The page then draws the countries and the
// player's castle on it, and clicking it moves the map.
const { test, expect, server, signIn, openGame } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const J = JSON.stringify;
const findOne = (collection, selector) => server(`dTest.e2e.findOne(${J(collection)}, ${J(selector)})`);

test('the worker draws the minimap, and the page shows the countries and the castle on it', async ({ page }) => {
  const w = server("dTest.e2e.world(['cartographer', 'other'])");
  const me = w.players.cartographer;
  expect(findOne('Games', w.gameId).minimap).toBeFalsy();

  const countries = server(`dTest.e2e.queueMinimap(${J(w.gameId)})`);
  expect(countries).toBeGreaterThan(0);
  await expect.poll(() => (findOne('Games', w.gameId).minimap || []).length, { timeout: 30000 }).toBe(countries);
  const game = findOne('Games', w.gameId);
  expect(game.map_size.maxX).toBeGreaterThan(game.map_size.minX);
  expect(findOne('Countries', { gameId: w.gameId }).paths.length).toBeGreaterThan(0);

  await signIn(page, me.username);
  await openGame(page, w.gameId);
  const paths = game.minimap.reduce((n, c) => n + c.country.length, 0);
  await expect(page.locator('#minimap .minimapPath')).toHaveCount(paths);
  await expect(page.locator('#minimap circle.minimap_castle').first()).toBeVisible();

  // a click on a country of the minimap, away from the castle, moves the map
  // there: the castle goes off its place on the screen
  const castle = page.locator(`.castle[data-id="${me.castle._id}"]`);
  await expect(castle).toBeVisible();
  const before = await castle.boundingBox();
  const spot = await page.evaluate(() => {
    const box = document.getElementById('minimap').getBoundingClientRect();
    const mine = document.querySelector('#minimap circle.minimap_castle').getBoundingClientRect();
    let best = null;
    for (let x = box.left + 4; x < box.right - 4; x += 6) {
      for (let y = box.top + 4; y < box.bottom - 4; y += 6) {
        const el = document.elementFromPoint(x, y);
        const d = Math.hypot(x - mine.x, y - mine.y);
        if (el && el.classList.contains('minimapPath') && (!best || d > best.d)) best = { x, y, d };
      }
    }
    return best;
  });
  expect(spot).not.toBeNull();
  await page.mouse.click(spot.x, spot.y);
  await expect.poll(async () => {
    const now = await castle.boundingBox();
    return !now || Math.hypot(now.x - before.x, now.y - before.y) > 50;
  }).toBe(true);
});
