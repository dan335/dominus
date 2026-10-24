# Soak test

Bots play the production Docker image for hours, and the run fails if anything wears down: a job that fails, a promise nobody waits on, a broken invariant, memory that keeps growing, or a call the server can't answer. This is T8 of the Meteor upgrade plan, and with no staging server it is the gate before each upgrade stage reaches production.

It runs only on your machine, in Docker. Nothing from the soak leaves the Docker network: no mail, no S3, no Stripe.

## Running

```bash
tests/soak/run.sh                          # build HEAD's image, 12 bots, 12 hours
MINUTES=30 tests/soak/run.sh               # a short check
HOURS=24 tests/soak/run.sh                 # the stage 3 gate
IMAGE=dominus-soak:abc1234 tests/soak/run.sh        # reuse an image you built before
BASELINE=old/summary.json tests/soak/run.sh         # compare with an earlier soak (of master)
WATCH_PORT=3100 tests/soak/run.sh          # watch at http://localhost:3100 (soak_bot01 / soak-password-1)
DUMP=~/dumps/dominus tests/soak/run.sh     # replay a production dump, see below
```

It needs Docker, and Meteor to build the image (`meteor build`, then `docker build`, the same as `deploy.sh`). The results go to `.test-results/soak`:

- `report.md`: the verdict;
- `summary.json`: the same, for a later run's `BASELINE`;
- the logs of the web, worker, MongoDB and bots containers;
- `bots.json` with every call the bots made;
- `docker-stats.csv`.

Keep the `summary.json` of a soak of master. The soak of each upgrade stage is then compared with it, and a kind of logged exception master didn't have fails the run.

## What runs

- **The app.** The image `deploy.sh` would ship, run as a web and a worker container, the way the server runs it. Both use the oplog, as production does.
  - The settings are `settings.json` with the development cheats off (`dominusIsDev: false`).
  - `DOMINUS_SOAK_MONITOR` turns on `server/soakMonitor.js`, which is off everywhere else. Every minute each process prints a `SOAK_SAMPLE` line with:
    - its memory, event loop delay and DDP sessions;
    - in the worker, also the job queues, failed job attempts, the cron ticks recorded in `cronHistory` and the invariants of every running game (`dTest.gameInvariants`).
- **The databases.** MongoDB 8.0, as on Atlas, as a single-node replica set, so the oplog and change streams work. Redis 6.
- **The network.** Everything is on a Docker network created with `--internal`, so no container can reach the internet. Emails are only printed to the web log. `WATCH_PORT` adds a small relay on the normal network, and only the relay is reachable from outside.
- **The bots** (`bots/soak.js`). They use a small DDP client (`bots/ddp.js`) on Node 22, with no packages.
  - An admin bot makes a crazy fast game (`addOrEditGame`). Most bots sign up and the rest join once it runs. When a game ends, the admin makes the next one and everyone moves to it.
  - Each bot subscribes to what the game screen subscribes to, then every 4 to 15 seconds does what a player might:
    - buy and sell at the market, hire soldiers, muster armies;
    - march on the nearest enemy castle or village, or to a hex nearby;
    - build and upgrade villages, split, combine, stop and garrison armies;
    - send gold, chat, start chat rooms;
    - click on castles (the right panel's subscriptions) and scroll the map (`countryOnScreen`).
  - Every 20 to 90 minutes a bot closes the game and comes back. Two signed-out spectators watch the map.
  - The bots' accounts have their emails marked verified in MongoDB, since no mail leaves the network. The admin is made admin the same way.

## What fails it

| Check | Fails when |
|---|---|
| The monitor reported all along | a process stopped sending samples, or the monitor threw |
| No web or worker restarts | a container restarted (an uncaught exception kills the process) |
| No unhandled promise rejections | any, in either process |
| No job failed for good | any job in a Bull failed set: since Bull 4 that is a job that ran past its timeout, or a stalled job (its worker stopped renewing its lock). Jobs are never retried. |
| No job threw | a job handler threw. That never reaches Bull: the handlers are wrapped in `Meteor.bindEnvironment`, which logs the error as "Exception in callback of async function" and returns, and `Queues.runJob` logs a rejected promise as "Exception in job <name>", so Bull marks the job completed (and never retries it). The report finds these in the worker log by that line or by their stack, which runs through `dominus-queue/queue.js`. With a `BASELINE`, kinds the baseline had only warn. |
| No queue backs up | a queue had 200 or more jobs waiting at a sample. 20 or more only warns. Since Bull 4 a queue runs at most its concurrency of jobs at once, so this is the sign that a queue needs more. |
| Every cron ran on every tick | a cron tick threw, a cron missed a tick (a gap of 1.5 times its interval between two ticks in `cronHistory`), or a cron stopped. Crons with fewer than 3 ticks in the run, such as the midnight job, are only checked for errors. |
| The invariants hold | an invariant is broken for 3 samples in a row (a passing moment while a job runs doesn't count). Known bugs are listed but don't fail. |
| No internal server errors or unanswered calls | any method call answered with a 500 or not answered within 60 seconds. Refusals the game makes on purpose (not enough gold, too far) are counted but are fine. |
| Memory is stable | the heap in the last tenth of the run is over 1.5 times what it was after the warm-up and 50 MB more. Under 2 hours (`MEMORY_MIN_MINUTES`) this only warns. |
| The game was played | no game started, or fewer than 100 calls went through |
| No new kinds of logged exceptions | with a `BASELINE`: an exception the baseline didn't have. Without one, exceptions only warn. |

## Production-data replay

`DUMP=<folder> tests/soak/run.sh` restores a `mongodump` of one database (`mongodump --db <name> --out <folder>`), runs the worker and the web container on it for `HOURS` (default 1) with no bots, and checks the same things. An invariant that was already broken in the dump is listed as such and doesn't fail the run.

A production dump has players' emails in it. Keep it on your own machine; the soak never sends it anywhere.
