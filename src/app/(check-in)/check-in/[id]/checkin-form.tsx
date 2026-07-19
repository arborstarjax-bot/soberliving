"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignaturePad } from "@/components/signature-pad";
import { submitCheckIn } from "@/app/(dashboard)/check-ins/actions";
import { generateCheckInPdf } from "./generate-checkin-pdf";

interface CheckInFormProps {
  responseId: string;
  residentName: string;
  houseName: string;
  initialData: Record<string, string> | null;
}

export function CheckInForm({
  responseId,
  residentName,
  houseName,
  initialData,
}: CheckInFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<Record<string, string>>(
    initialData ?? {
      date: new Date().toLocaleDateString("en-US"),
    }
  );
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();

  const updateField = useCallback((name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const toggleCheckbox = useCallback((name: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: prev[name] === "true" ? "false" : "true",
    }));
  }, []);

  function handleSubmit() {
    setError(null);

    // Basic validation
    if (!formData.meeting_rating) {
      setError("Please rate how you feel about meetings (Question 1).");
      return;
    }
    if (!formData.has_sponsor) {
      setError("Please answer whether you have a sponsor (Question 3).");
      return;
    }
    if (!formData.work_rating) {
      setError("Please rate how work is going (Question 7).");
      return;
    }
    if (!formData.jsl_feeling_rating) {
      setError(
        "Please rate how you feel about being a resident at JSL (Question 8)."
      );
      return;
    }
    if (!signature) {
      setError("Please sign before submitting.");
      return;
    }

    startSubmitting(async () => {
      try {
        const pdfBase64 = await generateCheckInPdf(
          formData,
          residentName,
          houseName,
          signature
        );
        const result = await submitCheckIn(responseId, formData, pdfBase64);
        if (result?.error) {
          setError(result.error);
        } else {
          router.push("/dashboard");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to submit check-in"
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Monthly Check-In</h1>
        <p className="text-muted-foreground">
          Please complete this check-in before continuing.
        </p>
      </div>

      {/* Prefilled info */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Resident:</span>{" "}
              <span className="font-medium">{residentName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Date:</span>{" "}
              <span className="font-medium">
                {new Date().toLocaleDateString("en-US")}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">House:</span>{" "}
              <span className="font-medium">{houseName}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Q1: Meeting rating */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            1. How do you feel about meetings?
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            1 = terrible, 10 = best
          </p>
        </CardHeader>
        <CardContent>
          <RatingScale
            name="meeting_rating"
            value={formData.meeting_rating}
            onChange={updateField}
          />
        </CardContent>
      </Card>

      {/* Q2: Mandatory meetings — checkboxes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            2. Of your 7 mandatory meetings a week, are you making at least one
            of the following?
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Check all that apply
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <CheckboxItem
              label="Step Meeting"
              checked={formData.meeting_step === "true"}
              onChange={() => toggleCheckbox("meeting_step")}
            />
            <CheckboxItem
              label="Big Book Meeting"
              checked={formData.meeting_big_book === "true"}
              onChange={() => toggleCheckbox("meeting_big_book")}
            />
            <CheckboxItem
              label="Speaker Meeting"
              checked={formData.meeting_speaker === "true"}
              onChange={() => toggleCheckbox("meeting_speaker")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Q3: Sponsor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            3. Do you have a sponsor?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button
              type="button"
              variant={formData.has_sponsor === "Yes" ? "default" : "outline"}
              onClick={() => updateField("has_sponsor", "Yes")}
            >
              Yes
            </Button>
            <Button
              type="button"
              variant={formData.has_sponsor === "No" ? "default" : "outline"}
              onClick={() => updateField("has_sponsor", "No")}
            >
              No
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Q4: Call sponsor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            4. How often do you call your sponsor?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={formData.call_sponsor_frequency ?? ""}
            onChange={(e) =>
              updateField("call_sponsor_frequency", e.target.value)
            }
            placeholder="e.g., Daily, Weekly, etc."
          />
        </CardContent>
      </Card>

      {/* Q5: Current step — dropdown 1-12 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            5. What step are you working on now?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <select
            value={formData.current_step ?? ""}
            onChange={(e) => updateField("current_step", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select a step...</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={String(n)}>
                Step {n}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Q6: Current job */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            6. What is your current job?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={formData.current_job ?? ""}
            onChange={(e) => updateField("current_job", e.target.value)}
            placeholder="e.g., Warehouse associate, Server, etc."
          />
        </CardContent>
      </Card>

      {/* Q7: Work rating */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">7. How is work going?</CardTitle>
          <p className="text-sm text-muted-foreground">
            1 = terrible, 10 = best
          </p>
        </CardHeader>
        <CardContent>
          <RatingScale
            name="work_rating"
            value={formData.work_rating}
            onChange={updateField}
          />
        </CardContent>
      </Card>

      {/* Q8: Feeling about JSL */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            8. How are you feeling about being a resident at JSL?
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            1 = terrible, 10 = best
          </p>
        </CardHeader>
        <CardContent>
          <RatingScale
            name="jsl_feeling_rating"
            value={formData.jsl_feeling_rating}
            onChange={updateField}
          />
        </CardContent>
      </Card>

      {/* Q9: Spiritual growth */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            9. What are you doing daily to grow spiritually?
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Check all that apply
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <CheckboxItem
              label="Literature"
              checked={formData.spiritual_literature === "true"}
              onChange={() => toggleCheckbox("spiritual_literature")}
            />
            <CheckboxItem
              label="Prayer"
              checked={formData.spiritual_prayer === "true"}
              onChange={() => toggleCheckbox("spiritual_prayer")}
            />
            <CheckboxItem
              label="Meditation"
              checked={formData.spiritual_meditation === "true"}
              onChange={() => toggleCheckbox("spiritual_meditation")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Q10: Questions/concerns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            10. Do you have any questions or concerns I can help you with?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.questions_concerns ?? ""}
            onChange={(e) =>
              updateField("questions_concerns", e.target.value)
            }
            rows={4}
            placeholder="Type your questions or concerns here..."
          />
        </CardContent>
      </Card>

      {/* Resident Signature */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resident Signature</CardTitle>
        </CardHeader>
        <CardContent>
          <SignaturePad
            label="Sign below to confirm your answers"
            onSignatureChange={setSignature}
          />
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </p>
      )}

      {/* Submit */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          size="lg"
        >
          {isSubmitting ? "Submitting..." : "Submit Check-In"}
        </Button>
      </div>
    </div>
  );
}

// ─── Rating Scale (1-10) ──────────────────────────────────────

function RatingScale({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string | undefined;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(name, String(n))}
          className={`w-10 h-10 rounded-md border text-sm font-medium transition-colors ${
            value === String(n)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background hover:bg-muted border-input"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ─── Checkbox Item ────────────────────────────────────────────

function CheckboxItem({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
        checked
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-muted border-input"
      }`}
    >
      <span
        className={`w-4 h-4 rounded border flex items-center justify-center ${
          checked ? "bg-white border-white" : "border-current"
        }`}
      >
        {checked && (
          <svg
            className="w-3 h-3 text-primary"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M2 6l3 3 5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}
