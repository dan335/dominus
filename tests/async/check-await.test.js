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

test('observe, observeChanges and _publishCursor, which return a promise on Meteor 3, are flagged outside client files', function() {
  const source = [
    'function a() { Players.find().observe({added: function() {}}); }',
    'function b() { var h = Players.find().observeChanges({}); }',
    'function c(sub) { Mongo.Collection._publishCursor(Players.find(), sub, "players"); }',
    'async function d(sub) { await Mongo.Collection._publishCursor(Players.find(), sub, "players"); }',
    'async function e() { await Players.find().observeAsync({}); }',
    'function f() { return Players.find().observe({}); }',
    'function g(cursor, sub) { cursor._publishCursor(sub); }',
    'async function h(cursor, sub) { await cursor._publishCursor(sub); }'
  ].join('\n');
  const lines = function(name) {
    return checkSources({[name]: source}).map(function(f) { return f.line; });
  };
  assert.deepStrictEqual(lines('server/a.js'), [1, 2, 3, 7]);
  assert.deepStrictEqual(lines('lib/a.js'), [1, 2, 3, 7], 'shared files too');
  assert.deepStrictEqual(lines('client/a.js'), [], 'not client files: observe stays sync there');
  const finding = checkSources({'server/a.js': source})[0];
  assert.strictEqual(finding.kind, 'meteor3');
});

test('a bare name is the function declared around the call, before one of that name in another file', function() {
  const other = {'b.js': 'async function check() { return 1; }\n'};
  assert.deepStrictEqual(flagged('function f() { function check() {} check(); }', other), []);
  assert.deepStrictEqual(flagged('function f() { var check = function() {}; check(); }', other), []);
  assert.deepStrictEqual(flagged('function f() { check(); }', other), [1]);
  assert.deepStrictEqual(flagged('function f() { var load = async function() {}; load(); }'), [1]);
});

test('a local alias of an async function is that function', function() {
  const other = {'b.js': 'dTest = {}; dTest.throws = async function(fn) { await fn(); };\n'};
  assert.deepStrictEqual(flagged('function f() { var throws = dTest.throws; throws(g); }', other), [1]);
  assert.deepStrictEqual(flagged('async function f() { var throws = dTest.throws; await throws(g); }', other), []);
});

test('fn.apply() and fn.call() return what fn returns', function() {
  assert.deepStrictEqual(flagged(DEF + [
    'function a() { load.apply(null, []); }',
    'function b() { load.call(null); }',
    'async function c() { await load.apply(null, []); }',
    'function d() { Games.findOneAsync.call(Games, "x"); }',
    'function e(fn) { fn.apply(null, []); }'
  ].join('\n')), [2, 3, 5]);
});

test('withValue() with an async function returns its promise', function() {
  assert.deepStrictEqual(flagged([
    'function a() { DDP._CurrentInvocation.withValue(x, async function() {}); }',
    'async function b() { await DDP._CurrentInvocation.withValue(x, async function() {}); }',
    'function c() { DDP._CurrentInvocation.withValue(x, function() {}); }'
  ].join('\n')), [1]);
});

test('a promise kept in a variable and read as if it held the value is flagged, even when awaited later', function() {
  assert.deepStrictEqual(flagged(DEF + 'async function a() { var e = load(); use(e.error); return e; }'), [2]);
  assert.deepStrictEqual(flagged(DEF + 'async function a() { var p = load(); p.then(use); await p; }'), []);
});

test('Tinytest.addAsync registers a test; it is not a promise', function() {
  assert.deepStrictEqual(flagged('Tinytest.addAsync("x", async function(test) {});'), []);
  assert.deepStrictEqual(flagged('function f() { Queues.addAsync("x"); }'), [1]);
});

test('a promise kept in a variable and stored or handed on is flagged, but checking it is a promise is not', function() {
  assert.deepStrictEqual(flagged(DEF + 'async function a() { var u = load(); users.x = u; return u; }'), [2]);
  assert.deepStrictEqual(flagged(DEF + 'async function a() { var p = load(); assert(p instanceof Promise); assert(dTest.isPromise(p)); await p; }'), []);
});

test('in a test file, obj.key() is a promise when key only ever names async functions', function() {
  const lines = function(sources, file) {
    return checkSources(sources).filter(function(f) { return f.file === file; }).map(function(f) { return f.line; });
  };
  const world = 'function world() { return {doc: async function() {}, name: function() {}}; }\n' +
    'other = {name: async function() {}};\n';
  const body = 'async function t(w) {\n  w.doc();\n  await w.doc();\n  w.name();\n  "a,b".split(",");\n}\n';
  assert.deepStrictEqual(lines({'w.js': world, 'server/xTests.js': body}, 'server/xTests.js'), [2]);
  // outside the tests, an unknown object's method isn't guessed at
  assert.deepStrictEqual(lines({'w.js': world, 'server/x.js': body}, 'server/x.js'), []);
});

