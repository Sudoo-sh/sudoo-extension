/** Reading a panel's projects and instances, shared by the popup and the service worker, with a short memory cache. */

import { ApiError, type Credentials, PanelClient } from "./api";
import { getCache, getCredentials, type PanelConfig, setCache } from "./store";
import type { Instance, Project, ProjectDetail } from "./types";

/** Why a panel could not be read. */
export type PanelProblem = "no-token" | "no-permission" | "token-refused" | "unreachable" | "error";

/** What is read from a panel. */
export interface PanelData {
  /** The panel's instances. */
  instances: Instance[];
  /** null when the token may not read projects (the instances scope) */
  projects: Project[] | null;
  /** When the data was read, in milliseconds since 1970. */
  at: number;
}

/**
 * Turn an origin into a host permission pattern.
 *
 * @param origin - The origin, for example "https://panel.example.com".
 * @returns The pattern, for example "https://panel.example.com/*".
 */
export const originPattern = (origin: string) => `${origin}/*`;

/**
 * Tell whether the extension may read an origin.
 *
 * @param origin - The panel's origin.
 * @returns True when the permission is granted; false when it is not or the check fails.
 */
export async function hasHostPermission(origin: string): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [originPattern(origin)] });
  } catch {
    return false;
  }
}

/**
 * Make an API client for a saved panel.
 *
 * @param panel - The saved panel.
 * @returns The client, or null when no credentials are saved for it.
 */
export async function clientFor(panel: PanelConfig): Promise<PanelClient | null> {
  const credentials: Credentials | null = await getCredentials(panel.id);
  return credentials ? new PanelClient(panel.origin, credentials) : null;
}

/**
 * Classify an error from reading a panel.
 *
 * @param error - The error thrown.
 * @returns "token-refused" for status 401, "unreachable" for an unreachable panel, otherwise "error".
 */
export function problemOf(error: unknown): PanelProblem {
  if (error instanceof ApiError) return error.status === 401 ? "token-refused" : "error";
  if (error instanceof Error && error.name === "UnreachableError") return "unreachable";
  return "error";
}

/** The panel's instances and projects; from the cache when it is younger than `maxAgeMs`. */
export async function loadPanelData(panel: PanelConfig, client: PanelClient, maxAgeMs = 15000): Promise<PanelData> {
  const key = `${panel.id}:data`;
  const cached = maxAgeMs > 0 ? await getCache<PanelData>(key, maxAgeMs) : null;
  if (cached) return cached;
  const [instances, projects] = await Promise.all([
    client.instances(),
    client.projects().catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 403) return null;
      throw error;
    }),
  ]);
  const data: PanelData = { instances, projects, at: Date.now() };
  await setCache(key, data);
  return data;
}

/** The last data read, however old, to draw the popup at once while a fresh copy loads. */
export const lastPanelData = (panel: PanelConfig) => getCache<PanelData>(`${panel.id}:data`, Number.POSITIVE_INFINITY);

/**
 * Read a project with its branches, using a cache of 60 seconds.
 *
 * @param panel - The saved panel.
 * @param client - The API client.
 * @param projectId - The project's id.
 * @returns The project and its default branch, or null when the token may not read it or it does not exist.
 */
export async function loadProjectDetail(
  panel: PanelConfig,
  client: PanelClient,
  projectId: string,
): Promise<{ project: ProjectDetail; defaultBranch: string | null } | null> {
  const key = `${panel.id}:project:${projectId}`;
  const cached = await getCache<{ project: ProjectDetail; defaultBranch: string | null }>(key, 60000);
  if (cached) return cached;
  try {
    const detail = await client.project(projectId);
    await setCache(key, detail);
    return detail;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
    throw error;
  }
}
