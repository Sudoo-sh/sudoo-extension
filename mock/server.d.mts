import type { Server } from "node:http";

export const MOCK_TOKEN: string;
export const MOCK_SECRET: string;
export function createMockPanel(options?: { token?: string; secret?: string; scope?: string; jobMs?: number }): {
  server: Server;
  instances: Map<string, unknown>;
  jobs: Map<string, unknown>;
};
