#!/bin/bash
set -euo pipefail
release=/opt/personal-hub/releases/1.1.4-20261022
test ! -e "$release"
mkdir "$release"
tar -xzf /opt/personal-hub/downloads/personal-hub-1.1.4.tar.gz -C "$release" --no-same-owner
chmod -R a+rX "$release"
chmod 755 "$release/deploy/backup.sh"
ln -sfn "$release" /opt/personal-hub/current
install -m 644 "$release/deploy/personal-hub.service" /etc/systemd/system/personal-hub.service
install -m 644 "$release/deploy/personal-hub-backup.service" /etc/systemd/system/personal-hub-backup.service
install -m 644 "$release/deploy/personal-hub-backup.timer" /etc/systemd/system/personal-hub-backup.timer
cp -an /etc/caddy/Caddyfile /opt/personal-hub/downloads/Caddyfile.initial
install -m 644 "$release/deploy/Caddyfile" /etc/caddy/Caddyfile
install -d /etc/systemd/system/caddy.service.d
printf '[Service]\nMemoryHigh=192M\nMemoryMax=256M\n' > /etc/systemd/system/caddy.service.d/personal-hub.conf
caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemd-analyze verify /etc/systemd/system/personal-hub.service /etc/systemd/system/personal-hub-backup.service /etc/systemd/system/personal-hub-backup.timer
systemctl daemon-reload
systemctl enable --now personal-hub.service
systemctl restart caddy.service
systemctl enable --now personal-hub-backup.timer
systemctl is-active personal-hub.service caddy.service
