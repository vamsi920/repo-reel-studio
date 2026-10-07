import { describe, expect, it } from "vitest";

/**
 * The connection activity log must record real changes only. Every 401 from
 * a provider calls `markUserConnectionsStatus`; without the "only if it
 * changed" filter, a broken token would flood the log with one row per API
 * call. supabase/functions is outside this project's tsconfig, so the module
 * is loaded with a dynamic specifier (see legacy-mirror.test.ts).
 */
const MODULE_PATH = [
  "..",
  "..",
  "..",
  "supabase",
  "functions",
  "_shared",
  "connection-sync.ts",
].join("/");
const { markConnectionStatus, markUserConnectionsStatus } = await import(
  /* @vite-ignore */ MODULE_PATH
);

interface Row {
  id: string;
  org_id: string;
  provider_id: string;
  instance_key: string;
  created_by: string;
  status: string;
}

/** Just enough of the supabase-js builder to run an update/select/insert. */
function makeFakeAdmin(rows: Row[]) {
  const events: Record<string, unknown>[] = [];
  const admin = {
    from(table: string) {
      if (table === "connection_events") {
        return {
          insert: async (batch: Record<string, unknown>[]) => {
            events.push(...batch);
            return { error: null };
          },
        };
      }
      const filters: ((row: Row) => boolean)[] = [];
      let patch: Partial<Row> = {};
      const builder = {
        update(next: Partial<Row>) {
          patch = next;
          return builder;
        },
        eq(column: keyof Row, value: string) {
          filters.push((row) => row[column] === value);
          return builder;
        },
        in(column: keyof Row, values: string[]) {
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        neq(column: keyof Row, value: string) {
          filters.push((row) => row[column] !== value);
          return builder;
        },
        async select() {
          const changed = rows.filter((row) => filters.every((f) => f(row)));
          for (const row of changed) Object.assign(row, patch);
          return { data: changed, error: null };
        },
      };
      return builder;
    },
  };
  return { admin, events };
}

const row = (status: string): Row => ({
  id: "conn-1",
  org_id: "org-1",
  provider_id: "github",
  instance_key: "default",
  created_by: "user-1",
  status,
});

describe("connection status bookkeeping", () => {
  it("logs one status change, not one per repeated failure", async () => {
    // Arrange
    const { admin, events } = makeFakeAdmin([row("ok")]);

    // Act: the same 401 seen three times.
    for (let i = 0; i < 3; i += 1) {
      await markUserConnectionsStatus(admin, "user-1", ["github"], "revoked", {
        httpStatus: 401,
      });
    }

    // Assert
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      org_id: "org-1",
      provider_id: "github",
      action: "status_changed",
      status: "revoked",
      detail: { httpStatus: 401 },
    });
  });

  it("logs nothing when the connection was already in that state", async () => {
    const { admin, events } = makeFakeAdmin([row("expired")]);

    await markConnectionStatus(admin, "conn-1", "expired");

    expect(events).toHaveLength(0);
  });
});
