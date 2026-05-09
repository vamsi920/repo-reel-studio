import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion } from "framer-motion";
import { MagicalWordCloud } from "./MagicalWordCloud";
import { ConceptDiscovery } from "./ConceptDiscovery";
import {
  GitBranch,
  FileCode,
  Network,
  Layers,
  Zap,
  ChevronRight,
  Sparkles,
  Activity,
  Database,
  Shield,
  BarChart3,
} from "lucide-react";
import type {
  RepoIntelligence,
  RepoEvidenceBundle,
  RepoKnowledgeGraph,
  ConceptNode,
} from "@/lib/types";

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger);

interface Props {
  intelligence: RepoIntelligence | null;
  evidence: RepoEvidenceBundle | null;
  knowledgeGraph: RepoKnowledgeGraph | null;
  isBuilding: boolean;
  onContinue: () => void;
}

export const MagicalRepoUnderstanding = ({
  intelligence,
  evidence,
  knowledgeGraph,
  isBuilding,
  onContinue,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const [currentPhase, setCurrentPhase] = useState<
    "discovery" | "wordcloud" | "stats" | "complete"
  >("discovery");
  const [concepts, setConcepts] = useState<ConceptNode[]>([]);
  
  // Extract concepts from intelligence data
  useEffect(() => {
    if (!intelligence) return;
    
    const extractedConcepts: ConceptNode[] = [];
    const colors = [
      "#6884ff", "#4ade80", "#fbbf24", "#f87171",
      "#a78bfa", "#22d3ee", "#fb923c", "#e879f9",
    ];
    
    // Add technologies as concepts
    intelligence.technologies.forEach((tech, i) => {
      extractedConcepts.push({
        id: `tech-${i}`,
        label: tech,
        category: "technology",
        weight: 10 + Math.random() * 10,
        color: colors[i % colors.length],
        relatedConcepts: [],
        videoReferences: [],
      });
    });
    
    // Add architecture pattern
    if (intelligence.architecture_pattern) {
      extractedConcepts.push({
        id: "architecture",
        label: intelligence.architecture_pattern,
        category: "architecture",
        weight: 15,
        color: colors[0],
        relatedConcepts: extractedConcepts.slice(0, 2).map(c => c.id),
        videoReferences: [],
      });
    }
    
    // Add module concepts
    intelligence.modules.slice(0, 5).forEach((module, i) => {
      extractedConcepts.push({
        id: `module-${i}`,
        label: module.label,
        category: "module",
        weight: 8 + (module.is_hub ? 5 : 0),
        color: colors[(i + 3) % colors.length],
        relatedConcepts: [],
        videoReferences: [module.id],
      });
    });
    
    setConcepts(extractedConcepts);
  }, [intelligence]);
  
  // GSAP Timeline animations
  useEffect(() => {
    if (!containerRef.current || !intelligence) return;
    
    // Kill existing timeline
    if (timelineRef.current) {
      timelineRef.current.kill();
    }
    
    // Create master timeline
    const tl = gsap.timeline({
      defaults: { duration: 1, ease: "power3.inOut" },
      onUpdate: () => {
        const progress = tl.progress();
        if (progress < 0.25) {
          setCurrentPhase("discovery");
        } else if (progress < 0.5) {
          setCurrentPhase("wordcloud");
        } else if (progress < 0.75) {
          setCurrentPhase("stats");
        } else {
          setCurrentPhase("complete");
        }
      },
    });
    
    timelineRef.current = tl;
    
    // Phase 1: Discovery entrance
    tl.from(".discovery-container", {
      opacity: 0,
      scale: 0.8,
      duration: 1.5,
    })
    .from(".discovery-particle", {
      opacity: 0,
      scale: 0,
      stagger: 0.02,
      duration: 0.5,
    }, "-=1")
    
    // Phase 2: Word cloud reveal
    .to(".discovery-container", {
      opacity: 0,
      scale: 1.2,
      duration: 1,
    })
    .from(".wordcloud-container", {
      opacity: 0,
      rotationY: 90,
      duration: 1.5,
    }, "-=0.5")
    .from(".concept-word", {
      opacity: 0,
      scale: 0,
      stagger: {
        each: 0.05,
        from: "center",
        grid: "auto",
      },
      duration: 0.8,
    }, "-=1")
    
    // Phase 3: Stats dashboard
    .to(".wordcloud-container", {
      y: -100,
      opacity: 0.3,
      scale: 0.8,
      duration: 1,
    })
    .from(".stats-grid", {
      opacity: 0,
      y: 50,
      duration: 1,
    }, "-=0.5")
    .from(".stat-card", {
      opacity: 0,
      scale: 0.8,
      stagger: 0.1,
      duration: 0.6,
    }, "-=0.5")
    
    // Phase 4: Module cards
    .from(".module-card", {
      opacity: 0,
      x: -50,
      stagger: 0.1,
      duration: 0.8,
    })
    
    // Phase 5: Final reveal
    .from(".continue-button", {
      opacity: 0,
      scale: 0,
      duration: 0.8,
      ease: "back.out(1.7)",
    });
    
    // ScrollTrigger for parallax effects
    const cards = containerRef.current.querySelectorAll(".parallax-card");
    cards.forEach((card, i) => {
      gsap.to(card, {
        scrollTrigger: {
          trigger: card,
          start: "top bottom",
          end: "bottom top",
          scrub: 1,
        },
        y: (i % 2 === 0 ? -50 : 50),
      });
    });
    
    return () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
      }
      ScrollTrigger.killAll();
    };
  }, [intelligence]);
  
  if (!intelligence) return null;
  
  return (
    <div
      ref={containerRef}
      className="relative min-h-screen bg-gradient-to-br from-[#0a0f1f] via-[#0d1424] to-[#111a34] overflow-hidden"
    >
      {/* Animated background gradient */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `
              radial-gradient(circle at 20% 50%, rgba(104, 132, 255, 0.3) 0%, transparent 50%),
              radial-gradient(circle at 80% 80%, rgba(74, 222, 128, 0.2) 0%, transparent 50%),
              radial-gradient(circle at 40% 20%, rgba(251, 191, 36, 0.2) 0%, transparent 50%)
            `,
            animation: "gradientShift 20s ease-in-out infinite",
          }}
        />
      </div>
      
      {/* Phase indicators */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20">
        <div className="flex items-center gap-4">
          {["discovery", "wordcloud", "stats", "complete"].map((phase, i) => (
            <div
              key={phase}
              className={`flex items-center gap-2 ${
                currentPhase === phase ? "opacity-100" : "opacity-30"
              } transition-opacity duration-500`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  currentPhase === phase ? "bg-primary" : "bg-white/20"
                }`}
              />
              <span className="text-xs text-white/60 capitalize">{phase}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Content container */}
      <div className="relative z-10 container mx-auto px-4 py-20">
        {/* Discovery Phase */}
        {currentPhase === "discovery" && (
          <div className="discovery-container">
            <ConceptDiscovery
              concepts={concepts}
              isDiscovering={true}
              onComplete={() => {
                // Phase complete
              }}
            />
          </div>
        )}
        
        {/* Word Cloud Phase */}
        {currentPhase === "wordcloud" && (
          <div className="wordcloud-container">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center mb-8"
            >
              <h2 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-3">
                <Sparkles className="h-8 w-8 text-primary" />
                Concept Universe
              </h2>
              <p className="text-white/60">
                Exploring {concepts.length} interconnected concepts
              </p>
            </motion.div>
            <MagicalWordCloud
              concepts={concepts}
              isAnimating={true}
              animationType="orbit"
            />
          </div>
        )}
        
        {/* Stats Dashboard Phase */}
        {(currentPhase === "stats" || currentPhase === "complete") && (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="stats-grid grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  icon: FileCode,
                  label: "Source Files",
                  value: intelligence.total_source_files,
                  color: "primary",
                },
                {
                  icon: BarChart3,
                  label: "Lines of Code",
                  value: `${Math.round(intelligence.total_lines / 1000)}k`,
                  color: "emerald",
                },
                {
                  icon: Layers,
                  label: "Modules",
                  value: intelligence.modules.length,
                  color: "amber",
                },
                {
                  icon: Activity,
                  label: "Complexity",
                  value: intelligence.architecture_pattern || "Unknown",
                  color: "rose",
                },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className="stat-card parallax-card rounded-xl bg-white/[0.04] p-6 backdrop-blur-md border border-white/[0.08] hover:bg-white/[0.06] transition-all duration-300"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-lg bg-${stat.color}/10`}>
                      <stat.icon className={`h-6 w-6 text-${stat.color}`} />
                    </div>
                    <div>
                      <div className="text-xs text-white/40 uppercase tracking-wider">
                        {stat.label}
                      </div>
                      <div className="text-2xl font-bold text-white mt-1">
                        {stat.value}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Module Cards */}
            <div className="grid lg:grid-cols-2 gap-6">
              {intelligence.modules.slice(0, 4).map((module, i) => (
                <div
                  key={module.id}
                  className="module-card parallax-card rounded-xl bg-white/[0.04] p-6 backdrop-blur-md border border-white/[0.08] hover:bg-white/[0.06] transition-all duration-300"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-white">
                          {module.label}
                        </h3>
                        {module.is_hub && (
                          <span className="px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs">
                            Hub
                          </span>
                        )}
                        {module.is_entry && (
                          <span className="px-2 py-1 rounded-full bg-primary/20 text-primary text-xs">
                            Entry
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-white/60 mt-2">
                        {module.description}
                      </p>
                      <div className="flex items-center gap-4 mt-3">
                        <span className="text-xs text-white/40">
                          {module.file_paths.length} files
                        </span>
                        <span className="text-xs text-white/40">
                          Complexity: {module.complexity}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-white/20" />
                  </div>
                </div>
              ))}
            </div>
            
            {/* Continue Button */}
            {currentPhase === "complete" && (
              <div className="flex justify-center pt-8">
                <button
                  onClick={onContinue}
                  className="continue-button group relative px-8 py-4 rounded-full bg-primary text-white font-semibold text-lg shadow-[0_20px_50px_rgba(104,132,255,0.3)] hover:shadow-[0_20px_60px_rgba(104,132,255,0.4)] transition-all duration-300 hover:scale-105"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Continue to Video Generation
                    <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Custom animations */}
      <style jsx>{`
        @keyframes gradientShift {
          0%, 100% { transform: rotate(0deg) scale(1); }
          33% { transform: rotate(120deg) scale(1.1); }
          66% { transform: rotate(240deg) scale(0.9); }
        }
      `}</style>
    </div>
  );
};