// Creating an account, signing out and back in with a password.
// (Google and Facebook sign in need the real services: Daniel's smoke test.)
const { test, expect, server, signIn, expectSignedInAs, PASSWORD } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

test('create an account with the form, then sign out and back in', async ({ page }) => {
  await page.goto('/createaccount');
  await page.fill('#ca-username', 'e2e_newcomer');
  await page.fill('#ca-email', 'e2e_newcomer@example.com');
  await page.fill('#ca-password', PASSWORD);
  await page.click('#ca-submitButton');

  // signed in, and sent on to the landing page
  await expectSignedInAs(page, 'e2e_newcomer');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#topNavSignoutButton')).toBeVisible();

  const user = server("dTest.e2e.findOne('users', {username: 'e2e_newcomer'})");
  expect(user.emails[0].address).toBe('e2e_newcomer@example.com');
  // a development server verifies new emails straight away (server/accounts.js)
  expect(user.verifiedEmail).toBe(true);

  await page.click('#topNavSignoutButton');
  await expect.poll(() => page.evaluate(() => Meteor.userId())).toBe(null);

  await signIn(page, 'e2e_newcomer');
  await expectSignedInAs(page, 'e2e_newcomer');

  // and by email instead of username
  await page.click('#topNavSignoutButton');
  await expect.poll(() => page.evaluate(() => Meteor.userId())).toBe(null);
  await signIn(page, 'e2e_newcomer@example.com');
  await expectSignedInAs(page, 'e2e_newcomer');
});

test('a wrong password, or a name already taken, is refused with a message', async ({ page }) => {
  server("dTest.e2e.user('taken')");

  await page.goto('/signin');
  await page.fill('#s-username', 'e2e_taken');
  await page.fill('#s-password', 'not-the-password');
  await page.click('#s-submitButton');
  await expect(page.locator('#s-errorAlert')).toBeVisible();
  await expect(page.locator('#s-errorAlert')).toContainText('Incorrect password');
  expect(await page.evaluate(() => Meteor.userId())).toBe(null);

  await page.goto('/createaccount');
  await page.fill('#ca-username', 'e2e_taken');
  await page.fill('#ca-email', 'someone_else@example.com');
  await page.fill('#ca-password', PASSWORD);
  await page.click('#ca-submitButton');
  await expect(page.locator('#ca-errorAlert')).toBeVisible();
  await expect(page.locator('#ca-errorAlert')).toContainText('Username already exists');
  expect(await page.evaluate(() => Meteor.userId())).toBe(null);
});

test('signing in from a game you are watching comes back to the game', async ({ page }) => {
  const w = server("dTest.e2e.world(['spectre'])");
  server("dTest.e2e.user('visitor')");
  await page.goto('/game/' + w.gameId);
  const banner = page.locator('#spectatorBanner');
  await expect(banner).toContainText('Spectating E2E spectre');
  await page.click('#spectatorSignInButton');
  await expect(page).toHaveURL(/\/signin$/);

  await page.fill('#s-username', 'e2e_visitor');
  await page.fill('#s-password', PASSWORD);
  await page.click('#s-submitButton');
  await expectSignedInAs(page, 'e2e_visitor');
  await expect(page).toHaveURL(new RegExp('/game/' + w.gameId + '$'));

  // still watching (they have no castle here), now signed in
  await expect(banner).toContainText('Spectating E2E spectre');
  await expect(page.locator('#spectatorSignInButton')).toHaveCount(0);
});
