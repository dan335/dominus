#!/usr/bin/env node
// The async call graph (PR 6 of the Meteor upgrade plan).
//
//   node tests/async/async-graph.js    # writes .test-results/async-graph.md and .json
//
// For every server function (and every method, publication, job handler,
// cron job and observer) it lists what the function calls and whether it
// reaches the database, directly or through what it calls. Converting a
// function that reaches the database makes it async, and then every caller
// has to await it too. So the report counts, per domain (a package, or a
// top-level folder), the database calls to convert and the calls into the
// domain from other domains, which is how far a conversion ripples. That
// sets the order of PRs 7 to 17. It also counts what stage 2 has to remove:
// Futures, bulk executes with a callback, Meteor.wrapAsync, Promise.await,
// Meteor._sleepForMs and server-side Meteor.call.
//
// Names are matched by text (dCastles.foo, or a bare foo), the way the code
// calls them; a call through a variable or `this` is not followed. Client
// files are left out (minimongo stays sync), and so are tests.
const fs = require('fs');
const path = require('path');
const {ROOT, listFiles, parse, fileSide, dottedName} = require('./sources');

const DB_METHODS = new Set(['find', 'findOne', 'insert', 'update', 'remove', 'upsert', 'rawCollection',
  'createIndex', '_ensureIndex', 'aggregate']);
// PR 6 keeps these sync: they read the settings cache
const KEEP_SYNC = /^_g?s\./;
const isTestFile = function(file) {
  return /Tests?\.js$|tests?-server\.js$|-tests?\.js$|\/tests\/|testRunner|soakMonitor/.test(file);
};

function domainOf(file) {
  const parts = file.split('/');
  return parts[0] === 'packages' ? parts[1] : parts[0];
}

function isFunction(node) {
  return node && (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionDeclaration');
}

function children(node) {
  const out = [];
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === 'string') out.push(child);
    } else if (value && typeof value.type === 'string') {
      out.push(value);
    }
  }
  return out;
}

function propertyKey(property) {
  if (property.computed) return property.key.type === 'Literal' ? String(property.key.value) : null;
  return property.key.type === 'Identifier' ? property.key.name : String(property.key.value);
}

function literal(node) {
  return node && node.type === 'Literal' ? String(node.value) : null;
}

// the name of a function from where it is defined, given its ancestors
function functionName(fn, stack) {
  const parent = stack[stack.length - 1];
  const grand = stack[stack.length - 2];
  const great = stack[stack.length - 3];
  if (fn.type === 'FunctionDeclaration' && fn.id) return fn.id.name;
  if (!parent) return null;
  if (parent.type === 'VariableDeclarator' && parent.init === fn) return dottedName(parent.id);
  if (parent.type === 'AssignmentExpression' && parent.right === fn) return dottedName(parent.left);
  if (parent.type === 'Property' && parent.value === fn && grand && grand.type === 'ObjectExpression') {
    const key = propertyKey(parent);
    if (!key) return null;
    // Meteor.methods({name: fn})
    if (great && great.type === 'CallExpression' && dottedName(great.callee) === 'Meteor.methods') return 'method:' + key;
    // SyncedCron.add({name: 'x', job: fn})
    if (great && great.type === 'CallExpression' && dottedName(great.callee) === 'SyncedCron.add' && key === 'job') {
      const nameProp = grand.properties.find(function(p) { return p.key && propertyKey(p) === 'name'; });
      return 'cron:' + (nameProp ? literal(nameProp.value) : '?');
    }
    // x.observe({added: fn}) / observeChanges
    if (great && great.type === 'CallExpression' && great.callee.type === 'MemberExpression' &&
        /^observe(Changes)?(Async)?$/.test(great.callee.property.name || '')) return 'observer:' + key;
    // dX = {foo: fn}
    const outerParent = stack[stack.length - 3];
    let outer = null;
    if (outerParent && outerParent.type === 'AssignmentExpression') outer = dottedName(outerParent.left);
    if (outerParent && outerParent.type === 'VariableDeclarator') outer = dottedName(outerParent.id);
    return outer ? outer + '.' + key : key;
  }
  if (parent.type === 'CallExpression') {
    const callee = dottedName(parent.callee) || '';
    if (callee === 'Meteor.publish') return 'publish:' + (literal(parent.arguments[0]) || '?');
    if (/^Queues\.[^.]+\.process$/.test(callee)) return 'job:' + callee.split('.')[1];
    if (callee === 'Meteor.bindEnvironment' && grand && grand.type === 'CallExpression') {
      const outer = dottedName(grand.callee) || '';
      if (/^Queues\.[^.]+\.process$/.test(outer)) return 'job:' + outer.split('.')[1];
    }
    if (callee === 'Meteor.startup') return 'startup';
  }
  return null;
}

