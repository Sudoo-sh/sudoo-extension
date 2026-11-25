/** A few lines instead of a framework: elements are made with h(); text is always set as text. */

import { ICONS, type IconName } from "./icons";

/** Something that can be a child of an element; null, undefined and false are skipped. */
type Child = Node | string | null | undefined | false;
/** Attributes by name. A function is an event listener, true is an empty attribute, undefined and false are skipped. */
type Attrs = Record<string, string | boolean | undefined | ((event: Event) => void)>;

/**
 * Make an element.
 *
 * @param tag - The tag name.
 * @param attrs - The attributes, or listeners for names that start with "on".
 * @param children - The children; text is added as text, never as markup.
 * @returns The new element.
 */
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

/**
 * Make an icon element from `ICONS`.
 *
 * @param name - The icon's name.
 * @returns The svg element.
 */
export function icon(name: IconName): Element {
  const template = document.createElement("template");
  template.innerHTML = ICONS[name]; // a constant of this extension, never data
  return template.content.firstElementChild as Element;
}

/**
 * Make a button that shows an icon.
 *
 * @param name - The icon's name.
 * @param label - The accessible name and the tooltip.
 * @param attrs - More attributes.
 * @returns The button.
 */
export function iconButton(name: IconName, label: string, attrs: Attrs = {}): HTMLButtonElement {
  return h("button", { type: "button", class: "icon-button", title: label, "aria-label": label, ...attrs }, icon(name));
}

/**
 * Make a link that shows an icon and opens in a new tab.
 *
 * @param name - The icon's name.
 * @param label - The accessible name and the tooltip.
 * @param href - The address.
 * @param extraClass - A class name to add.
 * @returns The link.
 */
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

/** The timer that closes the toast on screen. */
let toastTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Show a short message at the bottom of the page for a few seconds, replacing the one on screen.
 *
 * @param text - The message.
 */
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
