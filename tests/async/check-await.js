#!/usr/bin/env node
// The missing-await checker (PR 6 of the Meteor upgrade plan).
//
//   node tests/async/check-await.js          # every app file; exit 1 on a finding
//   node tests/async/check-await.js --json   # the findings as JSON
//   node tests/async/check-await.js a.js b.js
//
// It flags a call that returns a promise when nothing waits for it: the call
// is not awaited, not returned, not handed to Promise.all and not followed by
// .catch(). A promise nobody waits for means the code after it runs before
// the work is done, and a rejection goes unhandled. The calls that return a
// promise are:
//   - calls to the app's own async functions (found by name in every file:
//     `async function foo`, `foo = async (...) =>`, `dX.foo = async function`,
//     `dX = {foo: async function}`)
//   - any *Async() API (findOneAsync, Queues.addAsync, ...), but not
//     Meteor.wrapAsync, which returns a function
//   - fetch(), a bulk's execute() without a callback, a rawCollection()
//     method other than find/aggregate/watch/initialize*BulkOp, a Bull queue's
//     add/pause/resume/clean/close/getJob*/empty and a job's isFailed/remove/
//     update/retry, and a Bull queue's Redis client
//   - in test files, obj.key() when key names only async functions wherever
//     it is defined (a helper's returned {doc: async function}), unless a
//     builtin uses it too (split, connect, ...)
// A promise kept in a variable counts as waited for only when the variable
// is awaited and not also used as if it held the value (p.x, obj.x = p).
// It also flags an async callback given to forEach, _.each, _.map, _.times or
// .map that is not handed to Promise.all: nothing waits for those callbacks.
// And one given to filter, find, some, every, sortBy, reduce and the like,
// which read the promise as if it were the value. (A cursor's forEachAsync
// and mapAsync do wait for them; server/asyncFoundationTests.js.)
//
// `void fooAsync()` says nobody waits on purpose. A line can also be skipped
// with a comment on it or on the line above: // check-await: ignore <reason>
//
// Outside client files it also flags the calls that were sync on Meteor 2.16
// but return a promise on Meteor 3: a cursor's observe() and observeChanges(),
// _publishCursor() (Mongo.Collection's, or a cursor's), and the accounts
// functions in METEOR3_SERVER_ASYNC.
//
// In server files it also flags the sync collection API, which Meteor 3's
// server doesn't have: findOne, insert, update, remove and upsert on a
// collection, and a find()'s fetch, forEach, map and count.
//
// Outside client files it flags a method or publication argument that an
// async handler check()s only after its first await or throw: Meteor 3's
// audit-argument-checks looks when the handler returns, which is then, and
// fails the call with a 500 (see server/lib/asyncArgumentChecks.js).
//
// knox's S3 calls are not on the list: they take a callback and return a
// request, not a promise.
const fs = require('fs');
const path = require('path');
const {ROOT, listFiles, parse, fileSide, dottedName} = require('./sources');

const BULL_QUEUE_METHODS = new Set(['add', 'pause', 'resume', 'clean', 'close', 'empty', 'obliterate',
  'getJob', 'getJobs', 'getJobCounts', 'getWaiting', 'getActive', 'getDelayed', 'getCompleted', 'getFailed',
  'getRepeatableJobs', 'removeRepeatable', 'removeJobs', 'count', 'isReady', 'whenCurrentJobsFinished']);
const BULL_JOB_METHODS = new Set(['isFailed', 'isCompleted', 'remove', 'update', 'retry', 'moveToFailed',
  'moveToCompleted', 'discard', 'finished', 'progress']);
const RAW_SYNC_METHODS = new Set(['find', 'aggregate', 'watch', 'initializeOrderedBulkOp', 'initializeUnorderedBulkOp']);
// *Async names that don't return a promise (Tinytest.addAsync registers a
// test whose function returns one)
const NOT_PROMISES = new Set(['wrapAsync', 'Meteor.wrapAsync', 'Tinytest.addAsync']);
const PROMISE_COMBINATORS = new Set(['Promise.all', 'Promise.allSettled', 'Promise.race', 'Promise.any']);
// how sync code waits for a promise under fibers on Meteor 2.16; only
// server/accounts.js still does, until the Meteor 3 upgrade
const FIBER_WAITS = new Set(['Promise.await']);

