// The forum: starting a topic, replying, and another reader seeing the reply
// arrive. Topics and posts by e2e_ users are removed by dTest.e2e.reset().
const { test, expect, server, signIn } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

// starts a topic through the form and returns its id
async function newTopic(page, title, text) {
  await page.goto('/forum');
  await page.click('#newTopicButton');
  await expect(page).toHaveURL(/\/forum\/newtopic$/);
  await page.fill('#topicTitleInput', title);
  await page.selectOption('#topicTagSelect', { index: 1 });
  await page.fill('#topicTextarea', text);
  await page.click('#saveNewTopicButton');
  await expect(page).toHaveURL(/\/forum$/);
  const topic = server(`dTest.e2e.findOne('Forumtopics', {title: ${JSON.stringify(title)}})`);
  expect(topic).toBeTruthy();
  return topic._id;
}

test('start a topic, reply to it, and another reader sees the reply arrive', async ({ page, newPage }) => {
  server("dTest.e2e.user('writer')");
  server("dTest.e2e.user('reader')");
  await signIn(page, 'e2e_writer');
  const topicId = await newTopic(page, 'E2E a topic about castles', 'Which castle image is the best one?');

  // it is at the top of the list, and opens from there
  await expect(page.locator('#forumTopicTable tbody tr').first()).toContainText('E2E a topic about castles');
  await page.locator('.forumTopicLink', { hasText: 'E2E a topic about castles' }).click();
  await expect(page).toHaveURL(new RegExp('/forum/topic/' + topicId + '$'));
  await expect(page.locator('body')).toContainText('Which castle image is the best one?');

  // a second reader, signed in elsewhere, has the topic open
  const reader = await newPage();
  await signIn(reader, 'e2e_reader');
  await reader.goto('/forum/topic/' + topicId);
  await expect(reader.locator('body')).toContainText('Which castle image is the best one?');

  // the reader replies, and the writer sees it without reloading
  await reader.fill('#newPostTextarea', 'The **blue** one, clearly.');
  await expect(reader.locator('#postPreview strong')).toHaveText('blue');
  await reader.click('#newPostButton');
  await expect(page.locator('body')).toContainText('The blue one, clearly.');
  await expect(page.locator('strong', { hasText: 'blue' })).toBeVisible();

  const topic = server(`dTest.e2e.findOne('Forumtopics', ${JSON.stringify(topicId)})`);
  expect([topic.numPosts, topic.lastPostUsername]).toEqual([2, 'e2e_reader']);
});

test('signed out, the forum asks you to sign in, and replying is refused', async ({ page }) => {
  server("dTest.e2e.user('poster')");
  await signIn(page, 'e2e_poster');
  const topicId = await newTopic(page, 'E2E for members only', 'Only signed in players can read this.');
  await page.click('#topNavSignoutButton');
  await expect.poll(() => page.evaluate(() => Meteor.userId())).toBe(null);

  for (const path of ['/forum', '/forum/topic/' + topicId]) {
    await page.goto(path);
    await expect(page.locator('body')).toContainText('Please login and verify email to access forum.');
    await expect(page.locator('#forumTopicTable')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Only signed in players can read this.');
  }
  const refused = await page.evaluate((topicId) => new Promise((resolve) => {
    Meteor.call('forumNewPost', topicId, 'sneaking a reply in', (error) => resolve(error ? error.error : null));
  }), topicId);
  expect(refused).toBeTruthy();
  expect(server(`dTest.e2e.findOne('Forumtopics', ${JSON.stringify(topicId)})`).numPosts).toBe(1);
});

// Stored XSS (reports/forum-audit.md, Oct 2026). The live markdown helper is
// marked 0.3.5 with sanitize on (the audit couldn't tell which of two helpers
// wins; this checks it): it escapes HTML, but lets through a link written
// javascript&#58..., which runs when a reader clicks it (CVE-2016-10531).
// Fixing the bug means changing the last expectation on purpose.
test('known bug: a javascript link in a forum post runs when a reader clicks it', async ({ page, newPage }) => {
  server("dTest.e2e.user('mallory')");
  server("dTest.e2e.user('victim')");
  await signIn(page, 'e2e_mallory');
  const topicId = await newTopic(page, 'E2E harmless looking topic',
    'Hello <img src="/e2e-no-such-image.png" onerror="window.__e2eInjected = 1"> [read more](javascript&#58this;window.__e2eInjected=2)');

  const victim = await newPage();
  await signIn(victim, 'e2e_victim');
  await victim.goto('/forum/topic/' + topicId);
  await expect(victim.locator('body')).toContainText('Hello');
  expect(await victim.evaluate(() => String(Blaze._globalHelpers.markdown.renderFunction))).toContain('marked(');

  // the HTML is shown as text and doesn't run
  await expect(victim.locator('body')).toContainText('<img src="/e2e-no-such-image.png"');
  await victim.waitForTimeout(1000);
  expect(await victim.evaluate(() => window.__e2eInjected)).toBeUndefined();

  // the link does, once clicked
  await victim.locator('a', { hasText: 'read more' }).click();
  await expect.poll(() => victim.evaluate(() => window.__e2eInjected)).toBe(2);
});
