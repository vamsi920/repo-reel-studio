import {
  ArrowRight,
  FolderGit2,
  GitPullRequest,
  Network,
  PlayCircle,
} from "lucide-react";

const STEPS = [
  {
    icon: FolderGit2,
    step: "01",
    title: "Bind the repository",
    description:
      "Start from a Git URL or a local folder. GitFlick indexes the repo and stores a reusable project workspace.",
  },
  {
    icon: PlayCircle,
    step: "02",
    title: "Generate the walkthrough",
    description:
      "The system builds a scene-backed narrative artifact that stays tied to files, durations, and repo evidence.",
  },
  {
    icon: Network,
    step: "03",
    title: "Inspect structure and ask questions",
    description:
      "Move between the code graph and repo Q&A to trace architecture, reading paths, and operational boundaries.",
  },
  {
    icon: GitPullRequest,
    step: "04",
    title: "Launch issue runs when needed",
    description:
      "Turn one GitHub issue into one isolated sandbox attempt with diff, validations, and PR draft review.",
  },
] as const;

export const HowItWorks = () => {
  return (
    <section id="features" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
            Operating Model
          </div>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
            A cleaner path from repository to reviewable output
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-8 text-slate-600">
            The flow is intentionally simple: bind the repo once, reuse that context across the
            workspace, and open the specific lane you need for the current review task.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-4">
          {STEPS.map((step, index) => (
            <div
              key={step.title}
              className="relative rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="inline-flex rounded-2xl bg-slate-100 p-2 text-slate-700">
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {step.step}
                </div>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-slate-950">{step.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{step.description}</p>

              {index < STEPS.length - 1 ? (
                <div className="mt-6 hidden xl:flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  <ArrowRight className="h-4 w-4" />
                  Next
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
