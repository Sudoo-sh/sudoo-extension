/**
 * The service worker: answers the GitHub box, follows jobs and alerts for notifications (only when the person turned
 * them on), and registers the GitHub content script only when github.com access was granted. It never touches an
 * Odoo page.
 */

import { ApiError, type PanelClient } from "./lib/api";
import { clientFor, hasHostPermission, loadPanelData, loadProjectDetail } from "./lib/data";
import { buildMatch, projectFor, versionFor } from "./lib/github";
import { pickLocale, wordsFor } from "./lib/i18n";
import { instancesOfRepo } from "./lib/match";
import type {
  GitHubCreateAnswer,
  GitHubJobAnswer,
  GitHubLookupAnswer,
  GitHubMatch,
  GitHubRequest,
  PageRequest,
} from "./lib/messages";
import { getPanels, getSettings, type PanelConfig } from "./lib/store";

/** The match pattern of GitHub pages. */
const GITHUB = "https://github.com/*";
/** The id of the registered GitHub content script. */
const SCRIPT_ID = "sudoo-github";
/** The name of the alarm that starts polling. */
const POLL_ALARM = "sudoo-poll";

// ---- the GitHub content script ----------------------------------------------------------------------------

/** Register the GitHub content script when the setting is on and github.com access is granted; remove it otherwise. */
async function syncGitHubScript(): Promise<void> {
  const settings = await getSettings();
  const granted = await chrome.permissions.contains({ origins: [GITHUB] }).catch(() => false);
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] }).catch(() => []);
  if (settings.github && granted) {
    if (!registered.length) {
      await chrome.scripting.registerContentScripts([
        {
          id: SCRIPT_ID,
          matches: [GITHUB],
          js: ["content/github.js"],
          runAt: "document_idle",
          persistAcrossSessions: true,
        },
      ]);
    }
  } else if (registered.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  }
}

// ---- notifications -----------------------------------------------------------------------------------------

/** Create the polling alarm (every minute) when notifications are on; clear it otherwise. */
async function syncAlarm(): Promise<void> {
  const settings = await getSettings();
  if (settings.notifications) {
    if (!(await chrome.alarms.get(POLL_ALARM))) await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
  } else {
    await chrome.alarms.clear(POLL_ALARM);
  }
}

/** A job started from the extension, followed until it ends. */
interface Tracked {
  /** The panel's id. */
  panelId: string;
  /** The job's id. */
  jobId: string;
  /** The action's name. */
  action: string;
  /** The instance's name, or null. */
  instance: string | null;
}

/** How polling one panel is going. */
interface PollState {
  /** How many polls failed in a row. */
  failures: number;
  /** The earliest time of the next poll, in milliseconds since 1970. */
  nextAt: number;
  /** Set when the token may not read alerts, so they are not asked for again. */
  alertsForbidden?: boolean;
}

/**
 * Read a value from the storage in memory.
 *
 * @param key - The key.
 * @param fallback - The value when nothing is stored.
 * @returns The stored value, or the fallback.
 */
async function sessionGet<T>(key: string, fallback: T): Promise<T> {
  return ((await chrome.storage.session.get(key))[key] as T | undefined) ?? fallback;
}

/**
 * Remember a job to follow.
 *
 * @param job - The job.
 */
async function track(job: Tracked): Promise<void> {
  const tracked = await sessionGet<Record<string, Tracked>>("tracked", {});
  tracked[`${job.panelId}|${job.jobId}`] = job;
  await chrome.storage.session.set({ tracked });
}

/**
 * Show a notification and remember the address to open when it is clicked.
 *
 * @param id - The notification's id.
 * @param title - The title.
 * @param message - The text; cut to 300 characters.
 * @param url - The address to open on click, or null.
 */
async function notify(id: string, title: string, message: string, url: string | null): Promise<void> {
  if (!chrome.notifications) return; // the optional permission was not granted
  const links = await sessionGet<Record<string, string>>("notificationLinks", {});
  if (url) links[id] = url;
  await chrome.storage.session.set({ notificationLinks: links });
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
    title,
    message: message.slice(0, 300),
  });
}

/**
 * Check one panel for finished jobs and new alerts, and notify about them.
 *
 * @param panel - The saved panel.
 * @param client - The API client.
 * @param state - The panel's polling state; updated when alerts are not allowed.
 */
