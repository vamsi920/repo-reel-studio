import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Terminal,
  ArrowLeft,
  Download,
  RefreshCw,
  Play,
  Pause,
  ChevronRight,
  File,
  Folder,
  Edit3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Scene {
  id: string;
  title: string;
  narration: string;
  file: string;
}

const mockScenes: Scene[] = [
  {
    id: "1",
    title: "Project Overview",
    narration: "This is a modern React application built with Vite and TypeScript. The project follows a modular architecture with clear separation of concerns...",
    file: "src/App.tsx",
  },
  {
    id: "2",
    title: "Authentication Flow",
    narration: "The authentication system uses JWT tokens stored in HTTP-only cookies. The auth middleware intercepts all protected routes and validates the session...",
    file: "src/auth/middleware.ts",
  },
  {
    id: "3",
    title: "Component Library",
    narration: "The UI is built using a custom component library based on shadcn/ui. Each component is fully typed and supports both light and dark themes...",
    file: "src/components/ui/button.tsx",
  },
  {
    id: "4",
    title: "State Management",
    narration: "Global state is managed using React Query for server state and Zustand for client state. This provides optimal caching and real-time updates...",
    file: "src/hooks/useStore.ts",
  },
];

const mockFileTree = [
  {
    name: "src",
    type: "folder" as const,
    expanded: true,
    children: [
      { name: "App.tsx", type: "file" as const },
      { name: "main.tsx", type: "file" as const },
      {
        name: "auth",
        type: "folder" as const,
        expanded: true,
        children: [
          { name: "middleware.ts", type: "file" as const, active: true },
          { name: "utils.ts", type: "file" as const },
        ],
      },
      {
        name: "components",
        type: "folder" as const,
        children: [{ name: "ui", type: "folder" as const }],
      },
    ],
  },
];

const codeContent = `// src/auth/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from './utils';

export interface AuthResult {
  user: User | null;
  error?: string;
}

export async function authMiddleware(
  request: NextRequest
): Promise<AuthResult | NextResponse> {
  const token = request.cookies.get('session');
  
  if (!token) {
    return NextResponse.redirect(
      new URL('/login', request.url)
    );
  }

  try {
    const user = await verifyToken(token.value);
    return { user };
  } catch (error) {
    return { user: null, error: 'Invalid token' };
  }
}`;

interface FileTreeItemProps {
  item: {
    name: string;
    type: "file" | "folder";
    expanded?: boolean;
    active?: boolean;
    children?: FileTreeItemProps["item"][];
  };
  depth?: number;
}

const FileTreeItem = ({ item, depth = 0 }: FileTreeItemProps) => {
  const [expanded, setExpanded] = useState(item.expanded ?? false);

  return (
    <div>
      <button
        className={cn(
          "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-secondary/50 transition-colors",
          item.active && "bg-primary/10 text-primary"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => item.type === "folder" && setExpanded(!expanded)}
      >
        {item.type === "folder" ? (
          <>
            <ChevronRight
              className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")}
            />
            <Folder className="h-3 w-3 text-primary" />
          </>
        ) : (
          <>
            <span className="w-3" />
            <File className="h-3 w-3 text-muted-foreground" />
          </>
        )}
        <span>{item.name}</span>
      </button>
      {item.type === "folder" && expanded && item.children && (
        <div>
          {item.children.map((child) => (
            <FileTreeItem key={child.name} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const Studio = () => {
  const navigate = useNavigate();
  const [activeScene, setActiveScene] = useState(mockScenes[1]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(35);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Terminal className="h-3.5 w-3.5" />
            </div>
            <span className="font-medium text-sm">facebook/react</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </Button>
          <Button size="sm" className="gap-2" onClick={() => navigate("/export")}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Script */}
        <aside className="w-72 border-r border-border bg-card flex flex-col shrink-0">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold">Script Scenes</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {mockScenes.map((scene, index) => (
              <Card
                key={scene.id}
                variant={activeScene.id === scene.id ? "elevated" : "interactive"}
                className={cn(
                  "p-3 cursor-pointer",
                  activeScene.id === scene.id && "ring-1 ring-primary"
                )}
                onClick={() => setActiveScene(scene)}
              >
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-sm font-medium flex-1">{scene.title}</h3>
                  <button className="text-muted-foreground hover:text-foreground">
                    <Edit3 className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 ml-5">
                  {scene.narration}
                </p>
              </Card>
            ))}
          </div>
        </aside>

        {/* Center - Video Player */}
        <main className="flex-1 flex flex-col bg-background p-6 overflow-hidden">
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-4xl">
              {/* Video Frame */}
              <Card variant="elevated" className="aspect-video relative overflow-hidden">
                <div className="absolute inset-0 bg-secondary/30 flex items-center justify-center">
                  {/* Fake video content */}
                  <div className="absolute inset-0 p-8">
                    <div className="h-full flex items-center justify-center">
                      <pre className="font-mono text-xs md:text-sm text-muted-foreground">
                        <code>{codeContent.substring(0, 300)}...</code>
                      </pre>
                    </div>
                  </div>

                  {/* Play button overlay */}
                  <button
                    className="relative z-10 h-16 w-16 rounded-full bg-primary/90 flex items-center justify-center hover:bg-primary transition-colors glow-primary"
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? (
                      <Pause className="h-6 w-6 text-primary-foreground" />
                    ) : (
                      <Play className="h-6 w-6 text-primary-foreground ml-1" />
                    )}
                  </button>
                </div>

                {/* Current scene indicator */}
                <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-background/80 backdrop-blur-sm text-xs font-medium">
                  Scene 2: {activeScene.title}
                </div>
              </Card>

              {/* Player Controls */}
              <div className="mt-4 flex items-center gap-4">
                <button
                  className="h-10 w-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors"
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4 text-primary-foreground" />
                  ) : (
                    <Play className="h-4 w-4 text-primary-foreground ml-0.5" />
                  )}
                </button>
                <div className="flex-1 relative">
                  <div className="h-1.5 rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={progress}
                    onChange={(e) => setProgress(Number(e.target.value))}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  />
                </div>
                <span className="text-xs font-mono text-muted-foreground w-20 text-right">
                  1:24 / 4:30
                </span>
              </div>
            </div>
          </div>
        </main>

        {/* Right Panel - File Tree */}
        <aside className="w-64 border-l border-border bg-card flex flex-col shrink-0">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold">Current Context</h2>
            <p className="text-xs text-muted-foreground mt-1">{activeScene.file}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {mockFileTree.map((item) => (
              <FileTreeItem key={item.name} item={item} />
            ))}
          </div>
          
          {/* Code Preview */}
          <div className="border-t border-border p-4 bg-secondary/20">
            <h3 className="text-xs font-semibold mb-2 text-muted-foreground">Preview</h3>
            <pre className="text-[10px] font-mono text-muted-foreground line-clamp-6 overflow-hidden">
              <code>{codeContent.substring(0, 200)}...</code>
            </pre>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Studio;
