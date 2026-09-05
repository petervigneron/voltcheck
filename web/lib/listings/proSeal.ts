import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM around the Pro artifact (lib/listings/proSignals.ts). Server
// only: the publisher seals, app/api/index/pro/route.ts opens. The key is
// PRO_FEED_KEY, hashed so any string works; the artifact is
// iv (12) ‖ ciphertext ‖ tag (16), one opaque binary in the public bucket.

const key = (secret: string) => createHash("sha256").update(secret).digest();

export function seal(plain: string, secret: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, body, c.getAuthTag()]);
}

/** Throws on a wrong key or a tampered body — never returns a partial read. */
export function open(sealed: Uint8Array, secret: string): string {
  const b = Buffer.from(sealed);
  if (b.length < 28) throw new Error("sealed body too short");
  const iv = b.subarray(0, 12);
  const tag = b.subarray(b.length - 16);
  const body = b.subarray(12, b.length - 16);
  const d = createDecipheriv("aes-256-gcm", key(secret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}
