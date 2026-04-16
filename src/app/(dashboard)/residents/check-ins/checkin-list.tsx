"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignaturePad } from "@/components/signature-pad";
import { staffSignCheckIn } from "@/app/(dashboard)/check-ins/actions";
import { ChevronDown, ChevronUp, CheckCircle, Clock, Pen } from "lucide-react";

interface CheckInResponseSummary {
  id: string;
  residentName: string;
  status: string;
  completedAt: string | null;
  formData: Record<string, unknown> | null;
  hasStaffSignature: boolean;
  houseId: string;
}

interface CheckInBatch {
  id: string;
  createdBy: string;
  houseNames: string;
  houseIds: string[];
  createdAt: string;
  completedCount: number;
  totalCount: number;
  responses: CheckInResponseSummary[];
}

interface CheckInListProps {
  batches: CheckInBatch[];
}

export function CheckInList({ batches }: CheckInListProps) {
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  if (batches.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No check-ins have been sent yet. Click &ldquo;Send Check-In&rdquo;
            to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {batches.map((batch) => {
        const isExpanded = expandedBatchId === batch.id;
        const allComplete = batch.completedCount === batch.totalCount;

        return (
          <Card key={batch.id}>
            <CardHeader
              className="cursor-pointer"
              onClick={() =>
                setExpandedBatchId(isExpanded ? null : batch.id)
              }
            >
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {batch.houseNames}
                    <Badge
                      variant={allComplete ? "default" : "secondary"}
                    >
                      {batch.completedCount}/{batch.totalCount} completed
                    </Badge>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sent by {batch.createdBy} on{" "}
                    {new Date(batch.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent>
                <div className="space-y-2">
                  {batch.responses.map((r) => (
                    <ResponseRow key={r.id} response={r} />
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Individual response row ─────────────────────────────────

function ResponseRow({
  response,
}: {
  response: CheckInResponseSummary;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const [showSignDialog, setShowSignDialog] = useState(false);

  const isCompleted = response.status === "completed";

  return (
    <>
      <div
        className={`flex items-center justify-between p-3 rounded-lg border ${
          isCompleted ? "bg-green-50/50" : "bg-yellow-50/50"
        }`}
      >
        <div className="flex items-center gap-2">
          {isCompleted ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <Clock className="h-4 w-4 text-yellow-600" />
          )}
          <span className="font-medium text-sm">{response.residentName}</span>
        </div>
        <div className="flex items-center gap-2">
          {isCompleted && response.completedAt && (
            <span className="text-xs text-muted-foreground">
              {new Date(response.completedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
          {isCompleted && !response.hasStaffSignature && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSignDialog(true)}
            >
              <Pen className="h-3 w-3 mr-1" />
              Sign Off
            </Button>
          )}
          {response.hasStaffSignature && (
            <Badge variant="default" className="text-[10px]">
              Staff Signed
            </Badge>
          )}
          {isCompleted && response.formData && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowDetail(!showDetail)}
            >
              {showDetail ? "Hide" : "View"}
            </Button>
          )}
          {!isCompleted && (
            <Badge variant="outline" className="text-yellow-700 border-yellow-400">
              Pending
            </Badge>
          )}
        </div>
      </div>

      {/* Detail view */}
      {showDetail && response.formData && (
        <ResponseDetail formData={response.formData} />
      )}

      {/* Staff sign dialog */}
      {showSignDialog && (
        <StaffSignDialog
          responseId={response.id}
          residentName={response.residentName}
          open={showSignDialog}
          onClose={() => setShowSignDialog(false)}
        />
      )}
    </>
  );
}

// ─── Response detail viewer ──────────────────────────────────

function ResponseDetail({
  formData,
}: {
  formData: Record<string, unknown>;
}) {
  const get = (key: string) => String(formData[key] ?? "—");

  const spiritualItems = [];
  if (formData.spiritual_literature === "true") spiritualItems.push("Literature");
  if (formData.spiritual_prayer === "true") spiritualItems.push("Prayer");
  if (formData.spiritual_meditation === "true") spiritualItems.push("Meditation");

  return (
    <div className="ml-6 p-3 border rounded-md bg-muted/30 text-sm space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <span className="text-muted-foreground">1. Meetings rating:</span>{" "}
          <span className="font-medium">{get("meeting_rating")}/10</span>
        </div>
        <div>
          <span className="text-muted-foreground">6. Work rating:</span>{" "}
          <span className="font-medium">{get("work_rating")}/10</span>
        </div>
        <div>
          <span className="text-muted-foreground">7. JSL feeling:</span>{" "}
          <span className="font-medium">{get("jsl_feeling_rating")}/10</span>
        </div>
        <div>
          <span className="text-muted-foreground">3. Has sponsor:</span>{" "}
          <span className="font-medium">{get("has_sponsor")}</span>
        </div>
      </div>
      <div>
        <span className="text-muted-foreground">2. Meetings —</span>{" "}
        Step: {get("step_meeting_count")}, Big Book: {get("big_book_meeting_count")}, Speaker: {get("speaker_meeting_count")}
      </div>
      <div>
        <span className="text-muted-foreground">4. Call sponsor:</span>{" "}
        {get("call_sponsor_frequency")}
      </div>
      <div>
        <span className="text-muted-foreground">5. Current step:</span>{" "}
        {get("current_step")}
      </div>
      <div>
        <span className="text-muted-foreground">8. Spiritual growth:</span>{" "}
        {spiritualItems.length > 0 ? spiritualItems.join(", ") : "None"}
      </div>
      {formData.questions_concerns ? (
        <div>
          <span className="text-muted-foreground">9. Questions/concerns:</span>
          <p className="mt-1 whitespace-pre-wrap">{get("questions_concerns")}</p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Staff sign dialog ───────────────────────────────────────

function StaffSignDialog({
  responseId,
  residentName,
  open,
  onClose,
}: {
  responseId: string;
  residentName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSigning, startSigning] = useTransition();

  function handleSign() {
    if (!signature) {
      setError("Please sign before submitting.");
      return;
    }

    setError(null);
    startSigning(async () => {
      const result = await staffSignCheckIn(responseId, signature);
      if (result.error) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Sign Off — {residentName}&apos;s Check-In
          </DialogTitle>
        </DialogHeader>

        <SignaturePad
          label="Staff Signature"
          onSignatureChange={setSignature}
        />

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 p-2 rounded-md">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={isSigning}>
            Cancel
          </Button>
          <Button onClick={handleSign} disabled={isSigning || !signature}>
            {isSigning ? "Signing..." : "Submit Signature"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
