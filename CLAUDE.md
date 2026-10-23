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

# Or, without a running app: starts the app (and Redis in docker if needed),
# runs the suites, and writes .test-results/server-tests.md
tests/run-server-tests.sh
RUNS=3 COVERAGE=1 tests/run-server-tests.sh   # repeat runs, plus c8 coverage
```

The runner is `server/lib/testRunner.js` (`dTest`). Each `server/*Tests.js` suite registers with `dTest.addSuite`. Results print to the server console and return as an object to the shell. The runner is async-aware: a test or method call that returns a promise is awaited and a rejection fails it, and any unhandled rejection or uncaught exception during the run fails the run. SyncedCron is paused while the suites run. Call method and publication handlers through `dTest.settle(...)` and check for errors with `dTest.throws(fn)`, so they keep working when the code under test becomes async.

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
- **Spectating**: anyone (even logged out) can open `/game/:id`; without a `Players` doc in that game they spectate. The client keeps this in `Session 'gameViewMode'` and only sets `Session 'playerId'` for players.
- **Pub/Sub**: Server publishes via `Meteor.publish()`, clients subscribe with `Meteor.subscribe()`
- **Routing**: SimpleRouter (`danimal:simplerouter`) maps URLs to Blaze templates via `Template.dynamic`

### Background Job System

Uses Bull (Redis-backed queue) with 40+ job types for async game mechanics: army movement, income collection, battle resolution, map baking. Jobs are defined in `*Job.js` files within packages. `DOMINUS_WORKER=true` env var enables background processing. SyncedCron handles distributed scheduling.

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
