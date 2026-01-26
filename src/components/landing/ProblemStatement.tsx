import { FileText, Clock, Users, TrendingDown } from "lucide-react";

export const ProblemStatement = () => {
  const problems = [
    {
      icon: FileText,
      title: "Stale Documentation",
      description: "READMEs get outdated the moment code changes. Developers skip them entirely.",
      stat: "73% of developers",
      statDesc: "find documentation outdated",
    },
    {
      icon: Clock,
      title: "Time-Consuming Onboarding",
      description: "New team members spend hours reading code to understand architecture.",
      stat: "5+ hours",
      statDesc: "average onboarding time",
    },
    {
      icon: Users,
      title: "Knowledge Gaps",
      description: "Critical architectural decisions are lost in code comments or forgotten.",
      stat: "60% of projects",
      statDesc: "lack clear architecture docs",
    },
    {
      icon: TrendingDown,
      title: "Low Engagement",
      description: "Text-based docs are boring. Developers prefer visual, interactive content.",
      stat: "3x more engaging",
      statDesc: "video vs. text content",
    },
  ];

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-rose-500/5 to-transparent" />
      
      <div className="container relative mx-auto px-4">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-100 border border-rose-300/60 text-sm mb-6">
            <span className="text-rose-600">⚠️</span>
            <span className="text-rose-800 font-medium">The Problem We're Solving</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Developer Documentation is{" "}
            <span className="bg-gradient-to-r from-rose-500 to-orange-500 bg-clip-text text-transparent">
              Broken
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Traditional documentation fails developers. We're fixing it with AI-powered video walkthroughs.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {problems.map((problem, index) => (
            <div
              key={problem.title}
              className="group p-6 rounded-2xl bg-card border border-border/50 hover:border-rose-300/50 hover:bg-rose-50/30 transition-all duration-300"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-gradient-to-br from-rose-500/20 to-orange-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <problem.icon className="h-6 w-6 text-rose-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="font-semibold text-lg">{problem.title}</h3>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-rose-600">{problem.stat}</div>
                      <div className="text-xs text-muted-foreground">{problem.statDesc}</div>
                    </div>
                  </div>
                  <p className="text-muted-foreground">{problem.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-primary/10 via-cyan-500/10 to-blue-500/10 border border-primary/20">
            <span className="text-2xl">💡</span>
            <div className="text-left">
              <p className="font-semibold text-foreground">GitFlick solves this</p>
              <p className="text-sm text-muted-foreground">
                Turn any repository into an engaging video walkthrough in under 60 seconds
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
