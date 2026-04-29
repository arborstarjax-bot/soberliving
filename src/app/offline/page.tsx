import Link from "next/link";

// Rendered by the service worker when a navigation fails and there's
// no cached version of the requested page. Kept deliberately plain:
// no data fetches, no client components, no app shell — it has to be
// servable straight from the browser's cache with zero network.
export default function OfflinePage() {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-background p-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-[#1e2a44] flex items-center justify-center text-white text-xl font-serif font-bold">
          HF
        </div>
        <h1 className="text-xl font-semibold">You&apos;re offline</h1>
        <p className="text-sm text-muted-foreground">
          HouseFlow needs a connection to sync residents, payments,
          and notifications. Check your Wi-Fi or cell signal and try
          again.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Retry
        </Link>
      </div>
    </main>
  );
}

export const dynamic = "force-static";
