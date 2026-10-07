import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useNavigation } from "#/context/navigation-context";
import { useTracking } from "#/hooks/use-tracking";
import { useAiGuideStore } from "./ai-guide-store";
import { buildAiGuideAppMap, getAiGuideAllowedRoutes } from "./app-map";
import { AiGuideWizard } from "./ai-guide-wizard";
import { getUiMap } from "./ui-map";

/**
 * Runs an AI guide whenever one is opened (`useAiGuideStore.open`) and shows
 * its bubble. The agent code is loaded on demand by `runAiGuide`.
 */
export function AiGuideHost({ onProductTour }: { onProductTour: () => void }) {
  const { t, i18n } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const { trackAiGuideEnded } = useTracking();
  const isOpen = useAiGuideStore((state) => state.isOpen);
  const query = useAiGuideStore((state) => state.query);

  // Latest navigate/t without restarting the run when they change identity.
  const navigateRef = React.useRef(navigate);
  navigateRef.current = navigate;
  const tRef = React.useRef(t);
  tRef.current = t;

  React.useEffect(() => {
    if (!isOpen || !query) return undefined;
    let cancelled = false;
    const store = useAiGuideStore.getState();
    const translate = (key: I18nKey) => tRef.current(key);
    const shared = {
      language: i18n.language,
      allowedRoutes: getAiGuideAllowedRoutes(),
      doneTitle: tRef.current(I18nKey.AI_GUIDE$DONE_TITLE),
      navigate: (route: string) => navigateRef.current(route),
      presentStep: store.presentStep,
      advance: store.advance,
      setPlanning: store.setPlanning,
      registerStop: store.setStopper,
    };
    // Plan first (one quick call, then every step is instant); the
    // page-reading agent only loads if the plan can't cover something.
    import("./plan-guide")
      .then(({ runPlannedGuide }) =>
        runPlannedGuide({
          ...shared,
          query,
          uiMap: getUiMap(translate),
          runLive: (liveQuery) =>
            import("./ai-guide-agent").then(({ runAiGuide }) =>
              runAiGuide({
                ...shared,
                query: liveQuery,
                appMap: buildAiGuideAppMap(translate),
              }),
            ),
        }),
      )
      .then((result) => {
        if (cancelled) return;
        const { stepCount } = useAiGuideStore.getState();
        trackAiGuideEnded({ outcome: result.outcome, steps: stepCount });
        if (result.outcome === "error") {
          useAiGuideStore.getState().fail(result.kind);
        } else if (result.outcome === "completed") {
          useAiGuideStore.getState().close();
        }
      })
      .catch(() => {
        if (!cancelled) useAiGuideStore.getState().fail("failed");
      });
    return () => {
      cancelled = true;
    };
    // A new query (or reopening) starts a fresh run.
  }, [isOpen, query]);

  if (!isOpen) return null;

  return (
    <AiGuideWizard
      onAskAnother={() => {
        const { close, openMenu } = useAiGuideStore.getState();
        close();
        openMenu();
      }}
      onProductTour={() => {
        useAiGuideStore.getState().close();
        onProductTour();
      }}
    />
  );
}
