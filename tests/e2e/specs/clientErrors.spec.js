// The browser error reporter (client/errorReporter.js): an error on the page
// reaches the server log, through reportClientError (server/clientErrors.js).
// The server keeps the last reports in ClientErrors.recent, which is what
// these read.
//
// Code run by page.evaluate, or an inline script it adds, isn't from the
// site's own files, so the reporter rightly leaves its errors out. The errors
// that should be reported come from a script served from the site instead
// (fromSite below).
const { test, expect, server, signIn, allowPageErrors } = require('../lib/fixtures');

test.beforeAll(() => { server('dTest.e2e.reset()'); server('ClientErrors.recent.length = 0'); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

// runs code from a script file served from the site, as the app's own code is
let scripts = 0;
async function fromSite(page, code) {
  const path = '/e2e-script-' + (++scripts) + '.js';
  await page.route('**' + path, (route) => route.fulfill({ contentType: 'application/javascript', body: code }));
  await page.addScriptTag({ url: path });
}

// a page that has started and connected
async function openPage(page, path) {
  await page.goto(path);
  await page.waitForFunction(() => window.Meteor && Meteor.status().connected);
}

// the reports whose message has this in it
const reports = (marker) => server(`ClientErrors.recent.filter((r) => r.message.indexOf(${JSON.stringify(marker)}) !== -1)`);

test('an uncaught error and an autorun that throws are reported, each once', async ({ page }) => {
  allowPageErrors(page, /E2E uncaught/, /E2E autorun/);
  await openPage(page, '/games');
  // only the path is sent, since a query or hash can hold a token
  await page.evaluate(() => history.replaceState(null, '', '/games?token=secret#hash'));

  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(m.text()));
  await fromSite(page, "for (var i = 0; i < 3; i++) setTimeout(function() { throw new Error('E2E uncaught'); });");
  await page.evaluate(() => {
    const v = new ReactiveVar(0);
    Tracker.autorun(() => { if (v.get()) throw new Error('E2E autorun'); });
    v.set(1);
    Tracker.flush();
    v.set(2);
    Tracker.flush();
  });

  await expect.poll(() => reports('E2E uncaught').length).toBe(1);
  await expect.poll(() => reports('E2E autorun').length).toBe(1);
  const uncaught = reports('E2E uncaught')[0];
  expect([uncaught.kind, uncaught.message, uncaught.path, uncaught.userId]).toEqual(['error', 'Uncaught Error: E2E uncaught', '/games', null]);
  expect(uncaught.stack).toContain('E2E uncaught');
  expect(uncaught.version).not.toBe('');
  const autorun = reports('E2E autorun')[0];
  expect(autorun.kind).toBe('meteor');
  expect(autorun.message).toMatch(/^Exception from Tracker recompute function: .*E2E autorun/);

  // it only watches: Meteor still logs the autorun's error to the console
  expect(consoleLines.some((line) => /Exception from Tracker recompute function/.test(line))).toBe(true);
});

test('a rejected promise from the page is reported with the signed in user', async ({ page }) => {
  allowPageErrors(page, /E2E rejected/);
  const user = server("dTest.e2e.user('reporter')");
  await signIn(page, 'e2e_reporter');
  await fromSite(page, "Promise.reject(new Error('E2E rejected'));");
  await expect.poll(() => reports('E2E rejected').length).toBe(1);
  const r = reports('E2E rejected')[0];
  expect([r.kind, r.message, r.userId]).toEqual(['unhandledrejection', 'E2E rejected', user._id]);
});

test('errors from other sites, refused simulations and logs Meteor was told to hide are not reported', async ({ page }) => {
  allowPageErrors(page, /E2E/);
  await openPage(page, '/games');
  await page.evaluate(() => {
    // Playwright's own code, and what a browser extension's or another
    // site's script error looks like
    setTimeout(() => { throw new Error('E2E from evaluate'); });
    window.dispatchEvent(new ErrorEvent('error', { message: 'E2E extension', filename: 'chrome-extension://abc/content.js' }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.', filename: '' }));
    // a method the browser refuses before asking the server
    Meteor.call('addOrEditGame', 'E2E refused', '', 10, '2099-01-05 10:00', false, false, false, false, false, false, null, () => {});
    Meteor._suppress_log(1);
    Meteor._debug('Exception in E2E suppressed:', new Error('E2E suppressed'));
    // and one that is reported, so the poll below knows the others had time
    Meteor._debug('Exception in E2E shown:', new Error('E2E shown'));
  });
  await expect.poll(() => reports('E2E shown').length).toBe(1);
  expect(reports('E2E extension')).toEqual([]);
  expect(reports('E2E from evaluate')).toEqual([]);
  expect(reports('E2E suppressed')).toEqual([]);
  expect(reports('addOrEditGame')).toEqual([]);
  expect(server("ClientErrors.recent.filter((r) => r.message == 'Script error.').length")).toBe(0);
});
