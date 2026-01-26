import { GitBranch, Brain, Film, Sparkles, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const HowItWorks = () => {
  const steps = [
    {
      icon: GitBranch,
      title: "Ingest",
      description: "Paste any GitHub URL. We instantly clone and map your entire repository structure, understanding file relationships and architecture.",
      step: "01",
      color: "from-blue-500 to-cyan-500",
    },
    {
      icon: Brain,
      title: "Analyze with Gemini 3",
      description: "Google's most powerful AI model analyzes your codebase, identifies key components, and crafts an engaging director's script.",
      step: "02",
      color: "from-primary to-cyan-500",
      highlight: true,
    },
    {
      icon: Film,
      title: "Render",
      description: "Watch as your code transforms into a professionally narrated video walkthrough with syntax highlighting and smooth animations.",
      step: "03",
      color: "from-pink-500 to-rose-500",
    },
  ];

  return (
    <section id="features" className="py-24 relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
      
      <div className="container relative mx-auto px-4">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm mb-6">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-primary font-medium">Simple 3-Step Process</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            How <span className="bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">GitFlick</span> Works
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            From repository to video in under 60 seconds
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <Card
              key={step.title}
              variant="interactive"
              className={`group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:border-primary/20 ${step.highlight ? 'ring-2 ring-primary/30' : ''}`}
            >
              {/* Gradient background on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${step.color} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
              
              {/* Step Number */}
              <div className={`absolute top-4 right-4 text-7xl font-bold bg-gradient-to-br ${step.color} bg-clip-text text-transparent opacity-20 font-mono group-hover:opacity-30 transition-opacity`}>
                {step.step}
              </div>

              <CardHeader className="relative">
                <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <step.icon className="h-7 w-7 text-white" />
                </div>
                <CardTitle className="text-xl flex items-center gap-2">
                  {step.title}
                  {step.highlight && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-normal">
                      Gemini 3
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              
              <CardContent className="relative">
                <CardDescription className="text-base leading-relaxed">
                  {step.description}
                </CardDescription>
              </CardContent>

              {/* Connector Arrow */}
              {index < steps.length - 1 && (
                <div className="hidden md:flex absolute top-1/2 -right-3 z-10 h-6 w-6 items-center justify-center rounded-full bg-card border border-border">
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* Gemini Highlight Box */}
        <div className="max-w-3xl mx-auto mt-16">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary via-cyan-500 to-rose-400 rounded-2xl blur opacity-25" />
            <div className="relative bg-card/90 backdrop-blur-sm border border-border/50 rounded-2xl p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex-shrink-0">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center">
                    <Brain className="h-8 w-8 text-white" />
                  </div>
                </div>
                <div className="text-center md:text-left">
                  <h3 className="text-xl font-bold mb-2 flex items-center gap-2 justify-center md:justify-start">
                    <span>Powered by Gemini 3 Pro</span>
                    <Sparkles className="h-5 w-5 text-yellow-500" />
                  </h3>
                  <p className="text-muted-foreground">
                    GitFlick leverages Google's most advanced multimodal AI to understand code context, 
                    generate intelligent narration scripts, and create engaging video content that actually 
                    explains your codebase - not just shows it.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
