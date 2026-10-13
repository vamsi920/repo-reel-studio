import { useDeploymentCapabilities } from "./use-manifest-capabilities";

/** Event sources the active automation deployment can receive, if known. */
export function useSupportedEventSources(): readonly string[] | null {
  const { data } = useDeploymentCapabilities();
  return data?.eventSources ?? null;
}
