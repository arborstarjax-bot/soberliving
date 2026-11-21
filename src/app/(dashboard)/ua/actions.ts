"use server";
import { err, ok, okVoid, type ActionResult } from "@/lib/action-result";

import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { revalidatePath } from "next/cache";

export async function drawUaTest(
  _prevState: { error?: string; testId?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role !== "admin") return err("Not authorized");

  const houseId = String(formData.get("house_id") ?? "");
  const count = Math.max(1, Math.min(50, Number(formData.get("count")) || 0));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const manualIds = String(formData.get("resident_ids") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!houseId) return err("Pick a house");

  const admin = createAdminClient();
  const { data: residents } = await admin
    .from("residents")
    .select("id")
    .eq("house_id", houseId)
    .eq("status", "active");
  const pool = (residents ?? []).map((r) => r.id as string);
  if (pool.length === 0) return err("No active residents in this house");

  let picked: string[];
  if (manualIds.length > 0) {
    picked = pool.filter((id) => manualIds.includes(id));
    if (picked.length === 0)
      return err("No selected residents are active in this house");
  } else {
    // Fisher-Yates shuffle, take `count`
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    picked = pool.slice(0, Math.min(count, pool.length));
  }

  const { data: test, error: tErr } = await admin
    .from("ua_tests")
    .insert({
      workspace_id: user.workspace_id,
      house_id: houseId,
      count: picked.length,
      reason,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (tErr || !test) return err(tErr?.message ?? "Draw failed");

  await admin
    .from("ua_results")
    .insert(picked.map((rid) => ({ test_id: test.id, resident_id: rid })));

  await logActivity({
    houseId,
    actorId: user.id,
    eventType: "ua_drawn",
    entityType: "ua_test",
    entityId: test.id,
    description: `${user.full_name} drew ${picked.length} residents for a UA`,
  });

  revalidatePath("/ua");
  return ok({ testId: test.id });
}

export async function setUaResult(
  _prevState: ActionResult | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role !== "admin") return err("Not authorized");

  const resultId = String(formData.get("result_id") ?? "");
  const result = String(formData.get("result") ?? "");
  if (!["pending", "pass", "fail"].includes(result)) {
    return err("Invalid result");
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("ua_results")
    .select("id, test_id, ua_tests!inner(workspace_id, status)")
    .eq("id", resultId)
    .maybeSingle();
  const test = row?.ua_tests as unknown as {
    workspace_id: string | null;
    status: string;
  } | null;
  if (!row || !test || test.workspace_id !== user.workspace_id || test.status !== "open") {
    return err("Test not found");
  }

  await admin.from("ua_results").update({ result }).eq("id", resultId);
  revalidatePath("/ua");
  return okVoid();
}

export async function uploadUaPhoto(
  _prevState: ActionResult | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role !== "admin") return err("Not authorized");

  const resultId = String(formData.get("result_id") ?? "");
  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) return err("No photo");
  if (file.size > 10 * 1024 * 1024) return err("Photo too large (10MB)");

  const admin = createAdminClient();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/ua/${Date.now()}-${safe}`;
  const { error: upErr } = await admin.storage
    .from("documents")
    .upload(path, file, { upsert: false });
  if (upErr) return err(upErr.message);

  await admin.from("ua_results").update({ photo_path: path }).eq("id", resultId);
  revalidatePath("/ua");
  return okVoid();
}

export async function archiveUaTest(
  _prevState: ActionResult | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role !== "admin") return err("Not authorized");

  const testId = String(formData.get("test_id") ?? "");
  const admin = createAdminClient();
  await admin
    .from("ua_tests")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", testId)
    .eq("workspace_id", user.workspace_id);
  revalidatePath("/ua");
  return okVoid();
}
