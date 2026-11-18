/** Messages between the content script, the extension's pages and the service worker. No secret ever crosses. */

import type { GitHubPageKind } from "./match";
import type { InstanceStatus, JobStatus, Stage } from "./types";

export interface InstanceSummary {
  name: string;
  stage: Stage;
  status: InstanceStatus;
  url: string | null;
  panelUrl: string;
  job: { action: string; status: JobStatus; progress: number | null } | null;
}

export interface GitHubMatch {
  panelId: string;
  panelLabel: string;
  project: { id: string; name: string; url: string } | null;
  branch: string | null;
  branchStage: Stage | null;
  instances: InstanceSummary[];
  canCreate: boolean;
  fork: boolean;
}

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

export type PageRequest =
  | { type: "track-job"; panelId: string; jobId: string; action: string; instance: string | null }
  | { type: "settings-changed" };

export type GitHubLookupAnswer = { ok: true; matches: GitHubMatch[]; locale: "en" | "ar" } | { ok: false };
export type GitHubCreateAnswer = { ok: true; jobId: string; instance: string | null } | { ok: false; error: string };
export type GitHubJobAnswer =
  | { ok: true; status: JobStatus; progress: number | null; error: string | null }
  | { ok: false };
