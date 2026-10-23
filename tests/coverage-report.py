#!/usr/bin/env python3
"""Server coverage report from NODE_V8_COVERAGE output (used by run-server-tests.sh).

Meteor loads the server bundle under meteor://💻app/... URLs, which c8 can't
find on disk. This rewrites them to the bundle files in .meteor/local/build,
runs c8 (which follows the bundle's source maps back to the repo files), and
writes a markdown table with repo-relative paths.

    tests/coverage-report.py <v8-coverage-dir> <out-dir>
"""
import glob
import json
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLE = os.path.join(REPO, '.meteor/local/build/programs/server/')
PREFIX = 'meteor://💻app/'


def listed(coverage_dir, name):
    path = os.path.join(coverage_dir, name + '.txt')
    return set(open(path).read().split()) if os.path.exists(path) else None


def zero_counts(data):
    for script in data.get('result', []):
        for fn in script.get('functions', []):
            for r in fn.get('ranges', []):
                r['count'] = 0


def rewrite_urls(coverage_dir):
    """Keep only what ran inside test runs, with bundle file URLs.

    runAllTests resets V8's counters before and after each run and lists the
    files written (before-runs.txt, test-runs.txt). After a reset V8 leaves out
    functions that haven't run since, so a run's file alone would make code
    that never ran look covered. The before-run files list every function, so
    they are kept with their counts zeroed: merged with the run files, code
    that didn't run during a test run counts as not covered.
    """
    runs = listed(coverage_dir, 'test-runs')
    before = listed(coverage_dir, 'before-runs') or set()
    for path in glob.glob(os.path.join(coverage_dir, '*.json')):
        name = os.path.basename(path)
        if runs is not None and name not in runs and name not in before:
            os.remove(path)
            continue
        with open(path) as f:
            data = json.load(f)
        # keep only the app server process: meteor-tool and meteor shell also
        # write coverage, and the tool's build plugins reuse meteor:// URLs
        if not any(s.get('url', '').endswith('/programs/server/boot.js') for s in data.get('result', [])):
            os.remove(path)
            continue
        if name in before:
            zero_counts(data)
        for script in data.get('result', []):
            url = script.get('url', '')
            if url.startswith(PREFIX):
                local = BUNDLE + url[len(PREFIX):]
                if os.path.exists(local):
                    script['url'] = 'file://' + local
        with open(path, 'w') as f:
            json.dump(data, f)


def repo_path(key):
    # c8 resolves a source map's meteor://💻app/<path> against the bundle file
    marker = 'meteor:/💻app/'
    if marker not in key:
        return None
    rel = key.split(marker, 1)[1]
    if '/node_modules/' in rel or '/.npm/' in rel:
        return None
    return rel if os.path.exists(os.path.join(REPO, rel)) else None


def main():
    coverage_dir, out_dir = sys.argv[1], sys.argv[2]
    rewrite_urls(coverage_dir)
    subprocess.run(['npx', '-y', 'c8@7.14.0', 'report', '--temp-directory', coverage_dir,
                    '--reports-dir', out_dir, '--reporter', 'json-summary', '--reporter', 'json',
                    '--exclude-after-remap', '--allowExternal', '--include', '**',
                    '--exclude', '**/node_modules/**'], cwd=REPO, check=True,
                   stdout=subprocess.DEVNULL)
    with open(os.path.join(out_dir, 'coverage-summary.json')) as f:
        summary = json.load(f)

    files = {}
    for key, value in summary.items():
        rel = repo_path(key)
        # client files only show up through shared (both/) code; keep server-side ones
        if rel and '/client/' not in '/' + rel:
            files[rel] = value['lines']
    with open(os.path.join(out_dir, 'server-coverage.json'), 'w') as f:
        json.dump(files, f, indent=1, sort_keys=True)

    total = sum(v['total'] for v in files.values())
    covered = sum(v['covered'] for v in files.values())
    lines = ['## Server line coverage', '',
             '%d of %d lines in %d files (%.1f%%), counting only what ran during test runs. Test files included.' % (
                 covered, total, len(files), 100.0 * covered / total if total else 0), '',
             '<details><summary>Per file</summary>', '',
             '| File | Lines | Covered |', '|---|---:|---:|']
    for rel in sorted(files):
        v = files[rel]
        lines.append('| %s | %d | %s%% |' % (rel, v['total'], v['pct']))
    lines += ['', '</details>', '']
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
