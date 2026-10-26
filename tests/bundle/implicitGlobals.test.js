const test = require('node:test');
const assert = require('assert');
const { implicitGlobals } = require('./implicitGlobals');

const names = (src) => implicitGlobals(src).map((f) => f.name + (f.strict ? ' strict' : ' sloppy'));

test('an undeclared assignment in sloppy code', () => {
  assert.deepStrictEqual(names('function f() { x = 1; }'), ['x sloppy']);
});

test('the Oct 2026 bug: a sloppy helper inlined into a strict function', () => {
  assert.deepStrictEqual(names('function l(t) { "use strict"; return function (d) { main_time_format = 1; return main_time_format; }; }'), ['main_time_format strict']);
});

test('a file that says use strict', () => {
  assert.deepStrictEqual(names('"use strict"; y++;'), ['y strict']);
});

test('class bodies are strict', () => {
  assert.deepStrictEqual(names('class A { m() { z = 1; } }'), ['z strict']);
});

test('declared names, params, catch, for-in and functions are not findings', () => {
  const src = '"use strict"; var a; let b; function g(c, {d}, [e], ...h) { var k; for (k in {}) {} try {} catch (err) { err = 1; } a = b = c = d = e = h = 1; g = null; } const m = () => { a++; };';
  assert.deepStrictEqual(names(src), []);
});

test('a var in a nested block counts for the whole function', () => {
  assert.deepStrictEqual(names('"use strict"; function f() { if (1) { var q; } q = 2; }'), []);
});

test('a member assignment is not a finding', () => {
  assert.deepStrictEqual(names('"use strict"; window.x = 1; o.p++;'), []);
});
