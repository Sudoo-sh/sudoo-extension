/** The shapes of the panel API the extension reads (docs/PANEL_API.md). Only the fields it uses are typed. */

/** The stage of an instance: production, staging or development. */
export type Stage = "production" | "staging" | "development";
/** The state of an instance as the panel reports it. */
export type InstanceStatus =
  | "creating"
  | "online"
  | "starting"
  | "busy"
  | "paused"
  | "switched_off"
  | "stopped"
  | "unknown";
/** The state of a job. */
export type JobStatus = "queued" | "running" | "success" | "failed";

/** One step of a job. */
export interface JobStep {
  /** The step's title. */
  title: string;
  /** The step's state, as text from the panel. */
  status: string;
}

/** A job (an action running on an instance). */
export interface Job {
  /** The job's id. */
  id: string;
  /** The instance's name, or null when the job does not belong to one. */
  instance: string | null;
  /** The action's name, for example "update". */
  action: string;
  /** The job's state. */
  status: JobStatus;
  /** Progress from 0 to 100, or null when unknown. */
  progress_percent: number | null;
  /** Who asked for the job. */
  requested_by?: string;
  /** When the job started, or null before it starts. */
  started_at?: string | null;
  /** When the job finished, or null while it runs. */
  finished_at?: string | null;
  /** The steps of the job. */
  steps?: JobStep[];
  /** The error text of a failed job, otherwise null. */
  error: string | null;
  /** Panel links of the job; `self` is its API path. */
  links?: { self: string; instance?: string };
}

/** An Odoo instance of a panel. */
export interface Instance {
  /** The instance's name. */
  name: string;
  /** The instance's state. */
  status: InstanceStatus;
  /** The instance's stage. */
  stage: Stage;
  /** The project the instance belongs to, or null. */
  project: { id: string; name: string } | null;
  /** The instance's web address, or null. */
  url: string | null;
  /** The Odoo version, the edition and the database name when given. */
  odoo: { version: string; edition: "community" | "enterprise"; database?: string };
  /** Where the code comes from: a repository or a plain installation. */
  source?: "repository" | "plain";
  /** The repository, the branch, whether the branch was deleted on GitHub, and the last commit. */
  git: {
    repository: string | null;
    branch: string | null;
    branch_deleted_on_github?: boolean;
    commit?: { sha: string; subject: string; author: string; age: string } | null;
  };
  /** The job running now, or null. */
  current_job: Job | null;
  /** Panel links of the instance. */
  links?: { self: string };
}

/** A project: a repository with its Odoo version. */
export interface Project {
  /** The project's id. */
  id: string;
  /** The project's name. */
  name: string;
  /** The GitHub repository's full name ("owner/name") and address. */
  repository: { full_name: string; url: string };
  /** The Odoo version and edition new instances get. */
  odoo: { version: string; edition: "community" | "enterprise" };
  /** How many instances the project has and their names. */
  instances?: { total: number; names: string[] };
  /** The names of the production branches. */
  production_branches?: string[];
}

/** A branch of a project's repository. */
export interface ProjectBranch {
  /** The branch's name. */
  name: string;
  /** The stage the branch is deployed as. */
  stage: Stage;
  /** Whether it is the repository's default branch. */
  default: boolean;
  /** Whether the branch exists on GitHub; null when unknown. */
  on_github: boolean | null;
  /** The names of the instances that run the branch. */
  instances: string[];
}

/** A project with the list of its branches. */
export interface ProjectDetail extends Project {
  /** The project's branches. */
  branches_list: ProjectBranch[];
}

/** An alert of the panel. */
export interface Alert {
  /** The alert's id. */
  id: string;
  /** The alert's kind, as text from the panel. */
  type: string;
  /** "problem", "recovered" or "info". */
  severity: "problem" | "recovered" | "info";
  /** A short title. */
  title: string;
  /** The alert's text. */
  text: string;
  /** The instance concerned, or null. */
  instance: string | null;
  /** A panel link, or null. */
  link: string | null;
  /** When the alert last happened, as a Unix time in seconds. */
  last_at: number;
  /** When the alert was resolved, as a Unix time in seconds, or null while open. */
  resolved_at: number | null;
}

/** RFC 9457 problem details */
export interface Problem {
  /** An address that names the kind of problem. */
  type?: string;
  /** A short title. */
  title?: string;
  /** The HTTP status code. */
  status?: number;
  /** An explanation of this occurrence. */
  detail?: string;
  /** An address for this occurrence. */
  instance?: string;
  /** The request's id, for the panel's logs. */
  request_id?: string;
}

/** The wrapper of a successful API answer. */
export interface Envelope<T> {
  /** The payload. */
  data: T;
  /** Extra information, such as paging. */
  meta?: Record<string, unknown>;
}

/** The actions the extension offers (a subset of POST /instances/<name>/actions/<action>). */
export type QuickAction = "start" | "pause" | "restart" | "update";
