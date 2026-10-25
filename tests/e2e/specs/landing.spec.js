// The account pages around the game: signing up for a game that hasn't
// started, and the settings page. Each click runs the method's simulation in
// the browser and then the server's part, so these check that the page ends
// where the server does, also when the server refuses what the browser let
// through. Games are named "E2E ..." and removed by dTest.e2e.reset().
const { test, expect, server, signIn } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const signups = (gameId) => server(`dTest.e2e.count('Gamesignups', {gameId: ${JSON.stringify(gameId)}})`);
const userNamed = (username) => server(`dTest.e2e.findOne('users', {username: ${JSON.stringify(username)}})`);

test('sign up for a game that has not started, then cancel', async ({ page }) => {
  const gameId = server("dTest.e2e.futureGame('signups')");
  const user = server("dTest.e2e.user('signer')");
  await signIn(page, 'e2e_signer');
  await page.goto('/game/' + gameId + '/signup');
  await expect(page.locator('body')).toContainText('E2E signups');
  await expect(page.locator('body')).toContainText('0 / 10 Players Signed Up');

  await page.fill('#gameSignupUsernameInput', 'e2e_signer in game');
  await page.click('#gameSignUpButton');
  await expect(page.locator('#gameRemoveSignUpButton')).toBeVisible();
  await expect(page.locator('body')).toContainText('1 / 10 Players Signed Up');
  const signup = server(`dTest.e2e.findOne('Gamesignups', {gameId: ${JSON.stringify(gameId)}})`);
  expect([signup.userId, signup.username, signup.usedToken]).toEqual([user._id, 'e2e_signer in game', false]);

  await page.click('#gameRemoveSignUpButton');
  await expect(page.locator('#gameSignUpButton')).toBeVisible();
  await expect(page.locator('body')).toContainText('0 / 10 Players Signed Up');
  await expect.poll(() => signups(gameId)).toBe(0);
});

test('a pro only game uses a token to sign up, and gives it back on cancel', async ({ page }) => {
  const gameId = server("dTest.e2e.futureGame('pro only', {isProOnly: true})");
  const user = server("dTest.e2e.user('tokens')");
  server(`dTest.e2e.setUser(${JSON.stringify(user._id)}, {proTokens: 1})`);
  const tokens = () => userNamed('e2e_tokens').proTokens;
  await signIn(page, 'e2e_tokens');
  await page.goto('/game/' + gameId + '/signup');
  await expect(page.locator('body')).toContainText('You have 1 left.');

  await page.click('#gameSignUpButton');
  await expect(page.locator('#gameRemoveSignUpButton')).toBeVisible();
  await expect.poll(tokens).toBe(0);
  expect(server(`dTest.e2e.findOne('Gamesignups', {gameId: ${JSON.stringify(gameId)}})`).usedToken).toBe(true);

  await page.click('#gameRemoveSignUpButton');
  await expect(page.locator('#gameSignUpButton')).toBeVisible();
  await expect.poll(tokens).toBe(1);
  await expect.poll(() => signups(gameId)).toBe(0);
});

// The browser can't see other people's signup names, so its simulation lets
// this through and only the server refuses it: the signup the page showed at
// once has to go away again.
test('a name someone else signed up with is refused, and the page takes the signup back', async ({ page }) => {
  const gameId = server("dTest.e2e.futureGame('taken names')");
  server("dTest.e2e.user('first')");
  server("dTest.e2e.user('second')");
  await signIn(page, 'e2e_first');
  await page.goto('/game/' + gameId + '/signup');
  await page.fill('#gameSignupUsernameInput', 'e2e_wanted');
  await page.click('#gameSignUpButton');
  await expect(page.locator('#gameRemoveSignUpButton')).toBeVisible();

  await page.evaluate(() => Meteor.logout());
  await signIn(page, 'e2e_second');
  await page.goto('/game/' + gameId + '/signup');
  await expect(page.locator('body')).toContainText('1 / 10 Players Signed Up');
  await page.fill('#gameSignupUsernameInput', 'E2E_WANTED');
  await page.click('#gameSignUpButton');
  await expect(page.locator('#gameSignupError')).toHaveText('A user exists with this username, try another.');
  await expect(page.locator('#gameSignUpButton')).toBeVisible();
  await expect(page.locator('body')).toContainText('1 / 10 Players Signed Up');
  expect(signups(gameId)).toBe(1);
});

test('change your username on the settings page, and a taken one is refused', async ({ page }) => {
  server("dTest.e2e.user('oldname')");
  server("dTest.e2e.user('someone')");
  await signIn(page, 'e2e_oldname');
  await page.goto('/settings');
  await expect(page.locator('#changeUsernameInput')).toHaveValue('e2e_oldname');

  await page.fill('#changeUsernameInput', 'e2e_newname');
  await page.click('#changeUsernameButton');
  await expect(page.locator('#settingsSuccessAlert')).toHaveText('Username changed.');
  await expect.poll(() => !!userNamed('e2e_newname')).toBe(true);
  expect(userNamed('e2e_oldname')).toBeFalsy();

  // the browser can't see that someone has this name, so only the server
  // refuses it, and the page goes back to the name you have
  await page.fill('#changeUsernameInput', 'e2e_someone');
  await page.click('#changeUsernameButton');
  await expect(page.locator('#settingsErrorAlert')).toHaveText('A user exists with this username, try another.');
  await expect.poll(() => page.evaluate(() => Meteor.user().username)).toBe('e2e_newname');
  expect(server("dTest.e2e.count('users', {username: 'e2e_someone'})")).toBe(1);
});

test('choosing a gender on the settings page changes it on your castle too', async ({ page }) => {
  const w = server("dTest.e2e.world(['gender'])");
  const me = w.players.gender;
  const male = () => [
    server(`dTest.e2e.findOne('users', ${JSON.stringify(me.userId)})`).male,
    server(`dTest.e2e.findOne('Players', ${JSON.stringify(me.playerId)})`).male,
    server(`dTest.e2e.findOne('Castles', ${JSON.stringify(me.castle._id)})`).male
  ];
  await signIn(page, me.username);
  await page.goto('/settings');

  await page.click('#genderFemaleButton');
  await expect(page.locator('#genderFemaleButton')).toHaveClass(/active/);
  await expect(page.locator('#genderMaleButton')).not.toHaveClass(/active/);
  await expect.poll(male).toEqual([false, false, false]);

  await page.click('#genderMaleButton');
  await expect(page.locator('#genderMaleButton')).toHaveClass(/active/);
  await expect.poll(male).toEqual([true, true, true]);
});
