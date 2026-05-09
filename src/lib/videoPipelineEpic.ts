import {
  generateManifestWithQualityPipeline,
  buildQualityReport,
} from "@/lib/videoPipelineV2";
import { enrichManifestWithCode } from "@/lib/enrichManifestWithCode";
import type {
  ChapterManifest,
  ChapterStatus,
  GitNexusGraphData,
  OnboardingConfig,
  RepoIntelligence,
  RepoModuleProfile,
  VideoGenerationPlan,
  VideoManifest,
} from "@/lib/types";

const WORDS_PER_SECOND = 2.3;

type ChapterProgressCallback = (
  chapterId: string,
  status: ChapterStatus,
  manifest?: VideoManifest,
  error?: string
) => void;

const buildChapterFileContents = (
  modules: RepoModuleProfile[],
  allFileContents: Record<string, string>
): Record<string, string> => {
  const subset: Record<string, string> = {};
  for (const mod of modules) {
    for (const fp of mod.file_paths) {
      if (allFileContents[fp]) {
        subset[fp] = allFileContents[fp];
      }
    }
  }
  return subset;
};

const splitModulesIntoChapters = (
  config: OnboardingConfig,
  intelligence: RepoIntelligence
): Array<{
  title: string;
  module_ids: string[];
  target_minutes: number;
}> => {
  const selectedModules = intelligence.modules.filter((m) =>
    config.selected_module_ids.includes(m.id)
  );

  if (selectedModules.length === 0) return [];

  const entryModules = selectedModules.filter((m) => m.is_entry);
  const hubModules = selectedModules.filter((m) => m.is_hub && !m.is_entry);
  const otherModules = selectedModules.filter((m) => !m.is_entry && !m.is_hub);

  const chapters: Array<{
    title: string;
    module_ids: string[];
    target_minutes: number;
  }> = [];

  if (entryModules.length > 0) {
    chapters.push({
      title: "Getting Started — Entry Points & Overview",
      module_ids: entryModules.map((m) => m.id),
      target_minutes: Math.max(3, Math.round(entryModules.length * 2.5)),
    });
  }

  for (const mod of hubModules) {
    const cx = mod.complexity === "high" ? 6 : mod.complexity === "medium" ? 4 : 3;
    chapters.push({
      title: `Deep Dive — ${mod.label}`,
      module_ids: [mod.id],
      target_minutes: cx,
    });
  }

  if (otherModules.length <= 3) {
    for (const mod of otherModules) {
      chapters.push({
        title: mod.label,
        module_ids: [mod.id],
        target_minutes: Math.max(2, Math.round(mod.file_paths.length * 0.5)),
      });
    }
  } else {
    const chunkSize = Math.ceil(otherModules.length / Math.ceil(otherModules.length / 3));
    for (let i = 0; i < otherModules.length; i += chunkSize) {
      const chunk = otherModules.slice(i, i + chunkSize);
      chapters.push({
        title: chunk.map((m) => m.label).join(" & "),
        module_ids: chunk.map((m) => m.id),
        target_minutes: chunk.reduce(
          (sum, m) => sum + Math.max(2, Math.round(m.file_paths.length * 0.4)),
          0
        ),
      });
    }
  }

  chapters.push({
    title: "Conclusion — Architecture Recap",
    module_ids: selectedModules.map((m) => m.id),
    target_minutes: 3,
  });

  return chapters;
};

export const buildGenerationPlan = (
  projectId: string,
  config: OnboardingConfig,
  intelligence: RepoIntelligence
): VideoGenerationPlan => {
  const chapterSpecs = splitModulesIntoChapters(config, intelligence);

  const chapters: ChapterManifest[] = chapterSpecs.map((spec, i) => ({
    id: `chapter-${i}`,
    title: spec.title,
    order: i,
    module_ids: spec.module_ids,
    status: "pending" as ChapterStatus,
    target_minutes: spec.target_minutes,
  }));

  const totalMinutes = chapters.reduce((sum, ch) => sum + ch.target_minutes, 0);
  const targetSceneCount = Math.round(totalMinutes * 2.5);
  const targetNarrationWords = Math.round(totalMinutes * 60 * WORDS_PER_SECOND);

  return {
    id: `plan-${Date.now()}`,
    project_id: projectId,
    created_at: new Date().toISOString(),
    onboarding: config,
    repo_intelligence: intelligence,
    target_total_minutes: totalMinutes,
    target_scene_count: targetSceneCount,
    target_narration_words: targetNarrationWords,
    chapters,
  };
};

