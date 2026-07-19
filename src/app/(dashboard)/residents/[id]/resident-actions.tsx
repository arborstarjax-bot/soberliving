"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { dischargeResident } from "../actions";
import type { ResidentStatus } from "@/lib/types";

interface Props {
  residentId: string;
  status: ResidentStatus;
}

export function ResidentActions({ residentId, status }: Props) {
  const [isPending, startTransition] = useTransition();

  if (status !== "active") return null;

  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={isPending}
      onClick={() => {
        if (confirm("Are you sure you want to discharge this resident? This will vacate all their beds.")) {
          startTransition(() => { dischargeResident(residentId); });
        }
      }}
    >
      {isPending ? "Discharging…" : "Discharge"}
    </Button>
  );
}
