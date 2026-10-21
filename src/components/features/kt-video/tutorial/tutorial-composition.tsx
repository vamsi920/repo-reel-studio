import { useMemo } from "react";
import { AbsoluteFill, Audio, Sequence, useCurrentFrame } from "remotion";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { CHAPTER_LEAD_SECONDS } from "#/lib/kt-video/tutorial-timing";
import type {
  CodeVisual,
  DiagramVisual,
  FlowVisual,
  KtTutorial,
  TutorialBeat,
  TutorialVisual,
} from "#/lib/kt-video/tutorial-types";
import { AnimatedDiagram } from "./animated-diagram";
import { FlowPanel } from "./flow-panel";
import { IdePanel } from "./ide-panel";
import { RecapCards } from "./recap-cards";
import { RepoMap } from "./repo-map";
import {
  CAPTION_HEIGHT,
  STAGE,
  THEME,
  TOP_BAR_HEIGHT,
  exitFade,
} from "./theme";
import { TitleCard } from "./title-card";
import { Captions, ChapterLowerThird, TopBar } from "./tutorial-chrome";

interface BeatContext {
  beat: TutorialBeat;
  chapterIndex: number;
  previous: TutorialBeat | null;
  openTabs: string[];
  introduceDiagram: boolean;
  introduceTree: boolean;
}

/** Everything a beat needs to know about what came before it. */
export function buildBeatContexts(tutorial: KtTutorial): BeatContext[] {
  const contexts: BeatContext[] = [];
  const seenDiagrams = new Set<string>();
  let seenTree = false;
  let previous: TutorialBeat | null = null;
  tutorial.chapters.forEach((chapter, chapterIndex) => {
    const tabs: string[] = [];
    chapter.beats.forEach((beat) => {
      const { visual } = beat;
      if (visual.kind === "code" && !tabs.includes(visual.path))
        tabs.push(visual.path);
      if (visual.kind === "flow") {
        visual.steps.slice(0, visual.activeStep + 1).forEach((s) => {
          if (!tabs.includes(s.path)) tabs.push(s.path);
        });
      }
      let introduceDiagram = false;
      if (visual.kind === "diagram" && !seenDiagrams.has(visual.diagramId)) {
        seenDiagrams.add(visual.diagramId);
        introduceDiagram = true;
      }
      let introduceTree = false;
      if (visual.kind === "tree" && !seenTree) {
        seenTree = true;
        introduceTree = true;
      }
      contexts.push({
        beat,
        chapterIndex,
        previous,
        openTabs: [...tabs],
        introduceDiagram,
        introduceTree,
      });
      previous = beat;
    });
  });
  return contexts;
}

function sameVisualFamily(
  a: TutorialVisual | undefined,
  b: TutorialVisual,
): boolean {
  if (!a) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "code" && b.kind === "code") return a.path === b.path;
  if (a.kind === "diagram" && b.kind === "diagram")
    return a.diagramId === b.diagramId;
  return true;
}

