/** Settings: connect panels, choose where tokens are kept, language, the GitHub box and notifications. */

import { ApiError, normalizeOrigin, PanelClient } from "../lib/api";
import { hasHostPermission, originPattern } from "../lib/data";
import { h } from "../lib/dom";
import { applyLocale, pickLocale, type Words } from "../lib/i18n";
import type { PageRequest } from "../lib/messages";
import {
  disablePassphrase,
  enablePassphrase,
  getPanels,
  getSettings,
  lockNow,
  lockState,
  newId,
  type PanelConfig,
  removePanel,
  type Settings,
  savePanels,
  saveSettings,
  setCredentials,
  unlock,
} from "../lib/store";
import { MIN_PASSPHRASE } from "../lib/vault";

const GITHUB = "https://github.com/*";
const main = document.querySelector("main") as HTMLElement;
let w: Words;
let editing: string | null = null; // the panel whose token is being replaced

const notifyWorker = () => {
  const message: PageRequest = { type: "settings-changed" };
  return chrome.runtime.sendMessage(message).catch(() => undefined);
};

function message(text: string, kind: "ok" | "error" = "ok"): HTMLElement {
  return h("p", { class: `message ${kind}`, role: kind === "error" ? "alert" : "status" }, text);
}

function field(label: string, input: HTMLInputElement, hint?: string): HTMLElement {
  const id = `f-${Math.random().toString(36).slice(2)}`;
  input.id = id;
  return h(
    "div",
    { class: "field" },
    h("label", { for: id }, label),
    input,
    hint ? h("span", { class: "hint" }, hint) : null,
  );
}

const input = (attrs: Record<string, string>) =>
  h("input", { class: "input", spellcheck: "false", autocomplete: "off", ...attrs });

async function render(): Promise<void> {
  const settings = await getSettings();
  w = applyLocale(document, pickLocale(settings.locale, chrome.i18n.getUILanguage()));
  document.title = w.options.title;
  const panels = await getPanels();
  const lock = await lockState();
  main.replaceChildren(
    h("h1", {}, h("img", { src: "../icons/icon-128.png", alt: "" }), w.options.title),
    await panelsSection(panels, lock.missing, lock.locked),
    secretsSection(settings, lock.locked),
    languageSection(settings),
    githubSection(settings),
    notificationsSection(settings),
  );
}

// ---- panels ---------------------------------------------------------------------------------------------------

async function panelsSection(panels: PanelConfig[], missing: string[], locked: boolean): Promise<HTMLElement> {
  const card = h("div", { class: "card" });
  if (!panels.length) card.append(h("p", { class: "muted" }, w.options.noPanels));
  for (const panel of panels) {
    const permitted = await hasHostPermission(panel.origin);
    const tokenMissing = missing.includes(panel.id);
    const row = h(
      "div",
      { class: "panel-row" },
      h("div", { class: "who" }, h("strong", {}, panel.label), h("span", { class: "muted mono" }, panel.origin)),
      h(
        "span",
        { class: `badge ${tokenMissing ? "missing" : "ok"}` },
        tokenMissing ? w.options.tokenMissing : w.options.tokenOk,
      ),
    );
    if (!permitted) {
      row.append(
        h(
          "button",
          {
            type: "button",
            class: "button primary",
            onclick: () => {
              void chrome.permissions.request({ origins: [originPattern(panel.origin)] }).then(() => render());
            },
          },
          w.popup.allow,
        ),
      );
    }
    row.append(
      h(
        "button",
        {
          type: "button",
          class: "button",
          disabled: locked,
          onclick: () => {
            editing = panel.id;
            void render();
          },
        },
        w.options.updateToken,
      ),
      h(
        "button",
        {
          type: "button",
          class: "button danger",
          onclick: async () => {
            await removePanel(panel.id);
            await chrome.permissions.remove({ origins: [originPattern(panel.origin)] }).catch(() => false);
            await render();
          },
        },
        w.common.remove,
      ),
    );
    card.append(row);
    if (editing === panel.id) card.append(panelForm(panel));
  }
  if (!editing) card.append(panelForm(null));
  return h("section", {}, h("h2", {}, w.options.panels), h("p", {}, w.options.panelsText), card);
}

