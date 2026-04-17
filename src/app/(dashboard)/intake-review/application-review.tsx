"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { IntakeReviewForm } from "./intake-review-form";
import { DenyButton } from "./deny-button";

interface House {
  id: string;
  name: string;
  address: string | null;
}

interface Props {
  userId: string;
  userName: string;
  email: string | null;
  phone: string | null;
  submittedAt: string | null;
  houses: House[];
  isAdmin: boolean;
  formData: Record<string, unknown>;
}

/**
 * Two-step intake review:
 *
 *   Step 1 — Review: PDF-style read-only view of the applicant's full
 *   intake packet with Approve / Deny at the top. Admin can deny
 *   (reason dialog); anyone reviewing can approve to move forward.
 *
 *   Step 2 — Assign: the existing housing-assignment + rent-config form
 *   is revealed only after Approve is clicked. The final
 *   "Complete Intake Review & Sign Commitment" submit still lives
 *   inside IntakeReviewForm.
 *
 * Approve here is just a UI gate — the authoritative approval is the
 * completeIntakeReview server action at the end of step 2 (which writes
 * the resident row, bed assignment, commitment, etc).
 */
export function ApplicationReview({
  userId,
  userName,
  email,
  phone,
  submittedAt,
  houses,
  isAdmin,
  formData: fd,
}: Props) {
  const [step, setStep] = useState<"review" | "assign">("review");
  // Collapse the full PDF packet by default so the Approve/Deny actions
  // stay above the fold — especially on phones where the packet pushes
  // the decision buttons many screens down.
  const [packetOpen, setPacketOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <StepPill active={step === "review"} done={step === "assign"} label="1. Review application" />
          <ArrowRight className="h-3.5 w-3.5" />
          <StepPill active={step === "assign"} done={false} label="2. Assign housing & rent" />
        </div>
        <div className="flex items-center gap-2">
          {step === "review" && (
            <>
              {isAdmin && <DenyButton userId={userId} userName={userName} />}
              <Button size="sm" onClick={() => setStep("assign")}>
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Approve &amp; Assign
              </Button>
            </>
          )}
          {step === "assign" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStep("review")}
            >
              Back to Review
            </Button>
          )}
        </div>
      </div>

      {step === "review" ? (
        <div className="space-y-3">
          <ApplicantSummary
            userName={userName}
            email={email}
            phone={phone}
            submittedAt={submittedAt}
          />
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={() => setPacketOpen((v) => !v)}
            aria-expanded={packetOpen}
          >
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {packetOpen ? "Hide Application" : "View Application"}
            </span>
            {packetOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          {packetOpen && (
            <ReviewPacket
              userName={userName}
              email={email}
              phone={phone}
              submittedAt={submittedAt}
              fd={fd}
            />
          )}
        </div>
      ) : (
        <IntakeReviewForm
          userId={userId}
          userName={userName}
          houses={houses}
        />
      )}
    </div>
  );
}

