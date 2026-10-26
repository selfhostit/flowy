# Running Flowy on a Synology NAS

This gives you Flowy at `https://flowy.<your-name>.synology.me` with a free
Let's Encrypt certificate, next to any other apps on the NAS. It needs DSM 7.2
or later; any model that runs **Container Manager** (x86-64 or ARM) works.

Flowy uses port **8091** on the NAS here, so it doesn't clash with another app
on 8090. Replace `<your-name>` with your Synology DDNS name.

## 1. Install

1. Install **Container Manager** from Package Center.
2. In Control Panel > Terminal & SNMP, enable SSH and sign in: `ssh you@nas.local`.
3. Install into the `docker` shared folder (press Enter when it asks for a
   Tailscale key, unless you use Tailscale):
   ```sh
   curl -fsSL https://raw.githubusercontent.com/selfhostit/flowy/main/deploy/install.sh | sudo PORT=8091 sh -s /volume1/docker/flowy
   ```

Flowy now runs on the NAS at port 8091, reachable only from the NAS itself, and
shows up in Container Manager under Project, where you can see its logs. The
database lives in `/volume1/docker/flowy/pb_data`, owned by your DSM user.

The image comes from `ghcr.io/selfhostit/flowy`. If the NAS can't pull it, make
the package public at https://github.com/selfhostit/flowy/pkgs/container/flowy
(Package settings > Change visibility).

## 2. Address and certificate

If you already have `<your-name>.synology.me` (Control Panel > External Access >
DDNS), it also answers for `flowy.<your-name>.synology.me`. Otherwise add it there
with Synology as the provider.

Control Panel > Security > Certificate: if your certificate doesn't cover
`*.<your-name>.synology.me` yet, choose Add > Replace an existing certificate >
Get a certificate from Let's Encrypt, with domain `<your-name>.synology.me` and
subject alternative name `*.<your-name>.synology.me`.

## 3. Reverse proxy

Control Panel > Login Portal > Advanced > Reverse Proxy > Create:

- Source: HTTPS, hostname `flowy.<your-name>.synology.me`, port 443, HSTS on
- Destination: HTTP, `localhost`, port 8091
- Custom Header > Create > WebSocket (for live updates)

Then in Control Panel > Security > Certificate > Settings, pick the certificate
for the new `flowy.<your-name>.synology.me` entry.

Port 443 must be forwarded to the NAS in your router; it already is if another
app on the NAS is reachable over HTTPS. To keep Flowy at home or on a VPN only,
skip steps 2 and 3 and use Tailscale (see [deploy.md](deploy.md)).

## 4. Create your account and install it on your phone

Open `https://flowy.<your-name>.synology.me` and create the owner account. Add
other people from the admin page (`/_/`); each person only sees their own
calendar. On the phone, sign in and choose **⋮ > Install app** in Chrome on
Android or **Share > Add to Home Screen** in Safari on iPhone, then turn on
notifications in Settings for reminders. [Phones](deploy.md#phones) lists what
works on Android and iPhone.

## Updating

Every push to `main` publishes a new image. On the NAS:

```sh
cd /volume1/docker/flowy && sudo docker compose pull && sudo docker compose up -d
```

Working on Flowy yourself? `scripts/deploy-to-nas.sh you@nas.local` builds the
image on your computer, copies it to the NAS over SSH and restarts Flowy, without
going through GitHub.

## Backups

Flowy keeps 7 nightly backups in `pb_data/backups`. To keep a copy off the NAS
as well, add `/volume1/docker/flowy` to a **Hyper Backup** task.
