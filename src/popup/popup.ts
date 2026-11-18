/** The toolbar popup: every connected panel with its projects and instances, quick actions and their jobs. */

import { ApiError, panelLinks } from "../lib/api";
import {
  clientFor,
  hasHostPermission,
  lastPanelData,
  loadPanelData,
  type PanelData,
  type PanelProblem,
  problemOf,
} from "../lib/data";
import { h, icon, iconButton, iconLink, toast } from "../lib/dom";
import { applyLocale, pickLocale, type Words } from "../lib/i18n";
import { actionsFor, byStage, instanceForUrl, matchesQuery, stateGroup } from "../lib/match";
import type { PageRequest } from "../lib/messages";
import { getPanels, getSettings, lockState, type PanelConfig, unlock } from "../lib/store";
import type { Instance, Job, Project, QuickAction } from "../lib/types";

interface PanelView {
  panel: PanelConfig;
  data: PanelData | null;
  problem: PanelProblem | null;
  loading: boolean;
}

interface RunningJob {
  action: string;
  status: Job["status"];
  progress: number | null;
  error: string | null;
}

const state = {
  views: [] as PanelView[],
  query: "",
  tabUrl: null as string | null,
  locked: false,
  confirming: null as string | null,
  jobs: new Map<string, RunningJob>(),
};

let w: Words;
const main = document.querySelector("main") as HTMLElement;
const keyOf = (panelId: string, name: string) => `${panelId}|${name}`;

async function start(): Promise<void> {
  const settings = await getSettings();
  w = applyLocale(document, pickLocale(settings.locale, chrome.i18n.getUILanguage()));
  document.title = "Sudoo.sh";
  const search = document.getElementById("search") as HTMLInputElement;
  search.placeholder = w.popup.searchLabel;
  search.setAttribute("aria-label", w.popup.searchLabel);
  search.addEventListener("input", () => {
    state.query = search.value;
    render();
  });
  document.querySelector(".search")?.prepend(icon("search"));
  const tools = document.querySelector(".brand-tools") as HTMLElement;
  tools.append(
    iconButton("refresh", w.common.refresh, { onclick: () => void refreshAll(0) }),
    iconButton("settings", w.common.settings, { onclick: () => void chrome.runtime.openOptionsPage() }),
  );

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  state.tabUrl = tab?.url ?? null;
  state.locked = (await lockState()).locked;
  state.views = (await getPanels()).map((panel) => ({ panel, data: null, problem: null, loading: true }));
  for (const view of state.views) view.data = await lastPanelData(view.panel);
  render();
  await refreshAll(5000);
  search.focus();
}

async function refreshAll(maxAgeMs: number): Promise<void> {
  await Promise.all(state.views.map((view) => refresh(view, maxAgeMs)));
}

async function refresh(view: PanelView, maxAgeMs: number): Promise<void> {
  view.loading = true;
  if (!(await hasHostPermission(view.panel.origin))) {
    view.problem = "no-permission";
    view.loading = false;
    render();
    return;
  }
  const client = await clientFor(view.panel);
  if (!client) {
    view.problem = "no-token";
    view.loading = false;
    render();
    return;
  }
  try {
    view.data = await loadPanelData(view.panel, client, maxAgeMs);
    view.problem = null;
  } catch (error) {
    view.problem = problemOf(error);
  }
  view.loading = false;
  render();
}

// ---- actions --------------------------------------------------------------------------------------------------

const ACTION_WORDS = (action: QuickAction) =>
  ({ start: w.actions.start, pause: w.actions.pause, restart: w.actions.restart, update: w.actions.update })[action];

