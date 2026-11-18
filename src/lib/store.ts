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

export interface PanelConfig {
  id: string;
  label: string;
  origin: string;
  addedAt: number;
}

export type SecretMode = "session" | "passphrase";

export interface Settings {
  locale: "auto" | "en" | "ar";
  secretMode: SecretMode;
  /** notifications are off until the person turns them on (and grants the permission) */
  notifications: boolean;
  notifyJobs: "mine" | "all";
  notifyAlerts: boolean;
  /** the box on GitHub pages; needs the optional github.com permission */
  github: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  locale: "auto",
  secretMode: "session",
  notifications: false,
  notifyJobs: "mine",
  notifyAlerts: true,
  github: false,
};

const local = () => chrome.storage.local;
const session = () => chrome.storage.session;

async function read<T>(area: chrome.storage.StorageArea, key: string, fallback: T): Promise<T> {
  const items = await area.get(key);
  return (items[key] as T | undefined) ?? fallback;
}

export const getPanels = () => read<PanelConfig[]>(local(), "panels", []);
export const savePanels = (panels: PanelConfig[]) => local().set({ panels });

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await read<Partial<Settings>>(local(), "settings", {})) };
}

export async function saveSettings(change: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...change };
  await local().set({ settings: next });
  return next;
}

// ---- secrets -------------------------------------------------------------------------------------------------

const getSessionSecrets = () => read<Record<string, Credentials>>(session(), "secrets", {});
const getSealed = () => read<Record<string, Sealed>>(local(), "sealed", {});
const getHeader = () => read<VaultHeader | null>(local(), "vault", null);

export async function getCredentials(panelId: string): Promise<Credentials | null> {
  return (await getSessionSecrets())[panelId] ?? null;
}

async function vaultKey(): Promise<CryptoKey | null> {
  const raw = await read<string | null>(session(), "vaultKey", null);
  return raw ? importKey(raw) : null;
}

export interface LockState {
  mode: SecretMode;
  /** passphrase mode, and the passphrase was not entered since the browser started */
  locked: boolean;
  /** panels whose token is not available in this browser session */
  missing: string[];
}

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

/** Opens the saved secrets with the passphrase; false when it is wrong. */
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

/** Switches to "Remember with a passphrase": seals what is in use now. */
export async function enablePassphrase(passphrase: string): Promise<void> {
  const { header, key } = await createVault(passphrase);
  const secrets = await getSessionSecrets();
  const sealed: Record<string, Sealed> = {};
  for (const [id, credentials] of Object.entries(secrets)) sealed[id] = await seal(key, JSON.stringify(credentials));
  await local().set({ vault: header, sealed });
  await session().set({ vaultKey: await exportKey(key) });
  await saveSettings({ secretMode: "passphrase" });
}

/** Back to "This browser session only": the sealed copies are deleted from disk. */
export async function disablePassphrase(): Promise<void> {
  await local().remove(["vault", "sealed"]);
  await session().remove("vaultKey");
  await saveSettings({ secretMode: "session" });
}

/** Forgets the vault key and every secret in memory; sealed copies stay on disk until the next unlock. */
export async function lockNow(): Promise<void> {
  await session().remove(["vaultKey", "secrets"]);
}

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

export async function getCache<T>(key: string, maxAgeMs: number): Promise<T | null> {
  const entry = await read<{ at: number; value: T } | null>(session(), `cache:${key}`, null);
  return entry && Date.now() - entry.at < maxAgeMs ? entry.value : null;
}

export async function setCache<T>(key: string, value: T): Promise<void> {
  await session().set({ [`cache:${key}`]: { at: Date.now(), value } });
}

export const newId = (): string => crypto.randomUUID();
