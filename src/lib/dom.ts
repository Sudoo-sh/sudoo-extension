/** A few lines instead of a framework: elements are made with h(); text is always set as text. */

import { ICONS, type IconName } from "./icons";

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | boolean | undefined | ((event: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === "function") node.addEventListener(key.replace(/^on/, "").toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

export function icon(name: IconName): Element {
  const template = document.createElement("template");
  template.innerHTML = ICONS[name]; // a constant of this extension, never data
  return template.content.firstElementChild as Element;
}

export function iconButton(name: IconName, label: string, attrs: Attrs = {}): HTMLButtonElement {
  return h("button", { type: "button", class: "icon-button", title: label, "aria-label": label, ...attrs }, icon(name));
}

export function iconLink(name: IconName, label: string, href: string, extraClass = ""): HTMLAnchorElement {
  return h(
    "a",
    {
      class: `icon-button ${extraClass}`.trim(),
      href,
      target: "_blank",
      rel: "noopener noreferrer",
      title: label,
      "aria-label": label,
    },
    icon(name),
  );
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string): void {
  document.querySelector(".toast")?.remove();
  const node = h("div", { class: "toast", role: "status" }, text);
  document.body.append(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.setAttribute("data-closing", "");
    setTimeout(() => node.remove(), 260);
  }, 3200);
}
