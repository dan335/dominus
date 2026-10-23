// Moving around the map: zoom, the arrow buttons and keys, dragging, and
// going to a hex by its coordinates. Checked by where castles are drawn.
const { test, expect, server, signIn, openGame, allowPageErrors } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const box = async (locator) => {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, width: b.width };
};

test('zoom, and pan with the buttons, the keys and the mouse', async ({ page }) => {
  const w = server("dTest.e2e.world(['scout', 'faraway'])");
  const mine = page.locator(`.castle[data-id="${w.players.scout.castle._id}"]`);
  await signIn(page, 'e2e_scout');
  await openGame(page, w.gameId);
  await expect(mine).toBeVisible();

  // a new player starts zoomed all the way in: zooming out makes the castle
  // smaller, zooming in bigger again, up to the limit
  const start = await box(mine);
  await page.click('#decrease_scale_button');
  await page.click('#decrease_scale_button');
  await expect.poll(async () => (await box(mine)).width).toBeLessThan(start.width * 0.9);
  const zoomedOut = await box(mine);
  await page.click('#increase_scale_button');
  await expect.poll(async () => (await box(mine)).width).toBeGreaterThan(zoomedOut.width * 1.05);
  await page.click('#increase_scale_button');
  await expect.poll(async () => (await box(mine)).width).toBeCloseTo(start.width, 0);
  await page.click('#increase_scale_button');
  await page.waitForTimeout(300);
  expect((await box(mine)).width).toBeCloseTo(start.width, 0);

  // holding the right arrow button moves the view right, so the castle goes left
  let before = await box(mine);
  await page.locator('#move_grid_right_button').hover();
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await expect.poll(async () => (await box(mine)).x).toBeLessThan(before.x - 20);

  // the up arrow key moves the view up, so the castle goes down
  before = await box(mine);
  await page.locator('#mapEvents').hover({ position: { x: 300, y: 300 }, force: true });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowUp');
  await expect.poll(async () => (await box(mine)).y).toBeGreaterThan(before.y + 20);

  // dragging the map carries the castle with it
  before = await box(mine);
  const from = { x: before.x + 150, y: before.y + 150 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - 100, from.y - 60, { steps: 10 });
  await page.mouse.up();
  // (the drag starts after the first few pixels, so it lags the mouse a bit)
  const after = await box(mine);
  expect(Math.abs(after.x - (before.x - 100))).toBeLessThan(15);
  expect(Math.abs(after.y - (before.y - 60))).toBeLessThan(15);
});


// is the castle drawn in the middle of the map?
async function expectCentred(page, castle) {
  const size = await page.evaluate(() => Session.get('canvas_size'));
  const svg = await page.locator('#svg_container').boundingBox();
  const at = await box(castle);
  expect(Math.abs(at.x - (svg.x + size.width / 2))).toBeLessThan(at.width);
  expect(Math.abs(at.y - (svg.y + size.height / 2))).toBeLessThan(at.width);
}

test('typing a hex\'s coordinates goes there and selects what is on it', async ({ page }) => {
  const w = server("dTest.e2e.world(['walker', 'neighbour'])");
  await signIn(page, 'e2e_walker');
  await openGame(page, w.gameId);
  const hex = server(`dTest.e2e.freeHexNear(${JSON.stringify(w.gameId)}, ${w.players.neighbour.castle.x}, ${w.players.neighbour.castle.y}, 2)`);
  await page.fill('#move_grid_x', String(hex.x));
  await page.fill('#move_grid_y', String(hex.y));
  await page.click('#move_grid_goto_button');
  await expect(page).toHaveURL(new RegExp(`/game/${w.gameId}/hex/${hex.x}/${hex.y}$`));
  await expect(page.locator('#rp_info_hex')).toContainText(`${hex.x},${hex.y}`);
  const theirs = page.locator(`.castle[data-id="${w.players.neighbour.castle._id}"]`);
  await expect(theirs).toBeVisible();
});

// Known bug (Oct 2026): selecting a hex that has a castle or village on it
// switches to the building with dInit.select(type, this.x, this.y, id) in an
// autorun (game/rightPanels/client/rp_info_hex.js), where this is the
// Computation, so the URL gets undefined coordinates. The panel still shows
// the castle, but reloading that URL throws in the map's centring autorun and
// leaves the castle off screen. The fix is selected.x and selected.y; fixing it
// means changing this test to expect /castle/x/y/id and a centred map.
test('known bug: going to a castle\'s coordinates puts undefined in the URL', async ({ page }) => {
  allowPageErrors(page, /Match error: Expected Integer, got \{"\$InfNaN":0\}/);
  const w = server("dTest.e2e.world(['finder', 'target'])");
  const far = w.players.target.castle;
  const theirs = page.locator(`.castle[data-id="${far._id}"]`);
  await signIn(page, 'e2e_finder');
  await openGame(page, w.gameId);
  await page.fill('#move_grid_x', String(far.x));
  await page.fill('#move_grid_y', String(far.y));
  await page.click('#move_grid_goto_button');

  // the castle is selected and centred, but its URL has no coordinates
  await expect(page).toHaveURL(new RegExp(`/game/${w.gameId}/castle/undefined/undefined/${far._id}$`));
  await expect(page.locator('#rp_info_castle')).toContainText(far.name);
  await expectCentred(page, theirs);
  expect(await page.evaluate(() => Session.get('selected'))).toEqual({ type: 'castle', x: NaN, y: NaN, id: far._id });

  // so after a reload the map can't centre on it
  await page.reload();
  await expect(page.locator('#rp_info_castle')).toContainText(far.name);
  await page.waitForTimeout(2000);
  const at = await theirs.boundingBox();
  const svg = await page.locator('#svg_container').boundingBox();
  const size = await page.evaluate(() => Session.get('canvas_size'));
  const offCentre = Math.hypot(at.x + at.width / 2 - (svg.x + size.width / 2), at.y + at.height / 2 - (svg.y + size.height / 2));
  expect(offCentre).toBeGreaterThan(at.width);
});
