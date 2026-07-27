import "server-only";
import { createHash } from "node:crypto";

/**
 * Server-side Meta Conversions API (CAPI). Server-only (enforced by the "server-only"
 * import, same pattern as lib/extractionCap.ts) — META_ACCESS_TOKEN must never reach a
 * client bundle, unlike NEXT_PUBLIC_META_PIXEL_ID which is meant to be public.
 *
 * Degrades to a no-op when unconfigured, matching lib/senders.ts's "simulated" convention —
 * this must never throw and break signup/billing just because Meta isn't set up yet.
 *
 * Only call this from confirmed server-side events (a real DB insert, a verified Stripe
 * webhook) — never from optimistic client-only state, so we don't feed Meta's ad-optimization
 * algorithm fake conversions (same "real data only" spirit as the rest of this codebase).
 */

const GRAPH_API_VERSION = "v25.0";

type MetaEventName = "CompleteRegistration" | "Subscribe";

interface MetaUserData {
  email?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
}

interface SendMetaEventOpts {
  eventName: MetaEventName;
  eventId: string;
  eventSourceUrl: string;
  userData: MetaUserData;
  customData?: Record<string, string | number>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export async function sendMetaConversionEvent(
  opts: SendMetaEventOpts
): Promise<{ status: "sent" | "simulated" | "failed"; error?: string }> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!pixelId || !accessToken) return { status: "simulated" };

  const { eventName, eventId, eventSourceUrl, userData, customData } = opts;
  const user_data: Record<string, string> = {};
  if (userData.email) user_data.em = sha256(userData.email);
  if (userData.fbp) user_data.fbp = userData.fbp;
  if (userData.fbc) user_data.fbc = userData.fbc;
  if (userData.clientIp) user_data.client_ip_address = userData.clientIp;
  if (userData.clientUserAgent) user_data.client_user_agent = userData.clientUserAgent;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [
            {
              event_name: eventName,
              event_time: Math.floor(Date.now() / 1000),
              event_id: eventId,
              action_source: "website",
              event_source_url: eventSourceUrl,
              user_data,
              ...(customData ? { custom_data: customData } : {}),
            },
          ],
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      return { status: "failed", error: `${res.status}: ${body.slice(0, 300)}` };
    }
    return { status: "sent" };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
