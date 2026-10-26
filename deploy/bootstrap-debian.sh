#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
install -d -m 755 /opt/personal-hub /opt/personal-hub/downloads /opt/personal-hub/runtime /opt/personal-hub/releases
apt-get update -qq
apt-get install -y --no-install-recommends ca-certificates curl gnupg xz-utils debian-keyring debian-archive-keyring apt-transport-https
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o /opt/personal-hub/downloads/caddy.gpg.asc
gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg /opt/personal-hub/downloads/caddy.gpg.asc
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
chmod 644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y --no-install-recommends caddy
cd /opt/personal-hub/downloads
curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o SHASUMS256.txt
archive=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64.tar.xz$/ {print $2}' SHASUMS256.txt)
test -n "$archive"
curl -fsSL "https://nodejs.org/dist/latest-v24.x/$archive" -o "$archive"
grep " $archive$" SHASUMS256.txt | sha256sum -c -
tar -xJf "$archive" -C /opt/personal-hub/runtime
ln -sfn "/opt/personal-hub/runtime/${archive%.tar.xz}" /opt/personal-hub/runtime/node
id personal-hub >/dev/null 2>&1 || useradd --system --home-dir /opt/personal-hub/data --shell /usr/sbin/nologin personal-hub
install -d -m 700 -o personal-hub -g personal-hub /opt/personal-hub/data
install -d -m 700 /opt/personal-hub/backups
/opt/personal-hub/runtime/node/bin/node --version
caddy version
