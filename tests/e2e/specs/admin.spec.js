// The control panel (/control): what an admin can do from it, and that
// nobody else can.
const { test, expect, server, signIn } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
// never leave the job queue paused for the specs that follow
test.afterEach(() => { server("Meteor.call('resumeJobQueue')"); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const queueSettings = () => server("_.pick(dTest.e2e.findOne('Settings', {}) || {}, 'isPaused', 'manualPause')");

test('an admin adds a game, it is listed as starting soon, and removes it again', async ({ page }) => {
  server("dTest.e2e.user('boss', {admin: true})");
  await signIn(page, 'e2e_boss');
  await page.goto('/control/games');
  await page.click('#addGameButton');
  await expect(page).toHaveURL(/\/control\/gamesAdd$/);
  await page.fill('#nameInput', 'E2E made by an admin');
  await page.fill('#descInput', 'A game far in the future.');
  await page.fill('#maxPlayers', '12');
  await page.fill('#gameStartDateInput', '2099-01-05');
  await page.fill('#gameStartTimeInput', '10:00');
  await page.check('#isSpeedCheckbox');
  await page.click('#addGameButton');
  await expect(page).toHaveURL(/\/control\/games$/);

  const row = page.locator('tr', { hasText: 'E2E made by an admin' });
  await expect(row).toContainText('0 / 12');
  const game = server("dTest.e2e.findOne('Games', {name: 'E2E made by an admin'})");
  expect([game.desc, game.maxPlayers, game.isSpeed, game.hasStarted]).toEqual(['A game far in the future.', 12, true, false]);
  expect(new Date(game.startAt).getUTCFullYear()).toBe(2099);

  await page.goto('/games');
  const soon = page.locator('#landingGames');
  await expect(soon).toContainText('Games Starting Soon');
  await expect(soon.locator('.landingGameContainer', { hasText: 'E2E made by an admin' })).toBeVisible();

  await page.goto('/control/games');
  await row.locator('#removeGameButton').click();
  await expect(row).toHaveCount(0);
  expect(server("dTest.e2e.findOne('Games', {name: 'E2E made by an admin'})")).toBeFalsy();
});

test('an admin pauses the job queue and unpauses it', async ({ page }) => {
  server("dTest.e2e.user('boss2', {admin: true})");
  await signIn(page, 'e2e_boss2');
  await page.goto('/control/kuestats');
  await page.click('#stopKueButton');
  await expect.poll(queueSettings).toEqual({ isPaused: true, manualPause: true });
  await expect(page.locator('#stopKueButton')).toHaveText('Pause Kue');
  await page.click('#startKueButton');
  await expect.poll(queueSettings).toEqual({ isPaused: false });
});

test('a player who is not an admin gets no control panel, and its methods refuse them', async ({ page }) => {
  server("dTest.e2e.user('nobody')");
  await signIn(page, 'e2e_nobody');
  await page.goto('/control/kuestats');
  await expect(page.locator('#control_container')).toBeVisible();
  await expect(page.locator('#stopKueButton')).toHaveCount(0);
  await expect(page.locator('#addGameButton')).toHaveCount(0);

  const before = queueSettings();
  const errors = await page.evaluate(() => Promise.all([
    ['pauseJobQueue'],
    ['addOrEditGame', 'E2E sneaky', 'no', 10, '2099-01-05 10:00', false, false, false, false, false, false, null]
  ].map((args) => new Promise((resolve) => {
    Meteor.apply(args[0], args.slice(1), {}, (error) => resolve(error ? error.error : null));
  }))));
  expect(errors[0]).toBe('not-authorized');
  expect(errors[1]).toBeTruthy();
  expect(queueSettings()).toEqual(before);
  expect(server("dTest.e2e.findOne('Games', {name: 'E2E sneaky'})")).toBeFalsy();
});
