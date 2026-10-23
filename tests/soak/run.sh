#!/bin/sh
# The soak test (T8 of the Meteor upgrade plan, Oct 2026): the production
# Docker image, a web and a worker container as on the server, MongoDB 8.0 as a
# single-node replica set with the oplog (as on Atlas) and Redis, all on a
# Docker network with no way out, so nothing reaches S3, Stripe, SendGrid or
# anything else; a stand-in mail server keeps the emails (tests/soak/mail.js).
# Bots play crazy fast games against it over DDP (tests/soak/bots). At the end tests/soak/report.js writes the report.
#
#   tests/soak/run.sh                     build HEAD's image and soak it for 12 hours
#   HOURS=24 tests/soak/run.sh            longer (MINUTES=30 for a short check)
#   IMAGE=dominus-soak:abc123 tests/soak/run.sh   reuse an image already built
#   BASELINE=path/summary.json tests/soak/run.sh  compare with an earlier soak
#   WATCH_PORT=3100 tests/soak/run.sh     also serve the game on localhost:3100
#                                         to watch it in a browser
#   DUMP=path/to/mongodump tests/soak/run.sh      replay: restore a production
#                                         dump, run it with no bots for HOURS
#                                         (default 1), check the invariants
#
# Other settings: BOTS (12), SPECTATORS (2), SEED (1), SAMPLE (seconds between
# samples, 60), KEEP=1 to leave the containers running afterwards, SOAK_NAME
# (dominus-soak) to name the containers and network differently, OUT for
# another results folder, and
# MONGO_IMAGE, REDIS_IMAGE, NODE_IMAGE to use other images.
#
# Needs docker, and meteor when it builds the image. Results go to
# .test-results/soak: report.md, summary.json, the containers' logs, bots.json
# and docker-stats.csv. It exits 1 when the soak fails.
set -e
cd "$(dirname "$0")/../.."
APP=$(pwd)
OUT=${OUT:-$APP/.test-results/soak}
if [ -n "$DUMP" ]; then
    MODE=replay
    HOURS=${HOURS:-1}
    BOTS=0
    SPECTATORS=0
else
    MODE=soak
    HOURS=${HOURS:-12}
fi
MINUTES=${MINUTES:-$((HOURS * 60))}
BOTS=${BOTS:-12}
SPECTATORS=${SPECTATORS:-2}
SEED=${SEED:-1}
SAMPLE=${SAMPLE:-60}
MONGO_IMAGE=${MONGO_IMAGE:-mongo:8.0}
REDIS_IMAGE=${REDIS_IMAGE:-redis:6}
NODE_IMAGE=${NODE_IMAGE:-node:22-alpine}
P=${SOAK_NAME:-dominus-soak}
CONTAINERS="$P-web $P-worker $P-mongo $P-redis $P-mail $P-bots $P-watch"

log() { echo "$(date -u +%H:%M:%S) $*"; }
image_present() { docker image inspect "$1" >/dev/null 2>&1 || docker pull "$1" >/dev/null; }

