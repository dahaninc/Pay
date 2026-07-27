"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/**
 * Refires PageView on client-side route changes — App Router navigations don't trigger a
 * full page load, so the Pixel's own automatic history-based PageView never fires again
 * after the first load without this.
 *
 * Also fires a paired browser-side event for dedup against a server-side CAPI call: when a
 * server action redirects with ?meta_ev=<EventName>&meta_eid=<uuid> (the SAME uuid it sent
 * to sendMetaConversionEvent), this fires fbq('track', EventName, {}, {eventID: uuid}) once —
 * Meta dedups the pair by matching event_name + event_id. A ref guards against re-firing the
 * same eid if this effect re-runs (e.g. searchParams object identity changing on rerender).
 */
function MetaPixelRouteTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firedEventIds = useRef(new Set<string>());

  useEffect(() => {
    if (typeof window.fbq !== "function") return;
    window.fbq("track", "PageView");

    const eventName = searchParams.get("meta_ev");
    const eventId = searchParams.get("meta_eid");
    if (eventName && eventId && !firedEventIds.current.has(eventId)) {
      firedEventIds.current.add(eventId);
      window.fbq("track", eventName, {}, { eventID: eventId });
    }
  }, [pathname, searchParams]);

  return null;
}

export function MetaPixel({ pixelId }: { pixelId: string }) {
  return (
    <>
      <Script id="meta-pixel-base" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window,document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${pixelId}');
          fbq('track', 'PageView');
        `}
      </Script>
      <Suspense fallback={null}>
        <MetaPixelRouteTracker />
      </Suspense>
    </>
  );
}
