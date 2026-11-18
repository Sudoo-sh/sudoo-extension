# Chrome Web Store listing (English)

Paste each part into the matching field of the Chrome Web Store Developer Dashboard.

## Name

Sudoo.sh

## Summary (short description, 132 characters at most)

Your Sudoo.sh panels in the toolbar: projects, instances and their status, quick actions, and branch instances on GitHub.

## Category

Developer Tools. Language: English (add Arabic as a second listing language, store/listing.ar.md).

## Description

Sudoo.sh runs Odoo instances for every Git branch on your own server, like Odoo.sh. This extension puts your
Sudoo.sh panels one click away while you work.

IN THE TOOLBAR
- Every panel you connect, with its projects (one GitHub repository each) and their instances.
- Status at a glance: online, working, paused, switched off; the stage of each instance: production, staging or
  development; its branch and Odoo version.
- Search by instance, branch, project, stage or version.
- Quick actions: open Odoo, open in the panel, start, pause, restart, get latest code. The job's progress shows until
  it is done. Production instances ask for a second click.

ON THE PAGE YOU ARE ON
- When the tab is one of your instances, the popup shows it first, with Open in panel, Restart and Odoo log.
- On GitHub (optional): on pages of a repository that is a project on your panels, a small Sudoo.sh button shows the
  branch's instance, its stage and status, and offers "Create development instance" for a branch without one. No
  GitHub token is needed.

NOTIFICATIONS (optional, off by default)
- When a job finishes or fails, and when a panel raises an alert.

PRIVATE AND MINIMAL
- Talks only to the panels you connect. No analytics, no tracking, no remote code.
- Every request is signed (token, timestamp, single-use nonce, HMAC-SHA256), as the panel's API requires.
- Tokens stay in memory by default and are forgotten when the browser closes; or keep them encrypted with a
  passphrase (AES-256-GCM).
- Site access is asked for one panel address at a time; GitHub access and notifications only when you turn them on.
  Nothing runs inside Odoo pages.

English and Arabic (right to left), light and dark. Open source under the Apache License 2.0:
https://github.com/Sudoo-sh/sudoo-extension

Needs a Sudoo.sh panel and an API token made on its API tokens page.

## Single purpose (Privacy practices tab)

Shows the projects and instances of the user's own Sudoo.sh panels and lets the user run their common actions
(open, start, pause, restart, update, create a branch instance) from the toolbar and from the GitHub pages of the
repositories those panels use.

## Permission justifications (Privacy practices tab)

- storage: keeps the list of connected panels and the settings on the computer, and the API tokens in memory (or
  encrypted with the user's passphrase).
- alarms: wakes the extension once a minute to check for finished jobs and alerts, only while the user has turned
  notifications on.
- activeTab: when the user opens the popup, reads the active tab's address to show the instance it belongs to. No
  page content is read.
- scripting: registers the GitHub box on github.com only after the user turns it on and grants github.com access.
- Optional host permissions (https://*/* and http://localhost): the panels are self-hosted at addresses the
  extension cannot know in advance; access is requested for one panel address at a time, when the user connects
  that panel, and github.com when the user turns on the GitHub box.
- notifications (optional): shows job and alert notifications when the user turns them on.

## Remote code

No, I am not using remote code. All scripts are in the package.

## Data usage (Privacy practices tab)

- Collected: "Authentication information" (the API token and signing secret the user enters, kept on the device
  only, used only to sign requests to the user's own panel); "Website content" is not collected (GitHub page
  addresses are compared locally and never sent).
- Certify: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used
  or transferred to determine creditworthiness or for lending.

## Privacy policy URL

https://github.com/Sudoo-sh/sudoo-extension/blob/main/PRIVACY.md

## Homepage and support

- Homepage: https://sudoo.sh
- Support: https://github.com/Sudoo-sh/sudoo-extension/issues
