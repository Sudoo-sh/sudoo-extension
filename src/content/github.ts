/**
 * The small Sudoo.sh box on github.com, only on pages of repositories that are projects on a connected panel.
 * Registered by the service worker only after the person granted github.com access. It reads the page's address
 * (and, on a pull request, the head branch GitHub shows); it never sees a token. Drawn in a closed shadow root so
 * GitHub's styles and scripts cannot reach it.
 */

import { type Words, wordsFor } from "../lib/i18n";
import { parseGitHubPath, stateGroup } from "../lib/match";
import type {
  GitHubCreateAnswer,
  GitHubJobAnswer,
  GitHubLookupAnswer,
  GitHubMatch,
  GitHubRequest,
  InstanceSummary,
} from "../lib/messages";
import { CONTENT_CSS } from "./github-style";

/**
 * Send a request to the service worker.
 *
 * @param message - The request.
 * @returns The answer, or null when there is none or the extension was reloaded or removed.
 */
const send = <T>(message: GitHubRequest): Promise<T | null> =>
  chrome.runtime.sendMessage(message).then(
    (answer) => (answer ?? null) as T | null,
    () => null, // the extension was reloaded or removed
  );

/** The element that holds the shadow root, or null while the box is not shown. */
let host: HTMLElement | null = null;
/** The closed shadow root of the box, or null while the box is not shown. */
let root: ShadowRoot | null = null;
/** The address path the box was last drawn for; a new path causes a new draw. */
let lastKey = "";
/** Whether the card is open (true) or only the pill is shown (false). */
let expanded = false;
/** Counts draws, so an answer that arrives after the page changed can be ignored. */
let generation = 0;

/**
 * Make an element with attributes and children.
 *
 * @param tag - The tag name.
 * @param attrs - The attributes.
 * @param children - The children; text is added as text.
 * @returns The element.
 */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) if (child !== null) node.append(child);
  return node;
}

/** Only clicks a person made: a page script cannot press our buttons. */
function onPress(node: HTMLElement, handler: () => void): void {
  node.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    event.preventDefault();
    handler();
  });
}

/**
 * Make a link that opens in a new tab.
 *
 * @param href - The address.
 * @param text - The link text.
 * @param className - The class name.
 * @returns The link.
 */
function link(href: string, text: string, className: string): HTMLAnchorElement {
  const a = el("a", { href, target: "_blank", rel: "noopener noreferrer", class: className }, text);
  return a;
}

/**
 * Create the host element and its shadow root when they are missing, and set the text direction.
 *
 * @param dir - The text direction.
 * @returns The shadow root.
 */
function ensureHost(dir: "ltr" | "rtl"): ShadowRoot {
  if (!host?.isConnected) {
    host = el("div", { "data-sudoo": "" });
    root = host.attachShadow({ mode: "closed" });
    // a constructed sheet: not an inline <style>, so GitHub's content security policy has no say
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CONTENT_CSS);
    root.adoptedStyleSheets = [sheet];
    document.documentElement.append(host);
  }
  host.setAttribute("dir", dir);
  return root as ShadowRoot;
}

/** Take the box off the page. */
function remove(): void {
  host?.remove();
  host = null;
  root = null;
}

/**
 * Read the repositories the person chose to hide the box on.
 *
 * @returns The repositories' full names.
 */
async function hiddenRepos(): Promise<string[]> {
  const items = await chrome.storage.local.get("githubHidden");
  return (items.githubHidden as string[] | undefined) ?? [];
}

/**
 * Read the head branch of a pull request from the page.
 *
 * @returns The text GitHub shows ("owner:branch"), or null when it is not on the page.
 */
function readHeadRef(): string | null {
  const selectors = [".head-ref[title]", "span.commit-ref.head-ref", ".head-ref", '[data-testid="head-ref"]'];
  for (const selector of selectors) {
    const node = document.querySelector<HTMLElement>(selector);
    const text = node?.getAttribute("title") || node?.textContent;
    if (text?.trim()) return text.trim().replace(/^[\w.-]+\/[\w.-]+:/, (m) => `${m.split("/")[0]}:`);
  }
  return null;
}

