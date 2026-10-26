# Deploy

A flowy app runs as one container on any Linux machine with Docker: a NAS, a
Raspberry Pi, a small server. Workers run next to it or on other machines.
Tailscale gives your devices an `https://` address for it without opening
anything to the internet.

```
 phone / laptop ──Tailscale──▶ tailscale sidecar ──▶ app (PocketBase + web app) ── pb_data/
                                                       ▲
                     worker on the same machine ───────┤  (records through the API)
                     worker on a Pi ──Tailscale────────┘
```

Every push to `main` publishes two images for amd64, arm64 and armv7:
`ghcr.io/selfhostit/flowy` (the app) and `ghcr.io/selfhostit/flowy-worker` (the
Python workers). A tag like `v1.2.0` publishes `:v1.2.0` of both.

## Install

On the machine, as a user that can run `docker`:

```sh
curl -fsSL https://raw.githubusercontent.com/selfhostit/flowy/main/deploy/install.sh | sh
```

This creates `~/flowy` with the compose files, a `.env` and a `pb_data` folder
for the database, asks for a Tailscale auth key (press Enter to skip), and starts
the app. Pass a folder to install elsewhere: `... | sh -s /srv/flowy`.

Then open the app and create your account; the first person becomes the owner.
Without Tailscale it is only reachable on the machine itself, at
http://localhost:8090 (the port is bound to `127.0.0.1` on purpose).

Settings live in `.env`: time zone, port, Tailscale, the worker account and the
image version. Change them and run `docker compose up -d` in the folder (or the
install script again).

## Remote access with Tailscale

1. In the [Tailscale admin console](https://login.tailscale.com/admin/dns), turn on
   **MagicDNS** and **HTTPS Certificates**.
2. Create an [auth key](https://login.tailscale.com/admin/settings/keys) and paste it
   when the install script asks. It is only used for the first sign-in; the
   sidecar keeps its login in `tailscale/`.
3. The app is now at `https://flowy.<your-tailnet>.ts.net` (the script prints it).
   The first visit can take a few seconds while the certificate is issued.

Phones join the tailnet with the Tailscale app; see [Phones](#phones).

To add Tailscale later, set `TS_AUTHKEY` and uncomment the `COMPOSE_FILE` line in
`.env`, then run `docker compose up -d`. `TS_HOSTNAME` sets the name.

## Phones

Flowy installs from the browser; there is no app store app.

1. Install the **Tailscale** app and sign in. With Tailscale switched on, the
   tailnet address works from anywhere with internet, not only at home.
2. Open `https://flowy.<your-tailnet>.ts.net` (or your reverse proxy address) and
   create an account. The first one becomes the owner.
3. Install it: **⋮ > Install app** in Chrome on Android, or **Share > Add to Home
   Screen** in Safari on iPhone. Then turn on reminders in Settings.

What the installed app can do depends on the phone:

| | Android (Chrome) | iPhone (Safari) |
| --- | --- | --- |
| Reminders | yes | yes, once installed to the home screen |
| Cycle day on the icon | no (Android shows a dot for notifications) | yes, with notifications on |
| Long-press shortcuts | yes | no |

### Other people

Each person signs up with their own account and only sees their own calendar.
Over Tailscale they also need to reach the app: share just the app's machine with
them (Tailscale admin console > Machines > ⋯ > Share) rather than inviting them to
the whole tailnet. They install Tailscale, sign in with their own account and
accept the share. A partner share link from Settings is the same address, so it
needs Tailscale too.

### Other VPNs

A phone runs one VPN at a time, and Tailscale is one, so it can't be on together
with another VPN app. While the other VPN is on:

- logging still works: days are saved on the phone and sent once Tailscale is back
  on (the app shows "Can't reach your server" until then);
- reminders still arrive, since they come through the phone's push service, not
  the tailnet.

To use the app without Tailscale on phones, serve it at a public address with a
reverse proxy instead (for a Synology, see [synology.md](synology.md)).

## Updates and versions

```sh
cd ~/flowy && docker compose pull && docker compose up -d
```

Running the install script again does the same and also refreshes the compose
files. To stay on a release, or go back to one, set `FLOWY_IMAGE` (and
`FLOWY_WORKER_IMAGE`) in `.env` to a tag, like `ghcr.io/selfhostit/flowy:v1.2.0`.
Database migrations run on start, so take a backup before going back across one.

## Backups and restore

The app backs up the database and uploads every night at 03:00 and keeps the
last 7, in `pb_data/backups`. A backup on the same disk doesn't survive the disk,
so copy `pb_data` somewhere else too (Hyper Backup on a Synology, `rsync`, or S3
storage set in the admin UI under Settings > Backups).

To restore, open the admin UI (`/_/`), go to Settings > Backups and restore one.
To move to another machine, stop the app, copy the whole folder, and start it
there.

## Workers

### Next to the app

1. In the admin UI, open the **workers** collection and add one with a name and a
   password.
2. In `.env`, set `FLOWY_WORKER` and `FLOWY_WORKER_PASSWORD` and uncomment
   `COMPOSE_PROFILES=worker`.
3. Run `docker compose up -d`.

It runs `workers/worker.py`, the starting point for your own worker. To run another
one, set `FLOWY_WORKER_SCRIPT` in `.env`, for example to `camera.py`. Every `.py`
file in `workers/` and every dependency you add with `uv add` is in the worker image.

### On another machine

Join the machine to your tailnet, then point the worker at the app's tailnet
address:

```sh
docker run -d --name worker --restart unless-stopped \
  -e FLOWY_URL=https://flowy.<your-tailnet>.ts.net \
  -e FLOWY_WORKER=camera -e FLOWY_WORKER_PASSWORD=... -e TZ=Europe/Athens \
  ghcr.io/selfhostit/flowy-worker python camera.py
```

## Synology NAS

See [synology.md](synology.md): install with one SSH command, then serve it at
`https://flowy.<your-name>.synology.me` with Synology's reverse proxy and a Let's
Encrypt certificate.

## Raspberry Pi

Use a Pi 4 or 5 with the 64-bit Raspberry Pi OS (Lite is enough).

```sh
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # then sign out and back in
```

Then run the install script as above to host the app on the Pi, or follow
[On another machine](#on-another-machine) to use the Pi only for workers, with
Tailscale installed on the Pi itself
(`curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`).

Hardware a worker needs, like a Hailo accelerator or a camera, is passed to its
container with `devices:` in compose (or `--device /dev/hailo0` with `docker run`).
Large services such as Frigate run as their own containers next to the worker.

## Check a deploy

`make smoke` builds both images, deploys them with `docker-compose.yml` in a
scratch folder, signs up an owner, runs one round of the worker and checks that
it reported in. CI runs the same script on every pull request.
