# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dominus is a multiplayer browser-based social strategy game built with **Meteor.js**. Players conquer castles, form feudal hierarchies (king/lord/vassal), and compete to dominate the map. Army movement and resource gathering are time-based (asynchronous gameplay).

## Development Commands

```bash
# Install dependencies
meteor npm install

# Run locally (requires MongoDB running)
meteor run --settings settings.json

# Build for production
meteor build .build --architecture os.linux.x86_64

# Deploy to production: ./deploy.sh (Mac/Linux or Git Bash) or deploy.bat (Windows wrapper).
# Registry-free — the image is streamed to the server over SSH (docker save | ssh | docker load).
# Never `docker compose pull` the dominus services on the server; there is no upstream registry.
# The server keeps the images of the last 2 deploys, tagged by commit:
#   ./deploy.sh --rollback [commit]   # back to the previous (or a named) kept image, no rebuild
#   ./deploy.sh --list                # kept images and recent deploys
# tests/deploy/ tests deploy.sh against a throwaway server (setup.sh, then run.sh).
```

```bash
# Run tests (from a second terminal while the app is running)
meteor shell
# Then in the shell:
Meteor.call('runAllTests')        # runGameCreationTests is the same thing
Meteor.call('runAllTests', 'method contracts')   # only suites whose name contains it

# Or, without a running app: starts the app (and Redis in docker if needed),
# runs the suites, and writes .test-results/server-tests.md
tests/run-server-tests.sh
RUNS=3 COVERAGE=1 tests/run-server-tests.sh   # repeat runs, plus c8 coverage
```

The runner is `server/lib/testRunner.js` (`dTest`). Each `server/*Tests.js` suite registers with `dTest.addSuite`. Results print to the server console and return as an object to the shell. The runner is async-aware: a test or method call that returns a promise is awaited and a rejection fails it, and any unhandled rejection or uncaught exception during the run fails the run. SyncedCron is paused while the suites run. Tests are async: await method and publication handlers, DDP calls and the `dTest` helpers, and check for errors with `await dTest.throws(fn)`. `dTest.eachAsync`, `mapAsync`, `filterAsync` and `findAsync` are `_.each`, `_.map`, `_.filter` and `_.find` for an async callback, one call at a time.

Method contract suites (`server/*ContractTests.js`) call methods the way the browser does: `dTest.ddp.connect(userId)` opens a real DDP connection logged in as that user (`server/lib/testRunnerDdp.js`), so calls go through the rate limiter, `server/methodGate.js` and the method. `dTest.buildGameWorld()` (`server/lib/testRunnerWorld.js`) starts a real game with players, castles and a market, and `dTest.snapshot` / `dTest.assertUnchanged` check that a refused call changed nothing. They pin down what the code does today; a test named "known bug" describes a bug, so fixing the bug means changing that test on purpose.

Game logic reads the time from `dClock` and random numbers and generated ids from `dRandom` (`packages/dominus-clock`) instead of `new Date()`, `Math.random()` and `Random.id()`, so tests can fix the clock and seed them; new game code should too. `server/simulationTests.js` plays a whole four-player game on a fixed clock with a seeded random source (`dTest.simulation`, `server/lib/testRunnerSimulation.js`: it runs the jobs and crons itself), checks the game's invariants after each step, and compares every document with `tests/golden/simulation.json`. A change that is meant to change what the game does needs that file recorded again: each run writes `.test-results/simulation/actual.json` and each step's documents; see the top of `server/simulationTests.js`.

Browser tests (Playwright, `tests/e2e/`, see its README) drive the real game in Chromium: `tests/e2e/run.sh` starts a fresh app, runs every spec and writes `.test-results/e2e/report`. Specs make their data with `dTest.e2e` (`server/lib/testRunnerE2e.js`) through `meteor shell`; everything they make is named `e2e_*` or `E2E ...` and removed by `dTest.e2e.reset()`. Pages can't reach other sites, and a page error or an exception Meteor logs from an autorun fails the test.

The soak test (`tests/soak/`, see its README) runs the production Docker image as a web and a worker container. They talk to MongoDB 8.0 (a replica set with the oplog) and Redis on a Docker network with no internet access, while DDP bots play crazy fast games for hours. Run it as `tests/soak/run.sh` (12 hours by default; `MINUTES=30` for a short check, `BASELINE=<summary.json>` to compare with a soak of master, `DUMP=<mongodump folder>` to replay production data). `DOMINUS_SOAK_MONITOR` turns on `server/soakMonitor.js`, which prints a `SOAK_SAMPLE` line every minute: memory, job counts and failures, and each running game's invariants. Only the soak sets it. `tests/soak/report.js` writes `.test-results/soak/report.md`.

