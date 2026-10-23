#!/bin/sh
# End-to-end test of deploy.sh against the throwaway server from setup.sh.
# Deploys commits of a scratch git repo (fake meteor, Dockerfile.test) and
# checks what is live, which images are kept, and that rollback works.
# Usage: ./setup.sh && ./run.sh   (logs go to $LOGS, default /tmp/deploy-test)
# The "legacy" step deploys with deploy.sh as of LEGACY_REF (before rollback
# support) to check the first new deploy keeps the image that was live.
HERE=$(cd "$(dirname "$0")" && pwd)
DEPLOY_SH=$HERE/../../deploy.sh
S=${LOGS:-/tmp/deploy-test}
rm -rf $S; mkdir -p $S/bin $S/repo
cp $HERE/fake-meteor $S/bin/meteor
cd $S/repo
git init -q; git config user.email test@example.com; git config user.name test
cp $HERE/Dockerfile.test Dockerfile
printf '.build\n' > .gitignore
export PATH=$S/bin:$PATH DEPLOY_SERVER=testserver DEPLOY_SITE=http://localhost:8080
R=registry.gitlab.com/danphi/dominus
SD="docker -H unix:///var/run/docker-testserver.sock"   # the fake server's own daemon
FAILS=0
ok()   { echo "PASS: $*"; }
bad()  { echo "FAIL: $*"; FAILS=$((FAILS+1)); }
live() { curl -s localhost:8080/ | grep -oE '%22gitCommitHash%22%3A%22[a-f0-9]+' | sed 's/.*%22//'; }
tags() { $SD images $R --format '{{.Tag}}' | grep -v -e latest -e '<none>' | sort | tr '\n' ' '; }
expect_tags() { want=$(for t in "$@"; do echo $t; done | sort | tr '\n' ' '); [ "$(tags)" = "$want" ] && ok "kept images = $*" || bad "kept images: got [$(tags)] want [$want]"; }
worker() { $SD inspect -f '{{.Image}}' server-dominus-worker-1; }
img()  { $SD image inspect -f '{{.Id}}' $R:$1; }
step() { echo; echo "=== $*"; }
commit() { echo "$1" > version.txt; git add -A; git commit -q --allow-empty -m "$1" >/dev/null; git rev-parse HEAD; }

step "reset the fake server and deploy L with the OLD deploy.sh (legacy state)"
(cd /root/server && $SD compose down >/dev/null 2>&1)
$SD images $R -q | sort -u | xargs -r $SD rmi -f >/dev/null 2>&1
rm -f /root/server/.dominus-deploys
git -C $HERE show ${LEGACY_REF:-f129eb2}:deploy.sh | sed -e 's#dan@104.236.39.83#testserver#' -e 's#https://dominusgame.net/#http://localhost:8080/#g' > $S/old-deploy.sh
L=$(commit L)
sh $S/old-deploy.sh > $S/L.log 2>&1 && ok "legacy deploy of L" || { bad "legacy deploy failed"; tail -20 $S/L.log; exit 1; }
[ "$(live)" = "$L" ] && ok "live = L" || bad "live = $(live)"
expect_tags
cp $DEPLOY_SH deploy.sh

step "deploy A over a legacy (untagged) server"
A=$(commit A)
./deploy.sh > $S/A.log 2>&1 && ok "deploy A exits 0" || { bad "deploy A failed"; tail -20 $S/A.log; }
[ "$(live)" = "$A" ] && ok "live = A" || bad "live = $(live)"
grep -q "tagged the running image as $L" $S/A.log && ok "legacy image tagged as $L" || bad "legacy not tagged"
expect_tags $L $A
[ "$(worker)" = "$(img $A)" ] && ok "worker runs A" || bad "worker not A"

step "deploy B"
B=$(commit B)
./deploy.sh > $S/B.log 2>&1 && ok "deploy B exits 0" || { bad "deploy B failed"; tail -20 $S/B.log; }
[ "$(live)" = "$B" ] && ok "live = B" || bad "live = $(live)"
expect_tags $A $B

