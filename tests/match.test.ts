import { describe, expect, it } from "vitest";
import {
  actionsFor,
  instanceForUrl,
  matchesQuery,
  normalizeRepo,
  parseGitHubPath,
  parseHeadRef,
  resolveBranch,
  stateGroup,
} from "../src/lib/match";
import type { Instance } from "../src/lib/types";

const instance = (over: Partial<Instance> & { name: string }): Instance => ({
  status: "online",
  stage: "development",
  project: { id: "acme", name: "Acme" },
  url: `https://${over.name}.demo.sudoo.sh`,
  odoo: { version: "19.0", edition: "community" },
  source: "repository",
  git: { repository: "https://github.com/Acme/ERP", branch: "main" },
  current_job: null,
  ...over,
});

describe("repositories", () => {
  it("normalizes GitHub addresses", () => {
    expect(normalizeRepo("https://github.com/Acme/ERP")).toBe("acme/erp");
    expect(normalizeRepo("https://github.com/acme/erp.git")).toBe("acme/erp");
    expect(normalizeRepo("git@github.com:acme/erp.git")).toBe("acme/erp");
    expect(normalizeRepo("https://gitlab.com/acme/erp")).toBeNull();
    expect(normalizeRepo("https://github.com/acme")).toBeNull();
    expect(normalizeRepo(null)).toBeNull();
  });
});

describe("GitHub pages", () => {
  it("reads repository, branch and pull-request pages", () => {
    expect(parseGitHubPath("/Acme/ERP")).toEqual({ repo: "acme/erp", kind: "repo", ref: null, pull: null });
    expect(parseGitHubPath("/acme/erp/tree/feature/x/addons")).toMatchObject({ kind: "tree", ref: "feature/x/addons" });
    expect(parseGitHubPath("/acme/erp/blob/main/README.md")).toMatchObject({ kind: "blob", ref: "main/README.md" });
    expect(parseGitHubPath("/acme/erp/pull/42/files")).toMatchObject({ kind: "pull", pull: 42 });
    expect(parseGitHubPath("/acme/erp/compare/main...feature-y")).toMatchObject({ kind: "compare", ref: "feature-y" });
    expect(parseGitHubPath("/acme/erp/tree/caf%C3%A9")).toMatchObject({ ref: "café" });
  });

  it("ignores pages that are not about a repository's code", () => {
    for (const path of [
      "/",
      "/settings/profile",
      "/orgs/acme/teams",
      "/acme",
      "/acme/erp/issues/3",
      "/marketplace/x",
      "/acme/erp/tree/",
    ]) {
      expect(parseGitHubPath(path)).toBeNull();
    }
  });

  it("finds the branch in a ref that may continue with a path", () => {
    const known = ["main", "feature", "feature/x", "feature/x-2"];
    expect(resolveBranch("feature/x/addons/sale", known)).toBe("feature/x");
    expect(resolveBranch("feature/x-2", known)).toBe("feature/x-2");
    expect(resolveBranch("main", known)).toBe("main");
    expect(resolveBranch("unknown/path", known)).toBe("unknown");
  });

  it("reads a pull request's head", () => {
    expect(parseHeadRef("acme:feature/x")).toEqual({ owner: "acme", branch: "feature/x" });
    expect(parseHeadRef("feature-y")).toEqual({ owner: null, branch: "feature-y" });
    expect(parseHeadRef("  ")).toBeNull();
  });
});

describe("instances", () => {
  const list = [instance({ name: "a" }), instance({ name: "b", url: "https://erp.client.com:8443" })];

  it("finds the instance of a tab by its host", () => {
    expect(instanceForUrl(list, "https://A.demo.sudoo.sh/odoo/action-1")?.name).toBe("a");
    expect(instanceForUrl(list, "https://erp.client.com:8443/web")?.name).toBe("b");
    expect(instanceForUrl(list, "https://erp.client.com/web")).toBeNull();
    expect(instanceForUrl(list, "chrome://extensions")).toBeNull();
    expect(instanceForUrl(list, null)).toBeNull();
  });

  it("groups statuses as the dashboard does", () => {
    expect(stateGroup("online")).toBe("online");
    expect(stateGroup("busy")).toBe("working");
    expect(stateGroup("creating")).toBe("working");
    expect(stateGroup("paused")).toBe("paused");
    expect(stateGroup("switched_off")).toBe("off");
  });

  it("searches every word", () => {
    const one = instance({ name: "shop-main", stage: "production" });
    expect(matchesQuery(one, "shop prod")).toBe(true);
    expect(matchesQuery(one, "acme 19.0")).toBe(true);
    expect(matchesQuery(one, "staging")).toBe(false);
    expect(matchesQuery(one, "  ")).toBe(true);
  });

  it("offers only the actions that fit", () => {
    expect(actionsFor(instance({ name: "x" }))).toEqual({ start: false, pause: true, restart: true, update: true });
    expect(actionsFor(instance({ name: "x", status: "paused" }))).toMatchObject({
      start: true,
      pause: false,
      restart: false,
    });
    const busy = instance({
      name: "x",
      status: "busy",
      current_job: { id: "1", instance: "x", action: "Restart", status: "running", progress_percent: 50, error: null },
    });
    expect(actionsFor(busy)).toEqual({ start: false, pause: false, restart: false, update: false });
    expect(actionsFor(instance({ name: "x", source: "plain", git: { repository: null, branch: null } })).update).toBe(
      false,
    );
  });
});