function isFunction(node) {
  return node && (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionDeclaration');
}

// set node.parent on every node
function link(ast) {
  const visit = function(node, parent) {
    node.parent = parent;
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'loc') continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') visit(child, node);
      } else if (value && typeof value.type === 'string') {
        visit(value, node);
      }
    }
  };
  visit(ast, null);
  return ast;
}

function each(ast, fn) {
  const visit = function(node) {
    fn(node);
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'loc') continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') visit(child);
      } else if (value && typeof value.type === 'string') {
        visit(value);
      }
    }
  };
  visit(ast);
}

// the name an object literal is known by: `dX = {...}`, `let dX = {...}`
function objectName(object) {
  const parent = object.parent;
  if (parent.type === 'AssignmentExpression' && parent.right === object) return dottedName(parent.left);
  if (parent.type === 'VariableDeclarator' && parent.init === object) return dottedName(parent.id);
  if (parent.type === 'Property' && parent.value === object) {
    const outer = objectName(parent.parent);
    const key = propertyKey(parent);
    return outer && key ? outer + '.' + key : null;
  }
  return null;
}

function propertyKey(property) {
  if (property.computed) return property.key.type === 'Literal' ? String(property.key.value) : null;
  return property.key.type === 'Identifier' ? property.key.name : String(property.key.value);
}

// The names of the app's async functions, as {name: 'file:line'}. A bare
// name counts here only when it is the file's own top-level function or an
// implicit global (`foo = async function`); a function declared inside
// another one is found by scope instead (localDefinition). A function that
// isn't async but returns a promise (`function f() { return loadAsync(); }`)
// counts too, so its callers wait for it as well.
function asyncDefinitions(asts) {
  const names = Object.create(null);
  const add = function(name, file, node) {
    if (name && !name.startsWith('this.') && !name.includes('?') && !names[name]) {
      names[name] = file + ':' + node.loc.start.line;
      return true;
    }
    return false;
  };
  const register = function(file, node) {
    const parent = node.parent;
    if (node.type === 'FunctionDeclaration' && node.id) return !nestedFunction(node) && add(node.id.name, file, node);
    if (parent.type === 'VariableDeclarator' && parent.init === node) {
      return (parent.id.type !== 'Identifier' || !nestedFunction(parent)) && add(dottedName(parent.id), file, node);
    }
    if (parent.type === 'AssignmentExpression' && parent.right === node) {
      return (parent.left.type !== 'Identifier' || !localDefinition(parent, parent.left.name)) && add(dottedName(parent.left), file, node);
    }
    if (parent.type === 'Property' && parent.value === node) {
      const outer = objectName(parent.parent);
      const key = propertyKey(parent);
      return !!(outer && key) && add(outer + '.' + key, file, node);
    }
    return false;
  };
  for (const [file, ast] of Object.entries(asts)) {
    each(ast, function(node) { if (isFunction(node) && node.async) register(file, node); });
  }
  // the functions that return a promise, and other names for async functions
  // (dTest.helpers = {cleanup: _testCleanup}), until no more are found
  for (let changed = true; changed;) {
    changed = false;
    const keys = asyncPropertyKeys(asts);
    for (const [file, ast] of Object.entries(asts)) {
      const fileKeys = isTestFile(file) ? keys : null;
      each(ast, function(node) {
        if (node.type === 'Identifier' && node.parent && namesAsyncFunction(node, names) &&
            ((node.parent.type === 'Property' && node.parent.value === node) ||
             (node.parent.type === 'VariableDeclarator' && node.parent.init === node) ||
             (node.parent.type === 'AssignmentExpression' && node.parent.right === node))) {
          if (register(file, node)) changed = true;
          return;
        }
        if (!isFunction(node) || node.async || RETURNS_PROMISE.has(node) || !returnsPromise(node, names, fileKeys)) return;
        RETURNS_PROMISE.add(node);
        register(file, node);
        changed = true;
      });
    }
  }
  return names;
}

// whether a bare name, where it is used, is an async (or promise returning) function
function namesAsyncFunction(identifier, names) {
  const local = localDefinition(identifier, identifier.name);
  if (!local) return !!names[identifier.name];
  if (local.async) return true;
  const fn = local.node.type === 'VariableDeclarator' ? local.node.init : local.node;
  return !!fn && RETURNS_PROMISE.has(fn);
}

function nestedFunction(node) {
  return !!enclosingFunction(node.type === 'FunctionDeclaration' ? node : node.parent);
}

// the sync functions that return a promise (asyncDefinitions finds them)
const RETURNS_PROMISE = new WeakSet();

