import type { GitNexusGraphData, VideoManifest } from "@/lib/types";

export type AgentRunsPanelProps = {
  repoUrl: string;
  repoName: string;
  projectId?: string | null;
  manifest: VideoManifest | null;
  graphData: GitNexusGraphData | null;
  onFocusFile?: (filePath: string) => void;
};

export type SelectedRunView = {
  phaseIndex: number;
  isActive: boolean;
  isReview: boolean;
  isFailed: boolean;
  latestTitle: string | null;
};
