#!/bin/bash
set -euo pipefail
version=${1:?Supply a release version}
expected=${2:?Supply archive SHA256}
build=${3:-$(date +%Y%m%d)}
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "$expected" =~ ^[0-9a-f]{64}$ ]]
[[ "$build" =~ ^[0-9]{8}(-[a-z0-9]+)?$ ]]
base=/opt/personal-hub
archive="$base/downloads/personal-hub-$version.tar.gz"
release="$base/releases/$version-$build"
previous=$(readlink -f "$base/current")
[[ "$previous" == "$base/releases/"* ]]
test -d "$previous"
test ! -e "$release"
printf '%s  %s\n' "$expected" "$archive" | sha256sum -c -
mkdir "$release"
tar -xzf "$archive" -C "$release" --no-same-owner
test -f "$release/dist/index.html"
test -f "$release/server/start.ts"
chmod -R a+rX "$release"
chmod 755 "$release/deploy/backup.sh"
"$base/runtime/node/bin/node" --check "$release/server/start.ts"
"$previous/deploy/backup.sh"
rollback() {
    ln -sfn "$previous" "$base/current.rollback"
    mv -Tf "$base/current.rollback" "$base/current"
    systemctl restart personal-hub.service
}
trap rollback ERR
ln -sfn "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
systemctl restart personal-hub.service
ready=false
for attempt in $(seq 1 20); do
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8787/v1/connect || true)
    if [[ "$code" == 401 ]]; then ready=true; break; fi
    sleep 1
done
test "$ready" = true
systemctl is-active personal-hub.service caddy.service
trap - ERR
printf 'Active release: %s\nPrevious release: %s\n' "$release" "$previous"
