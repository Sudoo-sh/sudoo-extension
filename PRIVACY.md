# Privacy policy

**Audience:** everyone who installs the Sudoo.sh browser extension, and the reviewers of browser extension stores.
**Covers:** what the extension stores, what it sends and to whom, what it reads from web pages, and how to delete
everything.

Effective 18 November 2026. Publisher: Yousef M. Y. Al Sabbah (Sudoo.sh).

**In short:** the extension talks only to the Sudoo.sh panels you connect yourself. It collects nothing for the
publisher or anyone else: no analytics, no tracking, no advertising, no sale or transfer of data, and no remote code.

---

## Contents

1. [What is stored, and where](#1-what-is-stored-and-where)
2. [What is sent, and to whom](#2-what-is-sent-and-to-whom)
3. [What is read from web pages](#3-what-is-read-from-web-pages)
4. [Deleting your data](#4-deleting-your-data)
5. [Changes and contact](#5-changes-and-contact)

---

## 1. What is stored, and where

Everything stays in your browser's own extension storage, on your computer.

| Data | Where | How long |
| :--- | :--- | :--- |
| The panels you connect: the name you give each one and its address | `chrome.storage.local` (on disk) | Until you remove the panel or the extension |
| Settings: language, where tokens are kept, GitHub box on or off, notifications on or off, repositories where you hid the GitHub box | `chrome.storage.local` | Until you change them or remove the extension |
| API tokens and signing secrets, default choice | `chrome.storage.session` (memory only, never written to disk) | Until the browser closes |
| API tokens and signing secrets, with **Remember with a passphrase** | `chrome.storage.local`, encrypted (AES-256-GCM, key derived from your passphrase with PBKDF2-SHA256, 600,000 rounds); your passphrase itself is never stored | Until you choose **Stop remembering**, remove the panel or remove the extension |
| What the panels answered (instances, projects, jobs), to draw the popup quickly | `chrome.storage.session` (memory only) | Until the browser closes |

## 2. What is sent, and to whom

* **To your panels only.** The extension calls the API of each panel you connected, at the address you entered,
  with that panel's token: to list projects, instances and jobs, to run the actions you click, to create the
  instances you ask for, and, if you turned notifications on, to check jobs and alerts about once a minute. Each
  request is signed with the signing secret; the secret itself is never sent.
* **Nothing else.** No request goes to the publisher, to Sudoo.sh's own servers, to GitHub or to any third party.
  There are no analytics, crash reports, advertising or tracking of any kind.
* Your panel, which you or your organisation run, records each call in its audit log as `api:<token name>`, as it
  does for every API call. That log is on your panel, not with the publisher.

## 3. What is read from web pages

* **The tab you are on**, only when you open the popup (the `activeTab` permission): its address, compared with your
  instances' addresses to show "This tab". Nothing is read inside the page and nothing is stored.
* **GitHub pages**, only if you switch on **Show on GitHub** and allow github.com: the page's address (owner,
  repository, branch) and, on a pull request, the name of its branch as GitHub shows it. They are compared, inside
  the extension, with the projects and instances your panels list. Nothing from GitHub is sent anywhere, and no
  GitHub account or token is used.
* **No other website.** The extension never runs code in Odoo pages or any other site.

## 4. Deleting your data

* Remove one panel: the settings page, **Remove**. Its address, its token and secret (in memory and encrypted on
  disk) and its cached data are deleted, and its site access is given back.
* Forget saved tokens: **Stop remembering** deletes the encrypted copies; closing the browser clears the memory.
* Everything: remove the extension (`chrome://extensions`, **Remove**). The browser deletes all its storage.
* Revoke the token on the panel's **API tokens** page so that no copy of it works any more.

## 5. Changes and contact

A change to this policy is published with the extension's source and noted in its [CHANGELOG](CHANGELOG.md), and
the effective date above changes. Questions: open an issue at https://github.com/Sudoo-sh/sudoo-extension or use the
publisher contact on the extension's store page.