function panelForm(existing: PanelConfig | null): HTMLElement {
  const label = input({ placeholder: w.options.labelHint, value: existing?.label ?? "" });
  const origin = input({
    placeholder: w.options.originHint,
    value: existing?.origin ?? "",
    type: "url",
    inputmode: "url",
  });
  const token = input({ type: "password", placeholder: "sudoo_…" });
  const secret = input({ type: "password" });
  const status = h("div");
  const submit = h("button", { type: "submit", class: "button primary" }, existing ? w.common.save : w.options.add);

  const form = h(
    "form",
    {
      class: "card",
      onsubmit: (event: Event) => {
        event.preventDefault();
        const address = normalizeOrigin(origin.value);
        if (!address) {
          status.replaceChildren(message(w.options.badOrigin, "error"));
          return;
        }
        // asked first, inside the click: the browser shows its own prompt for exactly this address
        const asked = chrome.permissions.request({ origins: [originPattern(address)] });
        void (async () => {
          if (!(await asked.catch(() => false))) {
            status.replaceChildren(message(w.options.permissionDenied, "error"));
            return;
          }
          submit.disabled = true;
          submit.textContent = w.options.adding;
          const credentials = { token: token.value.trim(), secret: secret.value.trim() };
          try {
            await new PanelClient(address, credentials).get("/api/v1/instances?limit=1");
            const panels = await getPanels();
            const id = existing?.id ?? newId();
            const config: PanelConfig = {
              id,
              label: label.value.trim() || new URL(address).host,
              origin: address,
              addedAt: existing?.addedAt ?? Date.now(),
            };
            await setCredentials(id, credentials);
            await savePanels(existing ? panels.map((p) => (p.id === id ? config : p)) : [...panels, config]);
            editing = null;
            await render();
          } catch (error) {
            submit.disabled = false;
            submit.textContent = existing ? w.common.save : w.options.add;
            const text =
              error instanceof ApiError
                ? error.status === 401
                  ? w.popup.tokenRefused
                  : (error.detail ?? error.title)
                : error instanceof Error && error.message === "locked"
                  ? w.popup.locked
                  : w.common.unreachable;
            status.replaceChildren(message(text, "error"));
          }
        })();
      },
    },
    h("div", { class: "grid2" }, field(w.options.label, label), field(w.options.origin, origin)),
    h("div", { class: "grid2" }, field(w.options.token, token), field(w.options.secret, secret)),
    status,
    h(
      "div",
      { class: "row-end" },
      existing
        ? h(
            "button",
            {
              type: "button",
              class: "button",
              onclick: () => {
                editing = null;
                void render();
              },
            },
            w.common.cancel,
          )
        : null,
      submit,
    ),
  );
  token.required = true;
  secret.required = true;
  origin.required = true;
  return form;
}

// ---- where tokens are kept --------------------------------------------------------------------------------

function secretsSection(settings: Settings, locked: boolean): HTMLElement {
  const card = h("div", { class: "card" });
  const status = h("div");
  const choice = (mode: Settings["secretMode"], title: string, text: string) =>
    h(
      "label",
      { class: "choice" },
      h("input", {
        type: "radio",
        name: "mode",
        value: mode,
        checked: settings.secretMode === mode,
        onchange: async () => {
          if (mode === "session") {
            await disablePassphrase();
            await render();
          } else {
            passphraseArea.hidden = false;
          }
        },
      }),
      h("span", {}, title),
      h("small", {}, text),
    );
  const one = input({ type: "password", autocomplete: "new-password", minlength: String(MIN_PASSPHRASE) });
  const two = input({ type: "password", autocomplete: "new-password" });
  const passphraseArea = h(
    "form",
    {
      class: "card",
      hidden: true,
      onsubmit: async (event: Event) => {
        event.preventDefault();
        if (one.value.length < MIN_PASSPHRASE)
          return status.replaceChildren(message(w.options.passphraseShort, "error"));
        if (one.value !== two.value) return status.replaceChildren(message(w.options.passphraseMismatch, "error"));
        await enablePassphrase(one.value);
        await render();
      },
    },
    h("div", { class: "grid2" }, field(w.options.passphrase, one), field(w.options.passphraseAgain, two)),
    h("div", { class: "row-end" }, h("button", { type: "submit", class: "button primary" }, w.options.enable)),
  );
  card.append(
    choice("session", w.options.sessionMode, w.options.sessionModeText),
    choice("passphrase", w.options.passphraseMode, w.options.passphraseModeText),
  );
  if (settings.secretMode === "passphrase") {
    if (locked) {
      const pass = input({ type: "password", autocomplete: "current-password", "aria-label": w.popup.passphrase });
      card.append(
        h(
          "form",
          {
            class: "row-end",
            onsubmit: async (event: Event) => {
              event.preventDefault();
              if (await unlock(pass.value)) await render();
              else status.replaceChildren(message(w.popup.wrongPassphrase, "error"));
            },
          },
          pass,
          h("button", { type: "submit", class: "button primary" }, w.popup.unlock),
        ),
      );
    } else {
      card.append(
        h(
          "div",
          { class: "row-end" },
          h(
            "button",
            {
              type: "button",
              class: "button",
              onclick: async () => {
                await lockNow();
                await render();
              },
            },
            w.options.lockNow,
          ),
          h(
            "button",
            {
              type: "button",
              class: "button danger",
              onclick: async () => {
                await disablePassphrase();
                await render();
              },
            },
            w.options.disable,
          ),
        ),
      );
    }
  } else {
    card.append(passphraseArea);
  }
  card.append(status);
  return h("section", {}, h("h2", {}, w.options.secrets), card);
}

