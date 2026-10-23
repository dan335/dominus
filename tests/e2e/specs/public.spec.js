// The pages anyone can open, signed out, and the routes search engines read.
const { test, expect, server } = require('../lib/fixtures');

// /games lists the current games, so there is one to list
test.beforeAll(() => { server('dTest.e2e.reset()'); server("dTest.e2e.world(['listed'])"); });
test.afterAll(() => { server('dTest.e2e.reset()'); });

// each page's own <title> (served by the server, server/seo) and something
// only that page draws
const PAGES = [
  ['/', 'Dominus - Free Multiplayer Browser Strategy Game', '#joinAGameButton'],
  ['/games', 'Join a Game - Open & Upcoming Games | Dominus', '.landingGameContainer >> text=E2E listed'],
  ['/results', 'Past Game Results | Dominus', 'text=Results from Past Games'],
  ['/oldresults', 'Archived Game Results | Dominus', 'text=Rankings from Old Games'],
  ['/rankings', 'Player Rankings | Dominus', '#landingRankings'],
  ['/guide', 'How to Play Dominus - Beginner’s Guide', '#guideContainer'],
  ['/store', 'Store | Dominus', 'text=Upgrade your game.'],
  ['/privacy', 'Privacy Policy | Dominus', '#privacyContent'],
  ['/terms', 'Terms of Service | Dominus', '#termsContent'],
  ['/presskit', 'Dominus Press Kit - Fact Sheet, Logos & Screenshots', '#presskit'],
  ['/signin', 'Sign In | Dominus', '#s-submitButton'],
  ['/createaccount', 'Create a Free Account | Dominus', '#ca-submitButton']
];

for (const [path, title, selector] of PAGES) {
  test(`${path} draws its page, signed out`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator(selector).first()).toBeVisible();
    await expect(page).toHaveTitle(title);
  });
}

test('the landing page buttons move between pages without reloading', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.notReloaded = true; });
  await page.click('#joinAGameButton');
  await expect(page).toHaveURL(/\/games$/);
  await expect(page.locator('#landingGames')).toContainText('Current Games');
  await page.goBack();
  await page.click('#howToPlayButton');
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.locator('#guideContainer')).toBeVisible();
  expect(await page.evaluate(() => window.notReloaded)).toBe(true);
});

test('robots.txt, llms.txt and the sitemaps answer the way they do on a development server', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(robots.headers()['content-type']).toContain('text/plain');
  // a development server asks search engines to stay away
  expect(await robots.text()).toContain('Disallow: /');

  for (const path of ['/llms.txt', '/llms-full.txt']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type'], path).toContain('text/markdown');
    expect(await res.text(), path).toContain('Dominus');
  }

  // sitemaps are only served in production
  expect((await request.get('/sitemap.xml')).status()).toBe(404);
});

test('the server sends each page its title and description before any script runs', async ({ request }) => {
  const html = await (await request.get('/games')).text();
  expect(html).toContain('<title>Join a Game - Open &amp; Upcoming Games | Dominus</title>');
  expect(html).toMatch(/<meta name="description" content="[^"]+">/);
});
