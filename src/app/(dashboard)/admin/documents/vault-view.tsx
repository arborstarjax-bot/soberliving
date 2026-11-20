"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  uploadVaultDocument,
  deleteVaultDocument,
  emailVaultDocument,
} from "./actions";
import { getDocumentUrl } from "@/app/(intake)/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, Mail, Trash2 } from "lucide-react";

interface VaultDoc {
  id: string;
  name: string;
  storage_path: string;
  file_size: number | null;
  created_at: string;
}

export function VaultView({ docs }: { docs: VaultDoc[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [emailDoc, setEmailDoc] = useState<VaultDoc | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const upload = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await uploadVaultDocument(undefined, formData);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };

  const open = async (path: string) => {
    const res = await getDocumentUrl(path);
    if (res && "url" in res && res.url) window.open(res.url, "_blank");
  };

  const sendEmail = (formData: FormData) => {
    setEmailError(null);
    startTransition(async () => {
      const res = await emailVaultDocument(undefined, formData);
      if (res?.error) setEmailError(res.error);
      else setEmailSent(true);
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Upload Document</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={upload} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="doc_name">Name</Label>
              <Input id="doc_name" name="doc_name" placeholder="House Rules" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="file">File</Label>
              <Input id="file" name="file" type="file" required />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No documents yet.
                  </TableCell>
                </TableRow>
              )}
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>
                    {d.file_size
                      ? `${Math.round(d.file_size / 1024)} KB`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {new Date(d.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => open(d.storage_path)}
                    >
                      <FileText className="h-4 w-4" /> View
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEmailDoc(d);
                        setEmailSent(false);
                        setEmailError(null);
                      }}
                    >
                      <Mail className="h-4 w-4" /> Email
                    </Button>
                    <form
                      className="inline"
                      action={async (formData) => {
                        await deleteVaultDocument(undefined, formData);
                        router.refresh();
                      }}
                    >
                      <input type="hidden" name="document_id" value={d.id} />
                      <Button variant="ghost" size="sm" type="submit">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!emailDoc} onOpenChange={() => setEmailDoc(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Email “{emailDoc?.name}”</DialogTitle>
          </DialogHeader>
          {emailSent ? (
            <p className="text-sm text-green-600">
              Sent — the recipient received the document as an attachment.
            </p>
          ) : (
            <form action={sendEmail} className="space-y-4">
              <input
                type="hidden"
                name="document_id"
                value={emailDoc?.id ?? ""}
              />
              <div className="space-y-2">
                <Label htmlFor="email">Recipient email *</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message (optional)</Label>
                <Input id="message" name="message" />
              </div>
              {emailError && (
                <p className="text-sm text-destructive">{emailError}</p>
              )}
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Sending…" : "Send"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
