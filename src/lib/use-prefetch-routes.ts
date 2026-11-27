"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Prefetches the given routes on mount so that client-side navigation
 * resolves almost instantly — the RSC payload is already cached by
 * the time the user taps a link. This is the single biggest lever
 * for making an App Router app feel like a SPA.
 */
export function usePrefetchRoutes(routes: readonly string[]) {
  const router = useRouter();
  useEffect(() => {
    for (const route of routes) {
      router.prefetch(route);
    }
  }, [router, routes]);
}
