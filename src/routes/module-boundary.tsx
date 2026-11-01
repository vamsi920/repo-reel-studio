import { isRouteErrorResponse, Outlet, useRouteError } from "react-router";
import { ModuleErrorPanel } from "#/components/shared/module-error-panel";

/**
 * Pathless layout around every page inside the app shell. Its only job is the
 * ErrorBoundary: React Router renders a route's boundary in place of that
 * route's element, and this route sits inside root-layout's <Outlet />, so a
 * page that crashes or 404s is replaced by a recoverable panel while the
 * sidebar, banners and command menu keep working. Without it the error went
 * to root-layout's boundary and the whole shell disappeared with it.
 */
export default function ModuleBoundary() {
  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <ModuleErrorPanel
        kind={error.status === 404 ? "not-found" : "crash"}
        detail={`${error.status} ${error.statusText}`.trim()}
      />
    );
  }

  return (
    <ModuleErrorPanel
      kind="crash"
      detail={error instanceof Error ? error.message : String(error)}
    />
  );
}
