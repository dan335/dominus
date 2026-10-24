#!/usr/bin/env node
// The missing-await checker (PR 6 of the Meteor upgrade plan).
//
//   node tests/async/check-await.js          # every app file; exit 1 on a finding
//   node tests/async/check-await.js --json   # the findings as JSON
//   node tests/async/check-await.js a.js b.js
//   node tests/async/check-await.js --meteor3  # also the calls listed below
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
// It also flags an async callback given to forEach, _.each, _.map or .map that
// is not handed to Promise.all: nothing waits for those callbacks. (A cursor's
// forEachAsync and mapAsync do wait for them; server/asyncFoundationTests.js.)
//
// `void fooAsync()` says nobody waits on purpose. A line can also be skipped
// with a comment on it or on the line above: // check-await: ignore <reason>
//
// With --meteor3 it also flags the calls that are sync on 2.16 but return a
// promise on Meteor 3, outside client files: a cursor's observe() and
// observeChanges(), and Mongo.Collection._publishCursor(). They are not
// findings yet, so the run of the test suite leaves them out; the list is
// what is left to change before stage 3.
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
// *Async names that don't return a promise
const NOT_PROMISES = new Set(['wrapAsync', 'Meteor.wrapAsync']);
const PROMISE_COMBINATORS = new Set(['Promise.all', 'Promise.allSettled', 'Promise.race', 'Promise.any']);
// the ways sync code waits for a promise under fibers on Meteor 2.16; PR 18
// removes them
const FIBER_WAITS = new Set(['Promise.await', 'dTest.settle', 'Queues._waitFor', 'Queues._waitForResult', 'awaitPromise']);

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

// the names of the app's async functions, as {name: 'file:line'}
function asyncDefinitions(asts) {
  const names = Object.create(null);
  const add = function(name, file, node) {
    if (name && !name.startsWith('this.') && !name.includes('?')) names[name] = names[name] || file + ':' + node.loc.start.line;
  };
  for (const [file, ast] of Object.entries(asts)) {
    each(ast, function(node) {
      if (!isFunction(node) || !node.async) return;
      const parent = node.parent;
      if (node.type === 'FunctionDeclaration' && node.id) add(node.id.name, file, node);
      else if (parent.type === 'VariableDeclarator' && parent.init === node) add(dottedName(parent.id), file, node);
      else if (parent.type === 'AssignmentExpression' && parent.right === node) add(dottedName(parent.left), file, node);
      else if (parent.type === 'Property' && parent.value === node) {
        const outer = objectName(parent.parent);
        const key = propertyKey(parent);
        if (outer && key) add(outer + '.' + key, file, node);
      }
    });
  }
  return names;
}

// why this call returns a promise, or null
function promiseReason(call, asyncNames, rawNames) {
  const callee = call.callee;
  const name = dottedName(callee);
  const last = callee.type === 'MemberExpression' && !callee.computed ? callee.property.name :
    callee.type === 'Identifier' ? callee.name : null;

  if (name && asyncNames[name]) return 'async function ' + name + ' (' + asyncNames[name] + ')';
  if (last && /.Async$/.test(last) && !NOT_PROMISES.has(last)) return (name || last) + '() returns a promise';
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
    case 'ReturnStatement':
      return true;
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
      return parent.init === node && parent.id.type === 'Identifier' && variableIsWaitedFor(parent.id.name, parent);
    default:
      return false;
  }
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

function asyncCallbackFindings(call) {
  const callee = call.callee;
  const name = dottedName(callee) || '';
  const method = callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : null;
  const asyncArg = call.arguments.find(function(arg) { return isFunction(arg) && arg.async; });
  if (!asyncArg) return null;
  if (name === '_.each' || name === '_.forEach' || method === 'forEach' || method === 'each') {
    return 'async callback to ' + (name.startsWith('_.') ? name : method) + '(): nothing waits for the callbacks; use for...of with await';
  }
  if (name === '_.map' || method === 'map') {
    if (isWaitedFor(call)) return null;
    return 'async callback to ' + (name === '_.map' ? '_.map' : 'map') + '() and the promises are not handed to Promise.all';
  }
  return null;
}

// why this call returns a promise on Meteor 3 but not on 2.16, or null
function meteor3Reason(call) {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression' || callee.computed) return null;
  const last = callee.property.name;
  if (last === 'observe' || last === 'observeChanges') return last + '() returns a promise on Meteor 3 (use ' + last + 'Async)';
  if (dottedName(callee) === 'Mongo.Collection._publishCursor') return 'Mongo.Collection._publishCursor() returns a promise on Meteor 3';
  return null;
}

// findings for parsed files: {file: ast}, with {file: source} for ignores;
// options.meteor3 adds the calls meteor3Reason names
function check(asts, sources, extraAsyncNames, options) {
  options = options || {};
  const asyncNames = Object.assign(asyncDefinitions(asts), extraAsyncNames || {});
  const findings = [];
  for (const [file, ast] of Object.entries(asts)) {
    const ignored = ignoredLines(sources[file] || '');
    const rawNames = rawCollectionNames(ast);
    each(ast, function(node) {
      if (node.type !== 'CallExpression') return;
      const line = node.loc.start.line;
      if (ignored.has(line)) return;
      const callbackMessage = asyncCallbackFindings(node);
      if (callbackMessage) findings.push({file: file, line: line, column: node.loc.start.column + 1, kind: 'async-callback', message: callbackMessage});
      const reason = promiseReason(node, asyncNames, rawNames);
      if (reason && !isWaitedFor(node)) {
        findings.push({file: file, line: line, column: node.loc.start.column + 1, kind: 'not-awaited',
          message: reason + ', and nothing waits for it'});
      }
      const laterReason = options.meteor3 && !reason && fileSide(path.join(ROOT, file)) !== 'client' && meteor3Reason(node);
      if (laterReason && !isWaitedFor(node)) {
        findings.push({file: file, line: line, column: node.loc.start.column + 1, kind: 'meteor3',
          message: laterReason + ', and nothing waits for it'});
      }
    });
  }
  return findings;
}

// for tests: check({name: source})
function checkSources(sources, options) {
  const asts = {};
  for (const [file, source] of Object.entries(sources)) asts[file] = link(parse(source));
  return check(asts, sources, null, options);
}

function checkFiles(files, options) {
  const sources = {};
  const asts = {};
  for (const file of files) {
    const name = path.relative(ROOT, file);
    sources[name] = fs.readFileSync(file, 'utf8');
    asts[name] = link(parse(sources[name]));
  }
  return {findings: check(asts, sources, null, options), asyncNames: asyncDefinitions(asts), files: files.length};
}

module.exports = {checkSources, checkFiles, asyncDefinitions};

if (require.main === module) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const meteor3 = args.includes('--meteor3');
  const given = args.filter(function(a) { return !a.startsWith('--'); }).map(function(f) { return path.resolve(f); });
  // async names come from every app file, even when only some are checked
  const all = listFiles();
  const result = checkFiles(all, {meteor3: meteor3});
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