function analyse(files) {
  const units = {};       // id -> unit
  const byName = Object.create(null);  // name -> [unit ids]
  const collections = new Set(['Meteor.users']);
  const asts = {};

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const source = fs.readFileSync(file, 'utf8');
    asts[rel] = parse(source);
  }

  // the collections: X = new Mongo.Collection(...)
  for (const ast of Object.values(asts)) {
    const visit = function(node) {
      if (node.type === 'NewExpression' && /^(Mongo|Meteor)\.Collection$/.test(dottedName(node.callee) || '')) {
        // found below through its parent
      }
      if ((node.type === 'AssignmentExpression' || node.type === 'VariableDeclarator')) {
        const value = node.type === 'AssignmentExpression' ? node.right : node.init;
        const target = node.type === 'AssignmentExpression' ? node.left : node.id;
        if (value && value.type === 'NewExpression' && /^(Mongo|Meteor)\.Collection$/.test(dottedName(value.callee) || '')) {
          const name = dottedName(target);
          if (name) collections.add(name);
        }
      }
      children(node).forEach(visit);
    };
    visit(ast);
  }

  for (const [file, ast] of Object.entries(asts)) {
    const side = fileSide(path.join(ROOT, file));
    const test = isTestFile(file);
    const domain = domainOf(file);
    const fileUnit = {id: file + ':top', name: 'top level of ' + file, file: file, line: 1, domain: domain, side: side, test: test,
      calls: [], db: 0, legacy: {}};
    units[fileUnit.id] = fileUnit;

    const stack = [];
    const unitStack = [fileUnit];
    const visit = function(node) {
      let pushed = false;
      if (isFunction(node)) {
        const name = functionName(node, stack);
        if (name) {
          const unit = {id: file + ':' + node.loc.start.line + ':' + name, name: name, file: file, line: node.loc.start.line,
            domain: domain, side: side, test: test, async: !!node.async, calls: [], db: 0, legacy: {}};
          units[unit.id] = unit;
          (byName[name] = byName[name] || []).push(unit.id);
          unitStack.push(unit);
          pushed = true;
        }
      }
      const current = unitStack[unitStack.length - 1];
      const legacy = function(kind) { current.legacy[kind] = (current.legacy[kind] || 0) + 1; };
      if (node.type === 'NewExpression' && dottedName(node.callee) === 'Future') legacy('Future');
      if (node.type === 'CallExpression') {
        const callee = dottedName(node.callee);
        if (callee) {
          current.calls.push({name: callee, line: node.loc.start.line});
          const parts = callee.split('.');
          const method = parts[parts.length - 1];
          const object = parts.slice(0, -1).join('.');
          if (collections.has(object) && DB_METHODS.has(method)) current.db++;
          if (method === 'execute' && /bulk/i.test(object)) {
            current.db++;
            if (node.arguments.some(isFunction)) legacy('bulk.execute(callback)');
          }
          if (callee === 'Meteor.wrapAsync') legacy('Meteor.wrapAsync');
          if (callee === 'Promise.await') legacy('Promise.await');
          if (callee === 'Meteor._sleepForMs') legacy('Meteor._sleepForMs');
          if ((callee === 'Meteor.call' || callee === 'Meteor.apply') && side !== 'client') legacy('server Meteor.call');
          if (callee === 'Email.send') legacy('Email.send');
          if (callee === 'HTTP.get' || callee === 'HTTP.call' || callee === 'HTTP.post') legacy('HTTP');
        }
      }
      stack.push(node);
      children(node).forEach(visit);
      stack.pop();
      if (pushed) unitStack.pop();
    };
    visit(ast);
  }

  // resolve calls by name
  const live = Object.values(units).filter(function(u) { return !u.test && u.side !== 'client' && u.side !== 'build'; });
  for (const unit of live) {
    unit.callees = [];
    for (const call of unit.calls) {
      let ids = byName[call.name] || [];
      ids = ids.filter(function(id) { const u = units[id]; return !u.test && u.side !== 'client' && u.side !== 'build'; });
      for (const id of ids) unit.callees.push({id: id, line: call.line});
    }
  }

  // reaches the database: directly, or through a callee (fixed point). The
  // _gs settings stay sync (they read a cache), so they don't count.
  for (const unit of live) unit.keptSync = KEEP_SYNC.test(unit.name);
  for (const unit of live) unit.reachesDb = unit.db > 0 && !unit.keptSync;
  let changed = true;
  while (changed) {
    changed = false;
    for (const unit of live) {
      if (unit.reachesDb || unit.keptSync) continue;
      if (unit.callees.some(function(c) { return units[c.id].reachesDb; })) {
        unit.reachesDb = true;
        changed = true;
      }
    }
  }

  return {units: units, live: live, collections: Array.from(collections).sort()};
}

