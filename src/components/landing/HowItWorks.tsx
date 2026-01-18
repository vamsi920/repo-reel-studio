import { GitBranch, Brain, Film } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const HowItWorks = () => {
  const steps = [
    {
      icon: GitBranch,
      title: "Ingest",
      description: "We clone and map your repository structure, understanding the relationships between files and modules.",
      step: "01",
    },
    {
      icon: Brain,
      title: "Analyze",
      description: "Gemini 3 analyzes your codebase and writes a detailed director's script for the walkthrough.",
      step: "02",
    },
    {
      icon: Film,
      title: "Render",
      description: "We generate a professionally narrated video walkthrough with code highlights and diagrams.",
      step: "03",
    },
  ];

  return (
    <section id="features" className="py-24 relative">
      <div className="absolute inset-0 bg-radial-gradient opacity-50" />
      
      <div className="container relative mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            How it <span className="gradient-text">Works</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            From repository to video in three simple steps
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {steps.map((step, index) => (
            <Card
              key={step.title}
              variant="interactive"
              className="group relative overflow-hidden"
            >
              {/* Step Number */}
              <div className="absolute top-4 right-4 text-6xl font-bold text-muted/30 font-mono group-hover:text-primary/20 transition-colors">
                {step.step}
              </div>

              <CardHeader className="relative">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <step.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{step.title}</CardTitle>
              </CardHeader>
              
              <CardContent className="relative">
                <CardDescription className="text-base leading-relaxed">
                  {step.description}
                </CardDescription>
              </CardContent>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-px bg-gradient-to-r from-border to-transparent" />
              )}
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