/**
 * Make the row of one instance: its state, name, stage, job or status, and links.
 *
 * @param words - The dictionary.
 * @param instance - The instance.
 * @returns The row.
 */
function statusRow(words: Words, instance: InstanceSummary): HTMLElement {
  const group = stateGroup(instance.status);
  const row = el(
    "div",
    { class: "row" },
    el("span", { class: `dot ${group}`, "aria-hidden": "true" }),
    el("span", { class: "name", title: instance.name }, instance.name),
    el("span", { class: `stage ${instance.stage}` }, words.stages[instance.stage]),
  );
  const status = instance.job
    ? `${instance.job.action} ${instance.job.progress !== null ? `${instance.job.progress}%` : ""}`.trim()
    : words.status[instance.status];
  const actions = el("div", { class: "actions" });
  if (instance.url) actions.append(link(instance.url, words.github.openOdoo, "button primary"));
  actions.append(link(instance.panelUrl, words.github.openInPanel, "button"));
  return el("div", { class: "instance" }, row, el("div", { class: "status" }, status), actions);
}

/**
 * Make the block of one panel: the branch, its instances and the button that creates one.
 *
 * @param words - The dictionary.
 * @param match - What the panel knows about the page.
 * @param repo - The repository's full name.
 * @param many - Whether more than one panel matches, so the panel's name is shown.
 * @param rerender - Draws the box again.
 * @returns The block.
 */
function matchBlock(words: Words, match: GitHubMatch, repo: string, many: boolean, rerender: () => void): HTMLElement {
  const block = el("section", { class: "match" });
  if (many) block.append(el("div", { class: "panel" }, match.panelLabel));
  if (match.branch) {
    const head = el("div", { class: "branch" }, el("span", { class: "mono" }, match.branch));
    if (match.branchStage)
      head.append(el("span", { class: `stage ${match.branchStage}` }, words.stages[match.branchStage]));
    block.append(head);
  }
  if (match.fork) {
    block.append(el("p", { class: "note" }, words.github.fork));
    return block;
  }
  for (const instance of match.instances) block.append(statusRow(words, instance));
  if (!match.instances.length) block.append(el("p", { class: "note" }, words.github.noInstance));
  if (match.canCreate && match.branch) {
    const branch = match.branch;
    const area = el("div", { class: "create" });
    const start = el("button", { type: "button", class: "button primary" }, words.github.create);
    onPress(start, () => {
      area.replaceChildren(
        el("p", { class: "note" }, words.github.createConfirm(branch, match.panelLabel)),
        (() => {
          const yes = el("button", { type: "button", class: "button primary" }, words.github.create);
          const no = el("button", { type: "button", class: "button" }, words.common.cancel);
          onPress(no, rerender);
          onPress(yes, () => void createInstance(words, match, repo, branch, area, rerender));
          return el("div", { class: "actions" }, yes, no);
        })(),
      );
    });
    area.append(start);
    block.append(area);
  }
  return block;
}

/**
 * Ask the service worker to create a development instance and follow its job until it ends.
 *
 * The job is read every 3 seconds, up to 400 times.
 *
 * @param words - The dictionary.
 * @param match - What the panel knows about the page.
 * @param repo - The repository's full name.
 * @param branch - The branch.
 * @param area - The element that shows progress and errors.
 * @param rerender - Draws the box again when the job succeeds.
 */
async function createInstance(
  words: Words,
  match: GitHubMatch,
  repo: string,
  branch: string,
  area: HTMLElement,
  rerender: () => void,
): Promise<void> {
  const bar = el("div", { class: "bar" }, el("span", { class: "fill" }));
  const text = el("p", { class: "note" }, words.github.creating);
  area.replaceChildren(text, bar);
  const answer = await send<GitHubCreateAnswer>({ type: "github:create", panelId: match.panelId, repo, branch });
  if (!answer?.ok) {
    area.replaceChildren(
      el("p", { class: "note error" }, answer && !answer.ok && answer.error ? answer.error : words.github.failed),
    );
    return;
  }
  text.textContent = words.github.created;
  const fill = bar.firstElementChild as HTMLElement;
  for (let i = 0; i < 400; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (!area.isConnected) return;
    const job = await send<GitHubJobAnswer>({ type: "github:job", panelId: match.panelId, jobId: answer.jobId });
    if (!job?.ok) continue;
    if (job.progress !== null) fill.style.transform = `scaleX(${Math.max(0.04, job.progress / 100)})`;
    if (job.status === "failed") {
      area.replaceChildren(el("p", { class: "note error" }, job.error ?? words.github.failed));
      return;
    }
    if (job.status === "success") {
      rerender();
      return;
    }
  }
}

