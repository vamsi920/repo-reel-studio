import { TeamMembersPanel } from "#/components/features/teams/team-members-panel";
import { useTeamOutletContext } from "./team";

export default function TeamMembersRoute() {
  const { team, currentUserId, personalTeamId } = useTeamOutletContext();
  // Keyed by team so nothing typed or opened for one team lingers into another.
  return (
    <TeamMembersPanel
      key={team.id}
      team={team}
      currentUserId={currentUserId}
      personalTeamId={personalTeamId}
    />
  );
}