function returnsPromise(fn, names, keys) {
  if (fn.type === 'ArrowFunctionExpression' && fn.body.type === 'CallExpression') return !!promiseReason(fn.body, names, new Set(), keys);
  let found = false;
  const visit = function(node) {
    if (found || !node || typeof node.type !== 'string') return;
    if (isFunction(node)) return;
    if (node.type === 'ReturnStatement' && node.argument && node.argument.type === 'CallExpression' &&
        promiseReason(node.argument, names, new Set(), keys)) {
      found = true;
      return;
    }
    // var client = connectAsync(); ...; return client;
    if (node.type === 'ReturnStatement' && node.argument && node.argument.type === 'Identifier') {
      const local = localDefinition(node, node.argument.name);
      const init = local && local.node.type === 'VariableDeclarator' && local.node.init;
      if (init && init.type === 'CallExpression' && enclosingFunction(local.node) === fn && promiseReason(init, names, new Set(), keys)) {
        found = true;
        return;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'loc') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value.type === 'string') visit(value);
    }
  };
  visit(fn.body);
  return found;
}

// The declaration of a bare name in the scopes around node (the functions it
// is in, then its file's top level), or null: {node, async}, where async is
// whether it is declared as an async function. A parameter or a variable that
// isn't set to a function counts as declared, not async.
function localDefinition(node, name) {
  for (let scope = enclosingFunction(node) || rootOf(node); scope; scope = scope.parent ? (enclosingFunction(scope) || rootOf(scope)) : null) {
    const found = declarationIn(scope, name);
    if (found) return found;
    if (!scope.parent) break;
  }
  return null;
}

const declarationCache = new WeakMap();
function declarationIn(scope, name) {
  let table = declarationCache.get(scope);
  if (!table) {
    table = Object.create(null);
    const set = function(n, value) { if (!(n in table)) table[n] = value; };
    if (isFunction(scope)) {
      for (const p of scope.params) if (p.type === 'Identifier') set(p.name, {node: p, async: false});
      if (scope.type !== 'FunctionDeclaration' && scope.id) set(scope.id.name, {node: scope, async: !!scope.async});
    }
    const body = isFunction(scope) ? scope.body : scope;
    const visit = function(node) {
      if (!node || typeof node.type !== 'string') return;
      if (node.type === 'FunctionDeclaration') {
        if (node.id) set(node.id.name, {node: node, async: !!node.async});
        return;
      }
      if (isFunction(node)) return;
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
        set(node.id.name, {node: node, async: !!(isFunction(node.init) && node.init.async)});
      }
      for (const key of Object.keys(node)) {
        if (key === 'parent' || key === 'loc') continue;
        const value = node[key];
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value.type === 'string') visit(value);
      }
    };
    visit(body);
    declarationCache.set(scope, table);
  }
  return table[name] || null;
}

// The property names that only ever name async (or promise returning)
// functions: {key: 'file:line'}. In test files, obj.key() counts as a call to
// one of them whatever obj is (a person or world object a helper returned),
// unless a sync function anywhere has the same key.
function asyncPropertyKeys(asts) {
  const found = Object.create(null);
  const sync = new Set();
  const keyOf = function(node) {
    const parent = node.parent;
    if (parent.type === 'Property' && parent.value === node) return propertyKey(parent);
    if (parent.type === 'AssignmentExpression' && parent.right === node && parent.left.type === 'MemberExpression' &&
        !parent.left.computed) return parent.left.property.name;
    if (parent.type === 'MethodDefinition' && parent.value === node && !parent.computed) return parent.key.name;
    return null;
  };
  for (const [file, ast] of Object.entries(asts)) {
    each(ast, function(node) {
      if (!isFunction(node) || !node.parent) return;
      const key = keyOf(node);
      if (!key) return;
      if (node.async || RETURNS_PROMISE.has(node)) {
        if (!found[key]) found[key] = file + ':' + node.loc.start.line;
      } else {
        sync.add(key);
      }
    });
  }
  for (const key of sync) delete found[key];
  return found;
}

// names a builtin or library object also uses for a sync method (and a DDP
// connection's own subscribe and call are sync, so `connection.` is skipped)
const COMMON_SYNC_KEYS = new Set(['split', 'join', 'push', 'map', 'filter', 'find', 'forEach', 'reduce', 'toString',
  'bind', 'then', 'catch', 'finally', 'connect', 'close', 'get', 'set', 'has']);

