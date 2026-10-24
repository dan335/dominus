// Markers and marker groups, and saving the map's zoom. Their methods run a
// simulation in the browser first (an async method with a sync copy of the
// change behind this.isSimulation), so these check that the page changes and
// that the server ends up with the same thing.
const { test, expect, server, signIn, openGame, openLeftPanel } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

const find = (collection, selector) => server(`dTest.e2e.findOne(${JSON.stringify(collection)}, ${JSON.stringify(selector)})`);

test('mark your castle, then name, group, move and remove markers and groups', async ({ page }) => {
  const w = server("dTest.e2e.world(['mapper'])");
  const me = w.players.mapper;
  await signIn(page, me.username);
  await openGame(page, w.gameId);

  // add a marker from the castle's panel
  await page.click('#infoPanelMarkerButton');
  await expect(page.locator('#infoPanelRemoveMarkerButton')).toBeVisible();
  await expect.poll(() => find('Markers', { user_id: me.userId, unitId: me.castle._id })).toBeTruthy();
  expect(find('Markers', { user_id: me.userId, unitId: me.castle._id }).name).toBe(me.username + "'s castle");

  await openLeftPanel(page, 'fa-map-marker', 'markersPanel');
  const panel = page.locator('#markersPanel');
  const marker = panel.locator('.markerBox');
  await expect(marker).toHaveCount(1);
  await expect(marker).toContainText(me.username + "'s castle");

  // groups: two, then a refused name
  const headings = panel.locator('.markerGroupHeading');
  const addGroup = async (name) => {
    await panel.locator('#groupNameInput').fill(name);
    await panel.locator('#addGroupButton').click();
  };
  await addGroup('Alpha');
  await expect(headings).toHaveText(['Default Group', 'Alpha']);
  await addGroup('Beta');
  await expect(headings).toHaveText(['Default Group', 'Alpha', 'Beta']);
  await expect(panel).toContainText('2 groups / ');
  await addGroup('***');
  await expect(panel.locator('#addGroupAlert')).toHaveText('Name too short.');
  await expect(headings).toHaveCount(3);

  // move Beta up and back down
  const group = (name) => panel.locator('.panel', { has: page.locator('.markerGroupHeading', { hasText: new RegExp('^\\s*' + name + '\\s*$') }) });
  await group('Beta').locator('.upGroupButton').click();
  await expect(headings).toHaveText(['Default Group', 'Beta', 'Alpha']);
  await expect.poll(() => find('MarkerGroups', { user_id: me.userId, name: 'Beta' }).order).toBe(0);
  await group('Beta').locator('.downGroupButton').click();
  await expect(headings).toHaveText(['Default Group', 'Alpha', 'Beta']);
  await expect.poll(() => find('MarkerGroups', { user_id: me.userId, name: 'Beta' }).order).toBe(1);

  // rename Beta in the right panel
  await group('Beta').locator('.editGroupButton').click();
  const groupInput = page.locator('.rightPanel #groupNameInput');
  await expect(groupInput).toHaveValue('Beta');
  await groupInput.fill('Gamma!');
  await page.click('#saveGroupButton');
  await expect(headings).toHaveText(['Default Group', 'Alpha', 'Gamma']);
  await expect.poll(() => find('MarkerGroups', { user_id: me.userId, name: 'Gamma' })).toBeTruthy();

  // rename the marker
  await marker.locator('.editMarkerButton').click();
  await expect(page.locator('#rp_infoMarker')).toBeVisible();
  await page.fill('#markerNameInput', 'Home <b>');
  await page.fill('#markerDescInput', 'Where it started');
  await page.click('#saveMarkerButton');
  await expect(marker).toContainText('Home b');
  await expect(marker.locator('.markerBoxDesc')).toHaveText('Where it started');
  await expect.poll(() => find('Markers', { user_id: me.userId, unitId: me.castle._id }).name).toBe('Home b');

  // with the server cut off the page still changes at once (that is the
  // simulation), and the server catches up when the page reconnects
  const gammaId = find('MarkerGroups', { user_id: me.userId, name: 'Gamma' })._id;
  await page.evaluate(() => Meteor.disconnect());
  await page.evaluate((id) => {
    dFunc.callAndForget('saveMarkerGroupInfo', id, 'Delta');
    dFunc.callAndForget('moveMarkerGroupUp', id);
  }, gammaId);
  await expect(headings).toHaveText(['Default Group', 'Delta', 'Alpha']);
  expect(find('MarkerGroups', gammaId).name).toBe('Gamma');
  await page.evaluate(() => Meteor.reconnect());
  await expect.poll(() => find('MarkerGroups', gammaId).name).toBe('Delta');
  await expect.poll(() => find('MarkerGroups', gammaId).order).toBe(0);
  await expect(headings).toHaveText(['Default Group', 'Delta', 'Alpha']);

  // remove the marker, then a group
  await marker.locator('.removeMarkerButton').click();
  await expect(marker).toHaveCount(0);
  await expect.poll(() => find('Markers', { user_id: me.userId, unitId: me.castle._id })).toBeFalsy();
  await group('Alpha').locator('.removeGroupButton').click();
  await expect(headings).toHaveText(['Default Group', 'Delta']);
  await expect.poll(() => find('MarkerGroups', { user_id: me.userId, name: 'Alpha' })).toBeFalsy();
  await expect.poll(() => find('MarkerGroups', gammaId).order).toBe(0);

  // and after opening the game again the server's copy is what the page shows
  await openGame(page, w.gameId);
  await openLeftPanel(page, 'fa-map-marker', 'markersPanel');
  await expect(headings).toHaveText(['Default Group', 'Delta']);
  await expect(marker).toHaveCount(0);
});

test('zooming the map is saved for next time', async ({ page }) => {
  const w = server("dTest.e2e.world(['zoomer'])");
  const me = w.players.zoomer;
  await signIn(page, me.username);
  await openGame(page, w.gameId);
  const start = await page.evaluate(() => Session.get('hexScale'));
  await page.click('#decrease_scale_button');
  await expect.poll(() => page.evaluate(() => Session.get('hexScale'))).toBeLessThan(start);
  const zoomed = await page.evaluate(() => Session.get('hexScale'));
  // it is saved five seconds after the last change
  await expect.poll(() => find('Players', me.playerId).hex_scale, { timeout: 15000 }).toBeCloseTo(zoomed, 5);

  await openGame(page, w.gameId);
  await expect.poll(() => page.evaluate(() => Session.get('hexScale'))).toBeCloseTo(zoomed, 5);
});
