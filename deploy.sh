#!/bin/sh
# Registry-free deploy — ONE script for Mac/Linux/Windows (deploy.bat is a thin
# wrapper around this; the old deploy.ps1 is folded in here). The image tag
# still says registry.gitlab.com but nothing contacts GitLab — the image is
# streamed to the server over SSH instead of pushed to a registry.
#
#   ./deploy.sh                      build HEAD and deploy it
#   ./deploy.sh --rollback           go back to the previously deployed image
#   ./deploy.sh --rollback <commit>  go back to a kept image (short sha is fine)
#   ./deploy.sh --list               show kept images and recent deploys
#
# Every deployed image is also tagged with its git commit on the server, and
# the images of the last KEEP_IMAGES distinct deploys (default 2: live and the
# one before it) are kept, so a rollback is a re-tag and a container restart,
# not a 10-minute rebuild. The deploy history lives in ~/server/.dominus-deploys.
#
# DEPLOY_SERVER and DEPLOY_SITE override the target, for testing the script
# against a throwaway server.
set -e

SERVER=${DEPLOY_SERVER:-dan@104.236.39.83}
SITE=${DEPLOY_SITE:-https://dominusgame.net}
REPO=registry.gitlab.com/danphi/dominus
IMAGE=$REPO:latest
KEEP_IMAGES=${KEEP_IMAGES:-2}

MODE=deploy
COMMIT=
case "$1" in
    "") ;;
    --rollback)
        MODE=rollback
        if [ -n "$2" ]; then
            COMMIT=$(git rev-parse --verify --quiet "$2^{commit}") || {
                echo "FAIL: $2 is not a commit in this checkout" >&2
                exit 1
            }
        fi
        ;;
    --list) MODE=list ;;
    *)
        echo "usage: $0 [--rollback [commit] | --list]" >&2
        exit 1
        ;;
esac

# Prints the commit baked into the bundle the site is serving, or nothing.
live_commit() {
    curl -s "$SITE/" | grep -oE '%22gitCommitHash%22%3A%22[a-f0-9]+%22' | sed 's/.*%22\([a-f0-9]*\)%22$/\1/'
}

# Runs on the server, in ONE SSH session per invocation: the server
# rate-limits SSH connections, and several in quick succession trip the block
# mid-deploy. The caller prepends MODE, REPO, COMMIT, PREV and KEEP.
REMOTE='
set -e
cd ~/server
HIST=~/server/.dominus-deploys
CONTAINERS="server-dominus-web-1 server-dominus-worker-1"

has_image() { docker image inspect "$REPO:$1" >/dev/null 2>&1; }

# Appends a commit to the deploy history unless it is already the last entry.
record() {
    [ "$(tail -n 1 "$HIST" 2>/dev/null | cut -d " " -f 1)" = "$1" ] ||
        echo "$1 $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$HIST"
}

# Distinct commits from the deploy history, most recent first.
recent() {
    [ -f "$HIST" ] || return 0
    awk "{ c[NR] = \$1 } END { for (i = NR; i > 0; i--) if (!seen[c[i]]++) print c[i] }" "$HIST"
}

# --force-recreate is required. Plain up -d does NOT reliably recreate: the
# build produces a multi-arch manifest list and the compose up-to-date check
# does not resolve through it, so it prints "Container server-dominus-web-1
# Running" and keeps the old container even though the image was just
# replaced. That is how this deploy silently no-opped for four months.
restart_and_verify() {
    docker compose up -d --force-recreate dominus-web dominus-worker
    EXPECTED=$(docker image inspect -f "{{.Id}}" "$REPO:$1")
    for c in $CONTAINERS; do
        LIVE=$(docker inspect -f "{{.Image}}" $c)
        echo "  $c: $LIVE"
        if [ "$EXPECTED" != "$LIVE" ]; then
            echo "FAIL: $c is NOT running the image for $1" >&2
            exit 1
        fi
    done
}

# Drops commit-tagged images that are not among the last KEEP deploys, then
# dangling images. Only runs after the image-ID check, so a failed deploy
# leaves the old image recoverable. docker image prune clears dangling images
# for every project on the host.
prune() {
    KEPT=$(recent | head -n "$KEEP")
    for t in $(docker images "$REPO" --format "{{.Tag}}"); do
        case "$t" in latest|"<none>") continue ;; esac
        echo "$KEPT" | grep -qx "$t" && continue
        if docker rmi "$REPO:$t" >/dev/null 2>&1; then
            echo "  removed old image $t"
        else
            echo "  could not remove old image $t (still in use?)"
        fi
    done
    docker image prune -f
    echo "  kept images: $(echo $KEPT)"
}

