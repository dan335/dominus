#!/bin/sh
# Runs the browser tests (Playwright, tests/e2e/specs) against a fresh local
# app. Never point it at production: the fixtures make and delete users and
# games, and the server tests' rules apply (local development database only).
#
#   tests/e2e/run.sh                        every spec
#   tests/e2e/run.sh specs/chat.spec.js     one spec (any playwright test args)
#   REUSE=1 tests/e2e/run.sh                use the app already running from
#                                           this checkout on PORT (the fixtures
#                                           talk to it through meteor shell)
#
# Needs meteor, node and either a Redis on localhost:6379, redis-server or
# docker. Report: .test-results/e2e/report (npx playwright show-report there).
set -e
cd "$(dirname "$0")/../.."
APP=$(pwd)
OUT="$APP/.test-results/e2e"
PORT=${PORT:-3000}
SUPERUSER=
[ "$(id -u)" = 0 ] && SUPERUSER=--allow-superuser
mkdir -p "$OUT"

if [ ! -d tests/e2e/node_modules/@playwright/test ]; then
    echo "Installing @playwright/test..."
    (cd tests/e2e && npm install --no-audit --no-fund)
fi

if [ -z "$REUSE" ]; then
    redis_up() { (printf 'PING\r\n'; sleep 1) | nc -w 2 127.0.0.1 6379 2>/dev/null | grep -q PONG; }
    if ! redis_up; then
        if command -v redis-server >/dev/null; then
            echo "Starting redis-server..."
            # no snapshots: nothing written into the checkout
            redis-server --daemonize yes --port 6379 --save '' --appendonly no >/dev/null
        else
            echo "Starting redis:6 in docker..."
            docker rm -f dominus-test-redis >/dev/null 2>&1 || true
            docker run -d --name dominus-test-redis --network host redis:6 >/dev/null
        fi
        sleep 2
        redis_up || { echo "FAIL: no Redis on localhost:6379" >&2; exit 1; }
    fi

    echo "Starting the app (log: $OUT/server.log)..."
    DOMINUS_WORKER=true DOMINUS_TEST=false meteor run --port $PORT --settings settings.json $SUPERUSER \
        > "$OUT/server.log" 2>&1 < /dev/null &
    METEOR_PID=$!
    stop_app() {
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
    sleep 5
fi

STATUS=0
(cd tests/e2e && E2E_URL="http://localhost:$PORT" npx playwright test "$@") || STATUS=$?
echo "Report: $OUT/report (cd tests/e2e && npx playwright show-report ../../.test-results/e2e/report)"
exit $STATUS