export const executeGenerationPlan = async (
  plan: VideoGenerationPlan,
  repoUrl: string,
  repoName: string,
  repoContent: string,
  fileContents: Record<string, string>,
  graphData: GitNexusGraphData | null | undefined,
  onChapterProgress: ChapterProgressCallback
): Promise<VideoGenerationPlan> => {
  const updatedChapters = [...plan.chapters];
  let aggregateStart = 0;

  for (let i = 0; i < updatedChapters.length; i++) {
    const chapter = updatedChapters[i];
    const chapterModules = plan.repo_intelligence.modules.filter((m) =>
      chapter.module_ids.includes(m.id)
    );
    const chapterFileContents = buildChapterFileContents(chapterModules, fileContents);

    if (Object.keys(chapterFileContents).length === 0) {
      onChapterProgress(chapter.id, "error", undefined, "No source files for this chapter");
      updatedChapters[i] = { ...chapter, status: "error", error: "No source files" };
      continue;
    }

    try {
      onChapterProgress(chapter.id, "outlining");
      updatedChapters[i] = { ...chapter, status: "outlining" };

      onChapterProgress(chapter.id, "writing");
      updatedChapters[i] = { ...updatedChapters[i], status: "writing" };

      const chapterManifest = await generateManifestWithQualityPipeline(
        repoUrl,
        repoName,
        repoContent,
        chapterFileContents,
        graphData
      );

      onChapterProgress(chapter.id, "enriching");
      updatedChapters[i] = { ...updatedChapters[i], status: "enriching" };

      const enriched = enrichManifestWithCode(chapterManifest, chapterFileContents);
      enriched.quality_report = buildQualityReport(enriched, chapterFileContents);
      enriched.title = chapter.title;

      const actualDuration = enriched.scenes.reduce(
        (sum, s) => sum + (s.duration_seconds || 15),
        0
      );

      updatedChapters[i] = {
        ...updatedChapters[i],
        status: "ready",
        manifest: enriched,
        actual_duration_seconds: actualDuration,
      };

      onChapterProgress(chapter.id, "ready", enriched);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Generation failed";
      updatedChapters[i] = {
        ...updatedChapters[i],
        status: "error",
        error: errorMsg,
      };
      onChapterProgress(chapter.id, "error", undefined, errorMsg);
    }
  }

  const readyChapters = updatedChapters.filter((ch) => ch.status === "ready" && ch.manifest);
  let runningSeconds = 0;
  const chapterTicks = readyChapters.map((ch) => {
    const tick = {
      chapter_id: ch.id,
      start_seconds: runningSeconds,
      title: ch.title,
    };
    runningSeconds += ch.actual_duration_seconds ?? 0;
    return tick;
  });

  return {
    ...plan,
    chapters: updatedChapters,
    master_index: {
      title: `${plan.repo_intelligence.repo_name} — Master Walkthrough`,
      total_chapters: readyChapters.length,
      total_duration_seconds: runningSeconds,
      chapter_ticks: chapterTicks,
    },
  };
};

export const mergeChapterManifests = (
  chapters: ChapterManifest[]
): VideoManifest | null => {
  const ready = chapters
    .filter((ch) => ch.status === "ready" && ch.manifest)
    .sort((a, b) => a.order - b.order);

  if (ready.length === 0) return null;

  let sceneId = 1;
  const allScenes = ready.flatMap((ch) =>
    (ch.manifest!.scenes || []).map((scene) => ({
      ...scene,
      id: sceneId++,
    }))
  );

  return {
    title: ready[0].manifest!.title || "Repository Walkthrough",
    scenes: allScenes,
    repo_files: Array.from(
      new Set(ready.flatMap((ch) => ch.manifest!.repo_files ?? []))
    ),
    pipeline_version: "v2-epic",
  };
};