/**
 * Draw the box for the current address.
 *
 * @param force - Draw even when the path did not change.
 */
async function render(force = false): Promise<void> {
  const page = parseGitHubPath(location.pathname);
  const key = page ? `${location.pathname}` : "";
  if (!force && key === lastKey) return;
  lastKey = key;
  const mine = ++generation;
  if (!page || (await hiddenRepos()).includes(page.repo)) {
    remove();
    return;
  }
  let head: string | null = null;
  if (page.kind === "pull") {
    for (let i = 0; i < 10 && !head; i++) {
      head = readHeadRef();
      if (!head) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  const answer = await send<GitHubLookupAnswer>({
    type: "github:lookup",
    repo: page.repo,
    kind: page.kind,
    ref: page.ref,
    head,
  });
  if (mine !== generation) return; // the page changed meanwhile
  if (!answer?.ok || !answer.matches.length) {
    remove();
    return;
  }
  const words = wordsFor(answer.locale);
  const shadow = ensureHost(words.dir);
  const rerender = () => void render(true);

  const any = answer.matches.flatMap((m) => m.instances);
  const lead = any[0];
  const pill = el(
    "button",
    { type: "button", class: "pill", "aria-expanded": String(expanded), title: words.github.expand },
    logo(),
    el("span", {}, words.github.label),
  );
  if (lead) pill.append(el("span", { class: `dot ${stateGroup(lead.status)}`, "aria-hidden": "true" }));
  onPress(pill, () => {
    expanded = !expanded;
    rerender();
  });

  const card = el("div", { class: "card", role: "region", "aria-label": words.github.label });
  const close = el(
    "button",
    { type: "button", class: "icon", title: words.github.collapse, "aria-label": words.github.collapse },
    "×",
  );
  onPress(close, () => {
    expanded = false;
    rerender();
  });
  card.append(el("header", {}, logo(), el("strong", {}, words.github.label), close));
  for (const match of answer.matches)
    card.append(matchBlock(words, match, page.repo, answer.matches.length > 1, rerender));
  const hide = el("button", { type: "button", class: "link" }, words.github.hide);
  onPress(hide, async () => {
    const hidden = await hiddenRepos();
    await chrome.storage.local.set({ githubHidden: [...new Set([...hidden, page.repo])] });
    remove();
  });
  card.append(el("footer", {}, hide));

  shadow.replaceChildren(expanded ? card : pill);
}

/**
 * Make the small logo of the box.
 *
 * @returns The svg element.
 */
function logo(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  const ring = document.createElementNS(ns, "circle");
  for (const [k, v] of Object.entries({
    cx: "27.4",
    cy: "35.6",
    r: "10.6",
    fill: "none",
    "stroke-width": "5.3",
    class: "ring",
  }))
    ring.setAttribute(k, v);
  const dot = document.createElementNS(ns, "circle");
  for (const [k, v] of Object.entries({ cx: "38.8", cy: "21.3", r: "2.65", class: "ink" })) dot.setAttribute(k, v);
  const bar = document.createElementNS(ns, "rect");
  for (const [k, v] of Object.entries({ x: "45.1", y: "18.8", width: "3.3", height: "29.7", rx: "0.4", class: "ink" }))
    bar.setAttribute(k, v);
  svg.append(ring, dot, bar);
  return svg;
}

// GitHub navigates without reloading (Turbo): draw again when the address changes.
/** Draw again after a navigation. */
const again = () => void render();
document.addEventListener("turbo:load", again);
window.addEventListener("popstate", again);
/** The browser's Navigation API object, when there is one. */
const navigation = (window as unknown as { navigation?: EventTarget }).navigation;
navigation?.addEventListener("navigatesuccess", again);
void render();