function report(result) {
  const {units, live} = result;
  const domains = {};
  const domain = function(name) {
    return domains[name] = domains[name] || {name: name, functions: 0, reachDb: 0, dbCalls: 0, legacy: {},
      callsIn: 0, callersIn: {}, callsOut: {}, entry: {method: 0, publish: 0, job: 0, cron: 0, observer: 0}};
  };
  for (const unit of live) {
    const d = domain(unit.domain);
    d.functions++;
    if (unit.reachesDb) d.reachDb++;
    d.dbCalls += unit.db;
    for (const [kind, n] of Object.entries(unit.legacy)) d.legacy[kind] = (d.legacy[kind] || 0) + n;
    const kind = unit.name.split(':')[0];
    if (d.entry[kind] !== undefined) d.entry[kind]++;
    for (const c of unit.callees) {
      const callee = units[c.id];
      if (callee.domain !== unit.domain && callee.reachesDb) {
        const target = domain(callee.domain);
        target.callsIn++;
        target.callersIn[unit.domain] = (target.callersIn[unit.domain] || 0) + 1;
        d.callsOut[callee.domain] = (d.callsOut[callee.domain] || 0) + 1;
      }
    }
  }

  // ripple: the functions in other domains that become async when this
  // domain's database-reaching functions do (every caller, up the chain)
  const callersOf = {};
  for (const unit of live) {
    for (const c of unit.callees) (callersOf[c.id] = callersOf[c.id] || new Set()).add(unit.id);
  }
  for (const d of Object.values(domains)) {
    const seen = new Set();
    const queue = live.filter(function(u) { return u.domain === d.name && u.reachesDb; }).map(function(u) { return u.id; });
    while (queue.length) {
      const id = queue.pop();
      for (const caller of callersOf[id] || []) {
        if (!seen.has(caller)) { seen.add(caller); queue.push(caller); }
      }
    }
    d.ripple = {};
    d.rippleCount = 0;
    for (const id of seen) {
      const u = units[id];
      if (u.domain === d.name) continue;
      d.ripple[u.domain] = (d.ripple[u.domain] || 0) + 1;
      d.rippleCount++;
    }
  }

  const rows = Object.values(domains).filter(function(d) { return d.functions; })
    .sort(function(a, b) { return b.dbCalls - a.dbCalls || a.name.localeCompare(b.name); });
  const legacyKinds = Array.from(new Set([].concat.apply([], rows.map(function(d) { return Object.keys(d.legacy); })))).sort();

  const lines = [];
  lines.push('# Async call graph');
  lines.push('');
  lines.push('Written by `tests/async/async-graph.js` on ' + new Date().toISOString().slice(0, 10) + '. Server and shared files only, without tests. ' +
    live.length + ' functions, ' + live.filter(function(u) { return u.reachesDb; }).length + ' of them reach the database.');
  lines.push('');
  lines.push('"DB calls" are direct calls on a collection (find, findOne, insert, update, remove, upsert, rawCollection, createIndex) and bulk executes: each one becomes an `await`. ' +
    '"Called from other domains" counts the call sites elsewhere that call this domain\'s database-reaching functions: each one has to `await` once this domain converts.');
  lines.push('');
  lines.push('## By domain');
  lines.push('');
  lines.push('| Domain | Functions | Reach the DB | DB calls | Methods | Publications | Jobs | Crons | Observers | Called from other domains | Calls into other domains |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|');
  const fmt = function(map) {
    return Object.entries(map).sort(function(a, b) { return b[1] - a[1]; }).map(function(e) { return e[0] + ' ' + e[1]; }).join(', ');
  };
  for (const d of rows) {
    lines.push('| ' + [d.name, d.functions, d.reachDb, d.dbCalls, d.entry.method, d.entry.publish, d.entry.job, d.entry.cron, d.entry.observer,
      (d.callsIn ? d.callsIn + ': ' + fmt(d.callersIn) : ''), fmt(d.callsOut)].join(' | ') + ' |');
  }
  lines.push('');
  lines.push('## Ripple');
  lines.push('');
  lines.push('The functions in other domains that have to become async when a domain converts its database-reaching functions: every caller, and their callers, up to the methods, jobs and publications. A domain with a big ripple is cheaper to convert after the domains it ripples into, once their callers are async already.');
  lines.push('');
  lines.push('| Domain | Functions elsewhere that become async | In |');
  lines.push('|---|---:|---|');
  rows.slice().sort(function(a, b) { return b.rippleCount - a.rippleCount || a.name.localeCompare(b.name); }).forEach(function(d) {
    if (d.rippleCount) lines.push('| ' + d.name + ' | ' + d.rippleCount + ' | ' + fmt(d.ripple) + ' |');
  });
  lines.push('');
  lines.push('## What stage 2 removes, by domain');
  lines.push('');
  lines.push('| Domain | ' + legacyKinds.join(' | ') + ' |');
  lines.push('|---|' + legacyKinds.map(function() { return '---:'; }).join('|') + '|');
  for (const d of rows) {
    if (!Object.keys(d.legacy).length) continue;
    lines.push('| ' + d.name + ' | ' + legacyKinds.map(function(k) { return d.legacy[k] || ''; }).join(' | ') + ' |');
  }
  lines.push('');
  lines.push('## Most-called database-reaching functions');
  lines.push('');
  lines.push('Converting one of these makes every caller async.');
  lines.push('');
  lines.push('| Function | Defined in | Call sites | From domains |');
  lines.push('|---|---|---:|---|');
  const callers = {};
  for (const unit of live) {
    for (const c of unit.callees) {
      const entry = callers[c.id] = callers[c.id] || {sites: 0, domains: {}};
      entry.sites++;
      entry.domains[unit.domain] = (entry.domains[unit.domain] || 0) + 1;
    }
  }
  Object.entries(callers).filter(function(e) { return units[e[0]].reachesDb; })
    .sort(function(a, b) { return b[1].sites - a[1].sites; }).slice(0, 40).forEach(function(e) {
      const unit = units[e[0]];
      lines.push('| `' + unit.name + '` | ' + unit.file + ':' + unit.line + ' | ' + e[1].sites + ' | ' + fmt(e[1].domains) + ' |');
    });
  lines.push('');
  return {markdown: lines.join('\n'), domains: rows};
}

module.exports = {analyse, report};

if (require.main === module) {
  const result = analyse(listFiles());
  const out = report(result);
  const dir = path.join(ROOT, '.test-results');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'async-graph.md'), out.markdown);
  const json = result.live.map(function(u) {
    return {name: u.name, file: u.file, line: u.line, domain: u.domain, async: u.async, db: u.db, reachesDb: u.reachesDb,
      legacy: u.legacy, callees: u.callees.map(function(c) { const t = result.units[c.id]; return {name: t.name, file: t.file, line: c.line}; })};
  });
  fs.writeFileSync(path.join(dir, 'async-graph.json'), JSON.stringify({collections: result.collections, functions: json}, null, 1));
  console.log('async-graph: ' + result.live.length + ' functions, ' + result.live.filter(function(u) { return u.reachesDb; }).length +
    ' reach the database; wrote .test-results/async-graph.md and .json');
}
