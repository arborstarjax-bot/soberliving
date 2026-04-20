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
  ALL_POLICIES,
  APPLICATION_ATTEST_TEXT,
  DOCUMENT_RECEIPT_TEXT,
  type PolicyPageContent,
  ROI_INTRO_TEXT,
} from "./policy-text";

const TOTAL_PAGES = 13;

interface IntakeFormWizardProps {
  userName: string;
  userEmail: string;
  initialData: Record<string, string> | null;
  initialSignatures: Record<string, string> | null;
}

function todayIso() {
  // Always capture the resident's local calendar date, not UTC.
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
      "mat_policy",
      "good_neighbor_policy",
      "confidentiality_policy",
      "discharge_policy",
      "hazardous_items_policy",
      "medication_storage_policy",
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
        <h1 className="text-2xl font-bold">Jax Sober Living Resident Application</h1>
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

      {page === 1 && <Page1PersonalInfo data={formData} onChange={updateField} />}
      {page === 2 && <Page2RecoveryMedical data={formData} onChange={updateField} />}
      {page === 3 && <Page3PhysicianEmployment data={formData} onChange={updateField} />}
      {page === 4 && <Page4FacilityHistory data={formData} onChange={updateField} />}
      {page === 5 && (
        <Page5DrugsCriminalAndSign
          data={formData}
          onChange={updateField}
          signatures={signatures}
          onSignatureChange={updateSignature}
        />
      )}
      {page === 6 && (
        <PolicyPage
          content={ALL_POLICIES[0]}
          data={formData}
          onChange={updateField}
          signatures={signatures}
          onSignatureChange={updateSignature}
        />
      )}
      {page === 7 && (
        <PolicyPage
          content={ALL_POLICIES[1]}
          data={formData}
          onChange={updateField}
          signatures={signatures}
          onSignatureChange={updateSignature}
        />
      )}
      {page === 8 && (
        <PolicyPage
          content={ALL_POLICIES[2]}
          data={formData}
          onChange={updateField}
          signatures={signatures}
          onSignatureChange={updateSignature}
        />
      )}
      {page === 9 && (
        <PolicyPage
          content={ALL_POLICIES[3]}
          data={formData}
          onChange={updateField}
          signatures={signatures}
          onSignatureChange={updateSignature}
        />
      )}
      {page === 10 && (
        <PolicyPage
          content={ALL_POLICIES[4]}
          data={formData}
          onChange={updateField}
          signatures={signatures}
          onSignatureChange={updateSignature}
        />
      )}
      {page === 11 && (
        <PolicyPage
          content={ALL_POLICIES[5]}
          data={formData}
          onChange={updateField}
          signatures={signatures}
          onSignatureChange={updateSignature}
        />
      )}
      {page === 12 && (
        <PageROI
          data={formData}
          onChange={updateField}
          signatures={signatures}
          onSignatureChange={updateSignature}
        />
      )}
      {page === 13 && (
        <PageDocumentReceipt
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

// ─── Field Helpers ────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  name: string;
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  max?: string;
}

function Field({ label, name, data, onChange, type = "text", required, placeholder, max }: FieldProps) {
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
        max={max}
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
  placeholder,
}: {
  label: string;
  name: string;
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
  rows?: number;
  placeholder?: string;
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
        placeholder={placeholder}
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
    <SelectField
      label={label}
      name={name}
      data={data}
      onChange={onChange}
      options={[
        { value: "Yes", label: "Yes" },
        { value: "No", label: "No" },
      ]}
    />
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
  const toggleKey = `${name}__use_today`;
  const useToday = data[toggleKey] === "true";
  const todayChecked = useToday && data[name] === todayIso();

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={name}>
          {label}
          {required && " *"}
        </Label>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={todayChecked}
            onChange={(e) => {
              if (e.target.checked) {
                onChange(toggleKey, "true");
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

// ─── Page 1: Personal Info, Address, Vehicle ──────────────────

function Page1PersonalInfo({ data, onChange }: PageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Jax Sober Living Resident Application</CardTitle>
        <p className="text-sm text-muted-foreground">
          Page 1 of the resident application packet.
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Plate State" name="license_plate_state" data={data} onChange={onChange} />
                <Field label="Plate Number" name="license_plate_number" data={data} onChange={onChange} />
                <Field
                  label="Plate Expiration (mo/yr)"
                  name="license_plate_expiration"
                  data={data}
                  onChange={onChange}
                  placeholder="MM/YYYY"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Insurance Company" name="insurance_company" data={data} onChange={onChange} />
                <Field label="Policy #" name="insurance_policy_number" data={data} onChange={onChange} />
                <DateFieldWithToday
                  label="Insurance Expiration"
                  name="insurance_expiration_date"
                  data={data}
                  onChange={onChange}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Please provide staff with DL, registration, and car insurance paperwork.
                Copies will go in your file.
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page 2: Referral, Recovery, Medical ──────────────────────

function Page2RecoveryMedical({ data, onChange }: PageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recovery &amp; Medical Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="How did you hear about Jax Sober Living?" name="referral_source" data={data} onChange={onChange} />
        <YesNoField
          label="Do you identify as someone who struggles with drugs and/or alcohol?"
          name="struggles_with_substances"
          data={data}
          onChange={onChange}
        />
        <YesNoField
          label="Do you plan on working a recovery program while at Jax Sober Living (12 Step based)?"
          name="in_recovery_program"
          data={data}
          onChange={onChange}
        />
        <YesNoField
          label="Are you attending or will you be attending an IOP Program?"
          name="attending_iop"
          data={data}
          onChange={onChange}
        />
        {data.attending_iop === "Yes" && (
          <Field
            label="IOP Program Name (please add to ROI section as well)"
            name="iop_program_name"
            data={data}
            onChange={onChange}
          />
        )}
        <TextAreaField label="Medications" name="medications" data={data} onChange={onChange} rows={4} />
        <TextAreaField label="Medical History / Issues" name="medical_history" data={data} onChange={onChange} rows={4} />
        <YesNoField
          label="Have you ever been diagnosed with a mental illness?"
          name="has_mental_illness"
          data={data}
          onChange={onChange}
        />
        {data.has_mental_illness === "Yes" && (
          <TextAreaField label="Diagnosis" name="mental_illness_diagnosis" data={data} onChange={onChange} />
        )}
        <YesNoField
          label="Do you have any present or past physical problems?"
          name="has_physical_problems"
          data={data}
          onChange={onChange}
        />
        {data.has_physical_problems === "Yes" && (
          <TextAreaField label="Diagnosis" name="physical_problems_diagnosis" data={data} onChange={onChange} />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page 3: Allergies, Physician, Employment, Contacts ───────

function Page3PhysicianEmployment({ data, onChange }: PageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Health, Employment &amp; Contacts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <YesNoField label="Do you have any known allergies?" name="has_allergies" data={data} onChange={onChange} />
        {data.has_allergies === "Yes" && (
          <TextAreaField
            label="Describe the allergy, reaction, and remedy"
            name="allergies_details"
            data={data}
            onChange={onChange}
          />
        )}

        <YesNoField
          label="Are you currently under the care of a physician?"
          name="under_physician_care"
          data={data}
          onChange={onChange}
        />
        {data.under_physician_care === "Yes" && (
          <>
            <Field label="Reason" name="physician_reason" data={data} onChange={onChange} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Physician's Name" name="physician_name" data={data} onChange={onChange} />
              <Field label="Physician's Phone" name="physician_phone" data={data} onChange={onChange} type="tel" />
            </div>
          </>
        )}

        <div className="border-t pt-4 space-y-4">
          <h3 className="font-semibold text-sm">Employment</h3>
          <YesNoField label="Currently working?" name="currently_working" data={data} onChange={onChange} />
          {data.currently_working === "Yes" && (
            <>
              <Field label="Employer" name="employer_name" data={data} onChange={onChange} />
              <Field label="Employer Address" name="employer_address" data={data} onChange={onChange} />
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
          <h3 className="font-semibold text-sm">Financial Contact</h3>
          <p className="text-xs text-muted-foreground">
            The person helping you out financially — if you are self-supporting, leave blank.
          </p>
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

// ─── Page 4: Substance Abuse Facility / Sober Housing History ─

function FacilityEntry({
  idx,
  data,
  onChange,
}: {
  idx: number;
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  const prefix = `facility_${idx}`;
  return (
    <div className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className="font-semibold text-sm">Entry {idx}</h3>
      <Field label="Facility / Sober Housing Name" name={`${prefix}_name`} data={data} onChange={onChange} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DateFieldWithToday label="Date Discharged" name={`${prefix}_discharge_date`} data={data} onChange={onChange} />
        <Field label="Length of Stay" name={`${prefix}_length_of_stay`} data={data} onChange={onChange} />
      </div>
      <YesNoField label="Successfully completed the program?" name={`${prefix}_completed`} data={data} onChange={onChange} />
      {data[`${prefix}_completed`] === "No" && (
        <TextAreaField label="If no, why not?" name={`${prefix}_reason_not_completed`} data={data} onChange={onChange} />
      )}
    </div>
  );
}

function Page4FacilityHistory({ data, onChange }: PageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Substance Abuse Facility / Sober Housing History</CardTitle>
        <p className="text-sm text-muted-foreground">
          List up to four prior facilities. Leave blank any you don&apos;t have.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <FacilityEntry idx={1} data={data} onChange={onChange} />
        <FacilityEntry idx={2} data={data} onChange={onChange} />
        <FacilityEntry idx={3} data={data} onChange={onChange} />
        <FacilityEntry idx={4} data={data} onChange={onChange} />
        <div className="border-t pt-4">
          <DateFieldWithToday label="Sobriety Date" name="sobriety_date" data={data} onChange={onChange} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page 5: Drug Use, Criminal History, Application Signatures ─

function RecentDrugRow({
  idx,
  data,
  onChange,
}: {
  idx: number;
  data: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label={`Drug ${idx}`} name={`recent_drug_${idx}_name`} data={data} onChange={onChange} />
      <DateFieldWithToday label="Date of Last Use" name={`recent_drug_${idx}_date`} data={data} onChange={onChange} />
    </div>
  );
}

function Page5DrugsCriminalAndSign({
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
        <CardTitle>Drug Use, Criminal History &amp; Signatures</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Field label="Drug of Choice" name="drug_of_choice" data={data} onChange={onChange} />
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">List Recent Drugs Used</h3>
          <RecentDrugRow idx={1} data={data} onChange={onChange} />
          <RecentDrugRow idx={2} data={data} onChange={onChange} />
          <RecentDrugRow idx={3} data={data} onChange={onChange} />
          <RecentDrugRow idx={4} data={data} onChange={onChange} />
        </div>

        <div className="border-t pt-4 space-y-4">
          <h3 className="font-semibold text-sm">Criminal History</h3>
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
          <YesNoField
            label="Convicted of crimes of violence or sexual in nature against the elderly, children, or the disabled?"
            name="violent_crime_history"
            data={data}
            onChange={onChange}
          />
          {data.violent_crime_history === "Yes" && (
            <TextAreaField
              label="Please explain"
              name="violent_crime_explanation"
              data={data}
              onChange={onChange}
            />
          )}
        </div>

        <div className="border-t pt-4 space-y-4">
          <p className="text-sm">{APPLICATION_ATTEST_TEXT}</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <Field label="Staff Name" name="application_staff_name" data={data} onChange={onChange} />
            <DateFieldWithToday
              label="Staff Date"
              name="application_staff_date"
              data={data}
              onChange={onChange}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Staff will sign on their end after reviewing your submission.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Policy Page (full-text) ──────────────────────────────────

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
          <div className="border-t pt-4 space-y-4">
            <SignaturePad
              label={content.witnessLabel ?? "Witness Signature"}
              initialValue={signatures[content.witnessKey] ?? null}
              onSignatureChange={(v) => onSignatureChange(content.witnessKey!, v)}
            />
            <DateFieldWithToday
              label="Date"
              name={`${content.witnessKey}_date`}
              data={data}
              onChange={onChange}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── ROI Page (multiple contact rows) ─────────────────────────

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
        <CardTitle>Release of Information (ROI) — Emergency Contact</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Resident's Name" name="roi_resident_name" data={data} onChange={onChange} />
          <DateFieldWithToday label="Date" name="roi_form_date" data={data} onChange={onChange} />
        </div>
        <div className="space-y-2 text-sm leading-relaxed">
          {ROI_INTRO_TEXT.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium">Authorized Contacts</p>
          <RoiContactRow idx={1} data={data} onChange={onChange} />
          <RoiContactRow idx={2} data={data} onChange={onChange} />
          <RoiContactRow idx={3} data={data} onChange={onChange} />
          <RoiContactRow idx={4} data={data} onChange={onChange} />
          <RoiContactRow idx={5} data={data} onChange={onChange} />
          <RoiContactRow idx={6} data={data} onChange={onChange} />
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

        <div className="border-t pt-4 space-y-4">
          <SignaturePad
            label="Witness Signature"
            initialValue={signatures.release_of_information_witness ?? null}
            onSignatureChange={(v) => onSignatureChange("release_of_information_witness", v)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Witness Printed Name" name="roi_witness_printed_name" data={data} onChange={onChange} />
            <DateFieldWithToday label="Date" name="roi_witness_date" data={data} onChange={onChange} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Document Receipt Acknowledgment Page ─────────────────────

function PageDocumentReceipt({
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
        <CardTitle>Resident Document Receipt Acknowledgment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Form letter to be signed by resident to indicate he or she has received the
          policy and procedures documents and understands its effect.
        </p>
        <Field
          label="Print Name"
          name="document_receipt_print_name"
          data={data}
          onChange={onChange}
          required
        />
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {DOCUMENT_RECEIPT_TEXT.replace(
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
