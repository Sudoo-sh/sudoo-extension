/** Messages between the content script, the extension's pages and the service worker. No secret ever crosses. */

import type { GitHubPageKind } from "./match";
import type { InstanceStatus, JobStatus, Stage } from "./types";

/** What the GitHub box shows about one instance. */
export interface InstanceSummary {
  /** The instance's name. */
  name: string;
  /** The instance's stage. */
  stage: Stage;
  /** The instance's state. */
  status: InstanceStatus;
  /** The instance's web address, or null. */
  url: string | null;
  /** The address of the instance in the panel. */
  panelUrl: string;
  /** The running job (action, state and progress), or null. */
  job: { action: string; status: JobStatus; progress: number | null } | null;
}

/** What one panel knows about the GitHub page that is open. */
export interface GitHubMatch {
  /** The id of the saved panel. */
  panelId: string;
  /** The panel's label. */
  panelLabel: string;
  /** The matching project, or null when there is none. */
  project: { id: string; name: string; url: string } | null;
  /** The branch of the page, or null. */
  branch: string | null;
  /** The stage of that branch, or null. */
  branchStage: Stage | null;
  /** The instances that run the branch. */
  instances: InstanceSummary[];
  /** Whether an instance can be created for the branch. */
  canCreate: boolean;
  /** Whether the page is a pull request from a fork. */
  fork: boolean;
}

/** A message from the content script to the service worker: look up the page, create an instance or read a job. */
export type GitHubRequest =
  | {
      type: "github:lookup";
      repo: string;
      kind: GitHubPageKind;
      ref: string | null;
      /** the pull request's head as GitHub's page shows it, "owner:branch" */
      head: string | null;
    }
  | { type: "github:create"; panelId: string; repo: string; branch: string }
  | { type: "github:job"; panelId: string; jobId: string };

/** A message from an extension page to the service worker: track a job, or tell that settings changed. */
export type PageRequest =
  | { type: "track-job"; panelId: string; jobId: string; action: string; instance: string | null }
  | { type: "settings-changed" };

/** The answer to a lookup: the matches and the language, or a failure. */
export type GitHubLookupAnswer = { ok: true; matches: GitHubMatch[]; locale: "en" | "ar" } | { ok: false };
/** The answer to a create request: the job's id, or an error text. */
export type GitHubCreateAnswer = { ok: true; jobId: string; instance: string | null } | { ok: false; error: string };
/** The answer to a job request: its state, progress and error, or a failure. */
export type GitHubJobAnswer =
  | { ok: true; status: JobStatus; progress: number | null; error: string | null }
  | { ok: false };
