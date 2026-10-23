#!/usr/bin/env python3
"""Coverage map: every server entry point and whether the server tests reach it.

Lists every Meteor method (and whether server/methodPolicy.js lists it), every
publication, every Bull queue handler, every SyncedCron job, the Accounts hooks
and the HTTP routes, each with how much of its handler body the test run
executed, and whether a test file names it.

    tests/coverage-map.py <coverage-final.json> [out.md]

The coverage file comes from `COVERAGE=1 tests/run-server-tests.sh`
(.test-results/coverage/coverage-final.json). Client-only files are skipped.
The scan is a small JavaScript tokenizer, not a full parser: it is enough for
the patterns this codebase uses, and anything it can't place is listed with
no coverage rather than dropped.
"""
import json
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARKER = 'meteor:/💻app/'


# --- Tokenizing ---

def mask(src):
    """Same length as src, with comments blanked and string/regex contents
    replaced by spaces, so braces and keywords can be found safely."""
    out = list(src)
    i, n = 0, len(src)
    last = ''  # last significant character, to tell a regex from a division

    def blank(a, b):
        for k in range(a, b):
            if out[k] != '\n':
                out[k] = ' '

    while i < n:
        c = src[i]
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            j = n if j == -1 else j
            blank(i, j)
            i = j
        elif c == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2)
            j = n if j == -1 else j + 2
            blank(i, j)
            i = j
        elif c in '\'"`':
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == '\\':
                    j += 1
                elif c != '`' and src[j] == '\n':
                    break
                j += 1
            blank(i + 1, min(j, n))
            i = j + 1
            last = c
        elif c == '/' and (last == '' or last in '(,=:[!&|?{};+-*%<>~^'):
            j = i + 1
            in_class = False
            while j < n and src[j] != '\n':
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == '[':
                    in_class = True
                elif src[j] == ']':
                    in_class = False
                elif src[j] == '/' and not in_class:
                    break
                j += 1
            blank(i + 1, j)
            i = j + 1
            last = '/'
        else:
            if not c.isspace():
                last = c
            i += 1
    return ''.join(out)


def match_brace(masked, i):
    """Index of the bracket closing the one at i."""
    pairs = {'{': '}', '(': ')', '[': ']'}
    stack = []
    for j in range(i, len(masked)):
        c = masked[j]
        if c in pairs:
            stack.append(pairs[c])
        elif c in ')}]':
            if not stack or stack.pop() != c:
                return None
            if not stack:
                return j
    return None


def line_of(src, i):
    return src.count('\n', 0, i) + 1


def string_at(src, i):
    """The quoted string starting at i (index of the quote), or None."""
    m = re.match(r'([\'"`])((?:\\.|(?!\1).)*)\1', src[i:])
    return m.group(2) if m else None


def function_body(src, masked, start, limit=None):
    """(open, close) of the first function body at or after start: a
    `function ... {`, an arrow `=> {`, or a method shorthand `name(...) {`."""
    limit = limit or len(masked)
    m = re.compile(r'function\b[^{(]*\(|=>\s*\{|\b[A-Za-z_$][\w$]*\s*\(').search(masked, start, limit)
    while m:
        text = m.group(0)
        if text.startswith('=>'):
            open_ = masked.index('{', m.start())
        else:
            paren = m.end() - 1
            close_paren = match_brace(masked, paren)
            if close_paren is None:
                return None
            rest = re.compile(r'\s*\{').match(masked, close_paren + 1)
            if not rest:
                # a call such as bindEnvironment(function...) - look inside it
                m = re.compile(r'function\b[^{(]*\(|=>\s*\{|\b[A-Za-z_$][\w$]*\s*\(').search(masked, m.end(), limit)
                continue
            open_ = rest.end() - 1
        close = match_brace(masked, open_)
        return (open_, close) if close else None
    return None


def named_function(src, masked, name):
    m = re.search(r'function\s+' + re.escape(name) + r'\s*\(', masked)
    if not m:
        m = re.search(r'\b' + re.escape(name) + r'\s*=\s*function\b', masked)
    return function_body(src, masked, m.start()) if m else None


# --- Entry points ---

