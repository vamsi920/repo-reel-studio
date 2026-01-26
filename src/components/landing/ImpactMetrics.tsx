import { TrendingUp, Zap, Users, Clock } from "lucide-react";

export const ImpactMetrics = () => {
  const metrics = [
    {
      icon: Clock,
      value: "60 seconds",
      label: "To generate a video",
      description: "From repo URL to video preview",
      color: "from-blue-500 to-cyan-500",
    },
    {
      icon: TrendingUp,
      value: "5x faster",
      label: "Onboarding speed",
      description: "Video walkthroughs vs. reading code",
      color: "from-cyan-500 to-teal-500",
    },
    {
      icon: Zap,
      value: "100%",
      label: "AI-powered",
      description: "Advanced AI analyzes and narrates",
      color: "from-primary to-purple-500",
    },
    {
      icon: Users,
      value: "3x more",
      label: "Engagement",
      description: "Developers prefer video content",
      color: "from-rose-500 to-orange-500",
    },
  ];

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/3 to-transparent" />
      
      <div className="container relative mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Real{" "}
            <span className="bg-gradient-to-r from-primary via-cyan-500 to-blue-500 bg-clip-text text-transparent">
              Impact
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            See how GitFlick transforms developer onboarding and documentation
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {metrics.map((metric, index) => (
            <div
              key={metric.label}
              className="group relative p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${metric.color} opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity`} />
              <div className="relative">
                <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${metric.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg`}>
                  <metric.icon className="h-6 w-6 text-white" />
                </div>
                <div className="text-3xl font-bold mb-1 bg-gradient-to-r from-foreground to-foreground bg-clip-text text-transparent">
                  {metric.value}
                </div>
                <div className="font-semibold text-foreground mb-1">{metric.label}</div>
                <div className="text-sm text-muted-foreground">{metric.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