function BeatScene({
  tutorial,
  context,
}: {
  tutorial: KtTutorial;
  context: BeatContext;
}) {
  const frame = useCurrentFrame();
  const { beat, previous, openTabs } = context;
  const { visual } = beat;
  const prevVisual = previous?.visual;
  const continuous = sameVisualFamily(prevVisual, visual);
  const fade = continuous ? 1 : exitFade(frame, beat.durationInFrames, 8);

  let body: React.ReactNode = null;
  switch (visual.kind) {
    case "code":
      body = (
        <IdePanel
          visual={visual}
          previous={
            prevVisual?.kind === "code" ? (prevVisual as CodeVisual) : null
          }
          files={tutorial.files}
          fileTree={tutorial.fileTree}
          openTabs={openTabs}
          relativeFrame={frame}
          durationInFrames={beat.durationInFrames}
        />
      );
      break;
    case "diagram": {
      const diagram = tutorial.diagrams[visual.diagramId];
      body = diagram ? (
        <AnimatedDiagram
          diagram={diagram}
          visual={visual}
          previous={
            prevVisual?.kind === "diagram"
              ? (prevVisual as DiagramVisual)
              : null
          }
          introduce={context.introduceDiagram}
          relativeFrame={frame}
        />
      ) : null;
      break;
    }
    case "tree":
      body = (
        <RepoMap
          visual={visual}
          fileTree={tutorial.fileTree}
          files={tutorial.files}
          introduce={context.introduceTree}
          relativeFrame={frame}
        />
      );
      break;
    case "title":
      body = (
        <TitleCard
          visual={visual}
          relativeFrame={frame}
          durationInFrames={beat.durationInFrames}
          repoName={tutorial.repoName}
          chapterIndex={context.chapterIndex}
        />
      );
      break;
    case "flow":
      body = (
        <FlowPanel
          visual={visual}
          previous={
            prevVisual?.kind === "flow" ? (prevVisual as FlowVisual) : null
          }
          files={tutorial.files}
          fileTree={tutorial.fileTree}
          relativeFrame={frame}
          durationInFrames={beat.durationInFrames}
        />
      );
      break;
    case "cards":
      body = <RecapCards visual={visual} relativeFrame={frame} />;
      break;
    default:
      body = null;
  }

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: TOP_BAR_HEIGHT,
        paddingBottom: CAPTION_HEIGHT,
        opacity: fade,
      }}
    >
      {body}
    </AbsoluteFill>
  );
}

export interface KtTutorialCompositionProps {
  tutorial: KtTutorial;
  captions?: boolean;
}

/**
 * The tutorial video: one Sequence per beat (visual + optional narration
 * audio + captions), a lower-third at every chapter start, and a persistent
 * top bar with chapter progress.
 */
export function KtTutorialComposition({
  tutorial,
  captions = true,
}: KtTutorialCompositionProps) {
  const frame = useCurrentFrame();
  const { t } = useTranslation("openhands");
  const contexts = useMemo(() => buildBeatContexts(tutorial), [tutorial]);
  const chapterIndex = Math.max(
    0,
    tutorial.chapters.findIndex((c, i) => {
      const next = tutorial.chapters[i + 1];
      return frame >= c.startFrame && (!next || frame < next.startFrame);
    }),
  );

  if (!contexts.length) {
    return (
      <AbsoluteFill
        style={{
          background: THEME.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: THEME.textMuted,
          fontFamily: THEME.fontSans,
        }}
      >
        {t(I18nKey.KT$VIDEO_NO_ELIGIBLE_SCENES)}
      </AbsoluteFill>
    );
  }

  const leadFrames = Math.round(CHAPTER_LEAD_SECONDS * tutorial.fps);

  return (
    <AbsoluteFill
      style={{
        background: THEME.bg,
        overflow: "hidden",
        width: STAGE.width,
        height: STAGE.height,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(1200px 700px at 50% 20%, rgba(34,224,255,0.07) 0%, transparent 65%), radial-gradient(800px 500px at 90% 90%, rgba(180,140,255,0.06) 0%, transparent 60%)",
        }}
      />
      {contexts.map((context) => (
        <Sequence
          key={context.beat.id}
          from={context.beat.startFrame}
          durationInFrames={context.beat.durationInFrames}
          name={context.beat.id}
        >
          <BeatScene tutorial={tutorial} context={context} />
          {tutorial.audio?.[context.beat.id] ? (
            <Audio src={tutorial.audio[context.beat.id].url} />
          ) : null}
          {captions ? (
            <Captions
              beat={context.beat}
              relativeFrame={frame - context.beat.startFrame}
            />
          ) : null}
        </Sequence>
      ))}
      {tutorial.chapters.map((chapter, i) => (
        <Sequence
          key={`${chapter.id}-lower-third`}
          from={chapter.startFrame}
          durationInFrames={Math.min(chapter.durationInFrames, leadFrames + 90)}
          name={`${chapter.id}-title`}
        >
          <ChapterLowerThird
            chapter={chapter}
            index={i}
            relativeFrame={frame - chapter.startFrame}
          />
        </Sequence>
      ))}
      <TopBar tutorial={tutorial} chapterIndex={chapterIndex} frame={frame} />
    </AbsoluteFill>
  );
}
