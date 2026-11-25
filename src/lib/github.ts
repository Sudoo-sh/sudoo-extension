/** What the GitHub box shows for one panel: pure, so it is tested without a browser. */

import { panelLinks } from "./api";
import type { GitHubPageKind } from "./match";
import { findProject, instancesOfRepo, parseHeadRef, resolveBranch } from "./match";
import type { GitHubMatch, InstanceSummary } from "./messages";
import type { Instance, Project, ProjectDetail } from "./types";

/** What the content script learned from the GitHub page. */
export interface PageInfo {
  /** The repository's full name ("owner/name"). */
  repo: string;
  /** The kind of page. */
  kind: GitHubPageKind;
  /** The branch, tag or commit in the address, or null. */
  ref: string | null;
  /** The head of a pull request as "owner:branch", or null. */
  head: string | null;
}

/**
 * Reduce an instance to what the GitHub box shows.
 *
 * @param origin - The panel's origin.
 * @param instance - The instance.
 * @returns The summary.
 */
export function summarize(origin: string, instance: Instance): InstanceSummary {
  const job = instance.current_job;
  return {
    name: instance.name,
    stage: instance.stage,
    status: instance.status,
    url: instance.url,
    panelUrl: panelLinks.instance(origin, instance.name),
    job: job ? { action: job.action, status: job.status, progress: job.progress_percent } : null,
  };
}

/**
 * Find the project of a repository.
 *
 * @param projects - The projects, or null when they could not be read.
 * @param repo - The repository's full name.
 * @returns The project, or null.
 */
export function projectFor(projects: readonly Project[] | null, repo: string): Project | null {
  return projects ? findProject(projects, repo) : null;
}

/**
 * Work out what to show for one panel on a GitHub page.
 *
 * The branch comes from the pull request's head, from the address, or from the default branch. A pull request from a
 * fork shows no instances.
 *
 * @param panel - The saved panel's id, label and origin.
 * @param page - The GitHub page.
 * @param instances - The panel's instances.
 * @param project - The project of the repository, or null.
 * @param detail - The project's branches and default branch, or null.
 * @returns The match, or null when the panel knows nothing about the repository.
 */
export function buildMatch(
  panel: { id: string; label: string; origin: string },
  page: PageInfo,
  instances: readonly Instance[],
  project: Project | null,
  detail: { project: ProjectDetail; defaultBranch: string | null } | null,
): GitHubMatch | null {
  const ofRepo = instancesOfRepo(instances, page.repo);
  if (!project && !ofRepo.length) return null;

  let branch: string | null = null;
  let fork = false;
  if (page.kind === "pull") {
    const head = parseHeadRef(page.head);
    if (head) {
      const owner = page.repo.split("/")[0];
      fork = head.owner !== null && head.owner.toLowerCase() !== owner;
      branch = head.branch;
    }
  } else if (page.ref) {
    const known = new Set<string>(detail?.project.branches_list.map((b) => b.name) ?? []);
    for (const instance of ofRepo) if (instance.git.branch) known.add(instance.git.branch);
    branch = resolveBranch(page.ref, [...known]);
  } else {
    branch = detail?.defaultBranch ?? detail?.project.branches_list.find((b) => b.default)?.name ?? null;
  }

  const shown = fork
    ? []
    : branch === null
      ? ofRepo.filter((i) => i.stage === "production")
      : ofRepo.filter((i) => i.git.branch === branch);
  const branchInfo = branch ? detail?.project.branches_list.find((b) => b.name === branch) : undefined;
  return {
    panelId: panel.id,
    panelLabel: panel.label,
    project: project ? { id: project.id, name: project.name, url: panelLinks.project(panel.origin, project.id) } : null,
    branch,
    branchStage: branchInfo?.stage ?? shown[0]?.stage ?? null,
    instances: shown.map((instance) => summarize(panel.origin, instance)),
    canCreate: !fork && branch !== null && shown.length === 0 && branchInfo?.on_github !== false,
    fork,
  };
}

/** The Odoo version and edition a new instance of the repository gets when created without its project. */
export function versionFor(
  project: Project | null,
  ofRepo: readonly Instance[],
): { version: string; edition: string } | null {
  if (project) return { version: project.odoo.version, edition: project.odoo.edition };
  const lead = ofRepo[0];
  return lead ? { version: lead.odoo.version, edition: lead.odoo.edition } : null;
}
