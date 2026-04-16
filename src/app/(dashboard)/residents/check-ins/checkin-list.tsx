"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, CheckCircle, Clock } from "lucide-react";

interface CheckInResponseSummary {
  id: string;
  residentName: string;
  status: string;
  completedAt: string | null;
  formData: Record<string, unknown> | null;
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
        {[
          formData.meeting_step === "true" && "Step Meeting",
          formData.meeting_big_book === "true" && "Big Book Meeting",
          formData.meeting_speaker === "true" && "Speaker Meeting",
        ].filter(Boolean).join(", ") || "None selected"}
      </div>
      <div>
        <span className="text-muted-foreground">4. Call sponsor:</span>{" "}
        {get("call_sponsor_frequency")}
      </div>
      <div>
        <span className="text-muted-foreground">5. Current step:</span>{" "}
        {formData.current_step ? `Step ${get("current_step")}` : "—"}
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
