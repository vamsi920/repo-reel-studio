import React from "react";
import { cn } from "#/utils/utils";

/**
 * Connector marks are bundled SVGs, never remote URLs.
 *
 * Three reasons, any one of which is sufficient: the Netlify CSP blocks
 * third-party image hosts, an air-gapped install could not fetch them, and
 * requesting a vendor's asset tells that vendor which customer is evaluating
 * them. `import.meta.glob` with `?react` matches how the sidebar already
 * loads its own SVGs.
 */
const LOGO_MODULES = import.meta.glob<{
  default: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
}>("../../../../lib/environment/logos/*.svg", { eager: true, query: "?react" });

const LOGOS = new Map<
  string,
  React.FunctionComponent<React.SVGProps<SVGSVGElement>>
>(
  Object.entries(LOGO_MODULES).map(([path, module]) => [
    path.slice(path.lastIndexOf("/") + 1),
    module.default,
  ]),
);

export interface ConnectorLogoProps {
  logo: string;
  size?: number;
  className?: string;
}

/**
 * Resolved outside the component body. Looking a component up inside render
 * and instantiating it reads to the linter -- correctly, in general -- as
 * creating a component during render. Here the set is a fixed, eagerly
 * imported map, so this is a table read rather than a new component identity
 * on every pass.
 */
function renderLogo(
  logo: string,
  props: React.SVGProps<SVGSVGElement>,
): React.ReactElement | null {
  const Logo = LOGOS.get(logo);
  return Logo ? <Logo {...props} /> : null;
}

export function ConnectorLogo({
  logo,
  size = 32,
  className,
}: ConnectorLogoProps) {
  const element = renderLogo(logo, {
    width: size,
    height: size,
    className: cn("shrink-0", className),
    ...{ "data-testid": "connector-logo" },
  });

  // A manifest referencing a missing file is caught by the registry test; at
  // runtime a neutral placeholder beats a broken-image icon.
  if (!element) {
    return (
      <span
        data-testid="connector-logo-missing"
        aria-hidden
        className={cn(
          "inline-block rounded-[11px] border border-[var(--border-color)] bg-[var(--background-tertiary)]",
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  return element;
}