def scan_file(path):
    src = open(path, encoding='utf-8', errors='replace').read()
    masked = mask(src)
    found = []

    def add(kind, name, body, at):
        span = (line_of(src, body[0]), line_of(src, body[1])) if body else None
        found.append({'kind': kind, 'name': name, 'file': os.path.relpath(path, REPO),
                      'line': line_of(src, at), 'span': span})

    # Meteor.methods({ name: function () {}, 'a.b': fn, short() {} })
    for m in re.finditer(r'Meteor\.methods\s*\(\s*\{', masked):
        open_ = m.end() - 1
        close = match_brace(masked, open_)
        if not close:
            continue
        i = open_ + 1
        while i < close:
            km = re.compile(r'\s*(?:([A-Za-z_$][\w$.]*)|([\'"])[^\'"]*\2)\s*(:|\()').match(masked, i)
            if not km:
                i += 1
                continue
            key_start = km.start(1) if km.group(1) else km.start(2)
            name = km.group(1) or string_at(src, key_start)
            if km.group(3) == '(':
                body = function_body(src, masked, key_start, close)
            else:
                value = re.compile(r'\s*([A-Za-z_$][\w$.]*)\s*[,}]').match(masked, km.end())
                if value and value.group(1) != 'function':
                    body = named_function(src, masked, value.group(1).split('.')[-1])
                else:
                    body = function_body(src, masked, km.end(), close)
            add('method', name, body, key_start)
            # skip to the end of this property
            end = body[1] + 1 if body and km.end() <= body[0] < close else km.end()
            nxt = masked.find(',', end, close)
            i = close if nxt == -1 else nxt + 1

    # new ValidatedMethod({ name: 'x', run() {} })
    for m in re.finditer(r'new\s+ValidatedMethod\s*\(\s*\{', masked):
        open_ = m.end() - 1
        close = match_brace(masked, open_)
        nm = re.compile(r'name\s*:\s*([\'"])').search(masked, open_, close)
        run = re.compile(r'\brun\s*[(:]').search(masked, open_, close)
        name = string_at(src, nm.start(1)) if nm else '?'
        add('method', name, function_body(src, masked, run.start(), close) if run else None, m.start())

    # Meteor.publish('name', function () {})
    for m in re.finditer(r'Meteor\.publish\s*\(\s*', masked):
        q = m.end()
        name = string_at(src, q) if masked[q] in '\'"' else ('(null: auto-published)' if masked.startswith('null', q) else '?')
        if masked.startswith('name', q):
            continue  # the Meteor.publish(name, ...) inside the admin_publish helper below
        close = match_brace(masked, masked.index('(', m.start()))
        add('publication', name, function_body(src, masked, q, close), m.start())

    # admin_publish('name', function () {}) (packages/dominus-admin/server/publish.js)
    for m in re.finditer(r'\badmin_publish\s*\(\s*([\'"])', masked):
        close = match_brace(masked, masked.index('(', m.start()))
        add('publication', string_at(src, m.start(1)), function_body(src, masked, m.end(), close), m.start())

    # Queues.name.process(n, Meteor.bindEnvironment(function (job) {}))
    for m in re.finditer(r'Queues\.([A-Za-z_$][\w$]*)\.process\s*\(', masked):
        close = match_brace(masked, m.end() - 1)
        add('queue job', m.group(1), function_body(src, masked, m.end(), close), m.start())

    # SyncedCron.add({ name: 'x', job: function () {} })
    for m in re.finditer(r'SyncedCron\.add\s*\(\s*\{', masked):
        open_ = m.end() - 1
        close = match_brace(masked, open_)
        nm = re.compile(r'name\s*:\s*([\'"])').search(masked, open_, close)
        job = re.compile(r'\bjob\s*[(:]').search(masked, open_, close)
        name = string_at(src, nm.start(1)) if nm else '?'
        add('cron job', name, function_body(src, masked, job.start(), close) if job else None, m.start())

    # Accounts hooks
    for m in re.finditer(r'Accounts\.(validateNewUser|onCreateUser|onLogin|onLoginFailure|validateLoginAttempt|onLogout)\s*\(', masked):
        close = match_brace(masked, m.end() - 1)
        add('accounts hook', m.group(1), function_body(src, masked, m.end(), close), m.start())
    for m in re.finditer(r'Accounts\.emailTemplates\.([\w.]+)\s*=\s*function', masked):
        add('accounts hook', 'emailTemplates.' + m.group(1), function_body(src, masked, m.start()), m.start())

    # HTTP routes
    for m in re.finditer(r'Picker\.route\s*\(\s*', masked):
        close = match_brace(masked, masked.index('(', m.start()))
        q = m.end()
        name = string_at(src, q) if masked[q] in '\'"' else src[q:masked.index(',', q)].strip()
        add('http route', name, function_body(src, masked, q, close), m.start())

    return found


