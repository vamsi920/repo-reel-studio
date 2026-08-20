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
    <AgentOpsPanel
      isLoading={budgets.isLoading || policies.isLoading}
      error={budgets.error ?? policies.error}
    >
      <BudgetsPanel
        budgets={budgets.data?.budgets ?? []}
        policies={policies.data ?? { workspaces: {}, agents: {} }}
      />
    </AgentOpsPanel>
  );
}

export default AgentOpsBudgets;
