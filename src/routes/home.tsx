import { PrefetchPageLinks } from "react-router";
import { HomeChatLauncher } from "#/components/features/home/home-chat-launcher";
import { LlmNotConfiguredBanner } from "#/components/features/home/llm-not-configured-banner";

<PrefetchPageLinks page="/conversations/:conversationId" />;

/**
 * `HomeChatLauncher` below is already a full "what are you building?"
 * screen — heading, prompt input, repo picker — inline on this page. The
 * first-run onboarding modal used to layer a near-duplicate popup on top of
 * it; removed so this screen is the one and only "new session" surface
 * (matching how e.g. Devin's new-session page works: it's the page, not a
 * dialog floating over it). `useOnboardingCompletion`'s flag is still read
 * by the separate locked-Cloud full-page takeover in root.tsx, which has no
 * shell to embed into yet and keeps its own modal for that reason.
 */
function HomeScreen() {
  return (
    <div
      data-testid="home-screen"
      className="custom-scrollbar-always h-full overflow-y-auto rounded-xl bg-transparent px-4 md:px-0 lg:px-[42px]"
    >
      <div className="md:px-4 lg:px-0">
        <LlmNotConfiguredBanner />
      </div>

      <HomeChatLauncher />
    </div>
  );
}

export default HomeScreen;
