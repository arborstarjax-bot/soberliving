"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Fires a one-shot `router.refresh()` after the page mounts so the
 * cached dashboard layout re-renders with fresh data — specifically,
 * so the sidebar's unread bulletin / notification badge count
 * recomputes after the page itself has already flipped the underlying
 * `is_read` / `last_seen_bulletin_at` row(s).
 *
 * Background: Next.js 16 forbids calling `revalidatePath` during a
 * page's render (it must be invoked from a Server Function or Route
 * Handler), so pages can't ask the router cache to drop the stale
 * layout themselves. `router.refresh()` client-side is the safe
 * equivalent — it invalidates the router cache and re-fetches the
 * current route from the server without a full page reload.
 *
 * Use sparingly — one instance per page that wants this behavior,
 * mounted once. A ref guards against double-fires in React 19 strict
 * mode.
 */
export function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
    // Intentionally empty deps — refresh exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
