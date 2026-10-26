# Bundle check

The production client bundle is minified, and the development bundle the e2e tests use is not. Old libraries in `lib/client/compatibility` assign names they never declare and rely on sloppy mode. When the minifier inlines one of their functions into a function that says `'use strict'`, that assignment throws `ReferenceError: x is not defined`. That broke every chart on Meteor 3 (`metricsgraphics.js`, `main_time_format`, Oct 2026), and no test saw it.

`check-bundle.js` parses each client bundle of a production build with [acorn](https://github.com/acornjs/acorn) and lists every assignment to an undeclared name in strict code. It exits 1 if there is one.

```bash
npm ci --prefix tests/bundle                       # once
meteor build /tmp/dominus-build --directory --architecture os.linux.x86_64
node tests/bundle/check-bundle.js /tmp/dominus-build
(cd tests/bundle && node --test implicitGlobals.test.js)   # the checker's own tests
```

It also takes the `.tar.gz` that `meteor build` makes. Assignments in sloppy code are counted but are fine: they make a global, as the library expects.

The fix for a finding is to declare the name with `var` in the library, with a comment saying why.
