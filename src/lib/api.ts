/**
 * A small client of the panel API: signed requests, the {"data", "meta"} envelope, RFC 9457 problem details, and
 * the 202 + job convention. No state of its own; the caller keeps the credentials.
 */

import { signedHeaders } from "./signing";
import type { Alert, Envelope, Instance, Job, Problem, Project, ProjectDetail, QuickAction } from "./types";

/** The credentials of one panel. */
export interface Credentials {
  /** The API token. */
  token: string;
  /** The signing secret that goes with the token. */
  secret: string;
}

/** The panel answered with an error status. */
export class ApiError extends Error {
  /** The HTTP status code. */
  readonly status: number;
  /** The problem's title, or "HTTP <status>". */
  readonly title: string;
  /** The problem's explanation, or null. */
  readonly detail: string | null;
  /** The request's id from the problem or the X-Request-ID header, or null. */
  readonly requestId: string | null;
  /** seconds, from Retry-After on 429 and 503 */
  readonly retryAfter: number | null;

  /**
   * Create the error.
   *
   * @param status - The HTTP status code.
   * @param problem - The problem details from the answer.
   * @param retryAfter - Seconds to wait, or null.
   * @param requestId - The X-Request-ID header, or null.
   */
  constructor(status: number, problem: Problem, retryAfter: number | null, requestId: string | null) {
    super(problem.detail || problem.title || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.title = problem.title ?? `HTTP ${status}`;
    this.detail = problem.detail ?? null;
    this.requestId = problem.request_id ?? requestId;
    this.retryAfter = retryAfter;
  }
}

/** The panel could not be reached at all (network, DNS, TLS, timeout). */
export class UnreachableError extends Error {
  /**
   * Create the error.
   *
   * @param cause - The error that was thrown by the network call.
   */
  constructor(cause: unknown) {
    super("The panel cannot be reached.");
    this.name = "UnreachableError";
    this.cause = cause;
  }
}

/** A branch name may contain "/": each part is encoded, the slashes are kept (PANEL_API.md, Projects). */
export const encodeBranch = (branch: string): string => branch.split("/").map(encodeURIComponent).join("/");

/** Accepts "panel.example.com", "https://panel.example.com/i/x" ...; gives the origin, or null when not usable.
 *  http is allowed only for this computer (a local panel or the mock). */
export function normalizeOrigin(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    const bare = !/^[a-z][a-z0-9+.-]*:\/\//i.test(text);
    // a bare address is https, except this computer's own (a local panel or the mock)
    const scheme = bare && /^(localhost|127\.0\.0\.1|[\w-]+\.localhost)(:\d+)?(\/|$)/i.test(text) ? "http" : "https";
    url = new URL(bare ? `${scheme}://${text}` : text);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".localhost");
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) return url.origin;
  return null;
}

/** The shape of `fetch`, so tests can replace it. */
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Options of `PanelClient`. */
export interface ClientOptions {
  /** The function that makes the HTTP call; the global `fetch` by default. */
  fetch?: FetchLike;
  /** How long to wait for an answer, in milliseconds; 15000 by default. */
  timeoutMs?: number;
  /** The user a request acts for (X-Sudoo-Acting-For), when given. */
  actingFor?: string;
}

/** A client of one panel's API. */
export class PanelClient {
  /** The panel's origin, without a trailing slash. */
  readonly origin: string;
  private readonly credentials: Credentials;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly actingFor: string | undefined;

  /**
   * Create the client.
   *
   * @param origin - The panel's origin.
   * @param credentials - The token and secret.
   * @param options - Optional settings.
   */
  constructor(origin: string, credentials: Credentials, options: ClientOptions = {}) {
    this.origin = origin.replace(/\/+$/, "");
    this.credentials = credentials;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.actingFor = options.actingFor;
  }