async function run(view: PanelView, instance: Instance, action: QuickAction): Promise<void> {
  const key = keyOf(view.panel.id, instance.name);
  const production = instance.stage === "production";
  if (production && state.confirming !== `${key}|${action}`) {
    state.confirming = `${key}|${action}`;
    render();
    return;
  }
  state.confirming = null;
  const client = await clientFor(view.panel);
  if (!client) return;
  const label = ACTION_WORDS(action);
  state.jobs.set(key, { action: label, status: "queued", progress: null, error: null });
  render();
  try {
    const job = await client.action(instance.name, action, production);
    const message: PageRequest = {
      type: "track-job",
      panelId: view.panel.id,
      jobId: job.id,
      action: job.action,
      instance: instance.name,
    };
    void chrome.runtime.sendMessage(message).catch(() => undefined);
    toast(w.popup.jobStarted(label));
    await follow(view, key, job.id, label);
  } catch (error) {
    state.jobs.delete(key);
    render();
    toast(errorText(error));
  }
}

async function follow(view: PanelView, key: string, jobId: string, label: string): Promise<void> {
  const client = await clientFor(view.panel);
  if (!client) return;
  for (let i = 0; i < 600; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const job = await client.job(jobId);
      state.jobs.set(key, { action: label, status: job.status, progress: job.progress_percent, error: job.error });
      render();
      if (job.status === "success" || job.status === "failed") {
        toast(job.status === "success" ? w.popup.jobDone(label) : w.popup.jobFailed(label));
        await refresh(view, 0);
        if (job.status === "success") state.jobs.delete(key);
        render();
        return;
      }
    } catch {
      // a missed poll: try again
    }
  }
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return w.popup.tokenRefused;
    if (error.status === 403) return error.detail ?? w.popup.forbidden;
    return error.detail ?? error.title;
  }
  if (error instanceof Error && error.name === "UnreachableError") return w.common.unreachable;
  return w.common.error;
}

// ---- drawing --------------------------------------------------------------------------------------------------

function render(): void {
  const parts: Node[] = [];
  if (state.locked) parts.push(unlockCard());
  if (!state.views.length) {
    parts.push(
      h(
        "section",
        { class: "empty" },
        h("img", { src: "../icons/icon-128.png", width: "40", height: "40", alt: "" }),
        h("h1", {}, w.popup.emptyTitle),
        h("p", {}, w.popup.emptyText),
        h(
          "button",
          { type: "button", class: "button primary", onclick: () => void chrome.runtime.openOptionsPage() },
          w.popup.connect,
        ),
      ),
    );
  }
  const here = hereCard();
  if (here) parts.push(here);
  for (const view of state.views) parts.push(panelSection(view));
  main.replaceChildren(...parts);
}

function unlockCard(): HTMLElement {
  const input = h("input", {
    class: "input",
    type: "password",
    autocomplete: "current-password",
    "aria-label": w.popup.passphrase,
    placeholder: w.popup.passphrase,
  });
  const form = h(
    "form",
    {
      onsubmit: async (event: Event) => {
        event.preventDefault();
        if (await unlock(input.value)) {
          state.locked = false;
          await refreshAll(0);
        } else {
          toast(w.popup.wrongPassphrase);
          input.select();
        }
      },
    },
    input,
    h("button", { type: "submit", class: "button primary" }, w.popup.unlock),
  );
  return h("section", { class: "notice unlock" }, h("span", {}, w.popup.locked), form);
}

function hereCard(): HTMLElement | null {
  if (!state.tabUrl) return null;
  for (const view of state.views) {
    const instance = view.data ? instanceForUrl(view.data.instances, state.tabUrl) : null;
    if (!instance) continue;
    const origin = view.panel.origin;
    return h(
      "section",
      { class: "group here-card", "aria-label": w.popup.thisTab },
      h("div", { class: "group-head" }, h("strong", {}, w.popup.thisTab), h("span", {}, view.panel.label)),
      instanceRow(view, instance, true),
      h(
        "div",
        { class: "here-links" },
        h(
          "a",
          {
            class: "button",
            href: panelLinks.instance(origin, instance.name),
            target: "_blank",
            rel: "noopener noreferrer",
          },
          w.actions.openInPanel,
        ),
        h(
          "button",
          {
            type: "button",
            class: "button",
            disabled: !actionsFor(instance).restart,
            onclick: () => void run(view, instance, "restart"),
          },
          w.actions.restart,
        ),
        h(
          "a",
          {
            class: "button",
            href: panelLinks.logs(origin, instance.name),
            target: "_blank",
            rel: "noopener noreferrer",
          },
          w.actions.logs,
        ),
      ),
    );
  }
  return null;
}

