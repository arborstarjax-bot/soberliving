"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SAFETY_CHECKLIST,
  type SafetyChecklistResponses,
  countCheckedItems,
} from "@/lib/safety-checklist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad } from "@/components/signature-pad";
import { submitSafetyAssessment } from "./actions";

interface NewAssessmentFormProps {
  houseId: string;
  houseName: string;
  todayIso: string; // YYYY-MM-DD in house tz
  defaultPersonName: string;
}

export function NewAssessmentForm({
  houseId,
  houseName,
  todayIso,
  defaultPersonName,
}: NewAssessmentFormProps) {
  const router = useRouter();
  const [responses, setResponses] = useState<SafetyChecklistResponses>({});
  const [assessmentDate, setAssessmentDate] = useState(todayIso);
  const [personName, setPersonName] = useState(defaultPersonName);
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { checked, total } = useMemo(
    () => countCheckedItems(responses),
    [responses]
  );

  function toggleItem(sectionKey: string, itemKey: string, checkedNow: boolean) {
    setResponses((prev) => {
      const next: SafetyChecklistResponses = { ...prev };
      const section = { ...(next[sectionKey] ?? {}) };
      if (checkedNow) section[itemKey] = true;
      else delete section[itemKey];
      if (Object.keys(section).length === 0) delete next[sectionKey];
      else next[sectionKey] = section;
      return next;
    });
  }

  function setAllInSection(sectionKey: string, value: boolean) {
    setResponses((prev) => {
      const next: SafetyChecklistResponses = { ...prev };
      const section = SAFETY_CHECKLIST.find((s) => s.key === sectionKey);
      if (!section) return next;
      if (value) {
        next[sectionKey] = Object.fromEntries(
          section.items.map((i) => [i.key, true])
        );
      } else {
        delete next[sectionKey];
      }
      return next;
    });
  }

  function submit() {
    setError(null);
    if (!signature) {
      setError("Please sign the assessment before submitting.");
      return;
    }
    if (!personName.trim()) {
      setError("Please enter the name of the person completing the assessment.");
      return;
    }
    startTransition(async () => {
      const result = await submitSafetyAssessment({
        houseId,
        assessmentDate,
        personCompletingName: personName.trim(),
        signature,
        checklist: responses,
        notes: notes.trim() ? notes.trim() : null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/houses/${houseId}?tab=safety`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Safety Assessment</h1>
        <p className="text-sm text-muted-foreground">
          {houseName} · {checked}/{total} items checked
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="assessment_date">Date completed</Label>
              <Input
                id="assessment_date"
                type="date"
                value={assessmentDate}
                onChange={(e) => setAssessmentDate(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="person_name">Person completing</Label>
              <Input
                id="person_name"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="Full name"
                disabled={isPending}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {SAFETY_CHECKLIST.map((section) => {
        const sectionResponses = responses[section.key] ?? {};
        const sectionChecked = section.items.filter(
          (i) => sectionResponses[i.key] === true
        ).length;
        const allChecked = sectionChecked === section.items.length;
        return (
          <Card key={section.key}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{section.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {sectionChecked}/{section.items.length} checked
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setAllInSection(section.key, !allChecked)
                  }
                  disabled={isPending}
                >
                  {allChecked ? "Clear all" : "Check all"}
                </Button>
              </div>
              <ul className="space-y-2">
                {section.items.map((item) => {
                  const id = `${section.key}__${item.key}`;
                  const isChecked = sectionResponses[item.key] === true;
                  return (
                    <li key={item.key} className="flex items-start gap-3">
                      <Checkbox
                        id={id}
                        checked={isChecked}
                        onCheckedChange={(v) =>
                          toggleItem(section.key, item.key, v)
                        }
                        disabled={isPending}
                      />
                      <label
                        htmlFor={id}
                        className="text-sm leading-relaxed cursor-pointer"
                      >
                        {item.label}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observations, follow-ups, items to address…"
              rows={4}
              disabled={isPending}
            />
          </div>
          <SignaturePad
            onSignatureChange={setSignature}
            label="Signature of person completing"
          />
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/houses/${houseId}?tab=safety`)}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={isPending || !signature}>
          {isPending ? "Saving…" : "Submit assessment"}
        </Button>
      </div>
    </div>
  );
}
