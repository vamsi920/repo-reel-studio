import { TeamInvitationsPanel } from "#/components/features/teams/team-invitations-panel";
import { useTeamOutletContext } from "./team";

export default function TeamInvitationsRoute() {
  const { team } = useTeamOutletContext();
  // Keyed by team so nothing typed or opened for one team lingers into another.
  return <TeamInvitationsPanel key={team.id} team={team} />;
}
