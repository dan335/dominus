// Tests for check-await.js: node --test tests/async/check-await.test.js
const test = require('node:test');
const assert = require('node:assert');
const {checkSources} = require('./check-await');

// the lines of a.js the checker flags
function flagged(source, others) {
  return checkSources(Object.assign({'a.js': source}, others || {}))
    .filter(function(f) { return f.file === 'a.js'; })
    .map(function(f) { return f.line; });
}

const DEF = 'async function load() { return 1; }\n';

test('an un-awaited call to an async function is flagged', function() {
  assert.deepStrictEqual(flagged(DEF + 'function f() { load(); }'), [2]);
});

test('awaiting, returning, void and Promise.all are waiting for it', function() {
  assert.deepStrictEqual(flagged(DEF + [
    'async function a() { await load(); }',
    'function b() { return load(); }',
    'const c = () => load();',
    'function d() { void load(); }',
    'async function e() { await Promise.all([load(), load()]); }',
    'function g(x) { return x ? load() : null; }',
    'async function h() { return (await load()) || load(); }',
    'function i() { Promise.await(load()); }'
  ].join('\n')), []);
});

test('.catch() handles it, .then() alone does not', function() {
  assert.deepStrictEqual(flagged(DEF + [
    'function a() { load().catch(console.error); }',
    'function b() { load().then(function() {}).catch(console.error); }',
    'function c() { load().then(function() {}, console.error); }',
    'function d() { load().then(function() {}); }',
    'async function e() { await load().then(function() {}); }'
  ].join('\n')), [5]);
});

test('if (fooAsync()) tests the promise, not its value', function() {
  assert.deepStrictEqual(flagged('async function f() { if (Games.findOneAsync("x")) return 1; }'), [1]);
  assert.deepStrictEqual(flagged('async function f() { if (await Games.findOneAsync("x")) return 1; }'), []);
});

test('a promise kept in a variable must be awaited later', function() {
  assert.deepStrictEqual(flagged(DEF + 'async function a() { const p = load(); other(); await p; }'), []);
  assert.deepStrictEqual(flagged(DEF + 'async function a() { const p = load(); return [p]; }'), [2]);
  assert.deepStrictEqual(flagged(DEF + 'async function a() { const p = load(); const q = load(); await Promise.all([p, q]); }'), []);
});

test('async callbacks to forEach, _.each and map are flagged unless the map goes to Promise.all', function() {
  assert.deepStrictEqual(flagged([
    'function a(xs) { xs.forEach(async function(x) { await x; }); }',
    'function b(xs) { _.each(xs, async (x) => { await x; }); }',
    'async function c(xs) { await Promise.all(xs.map(async (x) => x)); }',
    'function d(xs) { xs.map(async (x) => x); }',
    'function e(xs) { return Promise.all(_.map(xs, async (x) => x)); }',
    'function f(xs) { xs.forEach(function(x) { return x; }); }'
  ].join('\n')), [1, 2, 4]);
});

test('a cursor\'s forEachAsync and mapAsync wait for an async callback', function() {
  assert.deepStrictEqual(flagged([
    'async function a() { await Games.find().forEachAsync(async function(g) { await g; }); }',
    'async function b() { await Games.find().mapAsync(async (g) => g); }',
    'function c() { Games.find().forEachAsync(async (g) => g); }'
  ].join('\n')), [3]);
});

test('bulk.execute() without a callback and Queues.addAsync are promises', function() {
  assert.deepStrictEqual(flagged([
    'function a(bulk) { bulk.execute(); }',
    'function b(bulk) { bulk.execute({}, function(error) {}); }',
    'async function c(bulk) { await bulk.execute(); }',
    'function d() { Queues.addAsync("job", {}); }',
    'async function e() { await Queues.addAsync("job", {}); }'
  ].join('\n')), [1, 4]);
});

test('rawCollection(), fetch() and Bull calls; not Meteor.wrapAsync or bulk set-up', function() {
  assert.deepStrictEqual(flagged([
    'function a() { Games.rawCollection().updateMany({}, {}); }',
    'function b() { const raw = Games.rawCollection(); raw.deleteMany({}); }',
    'function c() { return Games.rawCollection().initializeOrderedBulkOp(); }',
    'function d() { fetch("http://x"); }',
    'function e() { Queues.foo.pause(); }',
    'function f(job) { job.isFailed(); }',
    'const g = Meteor.wrapAsync(function(cb) { cb(); });',
    'function h() { Games.rawCollection().find({}); }'
  ].join('\n')), [1, 2, 4, 5, 6]);
});

test('async functions are found by their dotted name in other files', function() {
  const others = {
    'b.js': 'dX = {}; dX.load = async function() {}; dY = {save: async function() {}, nested: {go: async () => 1}};'
  };
  assert.deepStrictEqual(flagged([
    'function a() { dX.load(); }',
    'function b() { dY.save(); }',
    'function c() { dY.nested.go(); }',
    'function d() { dZ.load(); }',
    'async function e() { await dX.load(); }'
  ].join('\n'), others), [1, 2, 3]);
});

test('an ignore comment with a reason skips its line or the next', function() {
  assert.deepStrictEqual(flagged(DEF + [
    'function a() { load(); } // check-await: ignore fire and forget on purpose',
    '// check-await: ignore the queue logs its own errors',
    'function b() { load(); }',
    'function c() { load(); } // check-await: ignore',
  ].join('\n')), [5]);
});
