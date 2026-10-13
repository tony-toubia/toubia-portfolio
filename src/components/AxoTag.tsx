"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Loads the AXO personalization tag on tonytoubia.com.
 *
 * The site id comes from NEXT_PUBLIC_AXO_SITE_ID. When it is unset, nothing
 * loads, so this is safe to deploy before the AXO site exists.
 *
 * This deployment also answers for slt.ventures and serves the /slt pages,
 * including the WRTT console, which shows private individuals' names. The tag
 * loads only when the host is tonytoubia.com (or www) and the path is outside
 * /slt, so none of that traffic reaches AXO.
 */
const AXO_SITE_ID = process.env.NEXT_PUBLIC_AXO_SITE_ID || "";

const ALLOWED_HOST = /^(www\.)?tonytoubia\.com$/i;
const EXCLUDED_PATH = /^\/slt(\/|$)/i;

// The hostname never changes for the life of the page, so there is nothing
// to subscribe to. The server snapshot is empty, which renders nothing.
const subscribe = () => () => {};
const getHostname = () => window.location.hostname;
const getServerHostname = () => "";

export function AxoTag() {
  const pathname = usePathname() ?? "/";
  const hostname = useSyncExternalStore(subscribe, getHostname, getServerHostname);
  const excluded = EXCLUDED_PATH.test(pathname);
  const active = Boolean(AXO_SITE_ID) && ALLOWED_HOST.test(hostname) && !excluded;

  // A script tag cannot be unloaded, so /slt must never render in a document
  // that has the tag. While the tag is active, turn every route into /slt into
  // a full page load before the Next.js router can render it:
  //  - link clicks: a document capture listener runs before React's handlers
  //    on the root, so a next/link to /slt becomes a plain navigation;
  //  - back/forward: a window capture listener on popstate runs before the
  //    router's own listener and reloads instead.
  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin && EXCLUDED_PATH.test(url.pathname)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.location.assign(url.href);
      }
    };
    const onPopState = (e: PopStateEvent) => {
      if (EXCLUDED_PATH.test(window.location.pathname)) {
        e.stopImmediatePropagation();
        window.location.reload();
      }
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState, true);
    };
  }, [active]);

  // Backstop for any other route in (a programmatic router.push, for
  // example): if /slt has rendered with the tag present, reload at once.
  useEffect(() => {
    if (excluded && document.querySelector('script[src*="axoapp.ai/tag.js"]')) {
      window.location.reload();
    }
  }, [excluded]);

  if (!active) {
    return null;
  }

  return (
    <Script
      id="axo-tag"
      src={`https://axoapp.ai/tag.js?site=${encodeURIComponent(AXO_SITE_ID)}`}
      strategy="afterInteractive"
    />
  );
}
