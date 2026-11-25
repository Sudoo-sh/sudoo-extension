/**
 * Tests of the passphrase vault: sealing and opening, a wrong passphrase, new IVs, key export and import, and the
 * passphrase rules.
 */

import { describe, expect, it } from "vitest";
import { createVault, exportKey, importKey, open, seal, unlockVault } from "../src/lib/vault";

/** Test group for src/lib/vault.ts. */
describe("the passphrase vault", () => {
  it("seals and opens, and tells a wrong passphrase", async () => {
    const { header, key } = await createVault("correct horse battery", 1000);
    const sealed = await seal(key, JSON.stringify({ token: "sudoo_x", secret: "s" }));
    expect(sealed.ct).not.toContain("sudoo_x");
    const again = await unlockVault(header, "correct horse battery");
    expect(again).not.toBeNull();
    expect(JSON.parse(await open(again as CryptoKey, sealed))).toEqual({ token: "sudoo_x", secret: "s" });
    expect(await unlockVault(header, "wrong passphrase!")).toBeNull();
  });

  it("uses a new IV every time and detects changed data", async () => {
    const { key } = await createVault("another long phrase", 1000);
    const a = await seal(key, "same");
    const b = await seal(key, "same");
    expect(a.iv).not.toBe(b.iv);
    const changed = { ...a, ct: `${a.ct.slice(0, -4)}AAA=` };
    await expect(open(key, changed)).rejects.toThrow();
  });

  it("keeps the key usable after export (memory-only session storage)", async () => {
    const { key } = await createVault("exported key phrase", 1000);
    const copy = await importKey(await exportKey(key));
    expect(await open(copy, await seal(key, "hello"))).toBe("hello");
  });

  it("refuses a short passphrase and uses 600,000 rounds by default", async () => {
    await expect(createVault("short")).rejects.toThrow();
    const { header } = await createVault("a long enough phrase");
    expect(header.iterations).toBe(600000);
  });
});