function panelSection(view: PanelView): HTMLElement {
  const { panel, data } = view;
  const instances = (data?.instances ?? []).filter((i) => matchesQuery(i, state.query, panel.label));
  const head = h(
    "div",
    { class: "panel-head" },
    h("h2", {}, panel.label),
    h("span", { class: "muted" }, new URL(panel.origin).host),
    h("span", { class: "count" }, data ? w.popup.instances(data.instances.length) : ""),
  );
  const section = h("section", { class: "panel-section", "aria-busy": view.loading ? "true" : "false" }, head);
  if (view.problem) section.append(problemNotice(view));
  if (!data) {
    if (view.loading)
      section.append(
        h("div", { class: "progress indeterminate", role: "progressbar", "aria-label": panel.label }, h("span")),
      );
    return section;
  }
  if (!data.instances.length) {
    section.append(h("div", { class: "notice" }, w.popup.noInstances));
    return section;
  }
  if (!instances.length) {
    section.append(h("div", { class: "notice" }, w.popup.noMatch));
    return section;
  }
  for (const group of groups(data.projects, instances)) {
    const box = h("div", { class: "group" });
    const title = group.project ? group.project.name : w.popup.plain;
    const headLine = h("div", { class: "group-head" }, h("strong", {}, title));
    if (group.project) {
      headLine.append(
        h(
          "span",
          { class: "mono repo", title: group.project.repository.full_name },
          group.project.repository.full_name,
        ),
      );
      headLine.append(
        h(
          "a",
          { href: panelLinks.project(panel.origin, group.project.id), target: "_blank", rel: "noopener noreferrer" },
          w.actions.openInPanel,
        ),
      );
    }
    box.append(headLine);
    for (const instance of group.instances) box.append(instanceRow(view, instance, false));
    section.append(box);
  }
  return section;
}