async function pollPanel(panel: PanelConfig, client: PanelClient, state: PollState): Promise<void> {
  const settings = await getSettings();
  const words = wordsFor(pickLocale(settings.locale, chrome.i18n.getUILanguage()));
  const tracked = await sessionGet<Record<string, Tracked>>("tracked", {});

  const announce = async (job: {
    id: string;
    action: string;
    instance: string | null;
    status: string;
    error: string | null;
  }) => {
    const name = job.instance ?? panel.label;
    const failed = job.status === "failed";
    await notify(
      `job:${panel.id}:${job.id}`,
      failed ? words.notify.jobFailed(job.action, name) : words.notify.jobSuccess(job.action, name),
      failed ? (job.error ?? "") : panel.label,
      job.instance ? `${panel.origin}/i/${encodeURIComponent(job.instance)}/activity` : panel.origin,
    );
  };

  if (settings.notifyJobs === "all") {
    const key = `seenJobs:${panel.id}`;
    const seen = await sessionGet<string[] | null>(key, null);
    const jobs = await client.jobs(30).catch((error: unknown) => {
      // an instances token may follow only its own jobs: those are tracked below
      if (error instanceof ApiError && error.status === 403) return null;
      throw error;
    });
    const finished = (jobs ?? []).filter((job) => job.status === "success" || job.status === "failed");
    if (seen && jobs) for (const job of finished) if (!seen.includes(job.id)) await announce(job);
    if (jobs) await chrome.storage.session.set({ [key]: finished.map((job) => job.id).slice(0, 200) });
    for (const job of finished) delete tracked[`${panel.id}|${job.id}`];
  }
  for (const [key, item] of Object.entries(tracked)) {
    if (item.panelId !== panel.id) continue;
    try {
      const job = await client.job(item.jobId);
      if (job.status === "success" || job.status === "failed") {
        await announce(job);
        delete tracked[key];
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) delete tracked[key];
      else throw error;
    }
  }
  await chrome.storage.session.set({ tracked });

  if (settings.notifyAlerts && !state.alertsForbidden) {
    try {
      const key = `seenAlerts:${panel.id}`;
      const since = await sessionGet<number | null>(key, null);
      const alerts = await client.alerts(20);
      const newest = Math.max(since ?? 0, ...alerts.map((alert) => alert.last_at));
      if (since !== null) {
        for (const alert of alerts) {
          if (alert.last_at > since && alert.severity !== "info") {
            await notify(
              `alert:${panel.id}:${alert.id}:${alert.last_at}`,
              alert.title,
              alert.text,
              alert.link ? panel.origin + alert.link : panel.origin,
            );
          }
        }
      }
      await chrome.storage.session.set({ [key]: newest });
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) state.alertsForbidden = true;
      else throw error;
    }
  }
}

/** Each panel is asked at most once a minute; after a failure it waits 2, 4, 8 ... up to 30 minutes. */
async function pollAll(): Promise<void> {
  const settings = await getSettings();
  if (!settings.notifications) return;
  const states = await sessionGet<Record<string, PollState>>("pollState", {});
  const now = Date.now();
  for (const panel of await getPanels()) {
    const state = states[panel.id] ?? { failures: 0, nextAt: 0 };
    if (now < state.nextAt) continue;
    const client = await clientFor(panel);
    if (!client || !(await hasHostPermission(panel.origin))) continue;
    try {
      await pollPanel(panel, client, state);
      state.failures = 0;
      state.nextAt = 0;
    } catch (error) {
      state.failures += 1;
      const wait = error instanceof ApiError && error.retryAfter ? error.retryAfter * 1000 : 0;
      state.nextAt = now + Math.max(wait, Math.min(2 ** state.failures, 30) * 60000);
    }
    states[panel.id] = state;
  }
  await chrome.storage.session.set({ pollState: states });
}

// ---- the GitHub box ------------------------------------------------------------------------------------------

/**
 * Answer the GitHub box: collect what each connected panel knows about the page.
 *
 * @param request - The lookup request.
 * @returns The matches and the language. A panel that cannot be read is left out.
 */
async function lookup(request: Extract<GitHubRequest, { type: "github:lookup" }>): Promise<GitHubLookupAnswer> {
  const settings = await getSettings();
  const matches: GitHubMatch[] = [];
  for (const panel of await getPanels()) {
    const client = await clientFor(panel);
    if (!client || !(await hasHostPermission(panel.origin))) continue;
    try {
      const data = await loadPanelData(panel, client, 30000);
      const project = projectFor(data.projects, request.repo);
      const detail = project ? await loadProjectDetail(panel, client, project.id) : null;
      const match = buildMatch(panel, request, data.instances, project, detail);
      if (match) matches.push(match);
    } catch {
      // a panel that cannot be read now is left out of the box
    }
  }
  return { ok: true, matches, locale: pickLocale(settings.locale, chrome.i18n.getUILanguage()) };
}

