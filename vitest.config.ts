/**
 * Test runner settings: Node environment, every .test.ts file under tests/, and at most two worker threads so the mock
 * panel's local ports and timers do not compete.
 */

import { defineConfig } from "vitest/config";

/** Vitest configuration object. */
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"], pool: "threads", maxWorkers: 2 },
});
