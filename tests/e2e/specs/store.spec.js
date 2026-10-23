// The store, without paying: Stripe is cut off (lib/fixtures.js), so nothing
// here clicks a purchase button. Purchases are set by a fixture instead.
const { test, expect, server, signIn, openGame } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const OWNED = ['castle_02_keep', 'castle_03_skull'];

test('the store marks the castles you own and offers the rest', async ({ page }) => {
  const user = server("dTest.e2e.user('shopper')");
  server(`dTest.e2e.setPurchases(${JSON.stringify(user._id)}, {castles: ${JSON.stringify(OWNED)}})`);
  await signIn(page, 'e2e_shopper');
  await page.goto('/store');

  const forSale = await page.evaluate(() => _s.store.castles.types_not_free.map((id) => _s.store.castles[id].name));
  const items = page.locator('.storePanelItem');
  await expect(items).toHaveCount(forSale.length);
  const skull = await page.evaluate(() => _s.store.castles.castle_03_skull.name);
  for (const name of forSale) {
    const item = items.filter({ has: page.locator('h4', { hasText: new RegExp('^' + name + '$') }) });
    if (name == skull) {
      await expect(item.locator('button')).toHaveText('Purchased');
      await expect(item.locator('button')).toBeDisabled();
    } else {
      await expect(item.locator('.store_purchase_button')).toHaveText(/^Purchase for \$\d+(\.\d+)?$/);
    }
  }
});

// PR #71 (Oct 2026): choosing a castle image sent the wrong id and did nothing
test('a castle image you own can be put on your castle', async ({ page }) => {
  const w = server("dTest.e2e.world(['builder'])");
  const me = w.players.builder;
  server(`dTest.e2e.setPurchases(${JSON.stringify(me.userId)}, {castles: ${JSON.stringify(OWNED)}})`);
  const castleImage = () => server(`dTest.e2e.findOne('Castles', ${JSON.stringify(me.castle._id)})`).image;
  expect(castleImage()).toBe('castle_02_keep');

  await signIn(page, me.username);
  await openGame(page, w.gameId);
  const panel = page.locator('#rp_info_castle');
  await expect(panel).toContainText('Set Castle Image');
  await expect(panel.locator('.image_radios')).toHaveCount(OWNED.length);
  await expect(panel.locator('.image_radios[value="castle_02_keep"]')).toBeChecked();
  await panel.locator('.image_radios[value="castle_03_skull"]').check();
  await expect.poll(castleImage).toBe('castle_03_skull');

  // and it is still chosen after a reload
  await page.reload();
  await expect(page.locator('#rp_info_castle .image_radios[value="castle_03_skull"]')).toBeChecked();
});
