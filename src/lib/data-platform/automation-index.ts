import { supabase } from "#/lib/data-platform/client";
import { currentOrigin } from "#/lib/data-platform/conversation-archive";
import { serializeAutomation } from "#/utils/automation-export";
import type { Automation, AutomationSpec } from "#/types/automation";

/**
 * Mirrors this agent-server's automations into `automation_index` so the
 * user's other environments list them. Removed automations are deleted from
 * the index for this origin.
 */
const TABLE = "automation_index";

export interface IndexedAutomation {
  origin: string;
  automation_id: string;
  name: string;
  enabled: boolean;
  trigger: Automation["trigger"] | null;
  spec: AutomationSpec;
  updated_at: string;
}

async function signedInUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  return user && !user.is_anonymous ? user.id : null;
}

let lastIndexed = "";

export async function indexAutomations(automations: Automation[]) {
  const userId = await signedInUserId();
  if (!userId || !supabase) return;
  const origin = currentOrigin();
  const rows = automations.map((a) => ({
    user_id: userId,
    origin,
    automation_id: a.id,
    name: a.name,
    enabled: a.enabled,
    trigger: a.trigger,
    spec: serializeAutomation(a).spec,
    updated_at: a.updated_at ?? new Date().toISOString(),
  }));
  const signature = JSON.stringify(
    rows.map((r) => [r.automation_id, r.updated_at, r.enabled]),
  );
  if (signature === lastIndexed) return;
  if (rows.length > 0) {
    const { error } = await supabase.from(TABLE).upsert(rows);
    if (error) {
      console.warn("[automation-index] upsert failed", error.message);
      return;
    }
  }
  const ids = rows.map((r) => r.automation_id);
  let stale = supabase.from(TABLE).delete().eq("origin", origin);
  if (ids.length > 0)
    stale = stale.not(
      "automation_id",
      "in",
      `(${ids.map((id) => `"${id}"`).join(",")})`,
    );
  await stale;
  lastIndexed = signature;
}

export async function listOtherOriginAutomations(): Promise<
  IndexedAutomation[]
> {
  if (!(await signedInUserId()) || !supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select("origin, automation_id, name, enabled, trigger, spec, updated_at")
    .neq("origin", currentOrigin())
    .order("updated_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as IndexedAutomation[];
}
