import { supabase } from "#/lib/data-platform/client";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import EventService from "#/api/event-service/event-service.api";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

/**
 * Indexes every chat the user's browser sees and archives its events in
 * Supabase, so chats run on this laptop show up on production and the other
 * way round. The agent-server that ran a chat stays its source of truth; the
 * archive is what other environments read (transcript, "Continue here").
 */

const INDEX_TABLE = "conversation_index";
const EVENTS_TABLE = "conversation_events";
/** Events archived per conversation per pass (pages of 100). */
const MAX_EVENTS_PER_PASS = 500;
/** One event above this is stored with long strings shortened. */
const MAX_EVENT_BYTES = 32_000;
const MAX_STRING_CHARS = 4_000;

export interface ArchivedConversation {
  conversation_id: string;
  origin: string;
  title: string | null;
  selected_repository: string | null;
  selected_branch: string | null;
  execution_status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ArchivedEvent {
  event_id: string;
  ts: string;
  payload: Record<string, unknown>;
}

/** Where a chat ran: the agent-server host it lives on. */
export function currentOrigin(): string {
  return getActiveBackend().backend.host.replace(/\/+$/, "");
}

export function isLocalOrigin(origin: string): boolean {
  return /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(origin);
}

async function signedInUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user || user.is_anonymous) return null;
  return user.id;
}

function shorten(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_STRING_CHARS
      ? `${value.slice(0, MAX_STRING_CHARS)}… [${value.length - MAX_STRING_CHARS} more characters on the agent-server]`
      : value;
  }
  if (Array.isArray(value)) return value.map(shorten);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, shorten(v)]),
    );
  }
  return value;
}

/** Stored form of one event: long tool output is cut, never the whole event. */
export function archivablePayload(event: unknown): Record<string, unknown> {
  const raw = JSON.stringify(event);
  const value = raw.length > MAX_EVENT_BYTES ? shorten(event) : event;
  return value as Record<string, unknown>;
}

const indexedAt = new Map<string, string>();

/** Upserts the index rows of conversations whose updated_at changed. */
export async function indexConversations(
  conversations: AppConversation[],
): Promise<void> {
  const userId = await signedInUserId();
  if (!userId || !supabase || conversations.length === 0) return;
  const origin = currentOrigin();
  const rows = conversations
    .filter((c) => indexedAt.get(c.id) !== c.updated_at)
    .map((c) => ({
      user_id: userId,
      conversation_id: c.id,
      origin,
      title: c.title,
      selected_repository: c.selected_repository,
      selected_branch: c.selected_branch,
      execution_status: c.execution_status,
      created_at: c.created_at,
      updated_at: c.updated_at,
      info: {
        trigger: c.trigger,
        pr_number: c.pr_number,
        llm_model: c.llm_model,
        git_provider: c.git_provider,
        tags: c.tags ?? null,
      },
      indexed_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from(INDEX_TABLE).upsert(rows);
  if (error) {
    console.warn("[conversation-archive] index failed", error.message);
    return;
  }
  for (const c of conversations) indexedAt.set(c.id, c.updated_at);
}

/**
 * Archives the events of one conversation newer than its last archived
 * event. Returns how many events were stored.
 */
export async function archiveConversationEvents(
  conversation: AppConversation,
): Promise<number> {
  const userId = await signedInUserId();
  if (!userId || !supabase) return 0;
  const { data: row } = await supabase
    .from(INDEX_TABLE)
    .select("archived_through, updated_at")
    .eq("conversation_id", conversation.id)
    .maybeSingle();
  const through = (row?.archived_through as string | null) ?? null;
  if (through && conversation.updated_at && through >= conversation.updated_at)
    return 0;

  let stored = 0;
  let pageId: string | undefined;
  let last = through;
  while (stored < MAX_EVENTS_PER_PASS) {
    const page = await EventService.searchEvents(
      conversation.id,
      conversation.conversation_url,
      conversation.session_api_key,
      {
        limit: 100,
        sortOrder: "TIMESTAMP",
        ...(through ? { timestampGte: through } : {}),
        ...(pageId ? { pageId } : {}),
      },
    );
    const items = (page.items ?? []) as unknown as Array<{
      id?: string;
      timestamp?: string;
    }>;
    const rows = items
      .filter((e) => e.id && e.timestamp)
      .map((e) => ({
        user_id: userId,
        conversation_id: conversation.id,
        event_id: e.id as string,
        ts: e.timestamp as string,
        payload: archivablePayload(e),
      }));
    if (rows.length > 0) {
      const { error } = await supabase.from(EVENTS_TABLE).upsert(rows);
      if (error) {
        console.warn("[conversation-archive] events failed", error.message);
        break;
      }
      stored += rows.length;
      last = rows[rows.length - 1].ts;
    }
    if (!page.next_page_id || items.length === 0) break;
    pageId = page.next_page_id;
  }
  if (last && last !== through) {
    await supabase
      .from(INDEX_TABLE)
      .update({ archived_through: last })
      .eq("conversation_id", conversation.id);
  }
  return stored;
}

/** Chats from the user's other environments (not on this agent-server). */
export async function listOtherOriginConversations(
  limit = 100,
): Promise<ArchivedConversation[]> {
  const userId = await signedInUserId();
  if (!userId || !supabase) return [];
  const { data, error } = await supabase
    .from(INDEX_TABLE)
    .select(
      "conversation_id, origin, title, selected_repository, selected_branch, execution_status, created_at, updated_at",
    )
    .neq("origin", currentOrigin())
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as ArchivedConversation[];
}

export async function getArchivedConversation(
  conversationId: string,
): Promise<ArchivedConversation | null> {
  if (!(await signedInUserId()) || !supabase) return null;
  const { data } = await supabase
    .from(INDEX_TABLE)
    .select(
      "conversation_id, origin, title, selected_repository, selected_branch, execution_status, created_at, updated_at",
    )
    .eq("conversation_id", conversationId)
    .maybeSingle();
  return (data as ArchivedConversation | null) ?? null;
}

export async function loadArchivedEvents(
  conversationId: string,
): Promise<ArchivedEvent[]> {
  if (!(await signedInUserId()) || !supabase) return [];
  const events: ArchivedEvent[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .select("event_id, ts, payload")
      .eq("conversation_id", conversationId)
      .order("ts", { ascending: true })
      .range(from, from + 999);
    if (error || !data?.length) break;
    events.push(...(data as ArchivedEvent[]));
    if (data.length < 1000) break;
  }
  return events;
}
