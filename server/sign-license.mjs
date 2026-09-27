// ============================================================
//  Issue a signed license key for a customer.
// ============================================================
//  Usage:
//    node server/sign-license.mjs --machine <DEVICE_ID> [options]
//
//  Options:
//    --machine <id>   Device ID from the user's lock screen, or "*"
//                     for a license that works on any machine.
//    --plan <name>    Plan label (default: "pro").
//    --name  <text>   Buyer name, shown in the app.
//    --days  <n>      Valid for N days (omit = perpetual).
//    --id    <id>     License id for your records (default: random).
//
//  Prints the license KEY — give this string to the customer to
//  paste into the app's activation screen.
//
//  Example:
//    node server/sign-license.mjs --machine A1B2-C3D4-E5F6-7890-1234 \
//         --plan pro --name "Acme Co" --days 365
// ============================================================

import crypto from "node:crypto";
import { sign, encodeKey } from "./lib.mjs";

function arg(flag, fallback = undefined) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const machineId = arg("--machine");
if (!machineId) {
  console.error('Missing --machine <DEVICE_ID>  (use "*" for any machine)');
  process.exit(1);
}

const days = arg("--days");
const payload = {
  id: arg("--id", "lic_" + crypto.randomUUID()),
  appId: "com.labelstudio.app", // must match LICENSE_CONFIG.appId
  machineId,
  plan: arg("--plan", "pro"),
  name: arg("--name", undefined),
  issuedAt: Date.now(),
  expiresAt: days ? Date.now() + Number(days) * 86_400_000 : null,
};

const signed = sign(payload);
const key = encodeKey(signed);

console.error("License issued:");
console.error(JSON.stringify(payload, null, 2));
console.error("\n--- give the customer this key ---\n");
console.log(key);
