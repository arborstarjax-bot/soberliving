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

const TOTAL_PAGES = 11;

interface IntakeFormWizardProps {
  userName: string;
  userEmail: string;
  initialData: Record<string, string> | null;
  initialSignatures: Record<string, string> | null;
}

export function IntakeFormWizard({
  userName,
  userEmail,
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
    // Auto-save draft on page change
    startSaving(async () => {
      await saveIntakeProgress(formData, signatures);
    });
    setPage((p) => Math.min(p + 1, TOTAL_PAGES));
  }

  function handlePrev() {
    setPage((p) => Math.max(p - 1, 1));
  }

  function handleSubmit() {
    setError(null);

    // Validate all signatures exist for pages 6-11
    const requiredSigs = [
      "mat_policy",
      "confidentiality_policy",
      "good_neighbor_policy",
      "hazardous_items_policy",
      "discharge_policy",
      "release_of_information",
    ];
    const missingSigs = requiredSigs.filter((key) => !signatures[key]);
    if (missingSigs.length > 0) {
      setError(
        `Please sign all policy pages before submitting. Missing ${missingSigs.length} signature(s).`
      );
      return;
    }

    startSubmitting(async () => {
      try {
        const pdfBase64 = await generateIntakePdf(formData, signatures);
        const result = await submitIntakeForm(formData, signatures, pdfBase64);
        if (result?.error) {
          setError(result.error);
        } else {
          router.push("/dashboard");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to submit intake form"
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
              This may take a few minutes — we&apos;re generating your intake
              packet and notifying staff. Please keep this screen open and
              don&apos;t close the app.
            </p>
          </div>
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold">Intake Packet</h1>
        <p className="text-muted-foreground">
          Page {page} of {TOTAL_PAGES}
        </p>
        {/* Progress bar */}
        <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(page / TOTAL_PAGES) * 100}%` }}
          />
        </div>
      </div>

      {page === 1 && <Page1 data={formData} onChange={updateField} />}
      {page === 2 && <Page2 data={formData} onChange={updateField} />}
      {page === 3 && <Page3 data={formData} onChange={updateField} />}
      {page === 4 && <Page4 data={formData} onChange={updateField} />}
      {page === 5 && <Page5 data={formData} onChange={updateField} />}
      {page === 6 && (
        <PolicyPage
          title="MAT Medication Storage & Use Policy"
          bullets={[
            "Residents enrolled in MAT programs will be treated equally. Medications must be secured and turned into staff upon admission.",
            "All MAT medications will be locked in the manager's office.",
            "Residents will be given controlled access to medications.",
            "Abuse or stockpiling will be treated as relapse.",
          ]}
          signatureKey="mat_policy"
          dateKey="mat_policy_date"
          data={formData}
          onChange={updateField}
          signatures={signatures}
          onSignatureChange={updateSignature}
        />
      )}
      {page === 7 && (
        <PolicyPage
          title="Confidentiality Policy"
          bullets={[
            "All resident information is confidential and will be securely stored. Only authorized staff may access this information.",
            "Information may be released with consent.",
            "Exceptions include legal orders or emergencies.",
            "Violation of peer confidentiality may result in discharge.",
          ]}
          signatureKey="confidentiality_policy"
          dateKey="confidentiality_policy_date"
          data={formData}
          onChange={updateField}
          signatures={signatures}
          onSignatureChange={updateSignature}
        />
      )}
      {page === 8 && (
        <PolicyPage
          title="Good Neighbor Policy"
          bullets={[
            "No excessive noise.",
            "No loitering in front of property.",
            "Keep property clean.",
            "Park only in designated areas.",
          ]}
          signatureKey="good_neighbor_policy"
          dateKey="good_neighbor_policy_date"
          data={formData}
          onChange={updateField}
          signatures={signatures}
          onSignatureChange={updateSignature}
        />
      )}
      {page === 9 && (
        <PolicyPage
          title="Hazardous Items & Search Policy"
          bullets={[
            "Drugs, alcohol, and mind-altering substances are prohibited.",
            "Weapons and paraphernalia are prohibited.",
            "Searches may occur randomly or upon suspicion.",
          ]}
          signatureKey="hazardous_items_policy"
          dateKey="hazardous_items_policy_date"
          data={formData}
          onChange={updateField}
          signatures={signatures}
          onSignatureChange={updateSignature}
        />
      )}
      {page === 10 && (
        <PolicyPage
          title="Discharge Policy"
          bullets={[
            "Residents may be discharged if criteria are no longer met.",
            "Lack of progress may result in discharge.",
            "Emergency contacts may be notified.",
          ]}
          signatureKey="discharge_policy"
          dateKey="discharge_policy_date"
          data={formData}
          onChange={updateField}
          signatures={signatures}
          onSignatureChange={updateSignature}
        />
      )}
      {page === 11 && (
        <Page11ROI
          data={formData}
          onChange={updateField}
          signatures={signatures}
          onSignatureChange={updateSignature}
        />
      )}

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={page === 1 || isSaving || isSubmitting}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          {isSaving && "Saving..."}
        </span>
        {isLastPage ? (
          <Button onClick={handleSubmit} disabled={isSubmitting || isSaving}>
            {isSubmitting ? "Submitting..." : "Submit & Sign"}
          </Button>
        ) : (
          <Button onClick={handleNext} disabled={isSaving || isSubmitting}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Field Helper ─────────────────────────────────────────────

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
    <div className="space-y-1.5">
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
        placeholder={placeholder}
        required={required}
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
    <div className="space-y-1.5">
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
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        value={data[name] ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
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

// ─── Page 1: Resident Application ─────────────────────────────

interface PageProps {
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
}

function Page1({ data, onChange }: PageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Jax Sober Living Resident Application</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="First Name" name="first_name" data={data} onChange={onChange} required />
          <Field label="Middle Name" name="middle_name" data={data} onChange={onChange} />
          <Field label="Last Name" name="last_name" data={data} onChange={onChange} required />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Admission Date" name="admission_date" data={data} onChange={onChange} type="date" required />
          <Field label="Date of Birth" name="date_of_birth" data={data} onChange={onChange} type="date" required />
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
        <SelectField
          label="Do you own a vehicle?"
          name="owns_vehicle"
          data={data}
          onChange={onChange}
          options={[
            { value: "Yes", label: "Yes" },
            { value: "No", label: "No" },
          ]}
        />
        {data.owns_vehicle === "Yes" && (
          <>
            <Field label="Vehicle Year / Make / Model / Color" name="vehicle_info" data={data} onChange={onChange} />
            <Field label="License Plate / State" name="license_plate" data={data} onChange={onChange} />
            <Field label="Insurance Info" name="insurance_info" data={data} onChange={onChange} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page 2: Recovery & Medical Information ───────────────────

function Page2({ data, onChange }: PageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recovery & Medical Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="How did you hear about Jax Sober Living?" name="referral_source" data={data} onChange={onChange} />
        <SelectField
          label="Struggles with drugs/alcohol?"
          name="struggles_with_substances"
          data={data}
          onChange={onChange}
          options={[
            { value: "Yes", label: "Yes" },
            { value: "No", label: "No" },
          ]}
        />
        <SelectField
          label="Participating in recovery program?"
          name="in_recovery_program"
          data={data}
          onChange={onChange}
          options={[
            { value: "Yes", label: "Yes" },
            { value: "No", label: "No" },
          ]}
        />
        <SelectField
          label="Attending IOP?"
          name="attending_iop"
          data={data}
          onChange={onChange}
          options={[
            { value: "Yes", label: "Yes" },
            { value: "No", label: "No" },
          ]}
        />
        {data.attending_iop === "Yes" && (
          <Field label="Program Name" name="iop_program_name" data={data} onChange={onChange} />
        )}
        <TextAreaField label="Medications" name="medications" data={data} onChange={onChange} />
        <TextAreaField label="Medical History / Issues" name="medical_history" data={data} onChange={onChange} />
        <TextAreaField label="Mental Illness Diagnosis" name="mental_illness" data={data} onChange={onChange} />
        <TextAreaField label="Physical Health Issues" name="physical_health" data={data} onChange={onChange} />
      </CardContent>
    </Card>
  );
}

// ─── Page 3: Emergency & Financial Contacts ───────────────────

function Page3({ data, onChange }: PageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Emergency & Financial Contacts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h3 className="font-semibold text-sm">Emergency Contact 1</h3>
          <Field label="Name" name="emergency_contact_1_name" data={data} onChange={onChange} required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Relationship" name="emergency_contact_1_relationship" data={data} onChange={onChange} required />
            <Field label="Phone" name="emergency_contact_1_phone" data={data} onChange={onChange} type="tel" required />
          </div>
        </div>
        <div className="space-y-4 border-t pt-4">
          <h3 className="font-semibold text-sm">Emergency Contact 2</h3>
          <Field label="Name" name="emergency_contact_2_name" data={data} onChange={onChange} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Relationship" name="emergency_contact_2_relationship" data={data} onChange={onChange} />
            <Field label="Phone" name="emergency_contact_2_phone" data={data} onChange={onChange} type="tel" />
          </div>
        </div>
        <div className="space-y-4 border-t pt-4">
          <h3 className="font-semibold text-sm">Financial Contact</h3>
          <Field label="Name" name="financial_contact_name" data={data} onChange={onChange} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Relationship" name="financial_contact_relationship" data={data} onChange={onChange} />
            <Field label="Phone" name="financial_contact_phone" data={data} onChange={onChange} type="tel" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page 4: Substance & Housing History ──────────────────────

function Page4({ data, onChange }: PageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Substance & Housing History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Facility Name" name="facility_name" data={data} onChange={onChange} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date Discharged" name="facility_discharge_date" data={data} onChange={onChange} type="date" />
          <Field label="Length of Stay" name="facility_length_of_stay" data={data} onChange={onChange} />
        </div>
        <SelectField
          label="Completed Program?"
          name="completed_program"
          data={data}
          onChange={onChange}
          options={[
            { value: "Yes", label: "Yes" },
            { value: "No", label: "No" },
          ]}
        />
        {data.completed_program === "No" && (
          <TextAreaField label="Reason if not completed" name="program_not_completed_reason" data={data} onChange={onChange} />
        )}
        <Field label="Sobriety Date" name="sobriety_date" data={data} onChange={onChange} type="date" />
      </CardContent>
    </Card>
  );
}

// ─── Page 5: Drug Use & Criminal History ──────────────────────

function Page5({ data, onChange }: PageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Drug Use & Criminal History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Drug of Choice" name="drug_of_choice" data={data} onChange={onChange} />
        <TextAreaField label="Recent Drugs Used & Last Use Dates" name="recent_drugs" data={data} onChange={onChange} />
        <SelectField
          label="Convicted of felony/misdemeanor?"
          name="convicted_felon"
          data={data}
          onChange={onChange}
          options={[
            { value: "Yes", label: "Yes" },
            { value: "No", label: "No" },
          ]}
        />
        {data.convicted_felon === "Yes" && (
          <TextAreaField label="Explanation" name="conviction_explanation" data={data} onChange={onChange} />
        )}
        <SelectField
          label="Sex Offender Status?"
          name="sex_offender"
          data={data}
          onChange={onChange}
          options={[
            { value: "Yes", label: "Yes" },
            { value: "No", label: "No" },
          ]}
        />
        <SelectField
          label="Violent/Sexual Crime History?"
          name="violent_crime_history"
          data={data}
          onChange={onChange}
          options={[
            { value: "Yes", label: "Yes" },
            { value: "No", label: "No" },
          ]}
        />
        {data.violent_crime_history === "Yes" && (
          <TextAreaField label="Explanation" name="violent_crime_explanation" data={data} onChange={onChange} />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Policy Pages (6-10) ──────────────────────────────────────

interface PolicyPageProps {
  title: string;
  bullets: string[];
  signatureKey: string;
  dateKey: string;
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
  signatures: Record<string, string>;
  onSignatureChange: (key: string, dataUrl: string | null) => void;
}

function PolicyPage({
  title,
  bullets,
  signatureKey,
  dateKey,
  data,
  onChange,
  signatures,
  onSignatureChange,
}: PolicyPageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="space-y-2">
          {bullets.map((bullet, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="text-muted-foreground mt-0.5">•</span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        <div className="border-t pt-4 space-y-4">
          <SignaturePad
            label="Resident Signature"
            initialValue={signatures[signatureKey] ?? null}
            onSignatureChange={(dataUrl) =>
              onSignatureChange(signatureKey, dataUrl)
            }
          />
          <Field label="Date" name={dateKey} data={data} onChange={onChange} type="date" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page 11: Release of Information (ROI) ────────────────────

interface Page11Props {
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
  signatures: Record<string, string>;
  onSignatureChange: (key: string, dataUrl: string | null) => void;
}

function Page11ROI({ data, onChange, signatures, onSignatureChange }: Page11Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Release of Information (ROI)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Residents authorize Jax Sober Living to share information with listed contacts.
        </p>
        <div className="space-y-4">
          <Field label="Contact Name" name="roi_contact_name" data={data} onChange={onChange} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Relationship" name="roi_contact_relationship" data={data} onChange={onChange} />
            <Field label="Phone Number" name="roi_contact_phone" data={data} onChange={onChange} type="tel" />
          </div>
        </div>
        <div className="border-t pt-4 space-y-4">
          <SignaturePad
            label="Resident Signature"
            initialValue={signatures.release_of_information ?? null}
            onSignatureChange={(dataUrl) =>
              onSignatureChange("release_of_information", dataUrl)
            }
          />
          <Field label="Date" name="roi_date" data={data} onChange={onChange} type="date" />
        </div>
      </CardContent>
    </Card>
  );
}
