"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, ExternalLink, Plus } from "lucide-react";
import { formatDateOnly } from "@/lib/timezone";
import { countCheckedItems } from "@/lib/safety-checklist";
import type { SafetyChecklistResponses } from "@/lib/safety-checklist";

export interface SafetyAssessmentRow {
  id: string;
  assessment_date: string;
  person_completing_name: string;
  created_at: string;
  document_id: string | null;
  checklist: SafetyChecklistResponses;
  completed_by_name: string | null;
}

interface SafetyListProps {
  houseId: string;
  canManage: boolean;
  assessments: SafetyAssessmentRow[];
  documentUrls: Record<string, string>;
  latestThisMonth: boolean;
}

export function SafetyList({
  houseId,
  canManage,
  assessments,
  documentUrls,
  latestThisMonth,
}: SafetyListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          {!latestThisMonth && assessments.length > 0 && (
            <Badge variant="outline" className="text-amber-700 border-amber-600">
              No assessment yet this month
            </Badge>
          )}
          {!latestThisMonth && assessments.length === 0 && (
            <Badge variant="outline" className="text-amber-700 border-amber-600">
              No assessments on file
            </Badge>
          )}
          {latestThisMonth && (
            <Badge variant="outline" className="text-emerald-700 border-emerald-600">
              Up to date
            </Badge>
          )}
        </div>
        {canManage && (
          <Link
            href={`/houses/${houseId}/safety/new`}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            <Plus className="h-4 w-4 mr-1" />
            New assessment
          </Link>
        )}
      </div>

      {assessments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              No safety assessments recorded yet
            </p>
            {canManage && (
              <Link
                href={`/houses/${houseId}/safety/new`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "mt-4"
                )}
              >
                <Plus className="h-4 w-4 mr-1" />
                Start an assessment
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {assessments.map((row) => {
            const { checked, total } = countCheckedItems(row.checklist);
            const url = row.document_id
              ? documentUrls[row.document_id]
              : undefined;
            return (
              <Card key={row.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">
                      {formatDateOnly(row.assessment_date)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Completed by {row.person_completing_name} ·{" "}
                      {checked}/{total} items checked
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "h-8"
                        )}
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        View PDF
                      </a>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled
                      >
                        PDF unavailable
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
