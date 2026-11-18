/**
 * A small client of the panel API: signed requests, the {"data", "meta"} envelope, RFC 9457 problem details, and
 * the 202 + job convention. No state of its own; the caller keeps the credentials.
 */

import { signedHeaders } from "./signing";
import type { Alert, Envelope, Instance, Job, Problem, Project, ProjectDetail, QuickAction } from "./types";

export interface Credentials {
  token: string;
  secret: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string | null;
  readonly requestId: string | null;
  /** seconds, from Retry-After on 429 and 503 */
  readonly retryAfter: number | null;

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
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".localhost");
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) return url.origin;
  return null;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
  actingFor?: string;
}

export class PanelClient {
  readonly origin: string;
  private readonly credentials: Credentials;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly actingFor: string | undefined;

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

  async get<T>(path: string): Promise<Envelope<T>> {
    const answer = await this.request<Envelope<T>>("GET", path);
    if (!answer.body) throw new ApiError(answer.status, { title: "Empty answer" }, null, null);
    return answer.body;
  }

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

  async instance(name: string): Promise<Instance> {
    return (await this.get<Instance>(`/api/v1/instances/${encodeURIComponent(name)}`)).data;
  }

  async projects(): Promise<Project[]> {
    return (await this.get<Project[]>("/api/v1/projects")).data;
  }

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

  async job(id: string): Promise<Job> {
    return (await this.get<Job>(`/api/v1/jobs/${encodeURIComponent(id)}`)).data;
  }

  async jobs(limit = 30): Promise<Job[]> {
    return (await this.get<Job[]>(`/api/v1/jobs?limit=${limit}`)).data;
  }

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
  instance: (origin: string, name: string) => `${origin}/i/${encodeURIComponent(name)}`,
  logs: (origin: string, name: string) => `${origin}/i/${encodeURIComponent(name)}/logs`,
  activity: (origin: string, name: string) => `${origin}/i/${encodeURIComponent(name)}/activity`,
  project: (origin: string, id: string) => `${origin}/projects/${encodeURIComponent(id)}`,
  path: (origin: string, path: string) => (path.startsWith("/") ? origin + path : origin),
};
