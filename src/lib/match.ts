/**
 * Matching without any GitHub token: a GitHub page is identified by its URL (owner/repository, branch), and an
 * Odoo tab by its hostname, against what the panel's API lists.
 */

import type { Instance, InstanceStatus, Project, Stage } from "./types";

/** "https://github.com/Acme/ERP.git", "git@github.com:acme/erp" ... -> "acme/erp"; null for anything else. */
export function normalizeRepo(url: string | null | undefined): string | null {
  if (!url) return null;
  const match =
    /^(?:https?:\/\/(?:www\.)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(
      url.trim(),
    );
  if (!match) return null;
  return `${match[1]}/${match[2]}`.toLowerCase();
}

/** First path parts that are GitHub's own pages, never an owner. */
const RESERVED = new Set([
  "settings",
  "orgs",
  "organizations",
  "marketplace",
  "notifications",
  "explore",
  "topics",
  "trending",
  "collections",
  "sponsors",
  "login",
  "logout",
  "signup",
  "join",
  "new",
  "pulls",
  "issues",
  "codespaces",
  "features",
  "enterprise",
  "pricing",
  "search",
  "apps",
  "about",
  "site",
  "security",
  "account",
  "dashboard",
  "users",
  "stars",
  "watching",
  "copilot",
  "github-copilot",
  "readme",
  "customer-stories",
  "team",
  "home",
]);

export type GitHubPageKind = "repo" | "tree" | "blob" | "commits" | "pull" | "compare";

export interface GitHubPage {
  /** "owner/repo", lower case */
  repo: string;
  kind: GitHubPageKind;
  /** what follows tree/, blob/, commits/ or compare/: the branch, possibly followed by a path; null on the repo's home */
  ref: string | null;
  pull: number | null;
}

/** Reads a github.com path. Answers null for pages that are not about one repository's code. */
export function parseGitHubPath(pathname: string): GitHubPage | null {
  const parts = pathname.split("/").filter(Boolean).map(safeDecode);
  if (parts.length < 2) return null;
  const [owner, name, section, ...rest] = parts as [string, string, string | undefined, ...string[]];
  if (RESERVED.has(owner.toLowerCase()) || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(name)) return null;
  const repo = `${owner}/${name.replace(/\.git$/i, "")}`.toLowerCase();
  if (section === undefined) return { repo, kind: "repo", ref: null, pull: null };
  if (section === "tree" || section === "blob" || section === "commits") {
    if (!rest.length) return null;
    return { repo, kind: section, ref: rest.join("/"), pull: null };
  }
  if (section === "pull" && rest[0] && /^\d+$/.test(rest[0])) {
    return { repo, kind: "pull", ref: null, pull: Number(rest[0]) };
  }
  if (section === "compare" && rest.length) {
    // compare/base...head or compare/head
    const spec = rest.join("/");
    const head = spec.includes("...") ? spec.split("...").pop() : spec;
    return head ? { repo, kind: "compare", ref: head.replace(/^[\w.-]+:/, ""), pull: null } : null;
  }
  return null;
}

function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/**
 * A ref from a URL is "<branch>" or "<branch>/<path>", and a branch may contain "/" itself: the longest known
 * branch that the ref starts with wins. Without a match the first part is taken.
 */
export function resolveBranch(ref: string, known: readonly string[]): string {
  let best: string | null = null;
  for (const branch of known) {
    if ((ref === branch || ref.startsWith(`${branch}/`)) && (best === null || branch.length > best.length))
      best = branch;
  }
  return best ?? ref.split("/")[0] ?? ref;
}

/** The PR's head branch from GitHub's page text "owner:branch" or "branch"; a fork's head is another repository. */
export function parseHeadRef(text: string | null | undefined): { owner: string | null; branch: string } | null {
  const value = text?.trim();
  if (!value) return null;
  const colon = value.indexOf(":");
  if (colon > 0) {
    const owner = value.slice(0, colon);
    const branch = value.slice(colon + 1);
    return branch ? { owner: owner.includes("/") ? (owner.split("/")[0] ?? owner) : owner, branch } : null;
  }
  return { owner: null, branch: value };
}

export function findProject(projects: readonly Project[], repo: string): Project | null {
  return projects.find((project) => normalizeRepo(project.repository.url) === repo) ?? null;
}

const STAGE_RANK: Record<Stage, number> = { production: 0, staging: 1, development: 2 };

export const byStage = (a: Instance, b: Instance): number =>
  STAGE_RANK[a.stage] - STAGE_RANK[b.stage] || a.name.localeCompare(b.name);

export function instancesOfRepo(instances: readonly Instance[], repo: string): Instance[] {
  return instances.filter((instance) => normalizeRepo(instance.git.repository) === repo).sort(byStage);
}

export function instancesOfBranch(instances: readonly Instance[], repo: string, branch: string): Instance[] {
  return instancesOfRepo(instances, repo).filter((instance) => instance.git.branch === branch);
}

/** The instance whose public address is the tab's (same host and port); case does not matter. */
export function instanceForUrl(instances: readonly Instance[], tabUrl: string | null | undefined): Instance | null {
  const host = hostOf(tabUrl);
  if (!host) return null;
  return instances.find((instance) => hostOf(instance.url) === host) ?? null;
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.host.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The four states the panel's dashboard shows. */
export type StateGroup = "online" | "working" | "paused" | "off";

export function stateGroup(status: InstanceStatus): StateGroup {
  switch (status) {
    case "online":
      return "online";
    case "paused":
      return "paused";
    case "switched_off":
    case "stopped":
      return "off";
    default:
      return "working";
  }
}

/** Every word of the query must appear in the name, branch, project, repository, stage or version. */
export function matchesQuery(instance: Instance, query: string, extra = ""): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [
    instance.name,
    instance.git.branch,
    instance.git.repository,
    instance.project?.name,
    instance.project?.id,
    instance.stage,
    instance.status,
    instance.odoo.version,
    extra,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((word) => hay.includes(word));
}

/** Which quick actions make sense for a status. */
export function actionsFor(instance: Instance): { start: boolean; pause: boolean; restart: boolean; update: boolean } {
  const group = stateGroup(instance.status);
  const idle = instance.current_job === null && instance.status !== "creating" && instance.status !== "busy";
  const repo = instance.source !== "plain" && Boolean(instance.git.repository);
  return {
    start: idle && (group === "paused" || group === "off"),
    pause: idle && group === "online",
    restart: idle && group === "online",
    update: idle && repo && group !== "working",
  };
}
