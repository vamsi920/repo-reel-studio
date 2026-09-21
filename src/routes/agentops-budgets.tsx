import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  useAgentOpsBudgets,
  useAgentOpsPolicies,
} from "#/hooks/query/use-agentops";
import { AgentOpsPanel } from "#/components/features/agentops/agentops-panel";
import { BudgetsPanel } from "#/components/features/agentops/budgets-panel";

function AgentOpsBudgets() {
  const { backend } = useActiveBackend();
  const budgets = useAgentOpsBudgets();
  const policies = useAgentOpsPolicies();

  return (
    // The form's edits live inside BudgetsPanel, so it must stay mounted
    // across a failed poll: pass `hasData` whenever both queries still hold
    // their last good answer and let the panel show the outage as a banner.
    <AgentOpsPanel
      isLoading={budgets.isLoading || policies.isLoading}
      error={budgets.error ?? policies.error}
      hasData={Boolean(budgets.data && policies.data)}
    >
      {/* `edits` inside BudgetsPanel is keyed only by workspace path, not by
          backend — switching to a backend with a workspace of the same path
          would otherwise keep a stale, unsaved edit around and apply it to
          the new backend's workspace on the next Save. Keying on the backend
          id remounts the form (and drops any unsaved edit) on a switch. */}
      <BudgetsPanel
        key={backend.id}
        budgets={budgets.data?.budgets ?? []}
        policies={policies.data ?? { workspaces: {}, agents: {} }}
      />
    </AgentOpsPanel>
  );
}

export default AgentOpsBudgets;
