#!/bin/sh
# Registry-free deploy for Mac/Linux (also works from Git Bash on Windows).
# The image tag still says registry.gitlab.com but nothing contacts GitLab —
# the image is streamed to the server over SSH instead of pushed to a registry.
set -e

SERVER=dan@104.236.39.83
IMAGE=registry.gitlab.com/danphi/dominus:latest

rm -rf .build
meteor build .build --architecture os.linux.x86_64

docker build -t $IMAGE --platform linux/x86_64 .

echo "Streaming image to $SERVER (ssh -C compresses in transit)..."
docker save $IMAGE | ssh -C $SERVER "docker load"

# No `docker compose pull` — there is no upstream registry anymore.
#
# --force-recreate is required. `up -d` alone does NOT reliably recreate: the
# build produces a multi-arch manifest list and compose's up-to-date check does
# not resolve through it, so it prints "Container server-dominus-web-1  Running"
# and keeps the old container even though docker load just replaced the image.
# That is how this deploy silently no-opped for four months.
ssh $SERVER "cd ~/server && docker compose up -d --force-recreate dominus-web dominus-worker"

# Wait for the app to boot — traefik returns 502 until Mongo Atlas connects.
echo "Waiting for app to come up..."
tries=0
until sleep 10 && curl -sf -o /dev/null https://dominusgame.net/; do
    tries=$((tries+1))
    if [ "$tries" -ge 18 ]; then
        echo "FAIL: dominusgame.net not responding after 3 minutes"
        exit 1
    fi
    echo "  not up yet, retrying..."
done

# "Site responds" is NOT proof the deploy landed — the OLD container answers
# 200 just as happily. Compare the commit baked into the served bundle against
# the commit we just built. This is the check that would have caught the
# four-month-stale deploy on day one.
EXPECTED=$(git rev-parse HEAD)
LIVE=$(curl -s https://dominusgame.net/ | grep -oE '%22gitCommitHash%22%3A%22[a-f0-9]+%22' | sed 's/.*%22\([a-f0-9]*\)%22$/\1/')
echo "  expected commit: $EXPECTED"
echo "  live commit:     $LIVE"
if [ "$EXPECTED" != "$LIVE" ]; then
    echo "FAIL: dominusgame.net is NOT running the current commit"
    exit 1
fi
echo "OK: dominusgame.net is up and running the current commit"

# Prune only after a verified deploy, so a failed one leaves the old image
# recoverable. Note this clears dangling images for every project on the host.
ssh $SERVER "docker image prune -f"
