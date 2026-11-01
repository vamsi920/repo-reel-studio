import { ModuleErrorPanel } from "#/components/shared/module-error-panel";

/** Catch-all for URLs no page claims, rendered inside the app shell. */
export default function NotFound() {
  return <ModuleErrorPanel kind="not-found" />;
}
