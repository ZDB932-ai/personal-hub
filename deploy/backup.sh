#!/bin/bash
set -euo pipefail
umask 077
exec 9>/opt/personal-hub/backups/.lock
flock -n 9 || exit 0
stamp=$(date -u +%Y%m%dT%H%M%SZ)
stage=/opt/personal-hub/backups/.stage-$stamp
test ! -e "$stage"
mkdir "$stage"
trap 'systemctl start personal-hub.service' EXIT
systemctl stop personal-hub.service
cp -a /opt/personal-hub/data "$stage/data"
systemctl start personal-hub.service
trap - EXIT
archive=/opt/personal-hub/backups/phub-$stamp.tar.gz
tar -czf "$archive.partial" -C "$stage" data
tar -tzf "$archive.partial" >/dev/null
mv "$archive.partial" "$archive"
case "$stage" in /opt/personal-hub/backups/.stage-*) rm -rf -- "$stage" ;; *) exit 1 ;; esac
mapfile -t old < <(find /opt/personal-hub/backups -maxdepth 1 -type f -name 'phub-????????T??????Z.tar.gz' -printf '%f\n' | sort -r | tail -n +8)
for name in "${old[@]}"; do
    [[ "$name" =~ ^phub-[0-9]{8}T[0-9]{6}Z\.tar\.gz$ ]] || exit 1
    rm -- "/opt/personal-hub/backups/$name"
done
echo "Backup verified: $archive"
