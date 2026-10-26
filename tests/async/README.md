# Async conversion tools

Two scripts for stage 2 of the Meteor upgrade (`/mnt/project-files/reports/meteor-upgrade-plan.md`, PR 6). Stage 2 converts the server code from fibers to `async`/`await`, one domain per PR. They read the app's own files with [acorn](https://github.com/acornjs/acorn), and they need nothing from Meteor.

```bash
npm ci --prefix tests/async                # once
node tests/async/check-await.js            # the missing-await check; exit 1 on a finding
node tests/async/async-graph.js            # writes .test-results/async-graph.md and .json
(cd tests/async && node --test check-await.test.js)   # the checker's own tests
```

`tests/run-server-tests.sh` runs the check and its tests and puts the result at the top of its report.

## check-await.js

This script flags a promise that nothing waits for. It checks every call that returns a promise:

- calls to the app's own async functions;
- `*Async()` APIs;
- `fetch()`;
- a bulk's `execute()` without a callback;
- `rawCollection()` methods;
- Bull and its Redis client.

A call is fine when it is awaited, returned, handed to `Promise.all`, given a `.catch()`, or written as `void fooAsync()` to say that nobody waits for it on purpose. The file's header comment has the full list.

The checker also flags an async callback given to `forEach`, `_.each`, `_.map`, `_.times` or `.map`, unless the `map` goes to `Promise.all`, and one given to `filter`, `find`, `some`, `every`, `sortBy`, `reduce` and the like, which read the promise as if it were the value. A sync callback that returns a promise counts, and so does an async function passed by name (`_.map(ids, sim.nameOf)`). A cursor's `forEachAsync` and `mapAsync` do wait for their callbacks, on 2.16 as on Meteor 3. `server/asyncFoundationTests.js` shows both.

To skip a line, put `// check-await: ignore <reason>` on it or on the line above. The reason is required.

`--meteor3` also lists the calls that are sync on 2.16 but return a promise on Meteor 3: a cursor's `observe()` and `observeChanges()`, and `Mongo.Collection._publishCursor()`, outside client files. They are not findings yet, so the test run only counts them. Each domain's PR awaits its own (`observeAsync`, `await Mongo.Collection._publishCursor(...)` in an async publication), and the list must be empty before stage 3.

The checker finds the app's own async functions by name: `async function foo`, `foo = async () => ...`, `dX.foo = async function`, and `dX = {foo: async function}`. A function that isn't async but returns a promise (`function f() { return fooAsync(); }`) counts as one too. It matches calls by name, the way this codebase calls its namespaced functions. A bare name is the function declared around the call when there is one, before a function of that name in another file. It follows a local alias (`var expectError = dTest.expectError`), `fn.apply(...)` and `fn.call(...)`, and an environment variable's `withValue(value, async function() {...})`, which returns its function's promise. It does not follow a call through `this` or a computed name (`handlers[name]()`).

A promise kept in a variable is fine when the variable is awaited later, unless the code also uses it as if it held the value (`var e = fooAsync(); e.error`, or `users[name] = e`); checking that it is a promise (`e instanceof Promise`, `dTest.isPromise(e)`) is fine. Returning a promise from a `try` block that has a `catch` or `finally` doesn't count as waiting for it: the `finally` runs first, so write `return await`.

In test files the checker also guesses at calls on an object it can't name: `p.doc()` counts as a promise when every function anywhere with the key `doc` is async (a helper returned `{doc: async function() {...}}`). A key that a builtin uses too (`split`, `connect`, ...) or that also names a sync function is left alone, and so is a DDP `connection.`'s own `call` and `subscribe`. `Tinytest.addAsync` registers a test; it is not a promise. A package's `tests/` folder is checked too (package.js names its files), though the app's own `tests/` is not.

## async-graph.js

This script reports what a conversion PR will touch. For every server function (and every method, publication, job, cron and observer), it lists what the function calls and whether it reaches the database. The `_gs` settings stay sync, because they read a cache. For each domain the report gives:

- the database calls to convert;
- the **ripple**: the functions in other domains that have to become async when this domain's functions do;
- what stage 2 removes: Futures, bulk executes with a callback, `Promise.await`, `Meteor._sleepForMs` and server-side `Meteor.call`.

Converting a domain is cheapest after its callers are async already. On 2.16, an async function can still make sync Meteor calls after an `await`, so callers can go first.
