// Chat between two players, each in their own browser: what one sends shows
// up for the other without reloading (publications and reactivity).
const { test, expect, server, signIn, openGame, openLeftPanel } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

async function openChatroom(page, name) {
  await page.locator('#chatrooms_panel .openChatroomButton', { hasText: name }).click();
  await expect(page.locator('#chatrooms_panel .chatInput')).toBeVisible();
}

async function say(page, text) {
  await page.fill('#chatrooms_panel .chatInput', text);
  await page.click('#chatrooms_panel .sendChatButton');
}

const chatLine = (page, username, text) => page.locator('#chatrooms_panel .chatLine', { hasText: text }).filter({ hasText: username });

test('two players talk in the Everyone room and in a room of their own', async ({ page, newPage }) => {
  const w = server("dTest.e2e.world(['ann', 'ben'])");
  const ben = await newPage();
  await signIn(page, 'e2e_ann');
  await signIn(ben, 'e2e_ben');
  await openGame(page, w.gameId);
  await openGame(ben, w.gameId);

  // the Everyone room
  await openLeftPanel(page, 'fa-comments', 'chatrooms_panel');
  await openLeftPanel(ben, 'fa-comments', 'chatrooms_panel');
  await openChatroom(page, 'Everyone');
  await openChatroom(ben, 'Everyone');
  await say(page, 'hello from ann');
  await expect(chatLine(ben, 'e2e_ann', 'hello from ann')).toBeVisible();
  await expect(chatLine(page, 'e2e_ann', 'hello from ann')).toBeVisible();
  await say(ben, 'hi ann');
  await expect(chatLine(page, 'e2e_ben', 'hi ann')).toBeVisible();

  // a room of their own, made by typing a name
  await page.fill('#chat_start_with_name', 'e2e_ben');
  await page.click('#chat_start_with_button');
  await expect(page.locator('#chat_error_alert')).toBeHidden();
  const findRoom = () => server(`dTest.e2e.findOne('Rooms', {gameId: ${JSON.stringify(w.gameId)}, type: {$ne: 'everyone'}})`);
  await expect.poll(findRoom).toBeTruthy();
  const room = findRoom();
  expect(room.members.sort()).toEqual([w.players.ann.playerId, w.players.ben.playerId].sort());

  // ann is put straight into it, and ben sees it appear in their list
  expect(room.name).toBe('e2e_ann and e2e_ben');
  await expect(page.locator('#chatrooms_panel .panel-heading')).toContainText(room.name);
  await expect(page.locator('#chatrooms_panel')).toContainText('Nothing here yet');
  await openChatroom(ben, room.name);
  await say(ben, 'just us now');
  await expect(chatLine(page, 'e2e_ben', 'just us now')).toBeVisible();

  const saved = server(`dTest.e2e.findOne('Roomchats', {room_id: ${JSON.stringify(room._id)}})`);
  expect(saved.text).toBe('just us now');
});

test('a chat sent while the server is cut off shows at once, and is saved once when the page reconnects', async ({ page }) => {
  const w = server("dTest.e2e.world(['cal'])");
  await signIn(page, 'e2e_cal');
  await openGame(page, w.gameId);
  await openLeftPanel(page, 'fa-comments', 'chatrooms_panel');
  await openChatroom(page, 'Everyone');
  const room = server(`dTest.e2e.findOne('Rooms', {gameId: ${JSON.stringify(w.gameId)}, type: 'everyone'})`);
  const saved = (text) => server(`dTest.e2e.count('Roomchats', {room_id: ${JSON.stringify(room._id)}, text: ${JSON.stringify(text)}})`);

  // the simulation shows it before the server has it
  await page.evaluate(() => Meteor.disconnect());
  await say(page, 'sent offline');
  await expect(chatLine(page, 'e2e_cal', 'sent offline')).toHaveCount(1);
  expect(saved('sent offline')).toBe(0);

  // and the server's copy takes its place: one line, one document
  await page.evaluate(() => Meteor.reconnect());
  await expect.poll(() => saved('sent offline')).toBe(1);
  await expect(chatLine(page, 'e2e_cal', 'sent offline')).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(chatLine(page, 'e2e_cal', 'sent offline')).toHaveCount(1);

  // a refused chat shows the server's reason and keeps the text
  await say(page, 'x'.repeat(401));
  await expect(page.locator('#chatSendAlert')).toHaveText('Text too long.');
  await expect(page.locator('#chatrooms_panel .chatInput')).toHaveValue('x'.repeat(401));
});
