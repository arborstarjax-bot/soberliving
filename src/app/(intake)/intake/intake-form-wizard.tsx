"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignaturePad } from "@/components/signature-pad";
import { Loader2 } from "lucide-react";
import { saveIntakeProgress, submitIntakeForm } from "../actions";
import { generateIntakePdf } from "./generate-pdf";
import {
  getAllPolicies,
  getApplicationAttestText,
  getDocumentReceiptText,
  getRoiIntroText,
  type PolicyPageContent,
} from "./policy-text";

const TOTAL_PAGES = 8;

interface IntakeFormWizardProps {
  userName: string;
  userEmail: string;
  facilityName: string;
  initialData: Record<string, string> | null;
  initialSignatures: Record<string, string> | null;
}

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function IntakeFormWizard({
  userName,
  userEmail,
  facilityName,
  initialData,
  initialSignatures,
}: IntakeFormWizardProps) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [formData, setFormData] = useState<Record<string, string>>(
    initialData ?? { full_name: userName, email: userEmail }
  );
  const [signatures, setSignatures] = useState<Record<string, string>>(
    initialSignatures ?? {}
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isSubmitting, startSubmitting] = useTransition();

  const policies = getAllPolicies(facilityName);

  const updateField = useCallback((name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const updateSignature = useCallback((key: string, dataUrl: string | null) => {
    setSignatures((prev) => {
      const next = { ...prev };
      if (dataUrl) {
        next[key] = dataUrl;
      } else {
        delete next[key];
      }
      return next;
    });
  }, []);

  function handleNext() {
    setError(null);
    startSaving(async () => {
      await saveIntakeProgress(formData, signatures);
    });
    setPage((p) => Math.min(p + 1, TOTAL_PAGES));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePrev() {
    setPage((p) => Math.max(p - 1, 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSubmit() {
    setError(null);

    const requiredSigs = [
      "resident_application",
      ...policies.map((p) => p.signatureKey),
      "release_of_information",
      "document_receipt",
    ];
    const missing = requiredSigs.filter((k) => !signatures[k]);
    if (missing.length > 0) {
      setError(
        `Please sign every signature box before submitting. Missing ${missing.length} signature${missing.length === 1 ? "" : "s"}.`
      );
      return;
    }

    startSubmitting(async () => {
      try {
        const pdfBase64 = await generateIntakePdf(formData, signatures, null, facilityName);
        const result = await submitIntakeForm(formData, signatures, pdfBase64);
        if (result?.error) {
          setError(result.error);
        } else {
          router.push("/rules");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to submit application"
        );
      }
    });
  }

  const isLastPage = page === TOTAL_PAGES;

  return (
    <div className="space-y-6">
      {isSubmitting && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-live="assertive"
          aria-label="Submitting application"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
            paddingLeft: "env(safe-area-inset-left)",
            paddingRight: "env(safe-area-inset-right)",
          }}
        >
          <div className="mx-4 max-w-sm rounded-2xl border bg-card p-8 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Submitting Your Application</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This may take a few minutes — we&apos;re generating your
              packet and notifying staff. Please keep this screen open.
            </p>
          </div>
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold">{facilityName} Resident Application</h1>
        <p className="text-muted-foreground">
          Page {page} of {TOTAL_PAGES}
        </p>
        <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(page / TOTAL_PAGES) * 100}%` }}
          />
        </div>
      </div>

      {page === 1 && <Page1PersonalInfo facilityName={facilityName} data={formData} onChange={updateField} />}
      {page === 2 && <Page2BackgroundAndSign data={formData} onChange={updateField} signatures={signatures} onSignatureChange={updateSignature} />}
      {page === 3 && <PolicyPage content={policies[0]} data={formData} onChange={updateField} signatures={signatures} onSignatureChange={updateSignature} />}
      {page === 4 && <PolicyPage content={policies[1]} data={formData} onChange={updateField} signatures={signatures} onSignatureChange={updateSignature} />}
      {page === 5 && <PolicyPage content={policies[2]} data={formData} onChange={updateField} signatures={signatures} onSignatureChange={updateSignature} />}
      {page === 6 && <PolicyPage content={policies[3]} data={formData} onChange={updateField} signatures={signatures} onSignatureChange={updateSignature} />}
      {page === 7 && <PageROI facilityName={facilityName} data={formData} onChange={updateField} signatures={signatures} onSignatureChange={updateSignature} />}
      {page === 8 && <PageDocumentReceipt facilityName={facilityName} data={formData} onChange={updateField} signatures={signatures} onSignatureChange={updateSignature} />}

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
          {error}
        </p>
      )}

      <div className="flex justify-between gap-4 pb-8">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={page === 1 || isSaving}
        >
          Previous
        </Button>
        {isLastPage ? (
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Submit Application"}
          </Button>
        ) : (
          <Button onClick={handleNext} disabled={isSaving}>
            {isSaving ? "Saving..." : "Next"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Reusable Form Helpers ──────────────────────────────────

function Field({
  label,
  name,
  data,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  name: string;
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>
        {label}
        {required && " *"}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        value={data[name] ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        required={required}
        placeholder={placeholder}
      />
    </div>
  );
}

function TextAreaField({
  label,
  name,
  data,
  onChange,
  rows = 3,
}: {
  label: string;
  name: string;
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Textarea
        id={name}
        name={name}
        value={data[name] ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        rows={rows}
      />
    </div>
  );
}

function YesNoField({
  label,
  name,
  data,
  onChange,
}: {
  label: string;
  name: string;
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-4">
        {["Yes", "No"].map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name={name}
              value={opt}
              checked={data[name] === opt}
              onChange={() => onChange(name, opt)}
              className="h-3.5 w-3.5 cursor-pointer"
            />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

function SelectField({
  label,
  name,
  data,
  onChange,
  options,
}: {
  label: string;
  name: string;
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        value={data[name] ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateFieldWithToday({
  label,
  name,
  data,
  onChange,
  required,
}: {
  label: string;
  name: string;
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
  required?: boolean;
}) {
  const toggleKey = `${name}_is_today`;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Label htmlFor={name}>
          {label}
          {required && " *"}
        </Label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={data[toggleKey] === "yes"}
            onChange={(e) => {
              if (e.target.checked) {
                onChange(toggleKey, "yes");
                onChange(name, todayIso());
              } else {
                onChange(toggleKey, "");
              }
            }}
            className="h-3.5 w-3.5 cursor-pointer"
          />
          Use today&apos;s date
        </label>
      </div>
      <Input
        id={name}
        name={name}
        type="date"
        value={data[name] ?? ""}
        onChange={(e) => {
          onChange(name, e.target.value);
          if (e.target.value !== todayIso()) {
            onChange(toggleKey, "");
          }
        }}
        required={required}
      />
    </div>
  );
}

interface PageProps {
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
}

// ─── Page 1: Personal Info, Vehicle, Employment, Contacts ─────

function Page1PersonalInfo({ facilityName, data, onChange }: PageProps & { facilityName: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{facilityName} Resident Application</CardTitle>
        <p className="text-sm text-muted-foreground">
          Personal information, employment, and emergency contacts.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="First Name" name="first_name" data={data} onChange={onChange} required />
          <Field label="Middle Name" name="middle_name" data={data} onChange={onChange} />
          <Field label="Last Name" name="last_name" data={data} onChange={onChange} required />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DateFieldWithToday label="Admission Date" name="admission_date" data={data} onChange={onChange} required />
          <DateFieldWithToday label="Date of Birth" name="date_of_birth" data={data} onChange={onChange} required />
        </div>
        <SelectField
          label="Gender"
          name="gender"
          data={data}
          onChange={onChange}
          options={[
            { value: "M", label: "Male" },
            { value: "F", label: "Female" },
            { value: "Trans", label: "Trans" },
            { value: "Non-Binary", label: "Non-Binary" },
          ]}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Phone Number" name="phone" data={data} onChange={onChange} type="tel" required />
          <Field label="Email Address" name="email" data={data} onChange={onChange} type="email" required />
        </div>
        <Field label="Home Address" name="home_address" data={data} onChange={onChange} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="City" name="city" data={data} onChange={onChange} />
          <Field label="State" name="state" data={data} onChange={onChange} />
          <Field label="Zip" name="zip" data={data} onChange={onChange} />
        </div>

        <div className="border-t pt-4 space-y-4">
          <h3 className="font-semibold text-sm">Vehicle</h3>
          <YesNoField label="Do you own a vehicle?" name="owns_vehicle" data={data} onChange={onChange} />
          {data.owns_vehicle === "Yes" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Field label="Year" name="vehicle_year" data={data} onChange={onChange} />
                <Field label="Make" name="vehicle_make" data={data} onChange={onChange} />
                <Field label="Model" name="vehicle_model" data={data} onChange={onChange} />
                <Field label="Color" name="vehicle_color" data={data} onChange={onChange} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Plate Number" name="license_plate_number" data={data} onChange={onChange} />
                <Field label="Plate State" name="license_plate_state" data={data} onChange={onChange} />
              </div>
            </>
          )}
        </div>

        <div className="border-t pt-4 space-y-4">
          <h3 className="font-semibold text-sm">Employment</h3>
          <YesNoField label="Currently employed?" name="currently_working" data={data} onChange={onChange} />
          {data.currently_working === "Yes" && (
            <>
              <Field label="Employer" name="employer_name" data={data} onChange={onChange} />
              <Field label="Employer Phone" name="employer_phone" data={data} onChange={onChange} type="tel" />
            </>
          )}
        </div>

        <div className="border-t pt-4 space-y-4">
          <h3 className="font-semibold text-sm">Emergency Contact 1</h3>
          <Field label="Name" name="emergency_contact_1_name" data={data} onChange={onChange} required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Relationship" name="emergency_contact_1_relationship" data={data} onChange={onChange} required />
            <Field label="Phone" name="emergency_contact_1_phone" data={data} onChange={onChange} type="tel" required />
          </div>
        </div>

        <div className="border-t pt-4 space-y-4">
          <h3 className="font-semibold text-sm">Emergency Contact 2</h3>
          <Field label="Name" name="emergency_contact_2_name" data={data} onChange={onChange} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Relationship" name="emergency_contact_2_relationship" data={data} onChange={onChange} />
            <Field label="Phone" name="emergency_contact_2_phone" data={data} onChange={onChange} type="tel" />
          </div>
        </div>

        <div className="border-t pt-4 space-y-4">
          <h3 className="font-semibold text-sm">Recovery Information</h3>
          <Field label="How did you hear about us?" name="referral_source" data={data} onChange={onChange} />
          <DateFieldWithToday label="Sobriety Date" name="sobriety_date" data={data} onChange={onChange} />
          <YesNoField
            label="Do you plan on working a recovery program?"
            name="in_recovery_program"
            data={data}
            onChange={onChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page 2: Criminal Background & Application Signature ──────

function Page2BackgroundAndSign({
  data,
  onChange,
  signatures,
  onSignatureChange,
}: PageProps & {
  signatures: Record<string, string>;
  onSignatureChange: (key: string, dataUrl: string | null) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Background &amp; Signatures</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-4">
          <h3 className="font-semibold text-sm">Background Check</h3>
          <YesNoField
            label="Have you ever been convicted of a felony or misdemeanor?"
            name="convicted_felon"
            data={data}
            onChange={onChange}
          />
          {data.convicted_felon === "Yes" && (
            <TextAreaField label="Please explain" name="conviction_explanation" data={data} onChange={onChange} />
          )}
          <YesNoField
            label="Sex Offender / Predator Status?"
            name="sex_offender"
            data={data}
            onChange={onChange}
          />
          {data.sex_offender === "Yes" && (
            <TextAreaField label="Please explain" name="sex_offender_explanation" data={data} onChange={onChange} />
          )}
        </div>

        <div className="border-t pt-4 space-y-4">
          <TextAreaField
            label="Is there anything else you'd like us to know?"
            name="additional_notes"
            data={data}
            onChange={onChange}
            rows={4}
          />
        </div>

        <div className="border-t pt-4 space-y-4">
          <p className="text-sm whitespace-pre-wrap">{getApplicationAttestText()}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Resident Print Name" name="application_resident_print_name" data={data} onChange={onChange} required />
            <DateFieldWithToday
              label="Date"
              name="application_resident_date"
              data={data}
              onChange={onChange}
              required
            />
          </div>
          <SignaturePad
            label="Resident Signature"
            initialValue={signatures.resident_application ?? null}
            onSignatureChange={(v) => onSignatureChange("resident_application", v)}
          />
          <p className="text-xs text-muted-foreground">
            Staff will sign on their end after reviewing your submission.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Policy Page (reusable for each policy) ───────────────────

function PolicyPage({
  content,
  data,
  onChange,
  signatures,
  onSignatureChange,
}: {
  content: PolicyPageContent;
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
  signatures: Record<string, string>;
  onSignatureChange: (key: string, dataUrl: string | null) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{content.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4 text-sm leading-relaxed">
          {content.sections.map((s, i) => (
            <div key={i} className="space-y-2">
              {s.heading && <h3 className="font-semibold">{s.heading}</h3>}
              {s.body.split("\n\n").map((para, j) => (
                <p key={j} className="whitespace-pre-wrap">
                  {para}
                </p>
              ))}
            </div>
          ))}
        </div>

        <div className="border-t pt-4 space-y-4">
          <SignaturePad
            label="Resident Signature"
            initialValue={signatures[content.signatureKey] ?? null}
            onSignatureChange={(v) => onSignatureChange(content.signatureKey, v)}
          />
          <DateFieldWithToday
            label="Date"
            name={`${content.signatureKey}_date`}
            data={data}
            onChange={onChange}
          />
        </div>

        {content.witnessKey && (
          <p className="text-xs text-muted-foreground border-t pt-4">
            {(content.witnessLabel ?? "Witness Signature")} will be added by staff after review.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── ROI Page ─────────────────────────────────────────────────

function RoiContactRow({
  idx,
  data,
  onChange,
}: {
  idx: number;
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  const prefix = `roi_contact_${idx}`;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Field label={`Name ${idx}`} name={`${prefix}_name`} data={data} onChange={onChange} />
      <Field label="Relationship" name={`${prefix}_relationship`} data={data} onChange={onChange} />
      <Field label="Phone Number" name={`${prefix}_phone`} data={data} onChange={onChange} type="tel" />
    </div>
  );
}

function PageROI({
  facilityName,
  data,
  onChange,
  signatures,
  onSignatureChange,
}: PageProps & {
  facilityName: string;
  signatures: Record<string, string>;
  onSignatureChange: (key: string, dataUrl: string | null) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Release of Information (ROI) — Emergency Contact</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Resident's Name" name="roi_resident_name" data={data} onChange={onChange} />
          <DateFieldWithToday label="Date" name="roi_form_date" data={data} onChange={onChange} />
        </div>
        <div className="space-y-2 text-sm leading-relaxed">
          {getRoiIntroText(facilityName).split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium">Authorized Contacts</p>
          <RoiContactRow idx={1} data={data} onChange={onChange} />
          <RoiContactRow idx={2} data={data} onChange={onChange} />
          <RoiContactRow idx={3} data={data} onChange={onChange} />
          <RoiContactRow idx={4} data={data} onChange={onChange} />
        </div>

        <div className="border-t pt-4 space-y-4">
          <SignaturePad
            label="Resident Signature"
            initialValue={signatures.release_of_information ?? null}
            onSignatureChange={(v) => onSignatureChange("release_of_information", v)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Resident Printed Name" name="roi_resident_printed_name" data={data} onChange={onChange} />
            <DateFieldWithToday label="Date" name="roi_resident_date" data={data} onChange={onChange} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground border-t pt-4">
          Witness signature will be added by staff after review.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Document Receipt Acknowledgment Page ─────────────────────

function PageDocumentReceipt({
  facilityName,
  data,
  onChange,
  signatures,
  onSignatureChange,
}: PageProps & {
  facilityName: string;
  signatures: Record<string, string>;
  onSignatureChange: (key: string, dataUrl: string | null) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resident Document Receipt Acknowledgment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Sign below to indicate you have received the policy and procedures
          documents and understand their effect.
        </p>
        <Field
          label="Print Name"
          name="document_receipt_print_name"
          data={data}
          onChange={onChange}
          required
        />
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {getDocumentReceiptText(facilityName).replace(
            "____________________",
            data.document_receipt_print_name || "____________________"
          )}
        </p>
        <div className="border-t pt-4 space-y-4">
          <SignaturePad
            label="Resident Signature"
            initialValue={signatures.document_receipt ?? null}
            onSignatureChange={(v) => onSignatureChange("document_receipt", v)}
          />
          <DateFieldWithToday
            label="Date"
            name="document_receipt_date"
            data={data}
            onChange={onChange}
            required
          />
        </div>
      </CardContent>
    </Card>
  );
}
