// Battles (upgrade PR 14). The battle job runs on the worker, as in the game:
// two enemy armies on one hex start a battle, and its rounds come every
// battle interval. The report pages read what it saved. The calculator panel
// works a battle out in the browser, from the players it subscribes to.
const { test, expect, server, signIn, openGame, openLeftPanel } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const J = JSON.stringify;
const findOne = (collection, selector) => server(`dTest.e2e.findOne(${J(collection)}, ${J(selector)})`);

test('two armies fight on a hex, and the battle report shows its rounds and losses', async ({ page }) => {
  test.setTimeout(150000);
  const w = server("dTest.e2e.world(['victor', 'loser'])");
  const me = w.players.victor;
  const foe = w.players.loser;
  const hex = server(`dTest.e2e.freeHexNear(${J(w.gameId)}, ${me.castle.x}, ${me.castle.y}, 2)`);
  const mine = server(`dTest.e2e.makeArmy(${J(me.playerId)}, {footmen: 60, cavalry: 20}, ${hex.x}, ${hex.y})`);
  const theirs = server(`dTest.e2e.makeArmy(${J(foe.playerId)}, {footmen: 30}, ${hex.x}, ${hex.y})`);

  // the second army's arrival starts the battle; it goes on until one side is gone
  const battleHere = { gameId: w.gameId, x: hex.x, y: hex.y };
  await expect.poll(() => findOne('Battles2', battleHere), { timeout: 30000 }).toBeTruthy();
  await expect.poll(() => findOne('Battles2', battleHere).isOver, { timeout: 120000 }).toBe(true);
  const battle = findOne('Battles2', battleHere);
  expect(findOne('Armies', theirs)).toBeFalsy();
  const left = findOne('Armies', mine);
  expect(left.footmen + left.cavalry).toBeLessThan(80);
  expect(server(`dTest.e2e.count('Rounds', ${J({ battle_id: battle._id })})`)).toBe(battle.roundNumber);
  const lostByLoser = battle.loses.find((l) => l._id == theirs);
  expect(lostByLoser.footmen).toBe(30);

  await signIn(page, me.username);
  await openGame(page, w.gameId);
  await page.goto(`/game/${w.gameId}/battle/${battle._id}`);
  const report = page.locator('#battlePage');
  await expect(report).toContainText('Dominus Battle Report');
  await expect(report).toContainText(`Battle at hex ${hex.x}, ${hex.y}.`);
  await expect(report).toContainText(`Fought ${battle.roundNumber} rounds.`);

  // a title for each round, newest first
  const rounds = report.locator('.roundOpenButton');
  await expect(rounds).toHaveCount(battle.roundNumber);
  await expect(rounds.first()).toContainText(`Round ${battle.roundNumber} Results`);

  // the losses of every round
  await report.locator('.losesOpenButton').click();
  await expect(report).toContainText(`${foe.username}'s army`);
  await expect(report).toContainText('30 soldiers worth');

  // the first round: both armies, and what each lost
  await rounds.last().click();
  const units = report.locator('.battleReportUnit');
  await expect(units).toHaveCount(2);
  const headers = units.locator('.battleReportHeader');
  await expect(headers.filter({ hasText: `${me.username}'s` })).toHaveCount(1);
  await expect(headers.filter({ hasText: `${foe.username}'s` })).toHaveCount(1);
});

test('the battle calculator reads the players: enemies fight, a lord and vassal don\'t', async ({ page }) => {
  // a third player, so the lord of the other isn't the dominus, whose armies fight everyone's
  const w = server("dTest.e2e.world(['planner', 'neighbour', 'bystander'])");
  const me = w.players.planner;
  const other = w.players.neighbour;
  const hexA = server(`dTest.e2e.freeHexNear(${J(w.gameId)}, ${me.castle.x}, ${me.castle.y}, 2)`);
  const hexB = server(`dTest.e2e.freeHexNear(${J(w.gameId)}, ${other.castle.x}, ${other.castle.y}, 2)`);
  const a = server(`dTest.e2e.makeArmy(${J(me.playerId)}, {footmen: 40}, ${hexA.x}, ${hexA.y})`);
  const b = server(`dTest.e2e.makeArmy(${J(other.playerId)}, {footmen: 20}, ${hexB.x}, ${hexB.y})`);

  await signIn(page, me.username);
  await openGame(page, w.gameId);
  const add = async (x, y, id) => {
    await page.evaluate((p) => SimpleRouter.go(p), `/game/${w.gameId}/army/${x}/${y}/${id}`);
    await expect(page.locator('#rp_info_army')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Session.get('selected') && Session.get('selected').id)).toBe(id);
    await page.click('#addSelectedButton');
  };
  const panel = page.locator('#calculatorPanel');
  const armyPanel = (username) => panel.locator('.panel').filter({ has: page.locator('.panel-heading', { hasText: `${username} :` }) });
  // the Dead column of the Total row: the soldiers the army would lose
  const dead = (username) => armyPanel(username).locator('.calcArmyTable tr').last().locator('td').last();

  await page.goto(`/game/${w.gameId}/army/${hexA.x}/${hexA.y}/${a}`);
  await openLeftPanel(page, 'fa-calculator', 'calculatorPanel');
  await expect(page.locator('#rp_info_army')).toBeVisible();
  await page.click('#addSelectedButton');
  await add(hexB.x, hexB.y, b);

  // each army's heading has its player's name, from the calcPlayer subscription
  await expect(armyPanel(me.username)).toHaveCount(1);
  await expect(armyPanel(other.username)).toHaveCount(1);
  await expect(panel).toContainText('Battle fought in');
  // enemies: the smaller army would lose soldiers
  await expect(dead(other.username)).not.toHaveText('');
  expect(Number(await dead(other.username).innerText())).toBeGreaterThan(0);

  // a vassal's army isn't the lord's enemy: once the subscription has the new
  // lord, the calculator's next run has nobody losing anyone
  server(`dTest.e2e.makeVassal(${J(me.playerId)}, ${J(other.playerId)})`);
  const footmen = armyPanel(me.username).locator('.armyUnitInput[data-type=footmen]');
  await expect.poll(async () => {
    await footmen.fill('41');
    await footmen.fill('40');
    return [(await dead(me.username).innerText()).trim(), (await dead(other.username).innerText()).trim()];
  }).toEqual(['', '']);
});
