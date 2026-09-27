// Probe real system info via the same code path the SystemDrawer uses.
// Run with: node --experimental-strip-types tests/sysinfo.ts

import { collectSystemInfo } from "../electron/system-info.ts";

const info = await collectSystemInfo();
console.log(JSON.stringify(info, null, 2));
