/**
 * Signed requests for the Sudoo.sh panel API (docs/PANEL_API.md, section 2).
 *
 * Every request carries the token, a timestamp, a single-use nonce and an HMAC-SHA256 signature over five lines
 * (six with X-Sudoo-Acting-For): timestamp, nonce, METHOD, path with query, hex SHA-256 of the exact body.
 * Only Web Crypto is used, so the same code runs in the service worker, the popup and Node (tests).
 */

/** Turns text into bytes. */
const encoder = new TextEncoder();

/**
 * Write bytes as lower-case hexadecimal.
 *
 * @param buffer - The bytes.
 * @returns The hex text.
 */
export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash text with SHA-256.
 *
 * @param text - The text, read as UTF-8.
 * @returns The hash as hex.
 */
export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

/**
 * Sign text with HMAC-SHA-256.
 *
 * @param secret - The secret, read as UTF-8.
 * @param text - The text, read as UTF-8.
 * @returns The signature as hex.
 */
export async function hmacSha256Hex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(text)));
}

/** The characters a nonce is made of. */
const NONCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * Make a random single-use nonce from [A-Za-z0-9-_]; the panel accepts 16 to 64 characters.
 *
 * @param length - The number of characters; 32 by default.
 * @returns The nonce.
 */
export function makeNonce(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => NONCE_ALPHABET[b & 63]).join("");
}

/** The pattern a value of X-Sudoo-Acting-For must match. */
export const ACTING_FOR = /^[A-Za-z0-9._@+-]{1,120}$/;

/** What is signed. */
export interface SignInput {
  /** The HTTP method. */
  method: string;
  /** the path with its query, for example /api/v1/instances?limit=100 */
  path: string;
  /** The exact request body; empty when there is none. */
  body: string;
  /** The time in seconds since 1970. */
  timestamp: number;
  /** The single-use nonce. */
  nonce: string;
  /** The user the request acts for, when given. */
  actingFor?: string;
}

/**
 * Build the text that is signed: lines joined with \n, no newline at the end. It must match the panel's own
 * canonical text byte for byte, or the panel refuses the request.
 *
 * @param input - The parts of the request that are signed.
 * @returns The canonical text.
 */
export async function canonicalText(input: SignInput): Promise<string> {
  const lines = [
    String(input.timestamp),
    input.nonce,
    input.method.toUpperCase(),
    input.path,
    await sha256Hex(input.body),
  ];
  if (input.actingFor !== undefined) lines.push(input.actingFor);
  return lines.join("\n");
}

/**
 * Make the value of the X-Sudoo-Signature header.
 *
 * @param secret - The signing secret.
 * @param input - What to sign.
 * @returns "sha256=" followed by the hex signature.
 */
export async function signatureFor(secret: string, input: SignInput): Promise<string> {
  return `sha256=${await hmacSha256Hex(secret, await canonicalText(input))}`;
}

/**
 * Build the headers of one signed request. A new nonce and timestamp are made unless given (tests give them).
 *
 * @param credentials - The token and signing secret.
 * @param request - The method, the path with its query, the exact body and the user the request acts for.
 * @returns Authorization, X-Sudoo-Timestamp, X-Sudoo-Nonce and X-Sudoo-Signature; X-Sudoo-Acting-For and
 *   Content-Type when they apply.
 */
export async function signedHeaders(
  credentials: { token: string; secret: string },
  request: { method: string; path: string; body?: string; actingFor?: string },
  now: number = Math.floor(Date.now() / 1000),
  nonce: string = makeNonce(),
): Promise<Record<string, string>> {
  if (request.actingFor !== undefined && !ACTING_FOR.test(request.actingFor)) {
    throw new Error("X-Sudoo-Acting-For: 1 to 120 letters, digits, '.', '_', '@', '+' or '-'.");
  }
  const body = request.body ?? "";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${credentials.token}`,
    "X-Sudoo-Timestamp": String(now),
    "X-Sudoo-Nonce": nonce,
    "X-Sudoo-Signature": await signatureFor(credentials.secret, {
      method: request.method,
      path: request.path,
      body,
      timestamp: now,
      nonce,
      actingFor: request.actingFor,
    }),
  };
  if (request.actingFor !== undefined) headers["X-Sudoo-Acting-For"] = request.actingFor;
  if (body) headers["Content-Type"] = "application/json";
  return headers;
}
