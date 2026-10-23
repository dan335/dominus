// The test() every spec uses. Each page:
// - never reaches another site: analytics, Facebook, Google and Stripe are
//   cut off, so nothing leaves the machine;
// - fails its test on an uncaught error in the page, or an exception Meteor
//   catches and logs (in an autorun or a method callback).
const base = require('@playwright/test');
const { server } = require('./server');

const PASSWORD = 'e2e-password-1';

// Errors every test may ignore. The test games' countries are never baked
// into images, and mapCanvas.js reads country.image.filename without checking
// (it throws inside an autorun, and the countries after it get no image).
const IGNORED_PAGE_ERRORS = [/Cannot read properties of undefined \(reading 'filename'\)/];

const test = base.test.extend({
  context: async ({ context, baseURL }, use) => {
    await context.route((url) => !url.href.startsWith(baseURL + '/'), (route) => route.abort());
    await use(context);
  },

  page: async ({ page }, use, testInfo) => {
    const errors = watch(page);
    await use(page);
    base.expect(errors, 'errors in the page').toEqual([]);
  },

  // another browser, for a second player or a spectator
  newPage: async ({ browser, baseURL }, use) => {
    const opened = [];
    await use(async () => {
      const context = await browser.newContext({ baseURL, viewport: { width: 1400, height: 900 } });
      await context.route((url) => !url.href.startsWith(baseURL + '/'), (route) => route.abort());
      const page = await context.newPage();
      opened.push({ context, errors: watch(page) });
      return page;
    });
    for (const o of opened) {
      await o.context.close();
      base.expect(o.errors, 'errors in the second page').toEqual([]);
    }
  }
});

// Collects the page's uncaught errors, and the exceptions Meteor catches and
// only logs (an autorun or a method callback that throws: "Exception from
// Tracker recompute function:" followed by the error in a second message).
function watch(page) {
  const errors = [];
  page._allowedErrors = [];
  const add = (message) => {
    if (![...IGNORED_PAGE_ERRORS, ...page._allowedErrors].some((re) => re.test(message))) errors.push(message);
  };
  page.on('pageerror', (e) => add(e.message));
  let pending = null;
  page.on('console', (m) => {
    const text = m.text();
    if (pending) {
      add(pending + ' ' + text.split('\n')[0]);
      pending = null;
    } else if (/^Exception (from Tracker|in )/.test(text)) {
      // the error comes in the same message or in the next one
      const firstLine = text.split('\n')[0];
      if (/:\s*\S/.test(firstLine.replace(/^[^:]*:/, ':'))) add(firstLine);
      else pending = firstLine;
    }
  });
  return errors;
}

// lets this page log errors matching these, for a test that pins a known bug
function allowPageErrors(page, ...patterns) {
  page._allowedErrors.push(...patterns);
}

// signs in through the sign in form and waits for the app to know
async function signIn(page, username, password) {
  await page.goto('/signin');
  await page.fill('#s-username', username);
  await page.fill('#s-password', password || PASSWORD);
  await page.click('#s-submitButton');
  await base.expect(page.locator('#topNavSignoutButton')).toBeVisible();
}

// waits until Meteor's client says it is logged in as username
async function expectSignedInAs(page, username) {
  await base.expect.poll(() => page.evaluate(() => Meteor.user() && Meteor.user().username)).toBe(username);
}

// opens a game as one of its players and gets past the welcome screen
async function openGame(page, gameId) {
  await page.goto('/game/' + gameId);
  const welcome = page.locator('#close_welcome_screen_button');
  await base.expect(welcome.or(page.locator('#rp_info_castle')).first()).toBeVisible();
  if (await welcome.isVisible()) await welcome.click();
  await base.expect(page.locator('#rp_info_castle')).toBeVisible();
}

// opens one of the game's left panels by its menu icon (fa-comments, ...)
async function openLeftPanel(page, icon, panelId) {
  await page.locator('.gameLeftMenuPanelIcon', { has: page.locator('.' + icon) }).click();
  await base.expect(page.locator('#' + panelId)).toBeVisible();
}

module.exports = { test, expect: base.expect, server, signIn, expectSignedInAs, openGame, openLeftPanel, allowPageErrors, PASSWORD };
