import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalText, makeNonce, sha256Hex, signedHeaders } from "../src/lib/signing";

const credentials = { token: "sudoo_test", secret: "test-secret" };

/** An independent implementation of PANEL_API.md section 2, with Node's crypto. */
function expected(lines: string[]): string {
  return `sha256=${createHmac("sha256", credentials.secret).update(lines.join("\n")).digest("hex")}`;
}

describe("signing", () => {
  it("hashes an empty body as the documentation shows", async () => {
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("signs the five lines of a GET, with no newline at the end", async () => {
    const text = await canonicalText({
      method: "get",
      path: "/api/v1/instances",
      body: "",
      timestamp: 1794430123,
      nonce: "p4Xq9mW2abcdefgh",
    });
    expect(text).toBe(
      "1794430123\np4Xq9mW2abcdefgh\nGET\n/api/v1/instances\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    const headers = await signedHeaders(
      credentials,
      { method: "GET", path: "/api/v1/instances" },
      1794430123,
      "p4Xq9mW2abcdefgh",
    );
    expect(headers.Authorization).toBe("Bearer sudoo_test");
    expect(headers["X-Sudoo-Timestamp"]).toBe("1794430123");
    expect(headers["X-Sudoo-Nonce"]).toBe("p4Xq9mW2abcdefgh");
    expect(headers["X-Sudoo-Signature"]).toBe(expected(text.split("\n")));
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("signs the exact body and the query", async () => {
    const body = JSON.stringify({ confirm_production: true });
    const path = "/api/v1/instances/shop-main/actions/pause?x=1";
    const headers = await signedHeaders(credentials, { method: "POST", path, body }, 1700000000, "n".repeat(16));
    const hash = createHash("sha256").update(body).digest("hex");
    expect(headers["X-Sudoo-Signature"]).toBe(expected(["1700000000", "n".repeat(16), "POST", path, hash]));
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("adds X-Sudoo-Acting-For as the sixth line", async () => {
    const headers = await signedHeaders(
      credentials,
      { method: "GET", path: "/api/v1/instances", actingFor: "sara@example.com" },
      1,
      "a".repeat(16),
    );
    expect(headers["X-Sudoo-Acting-For"]).toBe("sara@example.com");
    expect(headers["X-Sudoo-Signature"]).toBe(
      expected([
        "1",
        "a".repeat(16),
        "GET",
        "/api/v1/instances",
        createHash("sha256").update("").digest("hex"),
        "sara@example.com",
      ]),
    );
  });

  it("refuses an acting-for value the panel would refuse", async () => {
    await expect(signedHeaders(credentials, { method: "GET", path: "/", actingFor: "sara example" })).rejects.toThrow();
    await expect(signedHeaders(credentials, { method: "GET", path: "/", actingFor: "" })).rejects.toThrow();
  });

  it("makes nonces the panel accepts, new every time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const nonce = makeNonce();
      expect(nonce).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
      seen.add(nonce);
    }
    expect(seen.size).toBe(200);
  });
});
