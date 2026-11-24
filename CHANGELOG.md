# Changelog

All notable changes to the Sudoo.sh browser extension. The version follows the Sudoo.sh release it was made for.

## Unreleased

### Changed

- **Formatting and lint setup:** an `.editorconfig` and a pre-commit configuration (Biome and `tsc`). Biome was
  already clean, so no file was reformatted. No behaviour change.

## 3.0.0 - 2026-11-18

First release.

### Added

- Popup: every connected panel with its projects and instances, their status, stage, branch and Odoo version;
  search; English and Arabic (right to left) with the panel's words; light and dark following the system.
- Quick actions with job progress: open Odoo, open in the panel, start, pause, restart, get latest code; production
  instances ask for a second click.
- "This tab": the instance whose address is the active tab's comes first, with Open in panel, Restart and Odoo log.
- GitHub box (optional): on pages of a repository that is a project on a connected panel, the branch's instance and
  **Create development instance**, without any GitHub token; hidden per repository on request.
- Notifications (optional, off by default): finished and failed jobs and panel alerts, checked once a minute with
  backoff when a panel cannot be reached.
- Signed requests (token, timestamp, nonce, HMAC-SHA256) as the panel's API requires; tokens in memory only by
  default, or encrypted with a passphrase (AES-256-GCM, PBKDF2 600,000 rounds).
- Minimal permissions: storage, alarms, activeTab and scripting; each panel's address, github.com and notifications
  are asked for when needed.
- Chrome Web Store and Firefox packages from `npm run build` (reproducible zips), a mock panel and tests.
