"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export function ResidentsSearch({
  defaultValue,
}: {
  defaultValue: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        key={defaultValue}
        defaultValue={defaultValue}
        placeholder="Search residents…"
        className="pl-8"
        onChange={(e) => {
          const q = e.target.value;
          startTransition(() => {
            const next = new URLSearchParams(params.toString());
            if (q) next.set("q", q);
            else next.delete("q");
            router.replace(`?${next.toString()}`);
          });
        }}
      />
    </div>
  );
}
