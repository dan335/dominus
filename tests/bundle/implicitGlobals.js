// Finds the assignments in a script to names that no enclosing scope declares
// (implicit globals), and whether each one runs in strict mode. In strict
// mode such an assignment throws "x is not defined" unless the global already
// exists.
//
// Old libraries in lib/client/compatibility assign undeclared names and rely
// on sloppy mode. The production minifier can inline one of their functions
// into a function that says 'use strict', which turns the assignment into an
// error: that broke every graph on Meteor 3 (metricsgraphics.js,
// main_time_format, Oct 2026). check-bundle.js runs this on the client bundles
// of a production build.
//
// The scopes are worked out simply: every name a function declares, in any
// block, counts for the whole function. That can only miss a finding, never
// make one up.
const acorn = require('acorn');

const isFunction = (n) => n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');

function patternNames(p, out) {
  if (!p) return;
  switch (p.type) {
    case 'Identifier': out.push(p.name); break;
    case 'ObjectPattern': p.properties.forEach((q) => patternNames(q.type === 'RestElement' ? q.argument : q.value, out)); break;
    case 'ArrayPattern': p.elements.forEach((e) => patternNames(e, out)); break;
    case 'RestElement': patternNames(p.argument, out); break;
    case 'AssignmentPattern': patternNames(p.left, out); break;
  }
}

function children(n, fn) {
  for (const k in n) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && fn(c));
    else if (v && typeof v.type === 'string') fn(v);
  }
}

// the names declared in a function body, not counting nested functions
function declaredIn(body, names) {
  (function walk(n) {
    if (n.type === 'VariableDeclaration') n.declarations.forEach((d) => patternNames(d.id, names));
    if (n.type === 'FunctionDeclaration') { if (n.id) names.push(n.id.name); return; }
    if (n.type === 'ClassDeclaration' && n.id) names.push(n.id.name);
    if (n.type === 'CatchClause' && n.param) patternNames(n.param, names);
    if (isFunction(n)) return;
    children(n, walk);
  })(body);
}

function saysUseStrict(statements) {
  for (const s of statements) {
    if (s.type !== 'ExpressionStatement' || s.directive === undefined) break;
    if (s.directive === 'use strict') return true;
  }
  return false;
}

// [{name, strict, start}] for each assignment to an undeclared name
function implicitGlobals(source) {
  const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowHashBang: true});
  const found = [];

  function visit(n, scopes, strict) {
    if (isFunction(n)) {
      const names = [];
      n.params.forEach((p) => patternNames(p, names));
      if (n.type === 'FunctionExpression' && n.id) names.push(n.id.name);
      if (n.type !== 'ArrowFunctionExpression') names.push('arguments');
      let inner = strict;
      if (n.body.type === 'BlockStatement') {
        declaredIn(n.body, names);
        if (saysUseStrict(n.body.body)) inner = true;
      }
      const s = scopes.concat([new Set(names)]);
      n.params.forEach((p) => visit(p, s, inner));
      visit(n.body, s, inner);
      return;
    }
    if (n.type === 'ClassDeclaration' || n.type === 'ClassExpression') {
      if (n.superClass) visit(n.superClass, scopes, strict);
      visit(n.body, scopes.concat([new Set(n.id ? [n.id.name] : [])]), true);
      return;
    }
    const target = n.type === 'AssignmentExpression' ? n.left
      : n.type === 'UpdateExpression' ? n.argument
      : (n.type === 'ForInStatement' || n.type === 'ForOfStatement') ? n.left : null;
    if (target && target.type === 'Identifier' && !scopes.some((s) => s.has(target.name))) {
      found.push({name: target.name, strict, start: target.start});
    }
    children(n, (c) => visit(c, scopes, strict));
  }

  const top = [];
  declaredIn({type: 'Program', body: ast.body}, top);
  visit({type: 'BlockStatement', body: ast.body}, [new Set(top)], saysUseStrict(ast.body));
  return found;
}

module.exports = { implicitGlobals };