// ---- language, GitHub, notifications ------------------------------------------------------------------------

function languageSection(settings: Settings): HTMLElement {
  const select = h(
    "select",
    {
      class: "input",
      "aria-label": w.options.language,
      onchange: async (event: Event) => {
        await saveSettings({ locale: (event.target as HTMLSelectElement).value as Settings["locale"] });
        await render();
      },
    },
    h("option", { value: "auto", selected: settings.locale === "auto" }, w.options.languageAuto),
    h("option", { value: "en", selected: settings.locale === "en" }, "English"),
    h("option", { value: "ar", selected: settings.locale === "ar" }, "العربية"),
  );
  return h("section", {}, h("h2", {}, w.options.language), select);
}

function toggle(label: string, checked: boolean, onchange: (on: boolean, box: HTMLInputElement) => void): HTMLElement {
  const box = h("input", { type: "checkbox", checked });
  box.addEventListener("change", () => onchange(box.checked, box));
  return h("label", { class: "choice" }, box, h("span", {}, label));
}

function githubSection(settings: Settings): HTMLElement {
  return h(
    "section",
    {},
    h("h2", {}, w.options.github),
    h("p", {}, w.options.githubText),
    h(
      "div",
      { class: "card" },
      toggle(w.options.githubEnable, settings.github, (on, box) => {
        if (on) {
          void chrome.permissions.request({ origins: [GITHUB] }).then(async (granted) => {
            box.checked = granted;
            await saveSettings({ github: granted });
            await notifyWorker();
          });
        } else {
          void (async () => {
            await saveSettings({ github: false });
            await chrome.permissions.remove({ origins: [GITHUB] }).catch(() => false);
            await notifyWorker();
          })();
        }
      }),
    ),
  );
}

function notificationsSection(settings: Settings): HTMLElement {
  const radio = (value: Settings["notifyJobs"], label: string) =>
    h(
      "label",
      { class: "choice" },
      h("input", {
        type: "radio",
        name: "notifyJobs",
        checked: settings.notifyJobs === value,
        disabled: !settings.notifications,
        onchange: () => void saveSettings({ notifyJobs: value }),
      }),
      h("span", {}, label),
    );
  return h(
    "section",
    {},
    h("h2", {}, w.options.notifications),
    h("p", {}, w.options.notificationsText),
    h(
      "div",
      { class: "card" },
      toggle(w.options.notificationsEnable, settings.notifications, (on, box) => {
        if (on) {
          void chrome.permissions.request({ permissions: ["notifications"] }).then(async (granted) => {
            box.checked = granted;
            await saveSettings({ notifications: granted });
            await notifyWorker();
            await render();
          });
        } else {
          void (async () => {
            await saveSettings({ notifications: false });
            await chrome.permissions.remove({ permissions: ["notifications"] }).catch(() => false);
            await notifyWorker();
            await render();
          })();
        }
      }),
      radio("mine", w.options.notifyMine),
      radio("all", w.options.notifyAll),
      toggle(w.options.notifyAlerts, settings.notifyAlerts, (on) => void saveSettings({ notifyAlerts: on })),
    ),
  );
}

void render();
