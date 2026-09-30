import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isSupabaseConfigured: true,
  rpcError: null as { message: string } | null,
  rpcCalls: [] as { fn: string; args: unknown }[],
  schemaCalls: [] as string[],
  throwOnRpc: false,
}));

vi.mock("#/lib/data-platform/client", () => ({
  get isSupabaseConfigured() {
    return state.isSupabaseConfigured;
  },
  supabase: {
    schema: (name: string) => {
      state.schemaCalls.push(name);
      return {
        rpc: async (fn: string, args: unknown) => {
          state.rpcCalls.push({ fn, args });
          if (state.throwOnRpc) throw new Error("network error");
          return { error: state.rpcError };
        },
      };
    },
  },
}));

const { jobQueue } = await import("#/lib/data-platform/job-queue");

describe("jobQueue.enqueue", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.rpcError = null;
    state.rpcCalls = [];
    state.schemaCalls = [];
    state.throwOnRpc = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the payload to pgmq.send under the given queue name", async () => {
    await expect(
      jobQueue.enqueue("kt_video_jobs", { conversationId: "conv-1" }),
    ).resolves.toEqual({ ok: true });

    expect(state.schemaCalls).toEqual(["pgmq"]);
    expect(state.rpcCalls).toEqual([
      {
        fn: "send",
        args: {
          queue_name: "kt_video_jobs",
          msg: { conversationId: "conv-1" },
        },
      },
    ]);
  });

  it("returns ok:false without throwing when the rpc call reports an error", async () => {
    state.rpcError = { message: "relation pgmq.q_kt_video_jobs does not exist" };

    await expect(
      jobQueue.enqueue("kt_video_jobs", { conversationId: "conv-1" }),
    ).resolves.toEqual({ ok: false });
  });

  it("returns ok:false without throwing when the rpc call itself throws", async () => {
    state.throwOnRpc = true;

    await expect(
      jobQueue.enqueue("kt_video_jobs", { conversationId: "conv-1" }),
    ).resolves.toEqual({ ok: false });
  });

  it("no-ops to ok:true when Supabase isn't configured", async () => {
    state.isSupabaseConfigured = false;

    await expect(
      jobQueue.enqueue("kt_video_jobs", { conversationId: "conv-1" }),
    ).resolves.toEqual({ ok: true });
    expect(state.schemaCalls).toEqual([]);
  });
});
