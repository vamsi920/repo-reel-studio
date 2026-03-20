import { FileSearch, GitPullRequest, MessagesSquare, Users } from "lucide-react";

const PROBLEMS = [
  {
    icon: FileSearch,
    title: "Repository context is expensive to rebuild",
    description:
      "Architecture, entry points, and core files are obvious only after someone has already spent time re-reading the codebase.",
  },
  {
    icon: MessagesSquare,
    title: "Answers are scattered across tools",
    description:
      "Documentation, issues, chat threads, and source files each hold part of the picture, but almost never in one review flow.",
  },
  {
    icon: GitPullRequest,
    title: "Change review rarely starts with full context",
    description:
      "Teams review diffs without always understanding the surrounding system, which makes risk harder to judge and onboarding slower.",
  },
  {
    icon: Users,
    title: "Onboarding depends on whoever remembers the repo",
    description:
      "Critical knowledge often lives with a few engineers instead of staying attached to the repository as a reusable workspace artifact.",
  },
] as const;

export const ProblemStatement = () => {
  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <div className="grid gap-10 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
          <div>
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
              Why Teams Lose Context
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
              Repositories are understandable.
              <br />
              Reviewing them is what breaks.
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              The problem is not that code is impossible to explain. The problem is that the explanation
              is fragmented across tools, roles, and moments in time.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {PROBLEMS.map((problem) => (
              <div
                key={problem.title}
                className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="inline-flex rounded-2xl bg-slate-100 p-2 text-slate-700">
                  <problem.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-950">{problem.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{problem.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
