import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildAppJwt } from "../src/github/appAuth";

function decodeSegment(seg: string): Record<string, unknown> {
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

describe("buildAppJwt", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  it("produces an RS256 JWT with correct claims", () => {
    const now = 1_000_000;
    const jwt = buildAppJwt({ appId: "424242", privateKey }, now);
    const [h, p] = jwt.split(".");

    expect(decodeSegment(h)).toEqual({ alg: "RS256", typ: "JWT" });
    const payload = decodeSegment(p);
    expect(payload.iss).toBe("424242");
    expect(payload.iat).toBe(now - 60); // backdated for clock skew
    expect(payload.exp).toBe(now + 9 * 60);
  });

  it("signs with the private key so the public key verifies it", () => {
    const jwt = buildAppJwt({ appId: "1", privateKey }, 12345);
    const [h, p, sig] = jwt.split(".");
    const signingInput = `${h}.${p}`;
    const signature = Buffer.from(
      sig.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    );
    const ok = verify(
      "RSA-SHA256",
      Buffer.from(signingInput),
      publicKey,
      signature,
    );
    expect(ok).toBe(true);
  });
});
