#!/bin/sh
# Registry-free deploy — ONE script for Mac/Linux/Windows (deploy.bat is a thin
# wrapper around this; the old deploy.ps1 is folded in here). The image tag
# still says registry.gitlab.com but nothing contacts GitLab — the image is
# streamed to the server over SSH instead of pushed to a registry.
set -e

SERVER=dan@104.236.39.83
IMAGE=registry.gitlab.com/danphi/dominus:latest

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

# The whole remote side runs in ONE SSH session: the server rate-limits SSH
# connections, and several in quick succession trip the block mid-deploy.
#
# No docker compose pull — there is no upstream registry anymore.
#
# --force-recreate is required. Plain up -d does NOT reliably recreate: the
# build produces a multi-arch manifest list and the compose up-to-date check
# does not resolve through it, so it prints "Container server-dominus-web-1
# Running" and keeps the old container even though docker load just replaced
# the image. That is how this deploy silently no-opped for four months.
echo "Streaming image to $SERVER and deploying (single SSH session)..."
docker save $IMAGE | ssh -C $SERVER "
    set -e
    docker load
    cd ~/server
    docker compose up -d --force-recreate dominus-web dominus-worker
    EXPECTED=\$(docker image inspect -f '{{.Id}}' $IMAGE)
    for c in server-dominus-web-1 server-dominus-worker-1; do
        LIVE=\$(docker inspect -f '{{.Image}}' \$c)
        echo \"  \$c: \$LIVE\"
        if [ \"\$EXPECTED\" != \"\$LIVE\" ]; then
            echo \"FAIL: \$c is NOT running the image just deployed\" >&2
            exit 1
        fi
    done
    # Prune only after the image-ID check, so a failed deploy leaves the old
    # image recoverable. Clears dangling images for every project on the host.
    docker image prune -f
"

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
