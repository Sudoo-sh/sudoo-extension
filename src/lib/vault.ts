/**
 * Encryption of the saved API tokens and signing secrets (the "Remember with a passphrase" option).
 *
 * A key is derived from the person's passphrase with PBKDF2-SHA256 (600,000 iterations, a random 16-byte salt) and
 * each value is sealed with AES-256-GCM and a random 12-byte IV. Only the salt and the sealed values are written to
 * disk (chrome.storage.local); the passphrase never is. Pure functions over Web Crypto, so Node tests run them too.
 */

/** Turns text into bytes. */
const encoder = new TextEncoder();
/** Turns bytes into text. */
const decoder = new TextDecoder();

/** How many PBKDF2 iterations new vaults use. */
export const PBKDF2_ITERATIONS = 600_000;
/** The shortest passphrase accepted, in characters. */
export const MIN_PASSPHRASE = 10;

/** A sealed value. */
export interface Sealed {
  /** The random IV, as base64. */
  iv: string;
  /** The cipher text, as base64. */
  ct: string;
}

/** The data stored next to the sealed values, needed to unlock them again. */
export interface VaultHeader {
  /** The format version. */
  v: 1;
  /** The random PBKDF2 salt, as base64. */
  salt: string;
  /** The PBKDF2 iteration count the key was derived with. */
  iterations: number;
  /** a known text sealed with the key: tells a wrong passphrase from damaged data */
  check: Sealed;
}

/** The known text that is sealed into `VaultHeader.check`. */
const CHECK_TEXT = "sudoo-extension-vault-v1";

/**
 * Encode bytes as base64.
 *
 * @param bytes - The bytes.
 * @returns The base64 text.
 */
export function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}

/**
 * Decode base64 text.
 *
 * @param text - The base64 text.
 * @returns The bytes.
 */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Derive an AES-GCM key from a passphrase.
 *
 * @param passphrase - The passphrase.
 * @param salt - The PBKDF2 salt.
 * @param iterations - The PBKDF2 iteration count.
 * @returns The key, which can be exported.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    true, // exportable: kept in chrome.storage.session (memory only) while unlocked, so the passphrase is asked once
    ["encrypt", "decrypt"],
  );
}

/**
 * Export a key as base64.
 *
 * @param key - The key.
 * @returns The raw key as base64.
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

/**
 * Import a key exported with `exportKey`.
 *
 * @param raw - The raw key as base64.
 * @returns The key.
 */
export async function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromBase64(raw), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

/**
 * Encrypt text with AES-GCM and a new random IV.
 *
 * @param key - The key.
 * @param text - The text.
 * @returns The IV and the cipher text.
 */
export async function seal(key: CryptoKey, text: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(text));
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

/** Throws when the key is wrong or the value was changed (GCM authentication). */
export async function open(key: CryptoKey, sealed: Sealed): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(sealed.iv) }, key, fromBase64(sealed.ct));
  return decoder.decode(plain);
}

/**
 * Make a new vault header and key from a passphrase.
 *
 * @param passphrase - The passphrase; at least `MIN_PASSPHRASE` characters.
 * @param iterations - The PBKDF2 iteration count.
 * @returns The header to store and the key.
 */
export async function createVault(
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<{ header: VaultHeader; key: CryptoKey }> {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`The passphrase needs ${MIN_PASSPHRASE} characters or more.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt, iterations);
  return { header: { v: 1, salt: toBase64(salt), iterations, check: await seal(key, CHECK_TEXT) }, key };
}

/** The key, or null when the passphrase is wrong. */
export async function unlockVault(header: VaultHeader, passphrase: string): Promise<CryptoKey | null> {
  const key = await deriveKey(passphrase, fromBase64(header.salt), header.iterations);
  try {
    return (await open(key, header.check)) === CHECK_TEXT ? key : null;
  } catch {
    return null;
  }
}
