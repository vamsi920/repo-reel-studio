import { TeamWorkspacesPanel } from "#/components/features/teams/team-workspaces-panel";
import { useTeamOutletContext } from "./team";

export default function TeamWorkspacesRoute() {
  const { team } = useTeamOutletContext();
  // Keyed by team so nothing typed or opened for one team lingers into another.
  return <TeamWorkspacesPanel key={team.id} team={team} />;
}