function ApplicantSummary({
  userName,
  email,
  phone,
  submittedAt,
}: {
  userName: string;
  email: string | null;
  phone: string | null;
  submittedAt: string | null;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="text-lg font-semibold">{userName}</p>
      <p className="text-sm text-muted-foreground break-words">
        {email ?? "\u2014"}
        {phone ? ` \u2022 ${phone}` : ""}
      </p>
      {submittedAt && (
        <p className="text-xs text-muted-foreground mt-1">
          Submitted {new Date(submittedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

function StepPill({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground"
          : done
            ? "rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground line-through"
            : "rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
      }
    >
      {label}
    </span>
  );
}

/**
 * Read-only formatted display of the submitted intake form.
 * Field names mirror the submit payload in intake-form-wizard.tsx.
 * Keeping this dumb (no editing) — staff just needs to read through
 * the packet before deciding approve/deny.
 */
function ReviewPacket({
  userName,
  email,
  phone,
  submittedAt,
  fd,
}: {
  userName: string;
  email: string | null;
  phone: string | null;
  submittedAt: string | null;
  fd: Record<string, unknown>;
}) {
  const s = (k: string) => (fd[k] as string | undefined)?.toString().trim() || null;
  const ynToLabel = (v: string | null) => {
    if (!v) return null;
    if (v === "yes") return "Yes";
    if (v === "no") return "No";
    return v;
  };

  return (
    <div className="rounded-lg border bg-background p-6 space-y-6 print:p-0">
      <header className="border-b pb-4">
        <h2 className="text-xl font-bold">Intake Application</h2>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="font-medium text-foreground">{userName}</span>
          {email ? ` • ${email}` : ""}
          {phone ? ` • ${phone}` : ""}
          {submittedAt
            ? ` • Submitted ${new Date(submittedAt).toLocaleDateString()}`
            : ""}
        </p>
      </header>

      <Section title="Personal Information">
        <Grid>
          <Row label="First Name" value={s("first_name")} />
          <Row label="Middle Name" value={s("middle_name")} />
          <Row label="Last Name" value={s("last_name")} />
          <Row label="Admission Date" value={s("admission_date")} />
          <Row label="Date of Birth" value={s("date_of_birth")} />
          <Row label="Gender" value={s("gender")} />
          <Row label="Phone" value={s("phone")} />
          <Row label="Email" value={s("email")} />
        </Grid>
        <Grid cols={1}>
          <Row label="Home Address" value={s("home_address")} />
        </Grid>
        <Grid>
          <Row label="City" value={s("city")} />
          <Row label="State" value={s("state")} />
          <Row label="Zip" value={s("zip")} />
        </Grid>
      </Section>

      <Section title="Vehicle">
        <Grid>
          <Row label="Owns Vehicle" value={ynToLabel(s("owns_vehicle"))} />
          {s("owns_vehicle") === "yes" && (
            <>
              <Row label="Year / Make / Model / Color" value={s("vehicle_info")} />
              <Row label="License Plate / State" value={s("license_plate")} />
              <Row label="Insurance" value={s("insurance_info")} />
            </>
          )}
        </Grid>
      </Section>

      <Section title="Referral & Recovery">
        <Grid cols={1}>
          <Row label="Referral Source" value={s("referral_source")} />
        </Grid>
        <Grid>
          <Row
            label="Struggles with Substances"
            value={ynToLabel(s("struggles_with_substances"))}
          />
          <Row label="In a Recovery Program" value={ynToLabel(s("in_recovery_program"))} />
          <Row label="Attending IOP" value={ynToLabel(s("attending_iop"))} />
          <Row label="IOP Program Name" value={s("iop_program_name")} />
        </Grid>
        <Grid cols={1}>
          <Row label="Medications" value={s("medications")} multiline />
          <Row label="Medical History / Issues" value={s("medical_history")} multiline />
          <Row label="Mental Illness Diagnosis" value={s("mental_illness")} multiline />
          <Row label="Physical Health Issues" value={s("physical_health")} multiline />
        </Grid>
      </Section>

      <Section title="Emergency Contact 1 (required)">
        <Grid>
          <Row label="Name" value={s("emergency_contact_1_name")} />
          <Row label="Relationship" value={s("emergency_contact_1_relationship")} />
          <Row label="Phone" value={s("emergency_contact_1_phone")} />
        </Grid>
      </Section>

      {(s("emergency_contact_2_name") ||
        s("emergency_contact_2_phone")) && (
        <Section title="Emergency Contact 2">
          <Grid>
            <Row label="Name" value={s("emergency_contact_2_name")} />
            <Row label="Relationship" value={s("emergency_contact_2_relationship")} />
            <Row label="Phone" value={s("emergency_contact_2_phone")} />
          </Grid>
        </Section>
      )}

      {(s("financial_contact_name") || s("financial_contact_phone")) && (
        <Section title="Financial Contact">
          <Grid>
            <Row label="Name" value={s("financial_contact_name")} />
            <Row label="Relationship" value={s("financial_contact_relationship")} />
            <Row label="Phone" value={s("financial_contact_phone")} />
          </Grid>
        </Section>
      )}

      <Section title="Facility & Sobriety">
        <Grid>
          <Row label="Facility Name" value={s("facility_name")} />
          <Row label="Discharge Date" value={s("facility_discharge_date")} />
          <Row label="Length of Stay" value={s("facility_length_of_stay")} />
          <Row
            label="Completed Program"
            value={ynToLabel(s("completed_program"))}
          />
          <Row label="Sobriety Date" value={s("sobriety_date")} />
          <Row label="Drug of Choice" value={s("drug_of_choice")} />
        </Grid>
        {s("program_not_completed_reason") && (
          <Grid cols={1}>
            <Row
              label="Reason Program Not Completed"
              value={s("program_not_completed_reason")}
              multiline
            />
          </Grid>
        )}
        {s("recent_drugs") && (
          <Grid cols={1}>
            <Row
              label="Recent Drugs Used & Last Use Dates"
              value={s("recent_drugs")}
              multiline
            />
          </Grid>
        )}
      </Section>

      <Section title="Background">
        <Grid>
          <Row label="Convicted Felon" value={ynToLabel(s("convicted_felon"))} />
          <Row label="Sex Offender" value={ynToLabel(s("sex_offender"))} />
          <Row
            label="Violent Crime History"
            value={ynToLabel(s("violent_crime_history"))}
          />
        </Grid>
        {s("conviction_explanation") && (
          <Grid cols={1}>
            <Row
              label="Conviction Explanation"
              value={s("conviction_explanation")}
              multiline
            />
          </Grid>
        )}
        {s("violent_crime_explanation") && (
          <Grid cols={1}>
            <Row
              label="Violent Crime Explanation"
              value={s("violent_crime_explanation")}
              multiline
            />
          </Grid>
        )}
      </Section>

      {(s("roi_contact_name") || s("roi_contact_phone")) && (
        <Section title="Release of Information Contact">
          <Grid>
            <Row label="Contact Name" value={s("roi_contact_name")} />
            <Row label="Relationship" value={s("roi_contact_relationship")} />
            <Row label="Phone" value={s("roi_contact_phone")} />
          </Grid>
        </Section>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
        <Badge variant="secondary">Application Complete</Badge>
        <span>
          Review the sections above, then choose Approve &amp; Assign or Deny.
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Grid({
  children,
  cols = 3,
}: {
  children: React.ReactNode;
  cols?: 1 | 2 | 3;
}) {
  const cls =
    cols === 1
      ? "grid gap-3"
      : cols === 2
        ? "grid gap-3 sm:grid-cols-2"
        : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";
  return <div className={cls}>{children}</div>;
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <div className="text-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={
          multiline
            ? "mt-0.5 whitespace-pre-wrap font-medium"
            : "mt-0.5 font-medium"
        }
      >
        {value || <span className="font-normal text-muted-foreground">—</span>}
      </div>
    </div>
  );
}