step "rollback (no argument) goes to A"
T0=$(date +%s)
./deploy.sh --rollback > $S/RB1.log 2>&1 && ok "rollback exits 0 in $(( $(date +%s) - T0 ))s" || { bad "rollback failed"; tail -20 $S/RB1.log; }
[ "$(live)" = "$A" ] && ok "live = A" || bad "live = $(live)"
grep -q "OK: http://localhost:8080 is up and running commit $A" $S/RB1.log && ok "script's live commit check reported A" || bad "no OK line for A"
[ "$(worker)" = "$(img $A)" ] && ok "worker runs A" || bad "worker not A"
expect_tags $A $B

step "rollback again (no argument) goes forward to B"
./deploy.sh --rollback > $S/RB2.log 2>&1 && ok "exits 0" || { bad "failed"; tail -20 $S/RB2.log; }
[ "$(live)" = "$B" ] && ok "live = B" || bad "live = $(live)"

step "rollback to A by short sha"
./deploy.sh --rollback $(echo $A | cut -c1-7) > $S/RB3.log 2>&1 && ok "exits 0" || { bad "failed"; tail -20 $S/RB3.log; }
[ "$(live)" = "$A" ] && ok "live = A" || bad "live = $(live)"

step "deploy C while A is live keeps C and A (the one live before), drops B"
C=$(commit C)
./deploy.sh > $S/C.log 2>&1 && ok "deploy C exits 0" || { bad "deploy C failed"; tail -20 $S/C.log; }
[ "$(live)" = "$C" ] && ok "live = C" || bad "live = $(live)"
expect_tags $A $C

step "rollback to pruned B fails cleanly and leaves C live"
./deploy.sh --rollback $B > $S/RB4.log 2>&1 && bad "rollback to B should fail" || ok "rollback to B refused"
grep -q "no kept image for $B" $S/RB4.log && ok "says no kept image" || { bad "wrong message"; cat $S/RB4.log; }
[ "$(live)" = "$C" ] && ok "live still C" || bad "live = $(live)"

step "rollback to a non-commit fails before touching the server"
./deploy.sh --rollback nosuchcommit > $S/RB5.log 2>&1 && bad "should fail" || ok "refused"
grep -q "not a commit" $S/RB5.log && ok "says not a commit" || cat $S/RB5.log

step "redeploy C (same commit) keeps A"
./deploy.sh > $S/C2.log 2>&1 && ok "exits 0" || { bad "failed"; tail -20 $S/C2.log; }
[ "$(live)" = "$C" ] && ok "live = C" || bad "live = $(live)"
expect_tags $A $C
[ "$($SD images $R --format '{{.Tag}}' | grep -c '<none>')" = 0 ] && ok "no dangling images left" || bad "dangling images remain"

step "--list"
./deploy.sh --list > $S/list.log 2>&1 && ok "exits 0" || bad "list failed"
cat $S/list.log
grep -q "\* $C" $S/list.log && ok "list marks C live" || bad "list does not mark C"

step "KEEP_IMAGES=3"
D=$(commit D)
KEEP_IMAGES=3 ./deploy.sh > $S/D.log 2>&1 && ok "exits 0" || { bad "failed"; tail -20 $S/D.log; }
expect_tags $A $C $D

step "a broken build fails the deploy, and --rollback restores D"
E=$(commit E)
BROKEN=1 ./deploy.sh > $S/E.log 2>&1 && bad "broken deploy reported success" || ok "broken deploy fails"
grep -q "not responding after 3 minutes" $S/E.log && ok "fails on the health check" || { bad "unexpected failure"; tail -5 $S/E.log; }
T0=$(date +%s)
./deploy.sh --rollback > $S/RB6.log 2>&1 && ok "rollback exits 0 in $(( $(date +%s) - T0 ))s" || { bad "rollback failed"; tail -20 $S/RB6.log; }
[ "$(live)" = "$D" ] && ok "live = D" || bad "live = $(live)"
[ "$(worker)" = "$(img $D)" ] && ok "worker runs D" || bad "worker not D"

step "bad flag"
./deploy.sh --bogus > /dev/null 2>&1 && bad "bad flag accepted" || ok "bad flag refused"

echo; echo "history file:"; cat /root/server/.dominus-deploys
echo; echo "$FAILS failure(s)"
exit $FAILS
