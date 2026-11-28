# Sudoo.sh browser extension

**Audience:** developers and integrators who work with one or more [Sudoo.sh](https://sudoo.sh) panels.
**Covers:** what the extension does, installing it, connecting a panel, the permissions it asks for and why, where
your tokens are kept, and building it yourself.

Your Sudoo.sh panels in the browser's toolbar, the way Odoo.sh shows its branches: every project and instance with
its status and stage, quick actions with their progress, the instance of the tab you are on, and the branch's instance
right on GitHub.

Works in Chrome, Edge, Brave and other Chromium browsers (version 121 or later). A Firefox build (128 or later) is
made too.

---

## Contents

1. [What it does](#1-what-it-does)
2. [Installing](#2-installing)
3. [Connecting a panel](#3-connecting-a-panel)
4. [Permissions](#4-permissions)
5. [Where your tokens are kept](#5-where-your-tokens-are-kept)
6. [Building and developing](#6-building-and-developing)
7. [Licence](#7-licence)

---

## 1. What it does

| Feature | What you get |
| :--- | :--- |
| **Popup** | Each connected panel, its projects (one GitHub repository each) and their instances: status (online, working, paused, switched off), stage (production, staging, development), branch and Odoo version. Search by name, branch, project, stage or version. |
| **Quick actions** | Open Odoo, open the instance in the panel, start or pause, restart, get latest code. The job's progress shows under the instance until it is done. Production instances ask for a second click first. |
| **This tab** | When the tab you are on is an instance of a connected panel (its address is the instance's), the popup shows it first, with **Open in panel**, **Restart** and **Odoo log**. The extension never runs anything inside Odoo pages: it only compares the tab's address. |
| **GitHub box** (optional) | On github.com pages of a repository that is a project on one of your panels (its home, a branch, a file, a pull request, a comparison), a small **Sudoo.sh** button in the corner opens the branch's instance: stage, status, **Open Odoo**, **Panel**. A branch without an instance gets **Create development instance**. No GitHub token: pages are recognised by their address. You can hide it per repository. |
| **Notifications** (optional, off by default) | When a job you started from the extension ends (or every job on your panels, if you choose), and when a panel raises an alert. |
| **Languages** | English and Arabic (right to left), with the panel's own words; the browser's language by default. Light and dark follow the system. |

## 2. Installing

**From the Chrome Web Store** (Chrome, Edge, Brave): open the extension's page in the store and click **Add to
Chrome**. Pin it with the puzzle-piece menu so the Sudoo.sh icon stays in the toolbar.

**Unpacked** (a build of your own, or before the store listing is live):

1. Build it ([6](#6-building-and-developing)), or unzip `sudoo-extension-<version>-chrome.zip` into a folder.
2. Open `chrome://extensions` (Edge: `edge://extensions`), switch on **Developer mode**.
3. Click **Load unpacked** and choose `dist/chrome` (or the unzipped folder).

**Firefox** (for trying it): open `about:debugging#/runtime/this-firefox`, **Load Temporary Add-on**, and choose
`dist/firefox/manifest.json`. A temporary add-on is removed when Firefox closes.

## 3. Connecting a panel

1. In the panel, open **API tokens** in the sidebar and click **Create token**. Name it after where it will be used
   (for example "Browser, Sam's laptop") and choose a scope:

   | Scope | In the extension |
   | :--- | :--- |
   | `read` | Shows everything; every action is refused. The safest choice for looking only. |
   | `instances` | Also start, pause and restart, and create development instances from GitHub. Not **Get latest code**, not alerts, and not the project pages (the popup groups instances by the project each one names, and the GitHub box works from the instances alone). Recommended for daily use. |
   | `write` | Everything, including **Get latest code** and alerts. It acts as an **Administrator** of the panel, so keep it to a computer only you use. |

   The panel shows the **token** (`sudoo_...`) and the **signing secret** once: keep the page open for the next step.
2. Click the extension's icon, then **Connect a panel** (or right-click the icon, **Options**).
3. Enter a name, the panel's address (`https://panel.example.com`), the token and the signing secret, and click
   **Connect**. The browser asks to let the extension reach that address: allow it. The extension checks the token
   with one request, then the panel appears in the popup.

Every request is signed as the [Panel API](https://github.com/Sudoo-sh/sudoo.sh/blob/main/docs/PANEL_API.md)
describes (token, timestamp, single-use nonce, HMAC-SHA256 over the method, path and body), so a copy of a request
cannot be sent again, and the token alone, without the secret, opens nothing. Every call is in the panel's audit log
as `api:<token name>`. Revoke the token on the panel's **API tokens** page when you no longer use the extension
there.

## 4. Permissions

The extension asks for as little as it can, and for the rest only when you turn a feature on.

| Permission | When | Why |
| :--- | :--- | :--- |
| `storage` | Installed | Keeps your list of panels and settings on this computer, and your tokens in memory ([5](#5-where-your-tokens-are-kept)). |
| `alarms` | Installed | Wakes the extension once a minute to check for finished jobs, only while notifications are on. |
| `activeTab` | Installed | When you open the popup, reads the address of the tab you are on, to show its instance. Nothing is read from other tabs, or when you do not open the popup. |
| `scripting` | Installed | Adds the GitHub box to github.com pages, only after you turn it on and allow github.com. It shows no warning by itself. |
| Your panel's address, for example `https://panel.example.com/*` | When you connect that panel | To call the panel's API. Asked for each panel separately; removing the panel gives it back. |
| `https://github.com/*` | When you switch on **Show on GitHub** | To show the box on GitHub pages. Switching it off gives it back. |
| `notifications` | When you switch on **Notify me** | To show the notifications. Switching it off gives it back. |

The manifest lists `https://*/*` (and this computer's own `http://localhost`) as **optional** host permissions: the
extension cannot know your panel's address in advance, so it may ask for one address at a time. It never asks for
all of them, and installing it asks for none.

What it never does: inject anything into Odoo pages or other websites (only the box on github.com, when you allow
it); load code from the internet (everything is in the package, under a strict content security policy); send
analytics or any data to anyone but the panels you connect. See [PRIVACY.md](PRIVACY.md).

## 5. Where your tokens are kept

A token and its signing secret open your panel, so you choose where they live, on the settings page under
**Where tokens are kept**:

| Choice | Where | Trade-off |
| :--- | :--- | :--- |
| **This browser session only** (the default) | In memory (`chrome.storage.session`); never written to disk; never readable by the GitHub box or any page | Forgotten when the browser closes: after a restart, the popup asks you to enter them again. Nothing is left on the computer for someone who copies your browser profile. |
| **Remember with a passphrase** | On disk (`chrome.storage.local`), encrypted with AES-256-GCM under a key derived from your passphrase (PBKDF2-SHA256, 600,000 rounds, random salt) | You type the passphrase once per browser session (in the popup); the tokens then stay in memory until the browser closes or you click **Lock now**. A weak passphrase can be guessed offline by someone who copied your profile; a forgotten one means entering the tokens again. |

The default is the session-only choice because it leaves no secret on disk and needs no passphrase to be any good.
Choose **Remember with a passphrase** when re-entering tokens after every restart is too much, and use a long
passphrase (a few unrelated words). Whichever you choose, use the narrowest token scope that does the job
([3](#3-connecting-a-panel)).

## 6. Building and developing

You need Node.js 22 or later (an LTS release).

```bash
npm ci
npm run build        # dist/chrome, dist/firefox and release/sudoo-extension-<version>-{chrome,firefox}.zip
npm run lint         # Biome and the TypeScript check
npm test             # Vitest: signing, the API client against the mock panel, matching, the vault
npm run check        # all three, as CI runs them
```

The build is reproducible: the same sources give a byte-identical zip (fixed timestamps, sorted entries).

**Trying it without a panel.** `npm run mock` starts a stand-in for a panel's API on `http://localhost:8787` with
the panel's demo data; it checks signatures exactly as a panel does. It prints a test token and signing secret that
open only the mock; connect them as a panel with the address `http://localhost:8787`. `node mock/server.mjs --scope
instances` gives a mock that refuses what an `instances` token may not do.

**Looking at the pages.** `npm run preview` builds and serves the popup and the settings page from the mock with
stand-ins for the browser's APIs: open `http://localhost:8787/ext/popup/harness.html` (add `?lang=ar` for Arabic,
`?tab=https://acme-retail-main.demo.sudoo.sh/odoo` for the "This tab" card, `?empty=1` for the first run). The
harness (`dev/`) is never packaged.

### How this code is organised

| Folder | What |
| :--- | :--- |
| `src/lib/` | The API client and signing, matching, storage and the vault, the words (`i18n.ts`) |
| `src/popup/`, `src/options/` | The popup and the settings page |
| `src/content/github.ts` | The GitHub box (a closed shadow root; it never sees a token) |
| `src/background.ts` | The service worker: the GitHub box's questions, notifications |
| `static/` | The manifest, icons (drawn by `scripts/icons.py`) and the store name and description |
| `mock/`, `tests/`, `dev/` | The mock panel, the tests and the preview harness |
| `store/` | The store listing texts (English and Arabic) and the screenshots to make |
| `scripts/` | The build (`build.mjs`), the reproducible ZIP (`zip.mjs`), the docs check (`check-docs.mjs`) and the icons |

Every file starts with a header comment, and every function, type and field has a `/** ... */` comment; see
[CONTRIBUTING.md](CONTRIBUTING.md).

The design follows the panel's tokens (`web/src/styles/_tokens.scss` of the panel): one plum accent on graphite,
hairlines, ease-out curves, a 0.97 press, nothing animated when the popup opens (it opens many times a day), reduced
motion respected.

### Formatting

Code is formatted and linted with Biome (settings in `biome.json`), and `tsc` checks the types. `npm run format` rewrites
files and `npm run lint` checks them without changes; `npm run check` runs the lint, the tests and the build. The same
checks run on every commit with pre-commit (run `pre-commit install` once).

## 7. Licence

Apache License 2.0 ([LICENSE](LICENSE)), like the Sudoo.sh plugin SDK: a client tool you may read, change and
build. "Sudoo" and "Sudoo.sh" and the logo are trademarks: a changed version must not be published under that name
or logo.
