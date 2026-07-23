import crypto from "crypto";

/**
 * Svix webhook signature check (Resend signs all its webhooks this way: HMAC-SHA256 over
 * "{id}.{timestamp}.{body}" with the base64-decoded whsec_ secret, sent in svix-* headers).
 *
 * Matches this codebase's "degrade without keys" pattern: when the secret isn't configured
 * yet, requests are accepted (the caller logs a warning so the gap is visible); once the
 * secret is set, verification fails closed.
 */
export function verifySvixSignature(
  rawBody: string,
  headers: Headers,
  secret: string | undefined
): boolean {
  if (!secret) return true; // not configured yet — caller should log a warning
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  return signature
    .split(" ")
    .map((s) => s.split(",")[1])
    .filter(Boolean)
    .some((sig) => {
      try {
        return crypto.timingSafeEqual(Buffer.from(sig, "base64"), Buffer.from(expected, "base64"));
      } catch {
        return false;
      }
    });
}
