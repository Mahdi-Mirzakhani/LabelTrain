# LabelStudio license server

> ⚠️ **Superseded by Payload CMS.** The live licensing control plane now lives in
> `front/cms` (Payload):
> - the free→paid switch is the **License Policy** global (replaces `policy.json`);
> - `GET /api/license/policy` (replaces `server.mjs`) serves the signed policy;
> - per-device keys are issued by `POST /api/license/register-device`.
>
> Payload reuses the **same keypair in `keys/`** (via `LICENSE_PRIVATE_KEY_FILE` /
> `LICENSE_PRIVATE_KEY_PEM`), so the public key baked into the desktop build keeps
> verifying. Keep `keygen.mjs` / `sign-license.mjs` here as **offline admin tools**;
> `server.mjs` and `policy.json` remain only as a local reference/fallback.

This folder is your **backend** — it is *not* bundled into the app. It signs the
policy the app fetches and the license keys you sell.

## Files

| File | Purpose |
| --- | --- |
| `keygen.mjs` | One-time: generate the Ed25519 signing keypair into `keys/`. |
| `lib.mjs` | Shared crypto (canonical JSON + Ed25519 sign). Kept byte-compatible with the app. |
| `sign-license.mjs` | Issue a signed license key for a customer/device. |
| `server.mjs` | Reference HTTP server: policy endpoint + admin on/off switch. |
| `policy.json` | **The switch.** `enforce:false` = free, `enforce:true` = locked. |
| `keys/private.pem` | **SECRET.** Never commit or ship. Git-ignored. |
| `keys/public.pem` | Public half; mirror it into `electron/license/config.ts`. |

## First-time setup

```bash
node server/keygen.mjs          # writes keys/, prints the public key
# paste the printed key into electron/license/config.ts → publicKeyPem
```

## Run

```bash
ADMIN_TOKEN=yoursecret PORT=8787 node server/server.mjs
```

- `GET  /api/license/policy` — the app polls this when online.
- `GET  /admin` — status page.
- `POST /admin/enforce` — flip the switch:
  ```bash
  curl -X POST http://localhost:8787/admin/enforce \
       -H "x-admin-token: yoursecret" \
       -H "content-type: application/json" \
       -d '{"enforce":true,"message":"Please buy a license."}'
  ```

## Issue a license

```bash
node server/sign-license.mjs --machine <DEVICE_ID> --plan pro --name "Acme" --days 365
# --machine "*"  → works on any device
# omit --days    → perpetual license
```

Give the printed key to the customer; they paste it into the app's activation screen.

## Production notes

- Put `server.mjs` behind HTTPS (reverse proxy) and replace the admin token check
  with real auth before going live.
- Keep `keys/private.pem` only on this server. If it leaks, regenerate (which
  invalidates every issued license) and re-release the app with the new public key.
