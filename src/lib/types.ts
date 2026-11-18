/** The shapes of the panel API the extension reads (docs/PANEL_API.md). Only the fields it uses are typed. */

export type Stage = "production" | "staging" | "development";
export type InstanceStatus =
  | "creating"
  | "online"
  | "starting"
  | "busy"
  | "paused"
  | "switched_off"
  | "stopped"
  | "unknown";
export type JobStatus = "queued" | "running" | "success" | "failed";

export interface JobStep {
  title: string;
  status: string;
}

export interface Job {
  id: string;
  instance: string | null;
  action: string;
  status: JobStatus;
  progress_percent: number | null;
  requested_by?: string;
  started_at?: string | null;
  finished_at?: string | null;
  steps?: JobStep[];
  error: string | null;
  links?: { self: string; instance?: string };
}

export interface Instance {
  name: string;
  status: InstanceStatus;
  stage: Stage;
  project: { id: string; name: string } | null;
  url: string | null;
  odoo: { version: string; edition: "community" | "enterprise"; database?: string };
  source?: "repository" | "plain";
  git: {
    repository: string | null;
    branch: string | null;
    branch_deleted_on_github?: boolean;
    commit?: { sha: string; subject: string; author: string; age: string } | null;
  };
  current_job: Job | null;
  links?: { self: string };
}

export interface Project {
  id: string;
  name: string;
  repository: { full_name: string; url: string };
  odoo: { version: string; edition: "community" | "enterprise" };
  instances?: { total: number; names: string[] };
  production_branches?: string[];
}

export interface ProjectBranch {
  name: string;
  stage: Stage;
  default: boolean;
  on_github: boolean | null;
  instances: string[];
}

export interface ProjectDetail extends Project {
  branches_list: ProjectBranch[];
}

export interface Alert {
  id: string;
  type: string;
  severity: "problem" | "recovered" | "info";
  title: string;
  text: string;
  instance: string | null;
  link: string | null;
  last_at: number;
  resolved_at: number | null;
}

/** RFC 9457 problem details */
export interface Problem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  request_id?: string;
}

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/** The actions the extension offers (a subset of POST /instances/<name>/actions/<action>). */
export type QuickAction = "start" | "pause" | "restart" | "update";