test('a sync callback to map() that returns a promise is an async callback', function() {
  assert.deepStrictEqual(flagged(DEF + 'async function a() { var xs = [1].map(function() { return load(); }); }'), [2]);
  assert.deepStrictEqual(flagged(DEF + 'async function a() { await Promise.all([1].map(function() { return load(); })); }'), []);
});

test('an async callback to _.times, or to filter, find and the like, is flagged', function() {
  assert.deepStrictEqual(flagged(DEF + [
    'async function a() { _.times(3, function() { return load(); }); }',
    'async function b() { [1].filter(async function() { return await load(); }); }',
    'async function c() { _.find([1], async function() { return true; }); }',
    'async function d() { await dTest.findAsync([1], async function() { return true; }); }',
    'async function e() { await Promise.all(_.times(3, function() { return load(); })); }'
  ].join('\n')), [2, 3, 4]);
});

test('returning a promise from a try block with a finally does not wait for it before the finally', function() {
  assert.deepStrictEqual(flagged(DEF + [
    'async function a() { try { return load(); } finally { done(); } }',
    'async function b() { try { return await load(); } finally { done(); } }',
    'function c() { try { x(); } finally { done(); } return load(); }'
  ].join('\n')), [2]);
});

test('an async function passed by name to map() is an async callback', function() {
  assert.deepStrictEqual(flagged(DEF + [
    'function a(ids) { var names = _.map(ids, load); }',
    'async function b(ids) { return await dTest.mapAsync(ids, load); }',
    'function c(load) { return _.map(load, String); }'
  ].join('\n')), [2]);
});

test('in a server file, the sync collection API is flagged: Meteor 3\'s server has none', function() {
  const lines = function(file, source) {
    return checkSources({[file]: source}).filter(function(f) { return f.kind === 'sync-api'; }).map(function(f) { return f.line; });
  };
  const source = [
    'Games.findOne("x");',
    'Meteor.users.update("x", {});',
    'Games.find({}).forEach(function() {});',
    'async function a() { await Games.find({}).forEachAsync(function() {}); await Games.findOneAsync("x"); }',
    'queue.remove();'
  ].join('\n');
  assert.deepStrictEqual(lines('server/x.js', source), [1, 2, 3]);
  // shared and client files keep it: minimongo and the method simulations are sync
  assert.deepStrictEqual(lines('packages/p/both/x.js', source), []);
});

test('an async method or publication that checks an argument after its first await or throw is flagged: Meteor 3 audits at the first await', function() {
  const late = function(source) {
    return checkSources({'server/x.js': source}).filter(function(f) { return f.kind === 'late-check'; }).map(function(f) { return f.line + ' ' + f.message.split(':')[1].trim().split(' ')[1]; });
  };
  assert.deepStrictEqual(late([
    'Meteor.methods({',
    '  a: async function(x, y) { check(x, String); check(y, Number); await load(); },',
    '  b: async function(x) { await load(); check(x, String); },',
    '  c: async function(x) { if (!this.userId) throw new Meteor.Error("no"); check(x, String); },',
    '  d: async function(x, y) { check([x, y], [String]); await load(); },',
    '  e: async function(x) { await helper(x); },',
    '  f: function(x) { if (!this.userId) throw new Meteor.Error("no"); check(x, String); },',
    '  g: function(x) { if (this.isSimulation) { return; } return (async () => { await load(); check(x, String); })(); },',
    '  h: function(x) { return (async () => { check(x, String); await load(); })(); },',
    '  async i(x) { await load(); check(x, String); },',
    '  j: async function() { await load(); }',
    '});',
    'Meteor.publish("p", async function(x) { await load(); check(x, String); });',
    'Meteor.publish("q", function(x) { check(x, String); return Games.find(x); });',
    'Meteor.publish("r", async function(x) { setTimeout(function() { throw new Error(); }); check(x, String); await load(); });'
  ].join('\n')), ['3 x', '4 x', '8 x', '10 x', '13 x']);
  // client files have no audit
  assert.deepStrictEqual(checkSources({'client/x.js': 'Meteor.methods({b: async function(x) { await load(); check(x, String); }});'})
    .filter(function(f) { return f.kind === 'late-check'; }).length, 0);
});

test('outside client files, the accounts functions that return a promise on Meteor 3 are flagged when nothing waits for them', function() {
  const source = [
    'async function a() { var id = Accounts.createUser({username: "x"}); }',
    'async function b() { var id = await Accounts.createUser({username: "x"}); }',
    'async function c(id, t) { Accounts._insertLoginToken(id, t); }',
    'function d() { Accounts.createUser({username: "x"}, function() {}); }'
  ].join('\n');
  const lines = function(name) {
    return checkSources({[name]: source}).filter(function(f) { return f.kind === 'not-awaited'; }).map(function(f) { return f.line; });
  };
  assert.deepStrictEqual(lines('server/a.js'), [1, 3, 4]);
  assert.deepStrictEqual(lines('client/a.js'), [], 'in the browser they take a callback');
});