mkdir -p "$OUT"
rm -rf "$OUT"/mail
rm -f "$OUT"/*.log "$OUT"/bots.json "$OUT"/docker-stats.csv "$OUT"/report.md "$OUT"/summary.json "$OUT"/soak.env

# --- the image ---
if [ -z "$IMAGE" ]; then
    COMMIT=$(git rev-parse --short HEAD)
    IMAGE=dominus-soak:$COMMIT
    [ -n "$(git status --porcelain --untracked-files=no)" ] && IMAGE=$IMAGE-dirty
    SUPERUSER=
    [ "$(id -u)" = 0 ] && SUPERUSER=--allow-superuser
    log "Building $IMAGE (meteor build, then docker build, as deploy.sh does)..."
    rm -rf .build
    meteor build .build --architecture os.linux.x86_64 $SUPERUSER > "$OUT/build.log" 2>&1 ||
        { echo "FAIL: meteor build, see $OUT/build.log" >&2; exit 1; }
    docker build -t "$IMAGE" --platform linux/x86_64 . >> "$OUT/build.log" 2>&1 ||
        { echo "FAIL: docker build, see $OUT/build.log" >&2; exit 1; }
fi
for i in "$MONGO_IMAGE" "$REDIS_IMAGE" "$NODE_IMAGE"; do image_present "$i"; done
echo "$IMAGE" > "$OUT/image.txt"

# --- a fresh network and containers ---
docker rm -f $CONTAINERS >/dev/null 2>&1 || true
docker network rm $P >/dev/null 2>&1 || true
# --internal: the containers can reach each other and nothing else
docker network create --internal $P >/dev/null

save_logs() {
    for c in web worker mongo mail bots; do
        docker logs $P-$c > "$OUT/$c.log" 2>&1 || true
    done
    for c in web worker; do
        echo "$c $(docker inspect -f '{{.RestartCount}}' $P-$c 2>/dev/null || echo missing)"
    done > "$OUT/restarts.txt"
}
cleanup() {
    save_logs
    if [ -z "$KEEP" ]; then
        docker rm -f $CONTAINERS >/dev/null 2>&1 || true
        docker network rm $P >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

log "Starting MongoDB ($MONGO_IMAGE, replica set rs0) and Redis ($REDIS_IMAGE)..."
docker run -d --name $P-mongo --network $P --network-alias mongo "$MONGO_IMAGE" --replSet rs0 --bind_ip_all >/dev/null
docker run -d --name $P-redis --network $P --network-alias redis "$REDIS_IMAGE" redis-server --save '' --appendonly no >/dev/null
# a production build can't send mail without MAIL_URL, so a mail server that
# keeps every email in $OUT/mail and delivers none
docker run -d --name $P-mail --network $P --network-alias mail -v "$APP/tests/soak:/soak:ro" -v "$OUT:/out" \
    "$NODE_IMAGE" node /soak/mail.js >/dev/null
mongosh() { docker exec $P-mongo mongosh --quiet "$@"; }
tries=0
until mongosh --eval 'db.adminCommand({ping: 1}).ok' >/dev/null 2>&1; do
    tries=$((tries + 1)); [ $tries -lt 60 ] || { echo "FAIL: MongoDB did not start" >&2; exit 1; }
    sleep 1
done
mongosh --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "mongo:27017"}]})' >/dev/null
until [ "$(mongosh --eval 'db.hello().isWritablePrimary' 2>/dev/null)" = true ]; do sleep 1; done

if [ "$MODE" = replay ]; then
    log "Restoring $DUMP into the soak database..."
    docker cp "$DUMP" $P-mongo:/dump
    # a dump of one database (mongodump --db X) restores into dominus
    docker exec $P-mongo sh -c 'cd /dump && set -- */ && [ $# = 1 ] && [ -d "$1" ] && mongorestore --quiet --nsFrom "${1%/}.*" --nsTo "dominus.*" /dump' ||
        { echo "FAIL: mongorestore; DUMP should be a mongodump folder holding one database" >&2; exit 1; }
fi

# The game's own settings.json, with the development cheats off as in
# production. Its keys are placeholders, and nothing could reach the services
# they are for anyway.
SETTINGS=$(docker run --rm -v "$APP/settings.json:/settings.json:ro" "$NODE_IMAGE" \
    node -e 's = require("/settings.json"); s.public.dominusIsDev = false; process.stdout.write(JSON.stringify(s))')
cat > "$OUT/soak.env" <<EOF
MONGO_URL=mongodb://mongo:27017/dominus?replicaSet=rs0
MONGO_OPLOG_URL=mongodb://mongo:27017/local?replicaSet=rs0
ROOT_URL=http://localhost:${WATCH_PORT:-3100}
DOMINUS_REDIS_HOST=redis
DOMINUS_REDIS_PORT=6379
DOMINUS_ADMIN_EMAIL=soak_admin@example.com
DOMINUS_TEST=false
MAIL_URL=smtp://mail:25
S3ACCESSKEYID=soak
S3SECRETACCESSKEY=soak
DOMINUS_SOAK_MONITOR=$SAMPLE
METEOR_SETTINGS=$SETTINGS
EOF

log "Starting the web and worker containers from $IMAGE..."
docker run -d --name $P-web --network $P --network-alias web --restart unless-stopped \
    --env-file "$OUT/soak.env" -e PORT=80 "$IMAGE" >/dev/null
docker run -d --name $P-worker --network $P --network-alias worker --restart unless-stopped \
    --env-file "$OUT/soak.env" -e PORT=81 -e DOMINUS_WORKER=true "$IMAGE" >/dev/null

if [ -n "$WATCH_PORT" ]; then
    # a plain TCP relay on the default network, so only it can be reached from outside
    docker run -d --name $P-watch -p 127.0.0.1:$WATCH_PORT:3100 "$NODE_IMAGE" node -e '
        net = require("net");
        net.createServer((c) => { const s = net.connect(80, "web"); c.pipe(s).pipe(c); s.on("error", () => c.destroy()); c.on("error", () => s.destroy()); }).listen(3100);' >/dev/null
    docker network connect $P $P-watch
    log "Watch the game at http://localhost:$WATCH_PORT (sign in as soak_admin or soak_bot01, password soak-password-1)"
fi

node_run() { docker run --rm --network $P -v "$APP/tests/soak:/soak:ro" -v "$OUT:/out" "$@"; }
tries=0
until node_run "$NODE_IMAGE" node -e 'fetch("http://web/").then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))' 2>/dev/null; do
    tries=$((tries + 1)); [ $tries -lt 100 ] || { echo "FAIL: the web container did not come up, see $OUT/web.log" >&2; exit 1; }
    sleep 3
done
until docker logs $P-worker 2>&1 | grep -q "dominus worker started"; do sleep 2; done
log "The app is up."

if [ "$MODE" = soak ]; then
    log "Making the bots' accounts..."
    node_run -e BOTS=$BOTS "$NODE_IMAGE" node /soak/bots/soak.js accounts > "$OUT/accounts.log" 2>&1 ||
        { echo "FAIL: could not make the accounts, see $OUT/accounts.log" >&2; exit 1; }
    # the bots verified their emails from the links in $OUT/mail; making the
    # admin an admin has no method, as on the real site
    mongosh dominus --eval 'db.users.updateOne({username: "soak_admin"}, {$set: {admin: true}})' >/dev/null
    log "Playing for $MINUTES minutes with $BOTS bots and $SPECTATORS spectators..."
    docker run -d --name $P-bots --network $P -v "$APP/tests/soak:/soak:ro" -v "$OUT:/out" \
        -e BOTS=$BOTS -e SPECTATORS=$SPECTATORS -e MINUTES=$MINUTES -e SEED=$SEED "$NODE_IMAGE" node /soak/bots/soak.js play >/dev/null
    running() { [ "$(docker inspect -f '{{.State.Running}}' $P-bots 2>/dev/null)" = true ]; }
else
    log "Replaying for $MINUTES minutes..."
    END=$(( $(date +%s) + MINUTES * 60 ))
    running() { [ "$(date +%s)" -lt "$END" ]; }
fi

# memory and CPU of every container, from docker's side
echo "time,container,memory,cpu" > "$OUT/docker-stats.csv"
while running; do
    docker stats --no-stream --format '{{.Name}},{{.MemUsage}},{{.CPUPerc}}' $P-web $P-worker $P-mongo $P-redis 2>/dev/null |
        sed "s/^/$(date -u +%Y-%m-%dT%H:%M:%SZ),/" >> "$OUT/docker-stats.csv" || true
    sleep "$SAMPLE"
done

log "Done. Collecting the logs and writing the report..."
save_logs
BASE=
if [ -n "$BASELINE" ]; then
    cp "$BASELINE" "$OUT/baseline.json"
    BASE=/out/baseline.json
fi
STATUS=0
node_run -e MODE=$MODE -e MEMORY_MIN_MINUTES "$NODE_IMAGE" node /soak/report.js /out $BASE || STATUS=$?
log "Report: $OUT/report.md"
exit $STATUS