function isTestFile(file) {
  return /(Tests?|tests)\.js$/.test(file) || /(^|\/)testRunner[^/]*\.js$/.test(file) || /(^|\/)tests\//.test(file);
}

// why this call returns a promise, or null
// The server suites get dTest.helpers as their second parameter, t
const PARAMETER_ALIASES = {t: 'dTest.helpers'};

function promiseReason(call, asyncNames, rawNames, asyncKeys) {
  const callee = call.callee;
  if (callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier' &&
      PARAMETER_ALIASES[callee.object.name]) {
    const local = localDefinition(call, callee.object.name);
    const alias = PARAMETER_ALIASES[callee.object.name] + '.' + callee.property.name;
    if (local && local.node.type === 'Identifier' && isFunction(local.node.parent) && asyncNames[alias]) {
      return 'async function ' + alias + ' (' + asyncNames[alias] + ', as ' + callee.object.name + '.' + callee.property.name + ')';
    }
  }
  // fn.apply(self, args) and fn.call(self, ...) return what fn returns
  if (callee.type === 'MemberExpression' && !callee.computed && /^(apply|call)$/.test(callee.property.name) &&
      (callee.object.type === 'MemberExpression' || callee.object.type === 'Identifier')) {
    const reason = promiseReason(Object.assign(Object.create(call), {callee: callee.object}), asyncNames, rawNames, asyncKeys);
    if (reason) return reason + ' (through .' + callee.property.name + ')';
  }
  const name = dottedName(callee);
  const last = callee.type === 'MemberExpression' && !callee.computed ? callee.property.name :
    callee.type === 'Identifier' ? callee.name : null;

  if (callee.type === 'Identifier') {
    // a name declared around the call is that function, whatever other files call theirs
    const local = localDefinition(call, callee.name);
    if (local) {
      if (local.async) return 'async function ' + callee.name + ' (line ' + local.node.loc.start.line + ')';
      const fn = local.node.type === 'VariableDeclarator' ? local.node.init : local.node;
      if (fn && RETURNS_PROMISE.has(fn)) return callee.name + ' (line ' + local.node.loc.start.line + ') returns a promise';
      // var expectError = dTest.expectError;
      const init = local.node.type === 'VariableDeclarator' && local.node.init;
      const alias = init && init.type === 'MemberExpression' && dottedName(init);
      if (alias && asyncNames[alias]) return 'async function ' + alias + ' (' + asyncNames[alias] + ', as ' + callee.name + ')';
    } else if (asyncNames[name]) {
      return 'async function ' + name + ' (' + asyncNames[name] + ')';
    }
  } else if (name && asyncNames[name]) return 'async function ' + name + ' (' + asyncNames[name] + ')';
  if (asyncKeys && callee.type === 'MemberExpression' && !callee.computed && asyncKeys[last] &&
      !COMMON_SYNC_KEYS.has(last) && !NOT_PROMISES.has(last) && !NOT_PROMISES.has(name) &&
      !(name && /^(Meteor|Promise|_|Object|Array|JSON|Math|console|connection)\./.test(name))) {
    return '.' + last + '() names only async functions (' + asyncKeys[last] + ')';
  }
  // an environment variable's withValue returns what its function returns
  if (last === 'withValue' && call.arguments.some(function(arg) { return isFunction(arg) && arg.async; })) {
    return (name || last) + '() with an async function returns a promise';
  }
  if (last && /.Async$/.test(last) && !NOT_PROMISES.has(last) && !NOT_PROMISES.has(name)) return (name || last) + '() returns a promise';
  if (callee.type === 'Identifier' && callee.name === 'fetch') return 'fetch() returns a promise';
  if (callee.type !== 'MemberExpression' || callee.computed) return null;

  const object = callee.object;
  const objectNameText = dottedName(object) || '';
  if (last === 'execute' && /bulk/i.test(objectNameText) && !call.arguments.some(isFunction)) {
    return objectNameText + '.execute() without a callback returns a promise';
  }
  const fromRaw = (object.type === 'CallExpression' && object.callee.type === 'MemberExpression' &&
    !object.callee.computed && object.callee.property.name === 'rawCollection') ||
    (object.type === 'Identifier' && rawNames.has(object.name));
  if (fromRaw && !RAW_SYNC_METHODS.has(last)) return 'rawCollection().' + last + '() returns a promise';
  if (/^Queues\.[^.]+$/.test(objectNameText) && BULL_QUEUE_METHODS.has(last)) return objectNameText + '.' + last + '() (Bull) returns a promise';
  if (/^(queue|bullQueue)$/.test(objectNameText) && BULL_QUEUE_METHODS.has(last)) return objectNameText + '.' + last + '() (Bull) returns a promise';
  if (objectNameText === 'job' && BULL_JOB_METHODS.has(last)) return 'job.' + last + '() (Bull) returns a promise';
  // with a callback, ioredis reports the error to it
  if (/(^|\.)(queue|Queues\.[^.]+)\.client$/.test(objectNameText) && !call.arguments.some(isFunction)) return objectNameText + '.' + last + '() (Redis) returns a promise';
  return null;
}