The tests remove every document in several collections (`Games.remove({})` etc.), so only run them against a local development database. The method refuses calls from clients and from production builds.

The tinytest package tests (`Package.onTest`) don't currently build under `meteor test-packages`: client `.less` imports of `{dominus-init}/client/*.import.less` fail to resolve.

## Environment Variables

Required: `MAIL_URL`, `S3ACCESSKEYID`, `S3SECRETACCESSKEY`, `DOMINUS_WORKER=true`, `DOMINUS_ADMIN_EMAIL`, `DOMINUS_TEST=false`

Optional: `DOMINUS_REDIS_HOST`, `DOMINUS_REDIS_PORT`

## Architecture

### Package-Based Modular Monolith

The core application logic lives in **34 custom Meteor packages** under `packages/`. Each package encapsulates a game feature domain and follows this internal structure:

```
packages/dominus-<feature>/
├── package.js          # Manifest: dependencies, exports, file loading order
├── both/               # Shared client+server code
│   ├── namespace.js    # Global namespace object (e.g., dCastles = {})
│   ├── *Methods.js     # Meteor.methods() RPC definitions
│   └── *Functions.js   # Shared business logic
├── server/
│   ├── publish*.js     # Meteor.publish() data subscriptions
│   ├── *ServerMethods.js
│   ├── *ServerFunctions.js
│   ├── *Job.js         # Bull queue background jobs
│   └── indexes.js      # MongoDB index definitions
└── client/
    ├── *.html          # Blaze templates
    ├── *.js            # Template helpers and event handlers
    └── *.less          # Component styles
```

### Key Package Domains

- **Game core**: `dominus-game`, `dominus-control`, `dominus-init`
- **Entities**: `dominus-castles`, `dominus-villages`, `dominus-armies`, `dominus-capitals`
- **Combat**: `dominus-battles`
- **Economy**: `dominus-income`, `dominus-market`
- **Map**: `dominus-hexmap`, `dominus-mapmaker`, `dominus-mapbaker`, `dominus-minimap`, `dominus-mappather`
- **Social**: `dominus-chat`, `forum-*`
- **Data**: `dominus-collections` (defines all 25+ MongoDB collections)
- **Background processing**: `dominus-queue` (Bull/Redis job queue)
- **Admin**: `dominus-admin`

### Top-Level Directories

- `client/` - Meteor client entry: main HTML, body template, account handling
- `server/` - Meteor server entry: startup, account hooks, user publications
- `lib/` - Shared utilities and client router (SimpleRouter)
- `game/` - Game UI templates (left/right panels, navigation, settings)
- `alert/` - Alert notification system UI
- `public/` - Static assets

### Client-Server Communication

- **Meteor Methods**: RPC calls defined in `*Methods.js` files, validated with `check()`, rate-limited via DDPRateLimiter
- **Method policy**: every method a client can call must be listed in `server/methodPolicy.js` as `public`, `user` or `game`. `server/methodGate.js` enforces it on every client call and refuses unlisted methods. `game` methods require the caller to have a `Players` doc in the game that owns the documents being acted on, which is what keeps spectators from changing anything. `server/spectatorTests.js` fails if a method is missing from the policy or its attack table.
- **Browser errors**: `client/errorReporter.js` sends the page's uncaught errors, unhandled rejections and the exceptions Meteor logs (autoruns, helpers, method callbacks, through `Meteor._debug`) to `reportClientError` (`server/clientErrors.js`), which logs each as one `Client error: {json}` line and keeps the last 20 in `ClientErrors.recent`. Each distinct error is sent once per page load, at most 20 per page, and 5 a minute per connection.
- **Spectating**: anyone (even logged out) can open `/game/:id`; without a `Players` doc in that game they spectate. The client keeps this in `Session 'gameViewMode'` and only sets `Session 'playerId'` for players.
- **Pub/Sub**: Server publishes via `Meteor.publish()`, clients subscribe with `Meteor.subscribe()`
- **Routing**: SimpleRouter (`danimal:simplerouter`) maps URLs to Blaze templates via `Template.dynamic`

### Background Job System

Uses Bull 4 (Redis-backed queue) with 40+ job types for async game mechanics: army movement, income collection, battle resolution, map baking. Jobs are defined in `*Job.js` files within packages. `DOMINUS_WORKER=true` env var enables background processing. Every handler runs through `Queues.runJob` (`dominus-queue/queue.js`): Bull counts a job done when its work is done, so a queue runs at most its concurrency of jobs at once (1 unless the handler passes more to `.process`). A handler that throws is logged and its job still completes; jobs are never retried (`Queues.jobOptions` sets `attempts: 1`), and a job past its `timeout` fails in Bull but keeps its uniqueId until its work ends. Don't wait on Bull's own wait for active jobs (`queue.pause(true)` without `doNotWaitActive`, `queue.close()`): under fibers it aborts Node; use `Queues.pauseLocal()` and `Queues.whenIdle()`. SyncedCron (`quave:synced-cron`, pinned to 2.1.0 in `dominus-init/package.js`: later versions skip a tick while an earlier one has no `finishedAt`, and exit the process on SIGTERM and on an unhandled rejection) handles distributed scheduling; its ticks are recorded in the `cronHistory` collection.

