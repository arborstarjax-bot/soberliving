import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-10 text-center",
        className
      )}
    >
      <Icon className="mb-1 h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description && (
        <p className="max-w-xs text-xs text-muted-foreground/80">{description}</p>
      )}
    </div>
  );
}
