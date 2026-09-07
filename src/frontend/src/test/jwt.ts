/**
 * Builds an unsigned JWT for tests. `jwt-decode` only reads the payload, so a
 * fake signature is enough to exercise decoding and expiry logic.
 */
export function makeJwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.sig`;
}

export const nowInSeconds = () => Math.floor(Date.now() / 1000);
