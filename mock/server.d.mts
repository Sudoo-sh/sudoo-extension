/** Type declarations for mock/server.mjs, so the TypeScript tests can import the mock panel. */

import type { Server } from "node:http";

/** API token the mock panel accepts by default. A test value that opens nothing else. */
export const MOCK_TOKEN: string;
/** Signing secret the mock panel uses to check request signatures. A test value that opens nothing else. */
export const MOCK_SECRET: string;
/**
 * Creates the mock panel's HTTP server without starting to listen.
 * Options: `token` and `secret` replace the accepted credentials, `scope` is "write", "instances" or "read" (limits what
 * the token may do), `jobMs` is how long a job runs in milliseconds. Returns the Node `server`, the `instances` by name
 * and the `jobs` by id, which tests may inspect.
 */
export function createMockPanel(options?: { token?: string; secret?: string; scope?: string; jobMs?: number }): {
  server: Server;
  instances: Map<string, unknown>;
  jobs: Map<string, unknown>;
};
