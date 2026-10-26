// The charts (metricsgraphics.js, lib/client/compatibility): the graphs panel
// and the market panel's price and volume charts.
//
// On Meteor 3 every chart stopped drawing in production with
// "ReferenceError: main_time_format is not defined" (Oct 2026): the minifier
// had inlined a function that assigns an undeclared name into a 'use strict'
// one. These run on the development bundle, which isn't minified, so they
// check that the charts draw but can't catch that; tests/bundle/check-bundle.js
// looks for it in a production build.
const { test, expect, server, signIn, openGame, openLeftPanel } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const J = JSON.stringify;

// a chart is drawn: its line, and the dates along its x axis (the labels
// whose format broke)
async function expectChart(page, target) {
  const chart = page.locator(target + ' svg');
  await expect(chart.locator('.mg-main-line').first()).toBeAttached();
  await expect(chart.locator('.mg-x-axis text').first()).toBeAttached();
  expect(await chart.locator('.mg-x-axis text').count()).toBeGreaterThan(1);
}

test('the graphs panel draws income, rank, vassals, players and soldier worth', async ({ page }) => {
  const w = server("dTest.e2e.world(['grapher'])");
  const me = w.players.grapher;
  server(`dTest.e2e.makeStats(${J(w.gameId)}, ${J(me.playerId)})`);

  await signIn(page, me.username);
  await openGame(page, w.gameId);
  await openLeftPanel(page, 'fa-line-chart', 'stats_panel');

  for (const target of ['#incomeGraph', '#rankGraph', '#numVassalsGraph', '#playersGraph', '#soldierWorthGraph']) {
    await expectChart(page, target);
  }
});

test('the market panel draws the price and volume charts', async ({ page }) => {
  const w = server("dTest.e2e.world(['trader'])");
  const me = w.players.trader;
  server(`dTest.e2e.makeStats(${J(w.gameId)}, ${J(me.playerId)})`);

  await signIn(page, me.username);
  await openGame(page, w.gameId);
  await openLeftPanel(page, 'fa-money', 'market_panel');

  await expectChart(page, '#marketPriceChart');
  await expectChart(page, '#marketVolumeChart');
});
