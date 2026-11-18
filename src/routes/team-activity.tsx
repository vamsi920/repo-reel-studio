import { TeamActivityPanel } from "#/components/features/teams/team-activity-panel";
import { useTeamOutletContext } from "./team";

export default function TeamActivityRoute() {
  const { team } = useTeamOutletContext();
  // Keyed by team so nothing typed or opened for one team lingers into another.
  return <TeamActivityPanel key={team.id} team={team} />;
}
