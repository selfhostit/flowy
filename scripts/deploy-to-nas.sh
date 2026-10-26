#!/bin/sh
# Builds Flowy on this computer and replaces the running app on a Synology NAS
# (or any machine with Docker), over SSH. The data in pb_data is kept and
# migrations run on start.
#
#   scripts/deploy-to-nas.sh you@nas-address
#
# Uses /volume1/docker/flowy on the NAS; set FLOWY_DIR for another folder. A
# first deploy makes a .env with this computer's time zone, your NAS user and
# port 8091 (set PORT to change it). Asks for the NAS password for ssh and sudo.
set -eu
target=${1:?usage: $0 you@nas-address}
dir=${FLOWY_DIR:-/volume1/docker/flowy}
image=ghcr.io/selfhostit/flowy:latest

tz=${TZ:-$(cat /etc/timezone 2>/dev/null || readlink /etc/localtime | sed 's|.*zoneinfo/||')}

cd "$(dirname "$0")/.."
# Synology models run x86-64 or 64-bit ARM; build for the NAS, not this computer
platform=linux/$(ssh "$target" uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/')
docker build --platform "$platform" --build-arg VERSION="$(git describe --tags --always --dirty)" -t "$image" .

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
docker save "$image" | gzip >"$tmp/flowy-image.tar.gz"
cp deploy/docker-compose.yml deploy/docker-compose.tailscale.yml deploy/tailscale-serve.json deploy/.env.example "$tmp/"

echo "Copying to $target:$dir"
tar -C "$tmp" -cf - . | ssh "$target" "mkdir -p $dir/pb_data && tar -C $dir -xf -"

# sudo on DSM doesn't search /usr/local/bin, so docker is called by its full path
ssh -t "$target" "cd $dir && if [ ! -f .env ]; then
    sed -e 's|^TZ=.*|TZ=${tz:-UTC}|' -e \"s|^PUID=.*|PUID=\$(id -u)|\" -e \"s|^PGID=.*|PGID=\$(id -g)|\" \
      -e 's|^PORT=.*|PORT=${PORT:-8091}|' .env.example > .env; fi \
  && D=\$(command -v docker || echo /usr/local/bin/docker) \
  && sudo \$D load -i flowy-image.tar.gz && rm flowy-image.tar.gz \
  && sudo \$D compose up -d --force-recreate \
  && sleep 5 && wget -qO- http://127.0.0.1:\$(sed -n 's/^PORT=//p' .env)/api/health && echo"