  /** One signed call. `path` starts with /api/v1. Answers the parsed body, or null for 204. */
  async request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T | null }> {
    const text = body === undefined ? "" : JSON.stringify(body);
    const headers = await signedHeaders(this.credentials, { method, path, body: text, actingFor: this.actingFor });
    headers.Accept = "application/json";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.origin + path, {
        method,
        headers,
        body: text || undefined,
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
      });
    } catch (error) {
      throw new UnreachableError(error);
    } finally {
      clearTimeout(timer);
    }
    const requestId = response.headers.get("X-Request-ID");
    if (!response.ok) {
      let problem: Problem = {};
      try {
        problem = (await response.json()) as Problem;
      } catch {
        // not JSON (a proxy's page): the status says enough
      }
      const retry = Number(response.headers.get("Retry-After"));
      throw new ApiError(response.status, problem, Number.isFinite(retry) && retry > 0 ? retry : null, requestId);
    }
    if (response.status === 204) return { status: 204, body: null };
    return { status: response.status, body: (await response.json()) as T };
  }

  /**
   * Read a resource.
   *
   * @param path - The path, starting with /api/v1.
   * @returns The envelope.
   */
  async get<T>(path: string): Promise<Envelope<T>> {
    const answer = await this.request<Envelope<T>>("GET", path);
    if (!answer.body) throw new ApiError(answer.status, { title: "Empty answer" }, null, null);
    return answer.body;
  }

  /**
   * Send a POST request.
   *
   * @param path - The path, starting with /api/v1.
   * @param body - The JSON body; an empty object by default.
   * @returns The envelope.
   */
  async post<T>(path: string, body: unknown = {}): Promise<Envelope<T>> {
    const answer = await this.request<Envelope<T>>("POST", path, body);
    if (!answer.body) throw new ApiError(answer.status, { title: "Empty answer" }, null, null);
    return answer.body;
  }

  /** Every instance, following the pages of the list. */
  async instances(): Promise<Instance[]> {
    const all: Instance[] = [];
    const limit = 500;
    for (let offset = 0; offset < 10000; offset += limit) {
      const page = await this.get<Instance[]>(`/api/v1/instances?limit=${limit}&offset=${offset}`);
      all.push(...page.data);
      const total = Number(page.meta?.total ?? all.length);
      if (page.data.length < limit || all.length >= total) break;
    }
    return all;
  }

  /**
   * Read one instance.
   *
   * @param name - The instance's name.
   * @returns The instance.
   */
  async instance(name: string): Promise<Instance> {
    return (await this.get<Instance>(`/api/v1/instances/${encodeURIComponent(name)}`)).data;
  }

  /**
   * Read the projects.
   *
   * @returns The projects.
   */
  async projects(): Promise<Project[]> {
    return (await this.get<Project[]>("/api/v1/projects")).data;
  }

  /**
   * Read one project.
   *
   * @param id - The project's id.
   * @returns The project with its branches, and the default branch from the answer's meta, or null.
   */
  async project(id: string): Promise<{ project: ProjectDetail; defaultBranch: string | null }> {
    const answer = await this.get<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(id)}`);
    const defaultBranch = answer.meta?.default_branch;
    return { project: answer.data, defaultBranch: typeof defaultBranch === "string" ? defaultBranch : null };
  }

  /** start, pause, restart, update (Get latest code). A production pause needs confirm_production. */
  async action(name: string, action: QuickAction, production = false): Promise<Job> {
    const body = production && action === "pause" ? { confirm_production: true } : {};
    return (await this.post<Job>(`/api/v1/instances/${encodeURIComponent(name)}/actions/${action}`, body)).data;
  }

  /**
   * Read one job.
   *
   * @param id - The job's id.
   * @returns The job.
   */
  async job(id: string): Promise<Job> {
    return (await this.get<Job>(`/api/v1/jobs/${encodeURIComponent(id)}`)).data;
  }

  /**
   * Read the latest jobs.
   *
   * @param limit - How many to read.
   * @returns The jobs.
   */
  async jobs(limit = 30): Promise<Job[]> {
    return (await this.get<Job[]>(`/api/v1/jobs?limit=${limit}`)).data;
  }

  /**
   * Read the latest alerts.
   *
   * @param limit - How many to read.
   * @returns The alerts.
   */
  async alerts(limit = 20): Promise<Alert[]> {
    return (await this.get<Alert[]>(`/api/v1/alerts?limit=${limit}`)).data;
  }

  /** A development instance of a branch, through its project (the branch's stage, the project's version). */
  async createBranchInstance(projectId: string, branch: string): Promise<Job> {
    const path = `/api/v1/projects/${encodeURIComponent(projectId)}/branches/${encodeBranch(branch)}/instances`;
    return (await this.post<Job>(path, {})).data;
  }

  /** The same through POST /instances, for tokens that may not use projects (the instances scope). */
  async createInstance(fields: {
    repo: string;
    branch: string;
    version: string;
    edition: string;
    stage: "development";
  }): Promise<Job> {
    return (await this.post<Job>("/api/v1/instances", { ...fields, install_modules: true })).data;
  }

  /** The panel's version, when the token may read it. */
  async server(): Promise<{ version?: string }> {
    return (await this.get<{ version?: string }>("/api/v1/server")).data;
  }
}

/** Links into the panel's web app. */
export const panelLinks = {
  /** The address of an instance in the panel. */
  instance: (origin: string, name: string) => `${origin}/i/${encodeURIComponent(name)}`,
  /** The address of an instance's logs. */
  logs: (origin: string, name: string) => `${origin}/i/${encodeURIComponent(name)}/logs`,
  /** The address of an instance's activity. */
  activity: (origin: string, name: string) => `${origin}/i/${encodeURIComponent(name)}/activity`,
  /** The address of a project. */
  project: (origin: string, id: string) => `${origin}/projects/${encodeURIComponent(id)}`,
  /** The address of a path in the panel; the origin alone when the path does not start with "/". */
  path: (origin: string, path: string) => (path.startsWith("/") ? origin + path : origin),
};
