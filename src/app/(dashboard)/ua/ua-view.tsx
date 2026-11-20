"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  drawUaTest,
  setUaResult,
  uploadUaPhoto,
  archiveUaTest,
} from "./actions";
import { getDocumentUrl } from "@/app/(intake)/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Printer, FileText } from "lucide-react";

interface Result {
  id: string;
  resident_id: string;
  result: string;
  photo_path: string | null;
  resident: { full_name: string } | null;
}
interface Test {
  id: string;
  house_id: string | null;
  count: number;
  status: string;
  created_at: string;
  house: { name: string } | null;
  ua_results: Result[];
}

export function UaView({
  houses,
  tests,
}: {
  houses: { id: string; name: string }[];
  tests: Test[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [houseId, setHouseId] = useState(houses[0]?.id ?? "");
  const [count, setCount] = useState(3);

  const open = tests.filter((t) => t.status === "open");
  const archived = tests.filter((t) => t.status !== "open");

  const draw = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("house_id", houseId);
      fd.set("count", String(count));
      const res = await drawUaTest(undefined, fd);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };

  const setResult = (resultId: string, result: string) =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("result_id", resultId);
      fd.set("result", result);
      await setUaResult(undefined, fd);
      router.refresh();
    });

  const archive = (testId: string) =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("test_id", testId);
      await archiveUaTest(undefined, fd);
      router.refresh();
    });

  const viewPhoto = async (path: string) => {
    const res = await getDocumentUrl(path);
    if (res && "url" in res && res.url) window.open(res.url, "_blank");
  };

  const renderResults = (t: Test) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Resident</TableHead>
          <TableHead>Result</TableHead>
          <TableHead className="text-right">Photo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {t.ua_results.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">
              {r.resident?.full_name ?? "Resident"}
            </TableCell>
            <TableCell>
              {t.status === "open" ? (
                <div className="flex gap-1">
                  {(["pass", "fail"] as const).map((v) => (
                    <Button
                      key={v}
                      size="sm"
                      variant={r.result === v ? "default" : "outline"}
                      className={
                        r.result === v
                          ? v === "pass"
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-red-600 hover:bg-red-700"
                          : ""
                      }
                      onClick={() => setResult(r.id, v)}
                    >
                      {v === "pass" ? "Pass" : "Fail"}
                    </Button>
                  ))}
                </div>
              ) : (
                <Badge
                  variant={
                    r.result === "pass"
                      ? "default"
                      : r.result === "fail"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {r.result}
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-2">
                {r.photo_path && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => viewPhoto(r.photo_path!)}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                )}
                {t.status === "open" && (
                  <form
                    action={async (fd) => {
                      fd.set("result_id", r.id);
                      await uploadUaPhoto(undefined, fd);
                      router.refresh();
                    }}
                  >
                    <label className="text-xs underline cursor-pointer">
                      {r.photo_path ? "Replace" : "Add photo"}
                      <input
                        type="file"
                        name="photo"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          e.currentTarget.form?.requestSubmit()
                        }
                      />
                    </label>
                  </form>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>New Draw</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="ua-house">House</Label>
            <select
              id="ua-house"
              value={houseId}
              onChange={(e) => setHouseId(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ua-count">How many UAs</Label>
            <Input
              id="ua-count"
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-24"
            />
          </div>
          <Button onClick={draw} disabled={pending || !houseId}>
            Draw Names
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {open.map((t) => (
        <Card key={t.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {t.house?.name ?? "House"} — {t.count} drawn —{" "}
              {new Date(t.created_at).toLocaleString()}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
              <Button size="sm" onClick={() => archive(t.id)}>
                Complete & Archive
              </Button>
            </div>
          </CardHeader>
          <CardContent>{renderResults(t)}</CardContent>
        </Card>
      ))}

      {archived.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Archives</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {archived.map((t) => (
              <div key={t.id} className="space-y-2">
                <p className="text-sm font-medium">
                  {t.house?.name ?? "House"} —{" "}
                  {new Date(t.created_at).toLocaleString()}
                </p>
                {renderResults(t)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