function enclosingFunction(node) {
  for (let n = node.parent; n; n = n.parent) if (isFunction(n)) return n;
  return null;
}

// is something waiting for the value of this expression?
function isWaitedFor(node, depth) {
  depth = depth || 0;
  const parent = node.parent;
  if (!parent || depth > 20) return false;
  switch (parent.type) {
    case 'AwaitExpression':
      return true;
    case 'ReturnStatement':
      // in a try block, the finally (or catch) runs before the promise settles
      return !insideTryBlock(parent);
    case 'ArrowFunctionExpression':
      return parent.body === node;
    case 'UnaryExpression':
      return parent.operator === 'void';
    case 'ConditionalExpression':
      return parent.test !== node && isWaitedFor(parent, depth + 1);
    case 'LogicalExpression':
    case 'SequenceExpression':
    case 'ParenthesizedExpression':
      return isWaitedFor(parent, depth + 1);
    case 'ArrayExpression': {
      const call = parent.parent;
      return call.type === 'CallExpression' && PROMISE_COMBINATORS.has(dottedName(call.callee)) && call.arguments[0] === parent;
    }
    case 'CallExpression':
      if (parent.callee === node) return false;
      if (PROMISE_COMBINATORS.has(dottedName(parent.callee)) || FIBER_WAITS.has(dottedName(parent.callee))) return true;
      if (dottedName(parent.callee) === 'Promise.resolve') return isWaitedFor(parent, depth + 1);
      return false;
    case 'MemberExpression': {
      // fooAsync().then(...).catch(...)
      if (parent.object !== node || parent.computed) return false;
      const call = parent.parent;
      if (call.type !== 'CallExpression' || call.callee !== parent) return false;
      const method = parent.property.name;
      if (method === 'catch') return true;
      if (method === 'then' && call.arguments.length >= 2) return true;
      if (method === 'then' || method === 'finally') return isWaitedFor(call, depth + 1);
      return false;
    }
    case 'VariableDeclarator':
      // const p = fooAsync(); ... await p
      // (but not when the variable is also read as if it held the value: p.x)
      return parent.init === node && parent.id.type === 'Identifier' && variableIsWaitedFor(parent.id.name, parent) &&
        !variableIsReadAsValue(parent.id.name, parent);
    default:
      return false;
  }
}

// is this statement in the block of a try with a catch or finally, in its own function?
function insideTryBlock(node) {
  for (let n = node; n.parent && !isFunction(n.parent); n = n.parent) {
    if (n.parent.type === 'TryStatement' && n.parent.block === n && (n.parent.handler || n.parent.finalizer)) return true;
  }
  return false;
}

function variableIsWaitedFor(name, declarator) {
  const scope = enclosingFunction(declarator) || rootOf(declarator);
  let waited = false;
  each(scope, function(node) {
    if (waited || node === declarator.id) return;
    if (node.type === 'Identifier' && node.name === name && node.parent &&
        !(node.parent.type === 'MemberExpression' && node.parent.property === node && !node.parent.computed) &&
        !(node.parent.type === 'Property' && node.parent.key === node && !node.parent.computed) &&
        isWaitedFor(node)) {
      waited = true;
    }
  });
  return waited;
}

// a use of the variable as if it held the value: p.x, p[x], or p kept or
// handed on (obj.x = p, f(p)), other than awaiting it or p.then/catch/finally
function variableIsReadAsValue(name, declarator) {
  const scope = enclosingFunction(declarator) || rootOf(declarator);
  let read = false;
  each(scope, function(node) {
    if (read || node === declarator.id) return;
    if (node.type !== 'Identifier' || node.name !== name || !node.parent) return;
    const parent = node.parent;
    if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
    if (parent.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand) return;
    if (localDefinition(node, name) !== localDefinition(declarator.id, name)) return;
    if (parent.type === 'MemberExpression' && parent.object === node) {
      if (parent.computed || !/^(then|catch|finally)$/.test(parent.property.name)) read = true;
      return;
    }
    // a test that checks it is a promise: p instanceof Promise, dTest.isPromise(p)
    if (parent.type === 'BinaryExpression' && parent.operator === 'instanceof' && parent.left === node) return;
    if (parent.type === 'CallExpression' && /(^|\.)isPromise$/.test(dottedName(parent.callee) || '')) return;
    if (!isWaitedFor(node)) read = true;
  });
  return read;
}

