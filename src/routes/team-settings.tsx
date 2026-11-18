import { TeamSettingsPanel } from "#/components/features/teams/team-settings-panel";
import { useTeamOutletContext } from "./team";

export default function TeamSettingsRoute() {
  const { team, currentUserId, personalTeamId } = useTeamOutletContext();
  // Keyed by team so nothing typed or opened for one team lingers into another.
  return (
    <TeamSettingsPanel
      key={team.id}
      team={team}
      currentUserId={currentUserId}
      personalTeamId={personalTeamId}
    />
  );
}
