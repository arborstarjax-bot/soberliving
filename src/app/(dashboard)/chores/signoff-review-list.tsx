"use client";

import { useTransition, useState } from "react";
import { reviewSignoff } from "./actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, ImageIcon } from "lucide-react";
import { formatDateOnly } from "@/lib/timezone";

interface Signoff {
  id: string;
  sign_off_date: string;
  day_of_week: string;
  week_number: number;
  photo_url?: string | null;
  completion_note?: string | null;
  rotation_assignment: {
    resident: { full_name: string } | null;
    chore: { name: string; house_id: string } | null;
  } | null;
}

interface Props {
  signoffs: Signoff[];
}

export function SignoffReviewList({ signoffs }: Props) {
  if (signoffs.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No chore signoffs awaiting review
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {signoffs.map((s) => (
        <SignoffReviewCard key={s.id} signoff={s} />
      ))}
    </div>
  );
}

function SignoffReviewCard({ signoff }: { signoff: Signoff }) {
  const [isPending, startTransition] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [rejectionNote, setRejectionNote] = useState("");
  const [showPhoto, setShowPhoto] = useState(false);

  const ra = signoff.rotation_assignment;

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-3">
        <div className="space-y-1">
          <p className="font-medium">{ra?.chore?.name}</p>
          <p className="text-xs text-muted-foreground">
            {ra?.resident?.full_name} ·{" "}
            {formatDateOnly(signoff.sign_off_date)} ·{" "}
            <span className="capitalize">{signoff.day_of_week}</span> (Week{" "}
            {signoff.week_number})
          </p>
          {signoff.completion_note && (
            <p className="text-xs text-muted-foreground italic">Note: {signoff.completion_note}</p>
          )}
          {signoff.photo_url && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              onClick={() => setShowPhoto(!showPhoto)}
            >
              <ImageIcon className="h-3 w-3" />
              {showPhoto ? "Hide photo" : "View photo"}
            </button>
          )}
          {showPhoto && signoff.photo_url && (
            <img
              src={signoff.photo_url}
              alt="Chore completion photo"
              className="mt-1 max-w-xs rounded border"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          {showReject ? (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Reason..."
                value={rejectionNote}
                onChange={(e) => setRejectionNote(e.target.value)}
                className="w-40 h-8"
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={isPending}
                onClick={() =>
                  startTransition(() => {
                    reviewSignoff(signoff.id, "reject", rejectionNote);
                  })
                }
              >
                Reject
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowReject(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <Button
                size="sm"
                variant="default"
                disabled={isPending}
                onClick={() =>
                  startTransition(() => {
                    reviewSignoff(signoff.id, "approve");
                  })
                }
              >
                <Check className="mr-1 h-3 w-3" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => setShowReject(true)}
              >
                <X className="mr-1 h-3 w-3" />
                Reject
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