case "$MODE" in
deploy)
    # Before docker load replaces :latest, give the running image a commit
    # tag so it survives the prune. Deploys made before rollback support
    # existed only have :latest, so this is what makes the first one
    # rollback-able.
    if [ -n "$PREV" ] && ! has_image "$PREV"; then
        RUNNING=$(docker inspect -f "{{.Image}}" server-dominus-web-1 2>/dev/null || true)
        if [ -n "$RUNNING" ]; then
            docker tag "$RUNNING" "$REPO:$PREV"
            echo "  tagged the running image as $PREV"
        fi
    fi
    if [ -n "$PREV" ] && has_image "$PREV"; then record "$PREV"; fi

    docker load
    docker tag "$REPO:latest" "$REPO:$COMMIT"
    restart_and_verify "$COMMIT"
    record "$COMMIT"
    prune
    ;;
rollback)
    if [ -z "$COMMIT" ]; then
        LIVE_ID=$(docker inspect -f "{{.Image}}" server-dominus-web-1)
        for c in $(recent); do
            if has_image "$c" && [ "$(docker image inspect -f "{{.Id}}" "$REPO:$c")" != "$LIVE_ID" ]; then
                COMMIT=$c
                break
            fi
        done
        if [ -z "$COMMIT" ]; then
            echo "FAIL: no kept image other than the live one" >&2
            exit 1
        fi
    fi
    if ! has_image "$COMMIT"; then
        echo "FAIL: no kept image for $COMMIT. Kept images:" >&2
        docker images "$REPO" >&2
        exit 1
    fi
    echo "ROLLBACK_TO=$COMMIT"
    docker tag "$REPO:$COMMIT" "$REPO:latest"
    restart_and_verify "$COMMIT"
    record "$COMMIT"
    prune
    ;;
list)
    LIVE_ID=$(docker inspect -f "{{.Image}}" server-dominus-web-1 2>/dev/null || true)
    echo "Kept images (* = live):"
    for t in $(docker images "$REPO" --format "{{.Tag}}"); do
        case "$t" in latest|"<none>") continue ;; esac
        ID=$(docker image inspect -f "{{.Id}}" "$REPO:$t")
        MARK=" "
        [ "$ID" = "$LIVE_ID" ] && MARK="*"
        echo "  $MARK $t  built $(docker image inspect -f "{{.Created}}" "$REPO:$t")"
    done
    echo "Recent deploys (oldest first):"
    tail -n 10 "$HIST" 2>/dev/null | sed "s/^/  /" || true
    ;;
esac
'

remote() {
    ssh -C $SERVER "MODE=$MODE REPO=$REPO COMMIT=$COMMIT PREV=$PREV KEEP=$KEEP_IMAGES; $REMOTE"
}

# Waits for the site to boot, then checks it serves the expected commit.
# "Site responds" is NOT proof the deploy landed — the OLD container answers
# 200 just as happily. This is the check that would have caught the
# four-month-stale deploy on day one.
check_live() {
    # traefik returns 502 until Mongo Atlas connects.
    echo "Waiting for app to come up..."
    tries=0
    until sleep 10 && curl -sf -o /dev/null "$SITE/"; do
        tries=$((tries+1))
        if [ "$tries" -ge 18 ]; then
            echo "FAIL: $SITE not responding after 3 minutes"
            exit 1
        fi
        echo "  not up yet, retrying..."
    done
    LIVE=$(live_commit)
    echo "  expected commit: $1"
    echo "  live commit:     $LIVE"
    if [ "$1" != "$LIVE" ]; then
        echo "FAIL: $SITE is NOT running commit $1"
        exit 1
    fi
    echo "OK: $SITE is up and running commit $1"
}

if [ "$MODE" = list ]; then
    remote
    exit 0
fi

if [ "$MODE" = rollback ]; then
    echo "Rolling back on $SERVER (single SSH session)..."
    OUT=$(mktemp)
    STATUS=$(mktemp)
    { remote; echo $? > "$STATUS"; } | tee "$OUT"
    if [ "$(cat "$STATUS")" != 0 ]; then
        rm -f "$OUT" "$STATUS"
        exit 1
    fi
    COMMIT=$(sed -n 's/^ROLLBACK_TO=//p' "$OUT")
    rm -f "$OUT" "$STATUS"
    check_live "$COMMIT"
    exit 0
fi

COMMIT=$(git rev-parse HEAD)
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "WARNING: uncommitted changes will be deployed and kept as image $COMMIT"
fi
# The commit the site serves now, so its image can be kept for rollback.
PREV=$(live_commit || true)

rm -rf .build
# meteor is a .bat on Windows, which Git Bash cannot exec directly — go through
# cmd. --allow-superuser matches the old deploy.ps1 (meteor refuses admin
# shells otherwise). Known Windows quirk: meteor-tool can keep spinning after
# writing a complete .build/dominus.tar.gz — if the build seems stuck long
# after the tarball stops changing, verify it with tar -tzf and kill meteor.
case "$(uname -s)" in
    MINGW*|MSYS*) cmd //c "meteor build .build --architecture os.linux.x86_64 --allow-superuser" ;;
    *) meteor build .build --architecture os.linux.x86_64 ;;
esac

docker build -t $IMAGE --platform linux/x86_64 .

# No docker compose pull — there is no upstream registry anymore.
echo "Streaming image to $SERVER and deploying (single SSH session)..."
docker save $IMAGE | remote

check_live "$COMMIT"
