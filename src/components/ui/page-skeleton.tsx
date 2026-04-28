import { cn } from "@/lib/utils";

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

function CardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <SkeletonPulse className="h-4 w-2/5" />
        <SkeletonPulse className="h-5 w-16 rounded-full" />
      </div>
      <SkeletonPulse className="h-3 w-3/5" />
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <SkeletonPulse className="h-3 w-20" />
      <SkeletonPulse className="h-7 w-12" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonPulse className="h-7 w-48" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function ListPageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SkeletonPulse className="h-7 w-40" />
        <SkeletonPulse className="h-9 w-24 rounded-md" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonPulse key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <SkeletonPulse className="h-5 w-5 rounded" />
        <SkeletonPulse className="h-7 w-48" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <SkeletonPulse className="h-5 w-32" />
          <SkeletonPulse className="h-3 w-full" />
          <SkeletonPulse className="h-3 w-4/5" />
          <SkeletonPulse className="h-3 w-3/5" />
        </div>
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <SkeletonPulse className="h-5 w-32" />
          <SkeletonPulse className="h-3 w-full" />
          <SkeletonPulse className="h-3 w-2/3" />
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
