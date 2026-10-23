# Browser tests

Playwright tests that drive the real game in Chromium. Players sign up, play, chat and use the forum the way people do. These tests cover what the server suites (`Meteor.call('runAllTests')`) can't: templates, routing, subscriptions arriving in the page, and two browsers seeing each other's changes.

Only run them against a local development app. The fixtures create and delete users and games, like the server tests do.

## Running

```bash
tests/e2e/run.sh                       # starts a fresh app (and Redis if needed), runs every spec, stops the app
tests/e2e/run.sh specs/chat.spec.js    # one spec; any playwright test arguments work
REUSE=1 tests/e2e/run.sh               # use the app you already have running from this checkout
```

A full run takes about 5 minutes once the app is up. The report is in `.test-results/e2e/report`, and failures keep a screenshot and a trace in `.test-results/e2e/output`. To browse them:

```bash
cd tests/e2e && npx playwright show-report ../../.test-results/e2e/report
npx playwright show-trace ../../.test-results/e2e/output/<test>/trace.zip
```

`run.sh` installs `@playwright/test` on first use. It also needs a Chromium for Playwright: run `npx playwright install chromium` once in `tests/e2e`. The cloud sandbox already has one.

## How they work

- **The app.** Each run uses one app and one database, so the specs run one at a time (`workers: 1`).
- **Fixtures.** The specs make their data with the fixtures in `server/lib/testRunnerE2e.js` (`dTest.e2e`): users, a started game with players, armies, resources. They call them through `meteor shell` (`lib/server.js`), which is also how they check what a click changed in the database.
  - Everything the fixtures make is named `e2e_*` (users) or `E2E ...` (games, forum topics).
  - `dTest.e2e.reset()` removes it again. Each spec calls it before and after.
  - The fixtures refuse to run in a production build.
- **Every page** (`lib/fixtures.js`):
  - can't reach any other site, so analytics, Facebook, Google and Stripe are cut off and nothing leaves the machine;
  - fails its test on an uncaught error, or on an exception Meteor catches and only logs (an autorun or a method callback that throws).
  - A test that pins a known bug can allow the error it expects with `allowPageErrors(page, /pattern/)`.
- **Two browsers.** `newPage()` opens a second browser with its own sign in, for a second player, a reader or a spectator.

## What they cover

| Spec | What |
|---|---|
| `public.spec.js` | Every public page draws, with its own title. The landing buttons navigate without a reload. `robots.txt`, `llms.txt` and the sitemap. |
| `auth.spec.js` | Create an account, sign out, and sign in by username or email. Wrong passwords and taken names are refused. Signing in from a game you're watching brings you back to it. |
| `spectate.spec.js` | Signed out or signed in, a non-player can look at castles but gets no action buttons, and calling the methods directly is refused and changes nothing. A spectator sees an army appear and move live. |
| `game.spec.js` | Hire soldiers, make an army and march it by typing coordinates. Buy and sell at the market and see the price move. |
| `chat.spec.js` | Two players talk in the Everyone room and in a room of their own, each seeing the other's messages arrive. |
| `forum.spec.js` | Start a topic, reply, and a second reader sees the reply arrive. Signed out, the forum asks you to sign in. **Known bug:** a `javascript&#58...` link in a post runs when clicked (see `reports/forum-audit.md`). |
| `admin.spec.js` | An admin creates and removes a game, and pauses and unpauses the job queue. A non-admin gets neither the panel nor the methods. |
| `map.spec.js` | Zoom, pan with the buttons, the arrow keys and the mouse, and go to a hex by its coordinates. **Known bug:** going to a castle's coordinates puts `undefined` in the URL. |
| `store.spec.js` | The store marks what you own. A castle image you own can be put on your castle (PR #71). |

A test named "known bug" describes what the code does today. Fixing the bug means changing that test on purpose, as with the server suites.

Not covered here: Google and Facebook sign in, real Stripe payments, and email. Those need the real services, so they stay in the manual smoke test after a deploy.
