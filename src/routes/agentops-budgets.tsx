import {
  useAgentOpsBudgets,
  useAgentOpsPolicies,
} from "#/hooks/query/use-agentops";
import { AgentOpsPanel } from "#/components/features/agentops/agentops-panel";
import { BudgetsPanel } from "#/components/features/agentops/budgets-panel";

function AgentOpsBudgets() {
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
      <BudgetsPanel
        budgets={budgets.data?.budgets ?? []}
        policies={policies.data ?? { workspaces: {}, agents: {} }}
      />
    </AgentOpsPanel>
  );
}

export default AgentOpsBudgets;
