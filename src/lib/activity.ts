import "server-only";

import { createClient } from "@/lib/supabase/server";

interface LogActivityParams {
  houseId?: string;
  residentId?: string;
  actorId: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity({
  houseId,
  residentId,
  actorId,
  eventType,
  entityType,
  entityId,
  description,
  metadata,
}: LogActivityParams) {
  const supabase = await createClient();

  const { error } = await supabase.from("activity_log").insert({
    house_id: houseId ?? null,
    resident_id: residentId ?? null,
    actor_id: actorId,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    description,
    metadata: metadata ?? null,
  });

  if (error) {
    console.error("Failed to log activity:", error);
  }
}
