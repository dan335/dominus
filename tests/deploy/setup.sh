#!/bin/sh
# Builds a throwaway "server" for testing deploy.sh, in a root Linux sandbox
# (the cloud container): a second docker daemon reached over a second sshd on
# port 2222 as host "testserver", with ~/server holding a compose file. The
# client side uses the normal docker daemon, so the two never share images,
# just like Daniel's machine and the real server.
#   CLASSIC=1 ./setup.sh   uses Docker's classic image store on the server
#                          instead of the containerd one.
# Never run this on a real machine you care about: it edits /root/.ssh.
set -e
cd "$(dirname "$0")"
command -v sshd >/dev/null || [ -x /usr/sbin/sshd ] || { apt-get update -qq && apt-get install -y -qq openssh-server; }
docker info >/dev/null 2>&1 || { (dockerd > /tmp/dockerd.log 2>&1 &); sleep 8; }

SOCK=/var/run/docker-testserver.sock
if ! docker -H unix://$SOCK info >/dev/null 2>&1; then
    ROOT=/var/lib/docker-testserver
    CFG=/tmp/docker-testserver.json
    echo '{}' > $CFG
    if [ -n "$CLASSIC" ]; then
        echo '{"features":{"containerd-snapshotter":false}}' > $CFG
        ROOT=$ROOT-classic
    fi
    (dockerd --config-file $CFG --data-root $ROOT --exec-root /var/run/docker-testserver \
        -H unix://$SOCK --pidfile /var/run/docker-testserver.pid --bip 172.31.0.1/24 \
        > /tmp/dockerd-testserver.log 2>&1 &)
    sleep 8
fi
docker -H unix://$SOCK info 2>/dev/null | grep -i "storage driver"

mkdir -p /root/.ssh /run/sshd /root/server
[ -f /root/.ssh/id_ed25519 ] || ssh-keygen -q -t ed25519 -N '' -f /root/.ssh/id_ed25519
grep -qf /root/.ssh/id_ed25519.pub /root/.ssh/authorized_keys 2>/dev/null || cat /root/.ssh/id_ed25519.pub >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
ssh-keygen -A >/dev/null
if ! [ -f /run/sshd-testserver.pid ] || ! kill -0 "$(cat /run/sshd-testserver.pid)" 2>/dev/null; then
    printf 'Port 2222\nPermitRootLogin prohibit-password\nSetEnv DOCKER_HOST=unix://%s\nPidFile /run/sshd-testserver.pid\n' $SOCK > /tmp/sshd-testserver.conf
    /usr/sbin/sshd -f /tmp/sshd-testserver.conf
fi
grep -q "^Host testserver" /root/.ssh/config 2>/dev/null ||
    printf 'Host testserver\n  HostName localhost\n  Port 2222\n  User root\n  StrictHostKeyChecking accept-new\n' >> /root/.ssh/config
cp docker-compose.test.yml /root/server/docker-compose.yml
ssh testserver 'docker version -f "testserver docker {{.Server.Version}}"'
