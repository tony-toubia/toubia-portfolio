"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

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

  if (!AXO_SITE_ID || !ALLOWED_HOST.test(hostname) || EXCLUDED_PATH.test(pathname)) {
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
