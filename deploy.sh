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
# `up -d` recreates the containers because the image ID changed.
ssh $SERVER "cd ~/server && docker compose up -d dominus-web dominus-worker && docker image prune -f"

# The app can take a while to boot (Mongo Atlas connection etc.) — traefik
# returns 502 until then, so poll instead of a single check.
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
echo "OK: dominusgame.net is up"
