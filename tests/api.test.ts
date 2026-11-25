/**
 * Tests of the panel client against the mock panel (mock/server.mjs), started on a free local port, and of address
 * handling.
 */

import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockPanel, MOCK_SECRET, MOCK_TOKEN } from "../mock/server.mjs";
import { ApiError, encodeBranch, normalizeOrigin, PanelClient, UnreachableError } from "../src/lib/api";

/**
 * Starts a mock panel with the given scope (default "write") and short jobs on a free local port. Resolves with its
 * origin and a function that stops it.
 */
function start(scope = "write") {
  const mock = createMockPanel({ scope, jobMs: 300 });
  return new Promise<{ origin: string; close: () => void }>((resolve) => {
    mock.server.listen(0, "127.0.0.1", () => {
      const { port } = mock.server.address() as AddressInfo;
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => mock.server.close() });
    });
  });
}

/** The mock panel's token and secret. */
const credentials = { token: MOCK_TOKEN, secret: MOCK_SECRET };
/** Mock panel with the "write" scope, started before the tests. */
let panel: { origin: string; close: () => void };
/** Mock panel whose token has the "instances" scope only. */
let limited: { origin: string; close: () => void };

/** Starts both mock panels. */
beforeAll(async () => {
  panel = await start();
  limited = await start("instances");
});
/** Stops both mock panels. */
afterAll(() => {
  panel.close();
  limited.close();
});

/** Test group for the panel client. */
describe("PanelClient against the mock panel", () => {
  it("lists instances and projects through signed requests", async () => {
    const client = new PanelClient(panel.origin, credentials);
    const instances = await client.instances();
    expect(instances.length).toBe(10);
    expect(instances[0]).toMatchObject({ name: "acme-retail-main", stage: "production", status: "online" });
    const projects = await client.projects();
    expect(projects.map((p) => p.id)).toEqual(["acme-retail", "nile-logistics", "zahra-clinic"]);
    const { project, defaultBranch } = await client.project("nile-logistics");
    expect(defaultBranch).toBe("main");
    expect(project.branches_list.map((b) => b.name)).toContain("feature/upgrade-18");
  });

  it("starts an action and follows its job to the end", async () => {
    const client = new PanelClient(panel.origin, credentials);
    const job = await client.action("acme-retail-pos-refunds", "restart");
    expect(job).toMatchObject({ action: "Restart", status: "running" });
    expect((await client.instance("acme-retail-pos-refunds")).status).toBe("busy");
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect((await client.job(job.id)).status).toBe("success");
    expect((await client.instance("acme-retail-pos-refunds")).status).toBe("online");
  });

  it("confirms a production pause, which the panel refuses without it", async () => {
    const client = new PanelClient(panel.origin, credentials);
    await expect(client.post("/api/v1/instances/zahra-clinic-main/actions/pause", {})).rejects.toMatchObject({
      status: 400,
    });
    const job = await client.action("zahra-clinic-main", "pause", true);
    expect(job.action).toBe("Pause");
  });

  it("creates a branch instance, also for a branch with a slash", async () => {
    const client = new PanelClient(panel.origin, credentials);
    const job = await client.createBranchInstance("nile-logistics", "feature/customs-forms");
    expect(job).toMatchObject({ action: "Create instance", instance: "nile-logistics-feature-customs-forms" });
  });

  it("turns refusals into problem details", async () => {
    const wrong = new PanelClient(panel.origin, { token: MOCK_TOKEN, secret: "not-the-secret" });
    const error = await wrong.instances().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, detail: "The signature does not match the request." });
    expect((error as ApiError).requestId).toMatch(/^mock/);

    const scoped = new PanelClient(limited.origin, credentials);
    await expect(scoped.projects()).rejects.toMatchObject({ status: 403 });
    await expect(scoped.action("acme-retail-staging", "update")).rejects.toMatchObject({ status: 403 });
    await expect(scoped.instance("nope")).rejects.toMatchObject({ status: 404 });
  });

  it("creates through POST /instances when the token may not use projects", async () => {
    const scoped = new PanelClient(limited.origin, credentials);
    const job = await scoped.createInstance({
      repo: "https://github.com/example-integrator/acme-retail",
      branch: "gift-cards",
      version: "18.0",
      edition: "enterprise",
      stage: "development",
    });
    expect(job.instance).toBe("acme-retail-gift-cards");
  });

  it("refuses a replayed request (same nonce)", async () => {
    let captured: RequestInit | null = null;
    const recorder = new PanelClient(panel.origin, credentials, {
      fetch: (input, init) => {
        captured = init;
        return fetch(input, init);
      },
    });
    await recorder.instances();
    const again = await fetch(
      `${panel.origin}/api/v1/instances?limit=500&offset=0`,
      captured as unknown as RequestInit,
    );
    expect(again.status).toBe(401);
  });

  it("reports a panel that cannot be reached", async () => {
    const client = new PanelClient("http://127.0.0.1:9", credentials, { timeoutMs: 2000 });
    await expect(client.instances()).rejects.toBeInstanceOf(UnreachableError);
  });
});

/** Test group for address normalization and branch encoding. */
describe("addresses", () => {
  it("normalizes panel addresses and refuses unsafe ones", () => {
    expect(normalizeOrigin("panel.example.com")).toBe("https://panel.example.com");
    expect(normalizeOrigin("https://panel.example.com/i/shop?x=1")).toBe("https://panel.example.com");
    expect(normalizeOrigin("http://localhost:8787")).toBe("http://localhost:8787");
    expect(normalizeOrigin("localhost:8787")).toBe("http://localhost:8787");
    expect(normalizeOrigin("localhost.example.com")).toBe("https://localhost.example.com");
    expect(normalizeOrigin("http://panel.example.com")).toBeNull();
    expect(normalizeOrigin("https://user:pass@panel.example.com")).toBeNull();
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("")).toBeNull();
  });

  it("encodes each part of a branch and keeps the slashes", () => {
    expect(encodeBranch("feature/new form#2")).toBe("feature/new%20form%232");
  });
});
