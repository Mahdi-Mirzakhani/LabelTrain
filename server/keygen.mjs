// ============================================================
//  Generate the Ed25519 signing keypair.
// ============================================================
//  Run once:  node server/keygen.mjs
//
//  Writes server/keys/private.pem (KEEP SECRET, never ship) and
//  server/keys/public.pem. Paste the printed public key into
//  electron/license/config.ts  →  LICENSE_CONFIG.publicKeyPem.
//
//  Re-running OVERWRITES the keys and invalidates every license
//  already issued — only do it on first setup.
// ============================================================

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { KEYS_DIR } from "./lib.mjs";

const force = process.argv.includes("--force");
const privPath = path.join(KEYS_DIR, "private.pem");

if (fs.existsSync(privPath) && !force) {
  console.error(
    `Keys already exist at ${KEYS_DIR}.\n` +
    `Refusing to overwrite (this would invalidate all issued licenses).\n` +
    `Pass --force if you really mean to regenerate.`,
  );
  process.exit(1);
}

fs.mkdirSync(KEYS_DIR, { recursive: true });
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

fs.writeFileSync(privPath, priv, { mode: 0o600 });
fs.writeFileSync(path.join(KEYS_DIR, "public.pem"), pub);

console.log("Keypair written to", KEYS_DIR);
console.log("\nPaste this into electron/license/config.ts → publicKeyPem:\n");
console.log(pub);
