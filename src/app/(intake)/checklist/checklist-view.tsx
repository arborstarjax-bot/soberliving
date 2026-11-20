"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeIntakeChecklist } from "./actions";
import { getDocumentUrl } from "@/app/(intake)/actions";
import { SignaturePad } from "@/components/signature-pad";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface Step {
  id: string;
  label: string;
  required?: boolean;
}
interface AckDoc {
  id: string;
  name: string;
  storage_path: string;
}

export function ChecklistView({
  steps,
  rules,
  rulesDocId,
  ackDocs,
}: {
  steps: Step[];
  rules: string[];
  rulesDocId: string | null;
  ackDocs: AckDoc[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [rulesChecked, setRulesChecked] = useState<Set<number>>(new Set());
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const missingStep = steps.some((s) => s.required && !checked.has(s.id));
  const missingRule = rulesChecked.size < rules.length;
  const missingAck = ackDocs.some((d) => !signatures[d.id]);
  const blocked = missingStep || missingRule || missingAck;

  const openDoc = async (path: string) => {
    const res = await getDocumentUrl(path);
    if (res && "url" in res && res.url) window.open(res.url, "_blank");
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("checked_steps", JSON.stringify([...checked]));
      fd.set(
        "acks",
        JSON.stringify(
          ackDocs
            .filter((d) => signatures[d.id])
            .map((d) => ({ document_id: d.id, signature: signatures[d.id] }))
        )
      );
      const res = (await completeIntakeChecklist(fd)) as {
        error?: string;
      };
      if (res?.error) setError(res.error);
      else router.push("/rules");
    });
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 py-6">
      <h1 className="text-2xl font-bold">Intake Checklist</h1>

      {steps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {steps.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked.has(s.id)}
                  onChange={(e) =>
                    setChecked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(s.id);
                      else next.delete(s.id);
                      return next;
                    })
                  }
                />
                {s.label}
                {s.required && (
                  <span className="text-destructive">*</span>
                )}
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      {rules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Rules — check each one</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rules.map((r, i) => (
              <label key={i} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={rulesChecked.has(i)}
                  onChange={(e) =>
                    setRulesChecked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      return next;
                    })
                  }
                />
                {r}
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      {rulesDocId && null /* reserved for a vault rules doc */}

      {ackDocs.map((d) => (
        <Card key={d.id}>
          <CardHeader>
            <CardTitle className="text-lg">
              Acknowledge: {d.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              type="button"
              onClick={() => openDoc(d.storage_path)}
              className="text-sm underline"
            >
              Open document
            </button>
            <p className="text-sm text-muted-foreground">
              Sign to confirm you received and read this document.
            </p>
            <SignaturePad
              onSignatureChange={(sig) =>
                setSignatures((prev) => ({ ...prev, [d.id]: sig ?? "" }))
              }
            />
          </CardContent>
        </Card>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        className="w-full"
        disabled={pending || blocked}
        onClick={submit}
      >
        {pending ? "Saving…" : "Complete Intake"}
      </Button>
      <a
        href="/rules"
        className={cn(buttonVariants({ variant: "ghost" }), "w-full")}
      >
        Skip
      </a>
    </div>
  );
}
