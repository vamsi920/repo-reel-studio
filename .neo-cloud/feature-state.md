# Feature-builder state (owned by neo-feature-builder-cloud — don't hand-edit)

goal-hash: a090b5e9ede3
status: building
goal: build a tutorial interactive wizard (with navigations and subtitiles) so that any new user can understand it on the first watch.. and if not new user there shoud be a small button on the left side to start tutorial

interpretation: A first-time user should get a short guided tour of the whole
app — each step takes them to the page it describes and narrates it in a
caption bar at the bottom of the screen ("subtitles"), with Back/Next/Skip and
progress. It auto-plays once for someone who just finished onboarding;
returning users are never interrupted but see a small tab on the left edge of
the screen that replays it. Success = a newcomer who clicks Next through it
knows where chat, customization, automations, environment, AgentOps,
Knowledge and settings live.

design decisions:
- Lives in `src/components/features/tutorial/` (steps, zustand store, wizard, launcher, host); mounted as `<TutorialHost />` next to `<OnboardingHost />` in `src/routes/root-layout.tsx`.
- Steps are data (`getTutorialSteps()`): id, title/subtitle i18n keys, optional route. The wizard navigates via `useNavigation()` on step change (route decoupling rule).
- Caption bar is a non-modal `role="dialog"` pinned bottom-center so the page behind stays visible; subtitle is `aria-live="polite"`. Arrow keys move, Escape skips, Enter advances (Next autofocused).
- "Seen" persisted in localStorage `neo-tutorial-seen` on finish/skip/Escape. Auto-start only when onboarding transitions to completed in this session (same-tab `neo:onboarding-completed` event added to `useOnboardingCompletion`) — users onboarded before this feature just get the launcher.
- Launcher: small GraduationCap tab fixed to the left edge, vertically centered (clear of the sidebar's top nav and bottom user menu); hidden while the tour runs.
- Copy under `TUTORIAL$*` in all 15 locales.

milestones:
- [x] 1. MVP: steps + store + caption-bar wizard (Back/Next/Skip/Finish, progress, dots, keys) + left-edge launcher + auto-start after onboarding + i18n + tests — done 2026-09-28
- [x] 2. Spotlight: highlight the sidebar item each step talks about (anchor via data-testid, dim the rest, scroll into view) — done 2026-09-28 (works in expanded + collapsed sidebar; on phones the sidebar is hidden so no spotlight shows — opening the mobile drawer mid-tour deferred to milestone 4)
- [ ] 3. Auto-play mode: optional play/pause that advances captions on a timer sized to caption length ("watch" mode), respecting prefers-reduced-motion
- [ ] 4. Edge cases: Cloud backends that skip onboarding (treat as new user when tutorial never seen and no conversations), resume position after reload mid-tour, launcher placement on mobile + conversation route, spotlight on mobile (open drawer or anchor the header menu button), analytics events via useTracking
- [ ] 5. a11y + polish: focus return to launcher on close, tooltip on launcher, reduced-motion, dark/light tokens review, RTL (ar) check

last commit: feat(tutorial): spotlight the sidebar item each tour step describes (2026-09-28)
