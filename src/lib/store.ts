/**
 * What the extension keeps, and where.
 *
 * chrome.storage.local (on disk): the list of panels (label and address, no secret), the settings, and, only with
 * "Remember with a passphrase", the vault header and the sealed tokens and secrets.
 * chrome.storage.session (memory only, cleared when the browser closes, never readable by content scripts): the
 * tokens and signing secrets in use, the vault key while unlocked, short-lived caches and the jobs to follow.
 */

import type { Credentials } from "./api";
import { createVault, exportKey, importKey, open, type Sealed, seal, unlockVault, type VaultHeader } from "./vault";

/** A saved panel. No secret is part of it. */
export interface PanelConfig {
  /** The panel's id in this extension. */
  id: string;
  /** The name shown to the person. */
  label: string;
  /** The panel's origin. */
  origin: string;
  /** When it was added, in milliseconds since 1970. */
  addedAt: number;
}

/** Where secrets are kept: in memory for the browser session only, or sealed on disk with a passphrase. */
export type SecretMode = "session" | "passphrase";

/** The person's settings. */
export interface Settings {
  /** The language: "auto" follows the browser. */
  locale: "auto" | "en" | "ar";
  /** Where secrets are kept. */
  secretMode: SecretMode;
  /** notifications are off until the person turns them on (and grants the permission) */
  notifications: boolean;
  /** Which finished jobs cause a notification: the person's own or all. */
  notifyJobs: "mine" | "all";
  /** Whether alerts cause a notification. */
  notifyAlerts: boolean;
  /** the box on GitHub pages; needs the optional github.com permission */
  github: boolean;
}

/** The settings before the person changes anything. */
export const DEFAULT_SETTINGS: Settings = {
  locale: "auto",
  secretMode: "session",
  notifications: false,
  notifyJobs: "mine",
  notifyAlerts: true,
  github: false,
};

/** The extension's storage on disk. */
const local = () => chrome.storage.local;
/** The extension's storage in memory. */
const session = () => chrome.storage.session;

/**
 * Read one value from a storage area.
 *
 * @param area - The storage area.
 * @param key - The key.
 * @param fallback - The value when nothing is stored.
 * @returns The stored value, or the fallback.
 */
async function read<T>(area: chrome.storage.StorageArea, key: string, fallback: T): Promise<T> {
  const items = await area.get(key);
  return (items[key] as T | undefined) ?? fallback;
}

/**
 * Read the saved panels (local storage; no secrets).
 *
 * @returns The panels, or an empty list.
 */
export const getPanels = () => read<PanelConfig[]>(local(), "panels", []);
/**
 * Replace the saved panels in local storage.
 *
 * @param panels - The full list of panels.
 * @returns A promise that settles when they are stored.
 */
export const savePanels = (panels: PanelConfig[]) => local().set({ panels });

/**
 * Read the settings, with the defaults for anything not stored.
 *
 * @returns The settings.
 */
export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await read<Partial<Settings>>(local(), "settings", {})) };
}

/**
 * Change some settings.
 *
 * @param change - The settings to change.
 * @returns All settings after the change.
 */
export async function saveSettings(change: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...change };
  await local().set({ settings: next });
  return next;
}

// ---- secrets -------------------------------------------------------------------------------------------------

/** Read the credentials in memory, by panel id. */
const getSessionSecrets = () => read<Record<string, Credentials>>(session(), "secrets", {});
/** Read the sealed credentials on disk, by panel id. */
const getSealed = () => read<Record<string, Sealed>>(local(), "sealed", {});
/** Read the vault header from disk. */
const getHeader = () => read<VaultHeader | null>(local(), "vault", null);

/**
 * Read the credentials of a panel from memory.
 *
 * @param panelId - The panel's id.
 * @returns The credentials, or null when they are not available in this browser session.
 */
export async function getCredentials(panelId: string): Promise<Credentials | null> {
  return (await getSessionSecrets())[panelId] ?? null;
}

/**
 * Read the vault key from memory.
 *
 * @returns The key, or null while the vault is locked or not in use.
 */
async function vaultKey(): Promise<CryptoKey | null> {
  const raw = await read<string | null>(session(), "vaultKey", null);
  return raw ? importKey(raw) : null;
}

/**
 * What the popup needs to know about locked secrets: the mode in use and which panels have no token available right now.
 */
export interface LockState {
  /** The secret mode in use. */
  mode: SecretMode;
  /** passphrase mode, and the passphrase was not entered since the browser started */
  locked: boolean;
  /** panels whose token is not available in this browser session */
  missing: string[];
}

/**
 * Tell whether secrets are available.
 *
 * @returns The mode, whether the vault is locked and the panels without credentials in memory.
 */
