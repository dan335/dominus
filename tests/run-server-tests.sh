#!/bin/sh
# Runs every server test suite (Meteor.call('runAllTests')) against a fresh
# local app and writes a markdown report. Meant for the cloud sandbox and for
# CI-style runs on a dev machine; it never touches production.
#
#   tests/run-server-tests.sh [output-dir]      default: .test-results
#   RUNS=3 tests/run-server-tests.sh            run the suites 3 times in a row
#   SUITE=march tests/run-server-tests.sh       only the suites whose name contains it
#   COVERAGE=1 tests/run-server-tests.sh        also report server line coverage
#                                               (tests/coverage-report.py, needs npx)
#                                               and write coverage-map.md, every
#                                               method, publication, job, cron, hook
#                                               and route with its coverage
#                                               (tests/coverage-map.py)
#
# Needs meteor and either a Redis on localhost:6379 or docker (it starts
# redis:6 if nothing answers). The app runs with DOMINUS_WORKER=true like
# production, on its own local Mongo (.meteor/local/db), which the tests wipe.
set -e
cd "$(dirname "$0")/.."
OUT=$(mkdir -p "${1:-.test-results}" && cd "${1:-.test-results}" && pwd)
RUNS=${RUNS:-1}
PORT=${PORT:-3000}
SUPERUSER=
[ "$(id -u)" = 0 ] && SUPERUSER=--allow-superuser

redis_up() { (printf 'PING\r\n'; sleep 1) | nc -w 2 127.0.0.1 6379 2>/dev/null | grep -q PONG; }
if ! redis_up; then
    echo "Starting redis:6 in docker..."
    docker rm -f dominus-test-redis >/dev/null 2>&1 || true
    docker run -d --name dominus-test-redis --network host redis:6 >/dev/null
    sleep 2
    redis_up || { echo "FAIL: no Redis on localhost:6379" >&2; exit 1; }
fi

if [ -n "$COVERAGE" ]; then
    rm -rf "$OUT/v8-coverage"
    mkdir -p "$OUT/v8-coverage"
    export NODE_V8_COVERAGE="$OUT/v8-coverage"
fi

echo "Starting the app (log: $OUT/server.log)..."
DOMINUS_WORKER=true DOMINUS_TEST=false meteor run --port $PORT --settings settings.json $SUPERUSER \
    > "$OUT/server.log" 2>&1 < /dev/null &
METEOR_PID=$!
stop_app() {
    # SIGINT lets meteor stop the app cleanly, which is when V8 writes coverage
    kill -INT $METEOR_PID 2>/dev/null || true
    wait $METEOR_PID 2>/dev/null || true
}
trap stop_app EXIT

tries=0
until grep -q "App running at" "$OUT/server.log"; do
    if grep -qE "has errors|is crashing" "$OUT/server.log"; then
        echo "FAIL: the app did not start, see $OUT/server.log" >&2
        exit 1
    fi
    tries=$((tries+1))
    [ $tries -lt 300 ] || { echo "FAIL: the app did not start in 15 minutes" >&2; exit 1; }
    sleep 3
done
# the worker starts its queues and cron after the app reports it is running
until grep -q "dominus worker started" "$OUT/server.log"; do sleep 2; done
sleep 10

STATUS=0
REPORT="$OUT/server-tests.md"
{
    echo "# Server tests"
    echo
    echo "Commit \`$(git rev-parse --short HEAD)\` ($(git rev-parse --abbrev-ref HEAD)), $(date -u +%Y-%m-%dT%H:%M:%SZ), $(meteor --version $SUPERUSER 2>/dev/null | tail -1)."
    echo
} > "$REPORT"

# the missing-await checker and its own tests (tests/async/README.md)
[ -d tests/async/node_modules ] || npm ci --prefix tests/async --no-audit --no-fund > /dev/null 2>&1 || true
if node tests/async/check-await.js > "$OUT/check-await.txt" 2>&1 &&
    (cd tests/async && node --test check-await.test.js) > "$OUT/check-await-tests.txt" 2>&1; then
    node tests/async/check-await.js --meteor3 > "$OUT/check-await-meteor3.txt" 2>&1 || true
    printf '## Missing-await check: passed\n\n%s, and its own tests. Left for Meteor 3 (observe, observeChanges, _publishCursor; `--meteor3`): %s.\n\n' \
        "$(tail -1 "$OUT/check-await.txt")" "$(grep -c '' "$OUT/check-await-meteor3.txt" | awk '{print $1 - 1}')" >> "$REPORT"
else
    STATUS=1
    printf '## Missing-await check: FAILED\n\n```\n%s\n%s\n```\n\n' "$(tail -40 "$OUT/check-await.txt")" \
        "$(grep -E '^not ok|^# (pass|fail)' "$OUT/check-await-tests.txt" 2>/dev/null)" >> "$REPORT"
fi

i=1
while [ $i -le $RUNS ]; do
    echo "Run $i of $RUNS..."
    echo "JSON.stringify(Meteor.call('runAllTests', $(node -e 'console.log(JSON.stringify(process.argv[1] || ""))' "$SUITE")))" | meteor shell $SUPERUSER > "$OUT/run-$i.txt" 2>&1 || true
    python3 - "$OUT/run-$i.txt" "$i" >> "$REPORT" <<'PY' || STATUS=1
import json, re, sys
text = open(sys.argv[1]).read()
match = re.search(r'^"(\{.*\})"\s*$', text, re.M)
if not match:
    print('## Run %s: no result\n\n```\n%s\n```\n' % (sys.argv[2], text[-3000:]))
    sys.exit(1)
out = json.loads(json.loads('"' + match.group(1) + '"'))
print('## Run %s: %d passed, %d failed, %d skipped\n' % (sys.argv[2], out['passed'], out['failed'], out['skipped']))
for r in out['results']:
    if r['status'] != 'PASS':
        print('- **%s** %s: %s' % (r['status'], r['name'], (r.get('error') or '').replace('\n', ' ')[:2000]))
print('\n<details><summary>All %d results</summary>\n' % len(out['results']))
for r in out['results']:
    print('- %s %s' % (r['status'], r['name']))
print('\n</details>\n')
sys.exit(1 if out['failed'] else 0)
PY
    i=$((i+1))
done

stop_app
trap - EXIT

if [ -n "$COVERAGE" ]; then
    echo "Writing coverage report..."
    python3 tests/coverage-report.py "$OUT/v8-coverage" "$OUT/coverage" >> "$REPORT" || STATUS=1
    python3 tests/coverage-map.py "$OUT/coverage/coverage-final.json" "$OUT/coverage-map.md" || STATUS=1
    echo "Coverage map: $OUT/coverage-map.md"
fi

grep -E "^## (Run|Missing)" "$REPORT"
echo "Report: $REPORT"
exit $STATUS
