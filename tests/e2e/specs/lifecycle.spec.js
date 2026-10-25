// A game's end (upgrade PR 15). The worker's jobs do the work, as in the
// game: making a vassal queues checkForDominus, and the 1 min cron queues
// checkForGameEnd. The test runs that cron's body itself, so the end comes in
// seconds. Starting and closing a game aren't run here: a real start bakes the
// map to S3 and a close deletes it from there. The server suites cover both
// (server/gameJobTests.js, server/simulationTests.js).
const { test, expect, server, signIn, openGame } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const J = JSON.stringify;
const findOne = (collection, selector) => server(`dTest.e2e.findOne(${J(collection)}, ${J(selector)})`);

test('a player becomes dominus, the game ends on its end date, and the results page names the winner', async ({ page }) => {
  test.setTimeout(120000);
  // a game waiting to start, so the new dominus doesn't make the next "Game N"
  server("dTest.e2e.futureGame('next')");
  const gameNumbers = () => server(`dTest.e2e.count('Games', {name: {$regex: '^Game \\\\d+$'}})`);
  const before = gameNumbers();

  const w = server("dTest.e2e.world(['ruler', 'subject'])");
  const ruler = w.players.ruler;
  const subject = w.players.subject;
  await signIn(page, ruler.username);
  await openGame(page, w.gameId);

  // the subject becomes the ruler's vassal: with two players, the ruler is dominus
  server(`dTest.e2e.makeVassal(${J(ruler.playerId)}, ${J(subject.playerId)})`);
  await expect.poll(() => findOne('Players', ruler.playerId).is_dominus, { timeout: 30000 }).toBe(true);
  await expect.poll(() => findOne('Games', w.gameId).dominusAchieved).toBe(true);
  const won = findOne('Games', w.gameId);
  expect(won.lastDominusPlayerId).toBe(ruler.playerId);
  expect(new Date(won.endDate).getTime()).toBeGreaterThan(Date.now());
  expect(gameNumbers()).toBe(before);

  // the end date comes
  server(`dTest.e2e.setGame(${J(w.gameId)}, {endDate: new Date(Date.now() - 1000)})`);
  server("dTest.e2e.runCron('1 min job')");
  await expect.poll(() => findOne('Games', w.gameId).hasEnded, { timeout: 30000 }).toBe(true);
  await expect.poll(() => findOne('Games', w.gameId).results, { timeout: 15000 }).toBeTruthy();
  const ended = findOne('Games', w.gameId);
  expect(ended.winningPlayer.username).toBe(ruler.username);
  expect(ended.winningPlayer.playerId).toBe(ruler.playerId);
  expect(new Date(ended.closeDate).getTime()).toBeGreaterThan(Date.now() + 2 * 24 * 60 * 60 * 1000);
  expect(ended.hasClosed).toBe(false);
  expect(ended.results.numVassals[0].username).toBe(ruler.username);
  expect(findOne('Players', ruler.playerId).wonGame).toBe(true);
  expect(findOne('Players', subject.playerId).wonGame).toBe(false);
  expect(findOne('Players', subject.playerId).gameIsOver).toBe(true);

  // the results page lists the game with its winner, and its rankings
  await page.goto('/results');
  const row = page.locator('.gameResultName', { hasText: 'E2E ruler subject' }).locator('xpath=ancestor::table[1]');
  await expect(row).toContainText(`Winner: ${ruler.username}`);
  await page.locator('.gameResultName a', { hasText: 'E2E ruler subject' }).click();
  const details = page.locator('.gameResultDetailsContainer');
  await expect(details).toBeVisible();
  await expect(details.locator('h4', { hasText: 'By Vassals' }).locator('xpath=..')).toContainText(`1 ${ruler.username}`);
});