function rootOf(node) {
  while (node.parent) node = node.parent;
  return node;
}

// names given the value of X.rawCollection() in a file
function rawCollectionNames(ast) {
  const names = new Set();
  each(ast, function(node) {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init &&
        node.init.type === 'CallExpression' && node.init.callee.type === 'MemberExpression' &&
        !node.init.callee.computed && node.init.callee.property.name === 'rawCollection') {
      names.add(node.id.name);
    }
  });
  return names;
}

function ignoredLines(source) {
  const lines = new Set();
  source.split('\n').forEach(function(line, i) {
    if (/check-await:\s*ignore\s+\S/.test(line)) {
      lines.add(i + 1);
      if (/^\s*\/\//.test(line)) lines.add(i + 2);
    }
  });
  return lines;
}

function asyncCallbackFindings(call, asyncNames, rawNames, asyncKeys) {
  const callee = call.callee;
  const name = dottedName(callee) || '';
  const method = callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : null;
  // (a sync callback that returns a promise counts too: function() { return loadAsync(); },
  // and so does an async function passed by name: _.map(ids, sim.nameOf))
  const asyncArg = call.arguments.find(function(arg, i) {
    if (isFunction(arg)) return arg.async || RETURNS_PROMISE.has(arg);
    // _.map(list, fn): the list isn't the callback
    if (name.startsWith('_.') && i === 0) return false;
    if (arg.type !== 'Identifier' && arg.type !== 'MemberExpression') return false;
    const asCall = {type: 'CallExpression', callee: arg, arguments: [], parent: call, loc: arg.loc};
    return !!promiseReason(asCall, asyncNames || {}, rawNames || new Set(), asyncKeys);
  });
  if (!asyncArg) return null;
  if (name === '_.each' || name === '_.forEach' || method === 'forEach' || method === 'each') {
    return 'async callback to ' + (name.startsWith('_.') ? name : method) + '(): nothing waits for the callbacks; use for...of with await';
  }
  if (name === '_.map' || name === '_.times' || method === 'map') {
    if (isWaitedFor(call)) return null;
    return 'async callback to ' + (name.startsWith('_.') ? name : 'map') + '() and the promises are not handed to Promise.all';
  }
  // these read the callback's value, and a promise is always truthy
  if (/^(filter|some|every|find|findIndex|reject|sortBy|reduce|groupBy|countBy)$/.test(method || '') && name !== 'dTest.' + method) {
    return 'async callback to ' + (name.startsWith('_.') ? name : method) + '(): it reads the promise, not its value';
  }
  return null;
}

// why this call returns a promise on Meteor 3 but not on 2.16, or null
function meteor3Reason(call) {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression' || callee.computed) return null;
  const last = callee.property.name;
  if (last === 'observe' || last === 'observeChanges') return last + '() returns a promise on Meteor 3 (use ' + last + 'Async)';
  if (last === '_publishCursor') return '_publishCursor() returns a promise on Meteor 3';
  return null;
}

// Meteor 3's server has no sync collection API: findOne, insert, update,
// remove, upsert and a cursor's count throw, and a cursor's fetch, forEach and
// map return a promise. In a server file, why this call is one, or null.
const SYNC_COLLECTION_METHODS = new Set(['findOne', 'insert', 'update', 'remove', 'upsert']);
const SYNC_CURSOR_METHODS = new Set(['fetch', 'forEach', 'map', 'count']);
function syncApiReason(call) {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression' || callee.computed) return null;
  const method = callee.property.name;
  const object = callee.object;
  const objectName = dottedName(object) || '';
  if (SYNC_COLLECTION_METHODS.has(method) && (/^[A-Z]\w*$/.test(objectName) || objectName === 'Meteor.users')) {
    return objectName + '.' + method + '() is sync, which the server doesn\'t have on Meteor 3 (use ' + method + 'Async)';
  }
  if (SYNC_CURSOR_METHODS.has(method) && object.type === 'CallExpression' && object.callee.type === 'MemberExpression' &&
      !object.callee.computed && object.callee.property.name === 'find') {
    return 'a cursor\'s ' + method + '() is sync, which the server doesn\'t have on Meteor 3 (use ' + method + 'Async)';
  }
  return null;
}

// Meteor 3's audit-argument-checks looks at a method's or publication's
// arguments when its handler returns, and an async handler returns at its
// first await: a check() after that counts as missing, and the call fails
// with a 500 (Meteor 2.16 ran an async handler to its end in the caller's
// fiber, so it counted). A throw before every argument is checked does the
// same, since an async function's throw is a rejection the audit doesn't see.
// The handlers are the functions in Meteor.methods({...}) and Meteor.publish's
// function, and a shared method's `return (async () => {...})()`, which runs
// at once up to its own first await. An argument handed to another call
// before then counts as checked by it. One finding per argument.
function lateCheckFindings(ast) {
  const findings = [];
  const handlers = [];
  each(ast, function(node) {
    if (node.type !== 'CallExpression') return;
    const name = dottedName(node.callee);
    if (name === 'Meteor.methods' && node.arguments[0] && node.arguments[0].type === 'ObjectExpression') {
      for (const property of node.arguments[0].properties) {
        if (property.type === 'Property' && isFunction(property.value)) handlers.push({fn: property.value, label: "method '" + propertyKey(property) + "'"});
      }
    }
    if (name === 'Meteor.publish' && isFunction(node.arguments[1])) {
      const label = node.arguments[0] && node.arguments[0].type === 'Literal' ? "publication '" + node.arguments[0].value + "'" : 'publication';
      handlers.push({fn: node.arguments[1], label: label});
    }
  });
  // an async function called right where it is written: (async () => {...})()
  const isRunAtOnce = function(fn) {
    return fn.async && fn.parent.type === 'CallExpression' && fn.parent.callee === fn;
  };
  for (const handler of handlers) {
    const params = handler.fn.params.filter(function(p) { return p.type === 'Identifier'; }).map(function(p) { return p.name; });
    if (!params.length) continue;
    let cut = Infinity;
    const checkedAt = {};
    const passedAt = {};
    const visit = function(node, inAsync) {
      if (isFunction(node) && node !== handler.fn) {
        if (!isRunAtOnce(node)) return;
        inAsync = true;
      }
      if (node.type === 'AwaitExpression') cut = Math.min(cut, node.end);
      if (node.type === 'ForOfStatement' && node.await) cut = Math.min(cut, node.start);
      if (node.type === 'ThrowStatement' && inAsync) cut = Math.min(cut, node.start);
      if (node.type === 'CallExpression') {
        const isCheck = node.callee.type === 'Identifier' && node.callee.name === 'check';
        const first = node.arguments[0];
        const values = isCheck && first && first.type === 'ArrayExpression' ? first.elements : (isCheck ? [first] : node.arguments);
        for (const value of values) {
          if (!value || value.type !== 'Identifier' || !params.includes(value.name)) continue;
          const seen = isCheck ? checkedAt : passedAt;
          seen[value.name] = Math.min(seen[value.name] === undefined ? Infinity : seen[value.name], node.start);
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'parent' || key === 'loc') continue;
        const value = node[key];
        if (Array.isArray(value)) {
          for (const child of value) if (child && typeof child.type === 'string') visit(child, inAsync);
        } else if (value && typeof value.type === 'string') {
          visit(value, inAsync);
        }
      }
    };
    visit(handler.fn, handler.fn.async);
    if (cut === Infinity) continue;
    for (const name of params) {
      const at = Math.min(checkedAt[name] === undefined ? Infinity : checkedAt[name], passedAt[name] === undefined ? Infinity : passedAt[name]);
      if (at < cut) continue;
      findings.push({node: handler.fn, message: handler.label + ': argument ' + name + ' is not check()ed before the handler\'s first await or throw, ' +
        'which Meteor 3\'s audit-argument-checks counts as not checked (a 500)'});
    }
  }
  return findings;
}

// findings for parsed files: {file: ast}, with {file: source} for ignores;
// Meteor 3's accounts functions that return a promise on the server
// (accounts-base 3.3, accounts-password 3.3); in the browser they take a callback
const METEOR3_SERVER_ASYNC = {
  'Accounts.createUser': 'accounts-password 3', 'Accounts.setPasswordAsync': 'accounts-password 3',
  'Accounts.findUserByUsername': 'accounts-base 3', 'Accounts.findUserByEmail': 'accounts-base 3',
  'Accounts.sendVerificationEmail': 'accounts-password 3', 'Accounts.sendResetPasswordEmail': 'accounts-password 3',
  'Accounts.sendEnrollmentEmail': 'accounts-password 3', 'Accounts.addEmailAsync': 'accounts-password 3',
  'Accounts.removeEmail': 'accounts-password 3', 'Accounts.setUsername': 'accounts-password 3',
  'Accounts.updateOrCreateUserFromExternalService': 'accounts-base 3', 'Accounts._insertLoginToken': 'accounts-base 3'
};

function check(asts, sources, extraAsyncNames) {
  const asyncNames = Object.assign(asyncDefinitions(asts), extraAsyncNames || {});
  const serverAsyncNames = Object.assign({}, asyncNames, METEOR3_SERVER_ASYNC);
  const asyncKeys = asyncPropertyKeys(asts);
  const findings = [];
  for (const [file, ast] of Object.entries(asts)) {
    const ignored = ignoredLines(sources[file] || '');
    const rawNames = rawCollectionNames(ast);
    const side = fileSide(path.join(ROOT, file));
    const names = side === 'client' ? asyncNames : serverAsyncNames;
    if (side !== 'client') {
      for (const late of lateCheckFindings(ast)) {
        const line = late.node.loc.start.line;
        if (!ignored.has(line)) findings.push({file: file, line: line, column: late.node.loc.start.column + 1, kind: 'late-check', message: late.message});
      }
    }
    each(ast, function(node) {
      if (node.type !== 'CallExpression') return;
      const line = node.loc.start.line;
      if (ignored.has(line)) return;
      const callbackMessage = asyncCallbackFindings(node, names, rawNames, isTestFile(file) ? asyncKeys : null);
      if (callbackMessage) findings.push({file: file, line: line, column: node.loc.start.column + 1, kind: 'async-callback', message: callbackMessage});
      const reason = promiseReason(node, names, rawNames, isTestFile(file) ? asyncKeys : null);
      if (reason && !isWaitedFor(node)) {
        findings.push({file: file, line: line, column: node.loc.start.column + 1, kind: 'not-awaited',
          message: reason + ', and nothing waits for it'});
      }
      const syncReason = fileSide(path.join(ROOT, file)) === 'server' && syncApiReason(node);
      if (syncReason) findings.push({file: file, line: line, column: node.loc.start.column + 1, kind: 'sync-api', message: syncReason});
      const laterReason = !reason && fileSide(path.join(ROOT, file)) !== 'client' && meteor3Reason(node);
      if (laterReason && !isWaitedFor(node)) {
        findings.push({file: file, line: line, column: node.loc.start.column + 1, kind: 'meteor3',
          message: laterReason + ', and nothing waits for it'});
      }
    });
  }
  return findings;
}

// for tests: check({name: source})
function checkSources(sources) {
  const asts = {};
  for (const [file, source] of Object.entries(sources)) asts[file] = link(parse(source));
  return check(asts, sources, null);
}

function checkFiles(files) {
  const sources = {};
  const asts = {};
  for (const file of files) {
    const name = path.relative(ROOT, file);
    sources[name] = fs.readFileSync(file, 'utf8');
    asts[name] = link(parse(sources[name]));
  }
  return {findings: check(asts, sources, null), asyncNames: asyncDefinitions(asts), files: files.length};
}

module.exports = {checkSources, checkFiles, asyncDefinitions};

if (require.main === module) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const given = args.filter(function(a) { return !a.startsWith('--'); }).map(function(f) { return path.resolve(f); });
  // async names come from every app file, even when only some are checked
  const all = listFiles();
  const result = checkFiles(all);
  let findings = result.findings;
  if (given.length) {
    const wanted = new Set(given.map(function(f) { return path.relative(ROOT, f); }));
    findings = findings.filter(function(f) { return wanted.has(f.file); });
  }
  if (json) {
    console.log(JSON.stringify({files: result.files, asyncFunctions: Object.keys(result.asyncNames).length, findings: findings}, null, 2));
  } else {
    for (const f of findings) console.log(f.file + ':' + f.line + ':' + f.column + '  ' + f.message);
    console.log('check-await: ' + result.files + ' files, ' + Object.keys(result.asyncNames).length +
      ' async functions, ' + findings.length + ' finding' + (findings.length === 1 ? '' : 's'));
  }
  process.exit(findings.length ? 1 : 0);
}