def server_files():
    files = subprocess.run(['git', 'ls-files', '*.js'], cwd=REPO, capture_output=True, text=True).stdout.split()
    keep = []
    for f in files:
        parts = f.split('/')
        if 'client' in parts or f.startswith('public/') or f.startswith('tests/') or '.npm' in parts:
            continue
        keep.append(f)
    return keep


# --- Coverage ---

def load_coverage(path):
    data = json.load(open(path))
    by_file = {}
    for key, value in data.items():
        if MARKER in key:
            by_file[key.split(MARKER, 1)[1]] = value
    return by_file


def span_coverage(cov, span):
    """(calls, covered, total) for the handler whose body spans these lines.

    Mapping V8's ranges back through Meteor's source maps can land a line off
    in some files, so the handler is found in the coverage's own function map
    (the function starting within a line of the body and reaching its end),
    and its call count is taken from there."""
    if not cov or not span:
        return None
    a, b = span
    best = None
    for fid, fn in cov['fnMap'].items():
        start, end = fn['loc']['start']['line'], fn['loc']['end']['line']
        if abs(start - a) <= 1 and end >= b - 1:
            key = (abs(start - a), end - start)
            if best is None or key < best[0]:
                best = (key, fid, start, end)
    if best:
        calls = cov['f'].get(best[1], 0)
        a, b = best[2], min(best[3], b + 1)
    else:
        calls = None
    total = covered = 0
    for sid, loc in cov['statementMap'].items():
        if a < loc['start']['line'] <= b:
            total += 1
            if cov['s'].get(sid, 0) > 0:
                covered += 1
    return calls, covered, total


def is_test_file(f):
    return bool(re.search(r'(Tests?\.js$|[Tt]ests?-[^/]*\.js$|-tests?[^/]*\.js$)', f)) or '/tests/' in '/' + f


def test_text():
    texts = []
    for f in subprocess.run(['git', 'ls-files', '*.js'], cwd=REPO, capture_output=True, text=True).stdout.split():
        if is_test_file(f):
            texts.append(open(os.path.join(REPO, f), encoding='utf-8', errors='replace').read())
    return '\n'.join(texts)


def method_policy():
    """name -> public / user / game, from the MethodPolicy object."""
    src = open(os.path.join(REPO, 'server/methodPolicy.js')).read()
    masked = mask(src)
    m = re.search(r'MethodPolicy\s*=\s*\{', masked)
    close = match_brace(masked, m.end() - 1)
    policy = {}
    depth = 0
    i = m.end()
    while i < close:
        c = masked[i]
        if c in '{([':
            depth += 1
        elif c in '})]':
            depth -= 1
        elif depth == 0:
            km = re.compile(r'(?:([A-Za-z_$][\w$.]*)|([\'"])[^\'"]*\2)\s*:\s*([A-Za-z_$][\w$]*)').match(masked, i)
            if km and (i == 0 or not re.match(r'[\w$.]', masked[i - 1])):
                name = km.group(1) or string_at(src, km.start(2))
                value = km.group(3)
                policy[name] = {'PUBLIC': 'public', 'USER': 'user'}.get(value, 'game')
                i = km.end()
                continue
        i += 1
    return policy


