/**
 * Matching without any GitHub token: a GitHub page is identified by its URL (owner/repository, branch), and an
 * Odoo tab by its hostname, against what the panel's API lists.
 */

import type { Instance, InstanceStatus, Project, Stage } from "./types";

/**
 * Reduce a GitHub repository address to "owner/name" in lower case:
 * "https://github.com/Acme/ERP.git", "git@github.com:acme/erp" ... -> "acme/erp".
 *
 * @param url - The repository address (https, scp-like or ssh form).
 * @returns "owner/name" in lower case, or null for an empty value or anything that is not a GitHub repository.
 */
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

/** The kind of repository page: home, tree, blob, commit list, pull request or compare. */
export type GitHubPageKind = "repo" | "tree" | "blob" | "commits" | "pull" | "compare";

/** A GitHub page that is about one repository's code. */
export interface GitHubPage {
  /** "owner/repo", lower case */
  repo: string;
  /** The kind of page. */
  kind: GitHubPageKind;
  /**
   * what follows tree/, blob/, commits/ or compare/: the branch, possibly followed by a path; null on the repo's home
   */
  ref: string | null;
  /** The pull request's number, or null on other pages. */
  pull: number | null;
}

/**
 * Read a github.com path.
 *
 * @param pathname - The path of the page's URL, for example "/acme/erp/tree/main/addons".
 * @returns The repository, the kind of page, the ref and the pull request's number; null for pages that are not
 *   about one repository's code (GitHub's own pages, settings, issues ...).
 */
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

/**
 * Decode a percent-encoded path part.
 *
 * @param part - The part.
 * @returns The decoded text, or the part itself when it is not valid.
 */
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
 *
 * @param ref - The ref from the URL.
 * @param known - The branches the panel knows for the repository.
 * @returns The branch.
 */
export function resolveBranch(ref: string, known: readonly string[]): string {
  let best: string | null = null;
  for (const branch of known) {
    if ((ref === branch || ref.startsWith(`${branch}/`)) && (best === null || branch.length > best.length))
      best = branch;
  }
  return best ?? ref.split("/")[0] ?? ref;
}

/**
 * Read the PR's head branch from GitHub's page text "owner:branch" or "branch"; a fork's head is another
 * repository, so the owner is kept for the caller to compare.
 *
 * @param text - The text of the head ref on the page.
 * @returns The owner (null when the text has none) and the branch, or null when the text is empty.
 */
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

/**
 * Find the project whose repository is a repository.
 *
 * @param projects - The projects.
 * @param repo - The repository's full name, lower case.
 * @returns The project, or null.
 */
export function findProject(projects: readonly Project[], repo: string): Project | null {
  return projects.find((project) => normalizeRepo(project.repository.url) === repo) ?? null;
}

/** The sort position of each stage: production first. */
const STAGE_RANK: Record<Stage, number> = { production: 0, staging: 1, development: 2 };

/**
 * Compare two instances by stage, then by name, for sorting.
 *
 * @param a - The first instance.
 * @param b - The second instance.
 * @returns A negative number, zero or a positive number.
 */
export const byStage = (a: Instance, b: Instance): number =>
  STAGE_RANK[a.stage] - STAGE_RANK[b.stage] || a.name.localeCompare(b.name);

/**
 * List the instances of a repository, sorted by stage and name.
 *
 * @param instances - The instances.
 * @param repo - The repository's full name, lower case.
 * @returns The matching instances.
 */
export function instancesOfRepo(instances: readonly Instance[], repo: string): Instance[] {
  return instances.filter((instance) => normalizeRepo(instance.git.repository) === repo).sort(byStage);
}

/**
 * List the instances of a repository that run a branch.
 *
 * @param instances - The instances.
 * @param repo - The repository's full name, lower case.
 * @param branch - The branch.
 * @returns The matching instances.
 */
export function instancesOfBranch(instances: readonly Instance[], repo: string, branch: string): Instance[] {
  return instancesOfRepo(instances, repo).filter((instance) => instance.git.branch === branch);
}

/**
 * Find the instance whose public address is the tab's (same host and port); case does not matter.
 *
 * @param instances - The panel's instances.
 * @param tabUrl - The tab's address.
 * @returns The instance, or null when none matches or the address is not http or https.
 */
export function instanceForUrl(instances: readonly Instance[], tabUrl: string | null | undefined): Instance | null {
  const host = hostOf(tabUrl);
  if (!host) return null;
  return instances.find((instance) => hostOf(instance.url) === host) ?? null;
}

/**
 * Read the lower-case host (with the port) of an http or https address.
 *
 * @param url - The address.
 * @returns The host, or null when the address is empty, not valid or not http or https.
 */
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

/**
 * Map a status to the group the dashboard shows.
 *
 * @param status - The instance's status.
 * @returns "online", "paused" or "off" for those statuses, "working" for every other one.
 */
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

/**
 * Tell whether an instance matches a search. Every word of the query must appear in the name, branch, project,
 * repository, stage, status or version, or in `extra`; case does not matter.
 *
 * @param instance - The instance.
 * @param query - The search text; empty matches everything.
 * @param extra - More text to search in, for example the panel's name.
 * @returns True when every word is found.
 */
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

/**
 * Tell which quick actions make sense for an instance. None while a job runs; update only for an instance from a
 * repository.
 *
 * @param instance - The instance.
 * @returns For each action, whether it is offered.
 */
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