### Async conversion (Meteor upgrade, stage 2)

The server code is moving from fibers to `async`/`await`, one domain per PR, while the app stays on Meteor 2.16. See `/mnt/project-files/reports/meteor-upgrade-plan.md` for the plan.

- **The missing-await check.** `node tests/async/check-await.js` must report no findings. `tests/run-server-tests.sh` runs it, and `tests/async/README.md` explains it.
  - Await or return every promise, or `.catch()` it.
  - Write `void fooAsync()` when nothing should wait on purpose.
  - Don't give an async callback to `forEach`/`_.each`; use `for...of` or a cursor's `forEachAsync`, which waits for it.
- **Settings stay sync.** `_gs.*` reads a server cache that holds every game (`dominus-settings/namespace.js`).
  - Code that inserts a game calls `_gs.cacheGame`.
  - Code that can see a game made on another server first awaits `_gs.ensureGame(gameId)`. `Queues.runJob` does this for any job whose data has a `gameId`.
  - The worker takes no jobs until `_gs.ready` resolves.
  - A cache miss logs an error with its stack, once per game.
- **Methods** (`both/*Methods.js` run on client and server):
  - A server-only method becomes an `async function`.
  - A shared method stays a plain function. Its simulation is sync, behind `if (this.isSimulation) { ...; return; }`, and the server's part is `return (async () => { ... })();`. On 2.16 two async simulations that overlap throw "Called saveOriginals twice without retrieveOriginals" in the browser and the second one's change is lost (`tests/e2e/specs/markers.spec.js`).
  - A method with no useful simulation loses its client stub.
  - As each method converts, its client callers move from `Meteor.call` to `Meteor.callAsync`: `dFunc.callAndForget(name, ...args)` for a call nobody waits for (it logs a refusal the way `Meteor.call` does), and `dFunc.callWithCallback(name, args, callback)` in place of `Meteor.apply(name, args, {}, callback)`. A server-only method (no stub) can keep `Meteor.call`.
  - Shared helpers the client calls sync get a server `…Async` twin, as with `dMarket.total_of_buyAsync`.
- **Order.** Callers can go first. On 2.16, an async function can still make sync Meteor calls after an `await`. `node tests/async/async-graph.js` shows how far converting a domain ripples into others.
  - A sync caller in a domain that hasn't converted yet calls a converted function as `Promise.await(fn())`, with a comment naming the PR that converts the caller. The only one left is `server/accounts.js`'s login hook: accounts-base 2.2 doesn't wait for an async `onLogin` callback, and the Meteor 3 upgrade (PR 19) removes it.
- **Publications and observers.** On Meteor 3, server `observe`, `observeChanges` and `Mongo.Collection._publishCursor` return promises. Use `observeAsync`/`observeChangesAsync`, and make a publication that calls `_publishCursor` async and await it. `node tests/async/check-await.js --meteor3` lists the ones left.
- **Jobs.** A handler is `process(async function(job) { await ... })`, without `Meteor.bindEnvironment`. Jobs are added with `await Queues.addAsync(...)`, which rejects when Redis refuses the job; the sync `Queues.add` is gone (upgrade PR 18). Where the caller should carry on, use `await Queues.addAsyncOrLog(...)`, which logs the error and resolves with false. Tests record or stub `Queues.addAsync` (`dTest.recordJobs`; the simulation replaces it too). Cron job functions are async, and SyncedCron 2.1.0 awaits them.
- **Tests.** The test files are async too (PR 18): they use the `*Async` collection calls and await what they call, and the missing-await check covers them. The package tinytests use `Tinytest.addAsync`. A browser test's `server(code)` waits for a promise the code returns.

### Tech Stack

- **Framework**: Meteor.js with Blaze templating
- **Database**: MongoDB (via Meteor's mongo package)
- **Queue**: Redis + Bull
- **CSS**: LESS + Bootstrap 3
- **Client libs**: jQuery, D3.js (v3), Moment.js, Underscore.js
- **Auth**: Meteor accounts with password, Google OAuth, Facebook OAuth
- **Payments**: Stripe
- **Email**: SendGrid / Mandrill
- **Deployment**: Docker, served on port 80 via `node main.js`