def main():
    coverage = load_coverage(sys.argv[1])
    out_path = sys.argv[2] if len(sys.argv) > 2 else None
    tests = test_text()
    policy = method_policy()

    entries = []
    for f in server_files():
        if is_test_file(f):
            continue
        entries.extend(scan_file(os.path.join(REPO, f)))

    rows = {}
    for e in entries:
        cov = coverage.get(e['file'])
        sc = span_coverage(cov, e['span'])
        e['loaded'] = cov is not None
        e['calls'] = sc[0] if sc else None
        e['covered'] = sc[1:] if sc else None
        e['pct'] = (100.0 * sc[1] / sc[2]) if sc and sc[2] else (None if not sc else 0.0)
        quoted = r'[\'"]' + re.escape(e['name']) + r'[\'"]'
        as_key = r'(?<![\w$.])' + re.escape(e['name']) + r'\s*:'
        e['named'] = e['name'] != '?' and bool(re.search(quoted, tests) or re.search(as_key, tests))
        if e['kind'] == 'method':
            e['policy'] = policy.get(e['name'], '')
        rows.setdefault(e['kind'], []).append(e)

    def status(e):
        if not e['loaded']:
            return 'not loaded'
        if e['pct'] is None:
            return 'unknown'
        if e['calls'] == 0:
            return 'untested'
        # Without a call count, one covered statement is usually the
        # handler's own first line, which line-based coverage counts as run
        # whenever the code around it runs (seen on every paused cron job).
        if e['calls'] is None and e['covered'][0] <= 1:
            return 'untested'
        if e['pct'] < 50:
            return 'partly'
        return 'tested'

    order = ['method', 'publication', 'queue job', 'cron job', 'accounts hook', 'http route']
    lines = ['# Server coverage map', '',
             'Generated by `tests/coverage-map.py` from a `COVERAGE=1 tests/run-server-tests.sh` run.', '',
             '**Body coverage** is the share of statements inside the handler that the test run executed. '
             '**Calls** is how many times the handler ran during the test runs, when the coverage data has the function (blank when it could not be matched). '
             '**Status**: tested (ran, 50% or more of its body), partly (ran, but mostly returned early), untested (never ran, or with no call count, at most one covered line), not loaded (the file is not in the server bundle, so it is dead code). '
             '**Named in a test** means a test file mentions the name in quotes or as an object key (the spectator attack table names every method). '
             'Neither column proves a test checks what the handler does: a spectator test that calls a method as a player of another game runs its body without asserting its effect. That is what T3 to T5 add.', '',
             '## Summary', '', '| Kind | Total | Tested | Partly | Untested | Not loaded |', '|---|---:|---:|---:|---:|---:|']
    for kind in order:
        rs = rows.get(kind, [])
        c = lambda s: sum(1 for e in rs if status(e) == s)
        lines.append('| %s | %d | %d | %d | %d | %d |' % (kind, len(rs), c('tested'), c('partly'), c('untested') + c('unknown'), c('not loaded')))
    lines.append('')

    for kind in order:
        rs = sorted(rows.get(kind, []), key=lambda e: (e['pct'] if e['pct'] is not None else -1, e['name']))
        lines += ['## %ss (%d)' % (kind[0].upper() + kind[1:], len(rs)), '']
        head = '| Name | Where | Calls | Body coverage | Status | Named in a test |'
        sep = '|---|---|---:|---:|---|---|'
        if kind == 'method':
            head = '| Name | Where | Policy | Calls | Body coverage | Status | Named in a test |'
            sep = '|---|---|---|---:|---:|---|---|'
        lines += [head, sep]
        for e in rs:
            pct = '' if e['pct'] is None else '%d%% (%d/%d)' % (round(e['pct']), e['covered'][0], e['covered'][1])
            where = '%s:%d' % (e['file'], e['line'])
            cells = ['`%s`' % e['name'], where]
            if kind == 'method':
                cells.append(re.sub(r'\s+', ' ', e['policy']) or '**missing**')
            cells += ['' if e['calls'] is None else str(e['calls']), pct, status(e), 'yes' if e['named'] else '']
            lines.append('| ' + ' | '.join(cells) + ' |')
        lines.append('')

    text = '\n'.join(lines)
    if out_path:
        open(out_path, 'w').write(text)
    else:
        print(text)


if __name__ == '__main__':
    main()
