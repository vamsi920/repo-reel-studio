import { Play, FileCode, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";

export const DemoMockup = () => {
  const codeSnippet = `// src/auth/middleware.ts
import { NextRequest } from 'next/server';
import { verifyToken } from './utils';

export async function authMiddleware(
  request: NextRequest
) {
  const token = request.cookies.get('session');
  
  if (!token) {
    return redirectToLogin(request);
  }

  const user = await verifyToken(token.value);
  return { user, request };
}`;

  const narrationScript = `Scene 2: Authentication Flow

"The authentication middleware intercepts 
all protected routes. It first extracts 
the session token from cookies..."

"If no token exists, the user is 
redirected to the login page. Otherwise, 
we verify the token and attach the user 
object to the request..."

"This pattern ensures secure access 
control throughout the application."`;

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            See it in <span className="gradient-text">Action</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Watch how we transform code into engaging video content
          </p>
        </div>

        <Card variant="elevated" className="max-w-5xl mx-auto overflow-hidden">
          {/* Video Player Header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-secondary/50 border-b border-border">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-destructive/50" />
              <div className="w-3 h-3 rounded-full bg-warning/50" />
              <div className="w-3 h-3 rounded-full bg-success/50" />
            </div>
            <span className="text-xs text-muted-foreground ml-2 font-mono">
              demo-walkthrough.mp4
            </span>
          </div>

          {/* Content */}
          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Code Panel */}
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                <FileCode className="h-4 w-4" />
                <span>Source Code</span>
              </div>
              <pre className="text-xs md:text-sm font-mono text-muted-foreground leading-relaxed overflow-x-auto">
                <code>{codeSnippet}</code>
              </pre>
            </div>

            {/* Narration Panel */}
            <div className="p-6 bg-secondary/20">
              <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                <span>AI Narration</span>
              </div>
              <div className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">
                {narrationScript}
              </div>
            </div>
          </div>

          {/* Player Controls */}
          <div className="flex items-center gap-4 px-6 py-4 bg-secondary/30 border-t border-border">
            <button className="h-10 w-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors glow-primary-subtle">
              <Play className="h-4 w-4 text-primary-foreground ml-0.5" />
            </button>
            <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
              <div className="w-1/3 h-full bg-primary rounded-full" />
            </div>
            <span className="text-xs text-muted-foreground font-mono">1:24 / 4:30</span>
          </div>
        </Card>
      </div>
    </section>
  );
};
