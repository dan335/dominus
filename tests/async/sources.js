// The app's own JavaScript files and their syntax trees, for check-await.js
// and async-graph.js.
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const ROOT = path.resolve(__dirname, '../..');

// what Meteor loads: everything but these (the app's tests/ and public/ are
// ignored by Meteor itself; .npm and node_modules hold the packages' npm
// dependencies). A package's tests/ folder is kept: package.js names its files.
const DIRS = ['packages', 'server', 'lib', 'game', 'client', 'alert'];
const SKIP = new Set(['.npm', 'node_modules', '.build', 'public', 'tests', '.git']);

function listFiles(root) {
  root = root || ROOT;
  const out = [];
  const packages = path.join(root, 'packages');
  const walk = function(dir) {
    const inPackage = dir.startsWith(packages + path.sep);
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (SKIP.has(entry.name) && !(inPackage && entry.name === 'tests')) continue;
      if (entry.name.startsWith('.build')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
    }
  };
  for (const dir of DIRS) {
    const full = path.join(root, dir);
    if (fs.existsSync(full)) walk(full);
  }
  return out.sort();
}

// Meteor's files are scripts, but a few use import/export
function parse(source) {
  const options = {ecmaVersion: 'latest', locations: true, allowHashBang: true,
    allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true};
  try {
    return acorn.parse(source, Object.assign({sourceType: 'script'}, options));
  } catch (error) {
    return acorn.parse(source, Object.assign({sourceType: 'module'}, options));
  }
}

// where a file runs: 'client', 'server' or 'both', from the folder names
// Meteor uses (a package's package.js can say otherwise; the folders are what
// this codebase goes by)
function fileSide(file) {
  const parts = path.relative(ROOT, file).split(path.sep);
  if (parts.includes('client')) return 'client';
  if (parts.includes('server')) return 'server';
  if (parts[parts.length - 1] === 'package.js') return 'build';
  return 'both';
}

// the dotted name of an expression: dCastles.foo, Queues[name] -> Queues.?
function dottedName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'MemberExpression') {
    const object = dottedName(node.object);
    if (!object) return null;
    if (!node.computed && node.property.type === 'Identifier') return object + '.' + node.property.name;
    if (node.computed && node.property.type === 'Literal') return object + '.' + node.property.value;
    return object + '.?';
  }
  return null;
}

module.exports = {ROOT, listFiles, parse, fileSide, dottedName};