/**
 * Create a development instance for a branch and follow its job.
 *
 * The project route is tried first; when the token may not use projects, the plain route with the repository and branch
 * is used.
 *
 * @param request - The create request.
 * @returns The job's id and instance, or an error text.
 */
async function create(request: Extract<GitHubRequest, { type: "github:create" }>): Promise<GitHubCreateAnswer> {
  const panel = (await getPanels()).find((p) => p.id === request.panelId);
  const client = panel ? await clientFor(panel) : null;
  if (!panel || !client) return { ok: false, error: "no-token" };
  try {
    const data = await loadPanelData(panel, client, 30000);
    const project = projectFor(data.projects, request.repo);
    let job: Awaited<ReturnType<PanelClient["createBranchInstance"]>>;
    try {
      if (!project) throw new ApiError(403, { title: "Forbidden" }, null, null);
      job = await client.createBranchInstance(project.id, request.branch);
    } catch (error) {
      // an instances token may not use projects: create it the plain way, from the repository and branch
      if (!(error instanceof ApiError && error.status === 403)) throw error;
      const ofRepo = instancesOfRepo(data.instances, request.repo);
      const version = versionFor(project, ofRepo);
      const repoUrl = project?.repository.url ?? ofRepo[0]?.git.repository;
      if (!version || !repoUrl) throw error;
      job = await client.createInstance({ repo: repoUrl, branch: request.branch, ...version, stage: "development" });
    }
    await chrome.storage.session.remove(`cache:${panel.id}:data`);
    await track({ panelId: panel.id, jobId: job.id, action: job.action, instance: job.instance });
    return { ok: true, jobId: job.id, instance: job.instance };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Read the state of a job for the GitHub box.
 *
 * @param request - The job request.
 * @returns The job's state, progress and error, or a failure.
 */
async function jobStatus(request: Extract<GitHubRequest, { type: "github:job" }>): Promise<GitHubJobAnswer> {
  const panel = (await getPanels()).find((p) => p.id === request.panelId);
  const client = panel ? await clientFor(panel) : null;
  if (!panel || !client) return { ok: false };
  try {
    const job = await client.job(request.jobId);
    if (job.status === "success" || job.status === "failed")
      await chrome.storage.session.remove(`cache:${panel.id}:data`);
    return { ok: true, status: job.status, progress: job.progress_percent, error: job.error };
  } catch {
    return { ok: false };
  }
}

// ---- wiring --------------------------------------------------------------------------------------------------

/**
 * Tell whether a message came from this extension's content script on github.com.
 *
 * @param sender - The sender.
 * @returns True when it did.
 */
const fromGitHub = (sender: chrome.runtime.MessageSender) =>
  sender.id === chrome.runtime.id && sender.tab !== undefined && (sender.url ?? "").startsWith("https://github.com/");
/**
 * Tell whether a message came from one of this extension's own pages.
 *
 * @param sender - The sender.
 * @returns True when it did.
 */
const fromExtensionPage = (sender: chrome.runtime.MessageSender) =>
  sender.id === chrome.runtime.id && (sender.url ?? "").startsWith(chrome.runtime.getURL(""));

chrome.runtime.onMessage.addListener((message: GitHubRequest | PageRequest, sender, sendResponse) => {
  let work: Promise<unknown> | null = null;
  if (fromGitHub(sender)) {
    if (message.type === "github:lookup") work = lookup(message);
    else if (message.type === "github:create") work = create(message);
    else if (message.type === "github:job") work = jobStatus(message);
  } else if (fromExtensionPage(sender)) {
    if (message.type === "track-job") work = track(message).then(() => ({ ok: true }));
    else if (message.type === "settings-changed")
      work = Promise.all([syncGitHubScript(), syncAlarm()]).then(() => ({ ok: true }));
  }
  if (!work) return false;
  work.then(sendResponse, () => sendResponse({ ok: false }));
  return true; // answered later
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) void pollAll();
});

chrome.notifications?.onClicked.addListener(async (id) => {
  const links = await sessionGet<Record<string, string>>("notificationLinks", {});
  const url = links[id];
  if (url) await chrome.tabs.create({ url });
  chrome.notifications.clear(id);
});

chrome.permissions.onAdded.addListener(() => void syncGitHubScript());
chrome.permissions.onRemoved.addListener(() => void syncGitHubScript());
chrome.runtime.onInstalled.addListener(() => {
  void syncGitHubScript();
  void syncAlarm();
});
chrome.runtime.onStartup.addListener(() => {
  void syncGitHubScript();
  void syncAlarm();
});