function groups(
  projects: Project[] | null,
  instances: Instance[],
): { project: Project | null; instances: Instance[] }[] {
  const byId = new Map<string, { project: Project | null; instances: Instance[] }>();
  for (const instance of instances) {
    const id = instance.project?.id ?? "";
    if (!byId.has(id)) {
      const project =
        projects?.find((p) => p.id === id) ??
        (instance.project
          ? ({
              id,
              name: instance.project.name,
              repository: {
                full_name: (instance.git.repository ?? "").replace(/^https:\/\/github\.com\//, ""),
                url: instance.git.repository ?? "",
              },
              odoo: instance.odoo,
            } as Project)
          : null);
      byId.set(id, { project, instances: [] });
    }
    byId.get(id)?.instances.push(instance);
  }
  return [...byId.values()]
    .map((g) => ({ ...g, instances: g.instances.sort(byStage) }))
    .sort((a, b) => (a.project ? (b.project ? a.project.name.localeCompare(b.project.name) : -1) : 1));
}

function instanceRow(view: PanelView, instance: Instance, here: boolean): HTMLElement {
  const key = keyOf(view.panel.id, instance.name);
  const running = state.jobs.get(key);
  const serverJob = instance.current_job;
  const can = actionsFor(instance);
  const busy = running !== undefined && running.status !== "success" && running.status !== "failed";
  const group = busy ? "working" : stateGroup(instance.status);
  const pending = state.confirming?.startsWith(`${key}|`) ? (state.confirming.split("|")[2] as QuickAction) : null;

  const actionButton = (action: QuickAction, iconName: "play" | "pause" | "restart" | "update", allowed: boolean) =>
    iconButton(iconName, pending === action ? w.actions.confirmProduction : ACTION_WORDS(action), {
      class: `icon-button${pending === action ? " confirming" : ""}`,
      disabled: !allowed || busy,
      onclick: () => void run(view, instance, action),
    });

  const tools = h("div", { class: "tools" });
  if (instance.url) tools.append(iconLink("external", w.actions.openOdoo, instance.url, "flip"));
  if (!here)
    tools.append(iconLink("panel", w.actions.openInPanel, panelLinks.instance(view.panel.origin, instance.name)));
  if (can.start || !can.pause) tools.append(actionButton("start", "play", can.start));
  else tools.append(actionButton("pause", "pause", can.pause));
  tools.append(actionButton("restart", "restart", can.restart));
  if (instance.source !== "plain") tools.append(actionButton("update", "update", can.update));

  const row = h(
    "div",
    { class: `instance${here ? " here" : ""}` },
    h(
      "div",
      { class: "line" },
      h("span", { class: `dot ${group}`, "aria-hidden": "true" }),
      h("span", { class: "name", title: instance.name }, instance.name),
      tools,
    ),
    h(
      "div",
      { class: "meta" },
      h("span", { class: `stage ${instance.stage}` }, w.stages[instance.stage]),
      instance.git.branch ? h("span", { class: "mono", title: instance.git.branch }, instance.git.branch) : null,
      instance.git.branch ? h("span", { "aria-hidden": "true" }, "·") : null,
      h("span", {}, w.status[instance.status] ?? instance.status),
      h("span", { "aria-hidden": "true" }, "·"),
      h("span", {}, `Odoo ${instance.odoo.version}`),
    ),
  );
  if (pending) row.append(h("div", { class: "confirm-note", role: "status" }, w.actions.confirmProduction));
  const shown =
    running ??
    (serverJob
      ? {
          action: serverJob.action,
          status: serverJob.status,
          progress: serverJob.progress_percent,
          error: serverJob.error,
        }
      : null);
  if (shown && (shown.status === "queued" || shown.status === "running" || shown.status === "failed")) {
    const bar =
      shown.status === "failed"
        ? null
        : shown.progress === null
          ? h("div", { class: "progress indeterminate" }, h("span"))
          : progressBar(shown.progress);
    row.append(
      h(
        "div",
        { class: `job${shown.status === "failed" ? " failed" : ""}`, role: "status" },
        h(
          "span",
          {},
          shown.status === "failed"
            ? (shown.error ?? w.popup.jobFailed(shown.action))
            : `${shown.action} · ${w.jobStatus[shown.status]}${shown.progress !== null ? ` ${shown.progress}%` : ""}`,
        ),
        bar,
      ),
    );
  }
  return row;
}

/** Set through the CSSOM: the pages' CSP allows no inline style attributes. */
function progressBar(percent: number): HTMLElement {
  const fill = h("span");
  fill.style.transform = `scaleX(${Math.max(0.04, percent / 100)})`;
  return h(
    "div",
    {
      class: "progress",
      role: "progressbar",
      "aria-valuenow": String(percent),
      "aria-valuemin": "0",
      "aria-valuemax": "100",
    },
    fill,
  );
}

function problemNotice(view: PanelView): HTMLElement {
  const openOptions = () => void chrome.runtime.openOptionsPage();
  switch (view.problem) {
    case "no-token":
      return h(
        "div",
        { class: "notice" },
        h("span", {}, w.popup.needsToken),
        state.locked
          ? null
          : h("button", { type: "button", class: "button", onclick: openOptions }, w.popup.enterToken),
      );
    case "no-permission":
      return h(
        "div",
        { class: "notice" },
        h("span", {}, w.popup.needsPermission),
        h("button", { type: "button", class: "button", onclick: openOptions }, w.popup.allow),
      );
    case "token-refused":
      return h("div", { class: "notice error" }, w.popup.tokenRefused);
    case "unreachable":
      return h("div", { class: "notice error" }, w.common.unreachable);
    default:
      return h("div", { class: "notice error" }, w.common.error);
  }
}

void start();
