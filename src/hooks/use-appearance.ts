import React from "react";
import {
  applyAppearance,
  currentAppearance,
  subscribeAppearance,
  type ResolvedAppearance,
} from "#/themes/appearance";

/** The resolved appearance ("light" | "dark"), live. */
export function useAppearance(): ResolvedAppearance {
  return React.useSyncExternalStore(
    subscribeAppearance,
    currentAppearance,
    () => "light",
  );
}

/** Mount once near the root: keeps the DOM attributes in step with the choice. */
export function useApplyAppearance(): ResolvedAppearance {
  const appearance = useAppearance();
  React.useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);
  return appearance;
}
