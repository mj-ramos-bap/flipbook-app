import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  return process.env.LINK_SECRET ?? process.env.NEXTAUTH_SECRET ?? "flipbook-no-secret-set";
}

// Returns a URL-safe HMAC-SHA256 signature for a flipbook UUID.
// Used to make share links tamper-proof — changing the UUID invalidates the token.
export function signUuid(uuid: string): string {
  return createHmac("sha256", secret()).update(uuid).digest("base64url");
}

export function verifyUuid(uuid: string, token: string): boolean {
  try {
    const expected = signUuid(uuid);
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
