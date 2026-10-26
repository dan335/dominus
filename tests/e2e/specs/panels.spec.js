// The welcome screen, the summary panel's groups and renaming, each a method
// with a simulation that the browser calls without waiting
// (dFunc.callAndForget, dFunc.callWithCallback; upgrade PR 17).
const { test, expect, server, signIn, openGame, openLeftPanel } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const J = JSON.stringify;

test('the welcome screen stays closed, and the summary panel\'s groups fold and unfold', async ({ page }) => {
  const w = server("dTest.e2e.world(['folder'])");
  const me = w.players.folder;
  const player = () => server(`dTest.e2e.findOne('Players', ${J(me.playerId)})`);
  expect(player().show_welcome_screen).toBe(true);

  await signIn(page, me.username);
  await openGame(page, w.gameId);
  await expect.poll(() => player().show_welcome_screen).toBe(false);

  // closed for good: not shown again on the next visit
  await page.reload();
  await expect(page.locator('#rp_info_castle')).toBeVisible();
  await expect(page.locator('#welcome_screen')).toHaveCount(0);

  await openLeftPanel(page, 'fa-bars', 'summary_panel');
  for (const [link, flag] of [['#armies_group_link', 'lp_show_armies'], ['#lords_group_link', 'lp_show_lords'], ['#allies_group_link', 'lp_show_allies']]) {
    expect(player()[flag]).toBe(true);
    await page.click(link);
    await expect.poll(() => player()[flag]).toBe(false);
    await page.click(link);
    await expect.poll(() => player()[flag]).toBe(true);
  }
});

test('rename your castle from its panel; a name that is too long shows the error and changes nothing', async ({ page }) => {
  const w = server("dTest.e2e.world(['namer'])");
  const me = w.players.namer;
  const castle = () => server(`dTest.e2e.findOne('Castles', ${J(me.castle._id)})`);
  const before = castle().name;

  await signIn(page, me.username);
  await openGame(page, w.gameId);

  await page.locator('#rp_info_castle .edit_name_button').click();
  await expect(page.locator('#edit_name_input')).toHaveValue(before);
  await page.fill('#edit_name_input', 'x'.repeat(31));
  await page.click('#edit_name_button');
  await expect(page.locator('#edit_name_error_alert')).toBeVisible();
  await expect(page.locator('#edit_name_error_alert')).toContainText('Name must be less than 30 characters.');
  await expect(page.locator('#edit_name_button')).toBeEnabled();
  expect(castle().name).toBe(before);

  // extra spaces are taken out
  await page.fill('#edit_name_input', '  E2E   Renamed  Keep ');
  await page.click('#edit_name_button');
  await expect(page.locator('#rp_info_castle')).toBeVisible();
  await expect.poll(() => castle().name).toBe('E2E Renamed Keep');
  await expect(page.locator('#rp_info_castle')).toContainText('E2E Renamed Keep');
});
