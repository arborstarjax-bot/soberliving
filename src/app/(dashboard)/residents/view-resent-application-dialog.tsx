"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileText } from "lucide-react";

interface Props {
  residentName: string;
  formData: Record<string, unknown>;
  signatures: Record<string, string>;
}

const FIELD_LABELS: Record<string, string> = {
  first_name: "First Name",
  middle_name: "Middle Name",
  last_name: "Last Name",
  date_of_birth: "Date of Birth",
  phone: "Phone",
  email: "Email",
  emergency_name: "Emergency Contact",
  emergency_phone: "Emergency Phone",
  emergency_relationship: "Relationship",
  sobriety_date: "Sobriety Date",
  employer: "Employer",
  employer_phone: "Employer Phone",
  medications: "Medications",
  allergies: "Allergies",
  medical_conditions: "Medical Conditions",
  probation_officer: "Probation Officer",
  probation_officer_phone: "PO Phone",
  vehicle_make: "Vehicle Make",
  vehicle_model: "Vehicle Model",
  vehicle_year: "Vehicle Year",
  vehicle_color: "Vehicle Color",
  vehicle_plate: "License Plate",
};

function formatLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ViewResentApplicationDialog({
  residentName,
  formData,
  signatures,
}: Props) {
  const [open, setOpen] = useState(false);

  const entries = Object.entries(formData).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <FileText className="mr-1.5 h-3.5 w-3.5" />
        View
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Application — {residentName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {entries.map(([key, value]) => (
            <div key={key} className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-muted-foreground">
                {formatLabel(key)}
              </span>
              <span className="break-words">
                {typeof value === "boolean"
                  ? value
                    ? "Yes"
                    : "No"
                  : String(value)}
              </span>
            </div>
          ))}
          {Object.keys(signatures).length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Signatures
              </p>
              {Object.entries(signatures).map(([label, dataUrl]) => (
                <div key={label} className="mb-2">
                  <p className="text-xs text-muted-foreground">{formatLabel(label)}</p>
                  {dataUrl.startsWith("data:image") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={dataUrl}
                      alt={label}
                      className="mt-1 max-h-16 rounded border bg-white px-2 py-1"
                    />
                  ) : (
                    <span className="italic text-muted-foreground">Signed</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
