import { describe, expect, it } from "vitest";
import { buildJiraTriggerPayload } from "#/manifests/jira-trigger-setup";

describe("buildJiraTriggerPayload filter", () => {
  // Jira webhooks nest the issue under `issue`, and an issue may have no
  // labels: `contains(fields.labels, ...)` read a missing path and raised a
  // filter error, which the automation service treats as "no match".
  it("reads the project and labels from the webhook's issue and tolerates missing labels", () => {
    const body = buildJiraTriggerPayload(
      {
        projectKey: "PROJ",
        labelFilter: "ai-ready",
        readyStatus: "Ready",
        repository: "acme/app",
      },
      "cloud-1",
    );

    expect((body.trigger as { filter: string }).filter).toBe(
      "(issue.fields.project.key || fields.project.key) == 'PROJ' && contains(issue.fields.labels || fields.labels || `[]`, 'ai-ready')",
    );
  });
});
