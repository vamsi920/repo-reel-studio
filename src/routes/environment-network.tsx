import React from "react";
import { useTranslation } from "react-i18next";
import { Download, Shield, Radio } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { ProbeVantage } from "#/lib/environment/types/probe";
import { VANTAGE_LABEL_KEY } from "#/lib/environment/display";
import { PLATFORM_EGRESS } from "#/lib/environment/requirements/feature-requirements";
import { resolveEgressUnion } from "#/lib/environment/registry";
import { useEnvironmentProfile } from "#/hooks/query/use-environment-profile";
import { useConnections } from "#/hooks/query/use-connections";
import { useEnvironmentChecks } from "#/hooks/query/use-environment-checks";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";

const VANTAGES: ProbeVantage[] = ["browser", "edge", "runtime"];

type CellState = "ok" | "fail" | "unknown";

function CellDot({ state }: { state: CellState }) {
  return (
    <span
      aria-hidden
      data-state={state}
      className={cn(
        "ame-pip",
        state === "ok" && "ame-pip-success",
        state === "fail" && "ame-pip-error",
      )}
    />
  );
}

function EnvironmentNetworkScreen() {
  const { t } = useTranslation("openhands");
  const { data: profile } = useEnvironmentProfile();
  const { data: connections } = useConnections();
  const { data: checks } = useEnvironmentChecks(200);

  const hosts = React.useMemo(
    () =>
      resolveEgressUnion(
        (connections ?? []).map((connection) => connection.providerId),
        PLATFORM_EGRESS,
      ),
    [connections],
  );

  /**
   * Latest verdict per (host, vantage). Keyed on both, never collapsed into a
   * single "reachable" boolean: an edge-function success proves the platform's
   * datacentre can reach the host, which is a different claim from the one the
   * customer's network team needs answered.
   */
  const verdicts = React.useMemo(() => {
    const map = new Map<string, CellState>();
    for (const check of checks ?? []) {
      if (check.kind !== "egress") continue;
      const key = `${check.target}|${check.vantage}`;
      // Checks arrive newest-first, so the first one wins.
      if (!map.has(key)) map.set(key, check.ok ? "ok" : "fail");
    }
    return map;
  }, [checks]);

  const mirrors = profile?.network.mirrors ?? {};

  const handleExport = React.useCallback(() => {
    const rows = [
      "host,port,purpose,mirrorable,mirror",
      ...hosts.map((host) =>
        [
          host.host,
          String(host.port),
          t(host.purposeKey).replace(/,/g, " "),
          host.mirrorable ? "yes" : "no",
          mirrors[host.host] ?? "",
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "neodevex-egress-allowlist.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    displaySuccessToast(t(I18nKey.ENVIRONMENT$EXPORT_ALLOWLIST));
  }, [hosts, mirrors, t]);

  const inbound = profile?.network.inbound;

  return (
    <div data-testid="environment-network" className="flex flex-col gap-5 pb-6">
      <p className="text-sm text-[var(--text-secondary)]">
        {t(I18nKey.ENVIRONMENT$NETWORK_SUBTITLE)}
      </p>

      <section className="ame-card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {t(I18nKey.ENVIRONMENT$EGRESS_TITLE)}
          </h2>
          <button
            type="button"
            data-testid="export-allowlist"
            onClick={handleExport}
            className="ame-btn-secondary ame-btn-sm inline-flex items-center gap-1.5"
          >
            <Download size={12} aria-hidden />
            {t(I18nKey.ENVIRONMENT$EXPORT_ALLOWLIST)}
          </button>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">
          {t(I18nKey.ENVIRONMENT$VANTAGE_HELP)}
        </p>

        {/* Wide table scrolls inside its own container so the page body never
            scrolls sideways on a narrow screen. */}
        <div className="overflow-x-auto">
          <table
            data-testid="egress-matrix"
            className="w-full min-w-[560px] border-collapse text-left text-xs"
          >
            <thead>
              <tr className="text-[var(--text-tertiary)]">
                <th scope="col" className="py-2 pr-3 font-normal">
                  {t(I18nKey.ENVIRONMENT$EGRESS_TITLE)}
                </th>
                {VANTAGES.map((vantage) => (
                  <th
                    key={vantage}
                    scope="col"
                    className="px-3 py-2 font-normal"
                  >
                    {t(VANTAGE_LABEL_KEY[vantage])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hosts.map((host) => (
                <tr
                  key={`${host.host}:${host.port}`}
                  data-testid={`egress-row-${host.host}`}
                  className="border-t border-[var(--border-color)]"
                >
                  <td className="py-2 pr-3">
                    <div className="flex flex-col">
                      <span className="font-mono text-[var(--text-primary)]">
                        {`${host.host}:${host.port}`}
                      </span>
                      <span className="text-[var(--text-tertiary)]">
                        {t(host.purposeKey)}
                      </span>
                      {mirrors[host.host] ? (
                        <span className="text-[var(--success-500)]">
                          {mirrors[host.host]}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  {VANTAGES.map((vantage) => (
                    <td key={vantage} className="px-3 py-2">
                      <CellDot
                        state={
                          mirrors[host.host]
                            ? "ok"
                            : (verdicts.get(`${host.host}|${vantage}`) ??
                              "unknown")
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-[var(--text-tertiary)]">
          {t(I18nKey.ENVIRONMENT$RUNTIME_NOT_PROBED)}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="ame-card flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2">
            <Shield
              size={14}
              aria-hidden
              className="text-[var(--primary-500)]"
            />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {t(I18nKey.ENVIRONMENT$PROXY_TITLE)}
            </h2>
          </div>
          <dl className="flex flex-col gap-1 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-tertiary)]">
                {t(I18nKey.ENVIRONMENT$PROXY_URL)}
              </dt>
              <dd className="font-mono text-[var(--text-primary)]">
                {profile?.network.proxyUrl || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-tertiary)]">
                {t(I18nKey.ENVIRONMENT$TLS_INTERCEPTION)}
              </dt>
              <dd className="text-[var(--text-primary)]">
                {t(
                  profile?.network.tlsInterception === "confirmed"
                    ? I18nKey.ENVIRONMENT$TLS_CONFIRMED
                    : profile?.network.tlsInterception === "suspected"
                      ? I18nKey.ENVIRONMENT$TLS_SUSPECTED
                      : I18nKey.ENVIRONMENT$TLS_NONE,
                )}
              </dd>
            </div>
          </dl>
          {profile?.network.tlsInterception === "confirmed" ? (
            <p className="ame-alert ame-alert-warning text-xs">
              {t(I18nKey.ENVIRONMENT$TLS_CONFIRMED_HELP)}
            </p>
          ) : null}
          <p className="text-xs text-[var(--text-tertiary)]">
            {t(I18nKey.ENVIRONMENT$MIRRORS_HELP)}
          </p>
        </section>

        <section className="ame-card flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2">
            <Radio
              size={14}
              aria-hidden
              className="text-[var(--primary-500)]"
            />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {t(I18nKey.ENVIRONMENT$INBOUND_TITLE)}
            </h2>
          </div>
          <p className="text-xs text-[var(--text-primary)]">
            {t(
              inbound?.webhooksReachable === true
                ? I18nKey.ENVIRONMENT$INBOUND_REACHABLE
                : inbound?.webhooksReachable === false
                  ? I18nKey.ENVIRONMENT$INBOUND_BLOCKED
                  : I18nKey.ENVIRONMENT$INBOUND_UNKNOWN,
            )}
          </p>
          {inbound?.webhooksReachable === false ? (
            <p className="text-xs text-[var(--text-secondary)]">
              {t(I18nKey.ENVIRONMENT$INBOUND_BLOCKED_HELP)}
            </p>
          ) : null}
          {inbound?.pollingFallback ? (
            <span className="ame-badge ame-badge-warning self-start">
              {t(I18nKey.ENVIRONMENT$POLLING_FALLBACK)}
            </span>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default EnvironmentNetworkScreen;
