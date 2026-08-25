import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

/**
 * `jira_automation_triggers` holds no secrets (project key, label, repo,
 * automation id) -- unlike `jira_connections`/`jira_webhook_registrations`,
 * it has real client-write RLS (`user_id = auth.uid()`), so the browser
 * manages its own rows directly like any other app data.
 */
export interface JiraTrigger {
  id: string;
  projectKey: string;
  labelFilter: string | null;
  readyStatus: string;
  repository: string;
  branch: string | null;
  automationId: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface JiraTriggerInput {
  projectKey: string;
  labelFilter?: string;
  readyStatus: string;
  repository: string;
  branch?: string;
  automationId: string;
}

export interface JiraTriggersRepository {
  listTriggers(): Promise<JiraTrigger[]>;
  createTrigger(input: JiraTriggerInput): Promise<JiraTrigger | null>;
  setEnabled(id: string, enabled: boolean): Promise<boolean>;
  deleteTrigger(id: string): Promise<boolean>;
  /** Whether this user already has an Atlassian + automation-service webhook
   * registered (`jira_webhook_registrations`) -- checked before registering
   * again, since the automation-service rejects a second custom webhook for
   * the same `source` per org. */
  hasWebhookRegistration(): Promise<boolean>;
}

function toTrigger(row: Record<string, unknown>): JiraTrigger {
  return {
    id: row.id as string,
    projectKey: row.project_key as string,
    labelFilter: (row.label_filter as string | null) ?? null,
    readyStatus: row.ready_status as string,
    repository: row.repository as string,
    branch: (row.branch as string | null) ?? null,
    automationId: (row.automation_id as string | null) ?? null,
    enabled: row.enabled as boolean,
    createdAt: row.created_at as string,
  };
}

class SupabaseJiraTriggersRepository implements JiraTriggersRepository {
  async listTriggers(): Promise<JiraTrigger[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("jira_automation_triggers")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data.map(toTrigger);
  }

  async createTrigger(input: JiraTriggerInput): Promise<JiraTrigger | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("jira_automation_triggers")
      .insert({
        user_id: user.id,
        project_key: input.projectKey,
        label_filter: input.labelFilter ?? null,
        ready_status: input.readyStatus,
        repository: input.repository,
        branch: input.branch ?? null,
        automation_id: input.automationId,
      })
      .select("*")
      .single();
    if (error || !data) return null;
    return toTrigger(data);
  }

  async setEnabled(id: string, enabled: boolean): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    const { error } = await supabase
      .from("jira_automation_triggers")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("id", id);
    return !error;
  }

  async deleteTrigger(id: string): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    const { error } = await supabase
      .from("jira_automation_triggers")
      .delete()
      .eq("id", id);
    return !error;
  }

  async hasWebhookRegistration(): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data } = await supabase
      .from("jira_webhook_registrations")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    return !!data;
  }
}

export const jiraTriggersRepository: JiraTriggersRepository =
  new SupabaseJiraTriggersRepository();
