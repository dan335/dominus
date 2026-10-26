// Your alerts: opening one marks it read, "Mark All Alerts as Read" marks the
// rest, and hiding an alert type in the settings panel. Each method runs a
// simulation in the browser first, which the browser calls without waiting
// (dFunc.callAndForget; upgrade PR 18). The alerts are made on the server the
// way the game makes them (dAlerts).
const { test, expect, server, signIn, openGame, openLeftPanel } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const J = JSON.stringify;

// makes an alert the way the game does, then dates it secondsAgo, so the
// panel's order (newest first) is known
const makeAlert = (gameId, type, args, secondsAgo) => server(`(function() {
  dTest.settle(dAlerts.${type}.apply(dAlerts, [${J(gameId)}].concat(${J(args)})));
  return Alerts.update({gameId: ${J(gameId)}, type: ${J(type)}}, {$set: {created_at: new Date(Date.now() - ${secondsAgo} * 1000)}});
})()`);

// the read flags of a player's copy of each of their alerts, newest first
const readFlags = (playerId) => server(`Alerts.find({'playerIds.playerId': ${J(playerId)}}, {sort: {created_at: -1}}).map(function(a) {
  return _.findWhere(a.playerIds, {playerId: ${J(playerId)}}).read; })`);

test('open an alert to mark it read, then mark all of them read; the unread count follows', async ({ page }) => {
  const w = server("dTest.e2e.world(['reader', 'liege'])");
  const me = w.players.reader;
  const liege = w.players.liege;
  // three alerts for me; the oldest goes to liege too
  makeAlert(w.gameId, 'alert_vassalIsUnderAttack', [[me.playerId, liege.playerId], liege.playerId, 'e2eBattle'], 30);
  makeAlert(w.gameId, 'alert_gainedVassal', [me.playerId, liege.playerId, me.playerId], 20);
  makeAlert(w.gameId, 'alert_newKingChatroom', [me.playerId], 10);
  expect(readFlags(me.playerId)).toEqual([false, false, false]);
  expect(readFlags(liege.playerId)).toEqual([false]);

  await signIn(page, me.username);
  await openGame(page, w.gameId);
  await openLeftPanel(page, 'fa-bullhorn', 'alerts_panel');
  const panel = page.locator('#alerts_panel');
  await panel.locator('#mineButton').click();
  const badge = panel.locator('#mineButton .badge');
  await expect(badge).toHaveText('3');
  const alerts = panel.locator('.openAlertButton');
  await expect(alerts).toHaveCount(3);
  await expect(panel.locator('.fa-exclamation-circle')).toHaveCount(3);

  // the newest one
  await alerts.first().click();
  await expect(badge).toHaveText('2');
  await expect(panel.locator('.fa-exclamation-circle')).toHaveCount(2);
  await expect.poll(() => readFlags(me.playerId)).toEqual([true, false, false]);
  expect(readFlags(liege.playerId)).toEqual([false]);

  await panel.locator('#markAllAlertsAsReadButton').click();
  await expect(badge).toHaveText('');
  await expect(panel.locator('.fa-exclamation-circle')).toHaveCount(0);
  await expect.poll(() => readFlags(me.playerId)).toEqual([true, true, true]);
  expect(readFlags(liege.playerId)).toEqual([false]);
});

test('hide an alert type in the settings panel: its unread alerts stop counting, and count again when shown', async ({ page }) => {
  const w = server("dTest.e2e.world(['hider', 'other'])");
  const me = w.players.hider;
  const player = () => server(`dTest.e2e.findOne('Players', ${J(me.playerId)})`);
  makeAlert(w.gameId, 'alert_newLord', [me.playerId, w.players.other.playerId], 20);
  makeAlert(w.gameId, 'alert_newKingChatroom', [me.playerId], 10);

  await signIn(page, me.username);
  await openGame(page, w.gameId);
  await openLeftPanel(page, 'fa-bullhorn', 'alerts_panel');
  const badge = page.locator('#alerts_panel #mineButton .badge');
  await expect(badge).toHaveText('2');

  await openLeftPanel(page, 'fa-wrench', 'settings_panel');
  const newLord = page.locator('#settings_panel .checkbox', { hasText: 'New Lord' }).locator('.hideAlertCheckbox');
  await expect(newLord).not.toBeChecked();
  await newLord.check();
  await expect.poll(() => player().hideAlertsMine).toEqual(['alert_newLord']);
  await expect(badge).toHaveText('1');

  await newLord.uncheck();
  await expect.poll(() => player().hideAlertsMine).toEqual([]);
  await expect(badge).toHaveText('2');
  // the hide is mine alone: the alert itself is still unread
  expect(readFlags(me.playerId)).toEqual([false, false]);
});