export async function lockState(): Promise<LockState> {
  const [settings, panels, secrets, sealed, key] = await Promise.all([
    getSettings(),
    getPanels(),
    getSessionSecrets(),
    getSealed(),
    read<string | null>(session(), "vaultKey", null),
  ]);
  const locked = settings.secretMode === "passphrase" && !key && Object.keys(sealed).length > 0;
  return { mode: settings.secretMode, locked, missing: panels.filter((p) => !secrets[p.id]).map((p) => p.id) };
}

/**
 * Keep the credentials of a panel in memory, and sealed on disk in passphrase mode.
 *
 * @param panelId - The panel's id.
 * @param credentials - The token and secret.
 * @throws Error "locked" in passphrase mode while the vault is locked.
 */
export async function setCredentials(panelId: string, credentials: Credentials): Promise<void> {
  const secrets = await getSessionSecrets();
  secrets[panelId] = credentials;
  await session().set({ secrets });
  const settings = await getSettings();
  if (settings.secretMode === "passphrase") {
    const key = await vaultKey();
    if (!key) throw new Error("locked");
    const sealed = await getSealed();
    sealed[panelId] = await seal(key, JSON.stringify(credentials));
    await local().set({ sealed });
  }
}

/**
 * Open the saved secrets with the passphrase and keep them, and the vault key, in session memory. A sealed value that
 * cannot be opened is skipped: that panel asks for its token again.
 *
 * @param passphrase - The passphrase.
 * @returns True when unlocked; false when there is no vault or the passphrase is wrong.
 */
export async function unlock(passphrase: string): Promise<boolean> {
  const header = await getHeader();
  if (!header) return false;
  const key = await unlockVault(header, passphrase);
  if (!key) return false;
  const sealed = await getSealed();
  const secrets = await getSessionSecrets();
  for (const [id, value] of Object.entries(sealed)) {
    try {
      secrets[id] = JSON.parse(await open(key, value)) as Credentials;
    } catch {
      // one damaged value: that panel asks for its token again
    }
  }
  await session().set({ secrets, vaultKey: await exportKey(key) });
  return true;
}

/**
 * Switch to "Remember with a passphrase": a new vault is made and the credentials in use now are sealed on disk.
 *
 * @param passphrase - The new passphrase.
 * @throws Error when the passphrase is too short (from `createVault`).
 */
export async function enablePassphrase(passphrase: string): Promise<void> {
  const { header, key } = await createVault(passphrase);
  const secrets = await getSessionSecrets();
  const sealed: Record<string, Sealed> = {};
  for (const [id, credentials] of Object.entries(secrets)) sealed[id] = await seal(key, JSON.stringify(credentials));
  await local().set({ vault: header, sealed });
  await session().set({ vaultKey: await exportKey(key) });
  await saveSettings({ secretMode: "passphrase" });
}

/**
 * Go back to "This browser session only": the vault and the sealed copies are deleted from disk; the credentials in
 * memory stay until the browser closes.
 */
export async function disablePassphrase(): Promise<void> {
  await local().remove(["vault", "sealed"]);
  await session().remove("vaultKey");
  await saveSettings({ secretMode: "session" });
}

/**
 * Lock now: forget the vault key and every secret in memory. The sealed copies stay on disk until the next unlock.
 */
export async function lockNow(): Promise<void> {
  await session().remove(["vaultKey", "secrets"]);
}

/**
 * Forget a panel with its credentials, sealed copy and caches.
 *
 * @param panelId - The panel's id.
 */
export async function removePanel(panelId: string): Promise<void> {
  await savePanels((await getPanels()).filter((p) => p.id !== panelId));
  const secrets = await getSessionSecrets();
  delete secrets[panelId];
  const sealed = await getSealed();
  delete sealed[panelId];
  await session().set({ secrets });
  await local().set({ sealed });
  const all = await session().get(null);
  await session().remove(Object.keys(all).filter((key) => key.startsWith(`cache:${panelId}:`)));
}

// ---- caches (memory only) -------------------------------------------------------------------------------------

/**
 * Read a cached value from memory.
 *
 * @param key - The cache key.
 * @param maxAgeMs - The oldest the value may be, in milliseconds.
 * @returns The value, or null when there is none or it is too old.
 */
export async function getCache<T>(key: string, maxAgeMs: number): Promise<T | null> {
  const entry = await read<{ at: number; value: T } | null>(session(), `cache:${key}`, null);
  return entry && Date.now() - entry.at < maxAgeMs ? entry.value : null;
}

/**
 * Keep a value in the cache in memory, with the current time.
 *
 * @param key - The cache key.
 * @param value - The value.
 */
export async function setCache<T>(key: string, value: T): Promise<void> {
  await session().set({ [`cache:${key}`]: { at: Date.now(), value } });
}

/**
 * Make a random id.
 *
 * @returns A random UUID.
 */
export const newId = (): string => crypto.randomUUID();
