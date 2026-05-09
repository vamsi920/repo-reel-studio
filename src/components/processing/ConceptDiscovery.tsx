import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial, Sphere } from "@react-three/drei";
import * as THREE from "three";
import { Sparkles, Brain, Cpu, Network, Zap, Code2 } from "lucide-react";
import type { ConceptNode } from "@/lib/types";

interface Props {
  concepts: ConceptNode[];
  isDiscovering: boolean;
  onComplete?: () => void;
}

// Animated particle system
function ParticleSystem({ count = 500 }: { count: number }) {
  const points = useRef<THREE.Points>(null);
  const [positions] = useState(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const radius = 4 + Math.random() * 6;
      
      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = radius * Math.cos(phi);
    }
    return pos;
  });

  useFrame((state) => {
    if (!points.current) return;
    
    const time = state.clock.elapsedTime;
    const positions = points.current.geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const x = positions[i3];
      const y = positions[i3 + 1];
      const z = positions[i3 + 2];
      
      // Create spiral motion
      const angle = time * 0.2 + i * 0.01;
      const radius = Math.sqrt(x * x + z * z);
      
      positions[i3] = radius * Math.cos(angle);
      positions[i3 + 1] = y + Math.sin(time + i * 0.1) * 0.02;
      positions[i3 + 2] = radius * Math.sin(angle);
    }
    
    points.current.geometry.attributes.position.needsUpdate = true;
    points.current.rotation.y = time * 0.05;
  });

  return (
    <Points ref={points} positions={positions} stride={3}>
      <PointMaterial
        transparent
        color="#6884ff"
        size={0.02}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        opacity={0.8}
      />
    </Points>
  );
}

// Glowing orb that pulses
function PulsingOrb({ position, color, scale = 1 }: {
  position: [number, number, number];
  color: string;
  scale?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.elapsedTime;
    meshRef.current.scale.setScalar(scale * (1 + Math.sin(time * 2) * 0.1));
  });
  
  return (
    <Sphere ref={meshRef} args={[0.5, 32, 32]} position={position}>
      <meshBasicMaterial color={color} transparent opacity={0.6} />
    </Sphere>
  );
}

// Concept card that appears with animation
function ConceptCard({
  concept,
  index,
  total,
  delay,
}: {
  concept: ConceptNode;
  index: number;
  total: number;
  delay: number;
}) {
  const angle = (index / total) * Math.PI * 2;
  const radius = 200;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  
  return (
    <motion.div
      initial={{ 
        opacity: 0, 
        scale: 0,
        x: 0,
        y: 0,
      }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        x,
        y,
      }}
      exit={{
        opacity: 0,
        scale: 0,
      }}
      transition={{
        delay,
        duration: 0.8,
        type: "spring",
        stiffness: 100,
      }}
      className="absolute flex items-center justify-center"
      style={{
        left: "50%",
        top: "50%",
        marginLeft: "-60px",
        marginTop: "-40px",
      }}
    >
      <div
        className="relative group cursor-pointer"
        style={{
          animation: `float ${3 + index * 0.2}s ease-in-out infinite`,
          animationDelay: `${index * 0.1}s`,
        }}
      >
        {/* Glow effect */}
        <div
          className="absolute -inset-4 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: `radial-gradient(circle, ${concept.color}40 0%, transparent 70%)`,
            filter: "blur(20px)",
          }}
        />
        
        {/* Card */}
        <div
          className="relative px-4 py-3 rounded-xl backdrop-blur-md transition-all duration-300 group-hover:scale-110"
          style={{
            background: `linear-gradient(135deg, ${concept.color}20, ${concept.color}10)`,
            border: `1px solid ${concept.color}30`,
            boxShadow: `0 4px 20px ${concept.color}15`,
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: concept.color }}
            />
            <span className="text-sm font-medium text-white/90">
              {concept.label}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-white/50">
            {concept.category} • weight: {concept.weight}
          </div>
        </div>
        
        {/* Connection lines */}
        {concept.relatedConcepts.length > 0 && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{
              width: "400px",
              height: "400px",
              left: "-150px",
              top: "-150px",
            }}
          >
            {concept.relatedConcepts.map((relatedId, i) => {
              const relatedAngle = (Math.random() * Math.PI * 2);
              const relatedRadius = 100 + Math.random() * 50;
              const x2 = 200 + Math.cos(relatedAngle) * relatedRadius;
              const y2 = 200 + Math.sin(relatedAngle) * relatedRadius;
              
              return (
                <line
                  key={relatedId}
                  x1="200"
                  y1="200"
                  x2={x2}
                  y2={y2}
                  stroke={concept.color}
                  strokeOpacity="0.2"
                  strokeWidth="1"
                  strokeDasharray="5,5"
                  className="animate-pulse"
                />
              );
            })}
          </svg>
        )}
      </div>
    </motion.div>
  );
}

export const ConceptDiscovery = ({ concepts, isDiscovering, onComplete }: Props) => {
  const [phase, setPhase] = useState<"scanning" | "discovering" | "organizing" | "complete">("scanning");
  const [discoveredConcepts, setDiscoveredConcepts] = useState<ConceptNode[]>([]);
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    if (!isDiscovering) return;
    
    // Simulate discovery phases
    const phases = [
      { name: "scanning", duration: 2000 },
      { name: "discovering", duration: 3000 },
      { name: "organizing", duration: 2000 },
      { name: "complete", duration: 1000 },
    ];
    
    let currentPhaseIndex = 0;
    let conceptIndex = 0;
    
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 2, 100));
    }, 50);
    
    const phaseTimer = setInterval(() => {
      if (currentPhaseIndex < phases.length) {
        setPhase(phases[currentPhaseIndex].name as any);
        
        if (phases[currentPhaseIndex].name === "discovering") {
          // Gradually reveal concepts
          const revealInterval = setInterval(() => {
            if (conceptIndex < concepts.length) {
              setDiscoveredConcepts(prev => [...prev, concepts[conceptIndex]]);
              conceptIndex++;
            } else {
              clearInterval(revealInterval);
            }
          }, 200);
          
          return () => clearInterval(revealInterval);
        }
        
        currentPhaseIndex++;
      } else {
        clearInterval(phaseTimer);
        clearInterval(progressInterval);
        if (onComplete) onComplete();
      }
    }, 2000);
    
    return () => {
      clearInterval(phaseTimer);
      clearInterval(progressInterval);
    };
  }, [isDiscovering, concepts, onComplete]);
  
  return (
    <div className="relative h-[600px] w-full rounded-2xl overflow-hidden bg-gradient-to-br from-[#0a0f1f] via-[#0d1424] to-[#111a34]">
      {/* 3D Background */}
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 0, 10], fov: 75 }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={0.5} color="#6884ff" />
          <ParticleSystem count={500} />
          
          {/* Central processing orb */}
          {phase === "scanning" && (
            <PulsingOrb position={[0, 0, 0]} color="#6884ff" scale={2} />
          )}
          
          {/* Discovered concept orbs */}
          {phase === "discovering" && discoveredConcepts.map((concept, i) => {
            const angle = (i / concepts.length) * Math.PI * 2;
            const radius = 3;
            return (
              <PulsingOrb
                key={concept.id}
                position={[
                  radius * Math.cos(angle),
                  radius * Math.sin(angle),
                  0,
                ]}
                color={concept.color}
                scale={0.5 + (concept.weight / 20)}
              />
            );
          })}
        </Canvas>
      </div>
      
      {/* UI Overlay */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Status header */}
        <div className="p-6">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl" />
              <div className="relative w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
                {phase === "scanning" && <Network className="h-6 w-6 text-primary animate-pulse" />}
                {phase === "discovering" && <Brain className="h-6 w-6 text-primary animate-pulse" />}
                {phase === "organizing" && <Cpu className="h-6 w-6 text-primary animate-pulse" />}
                {phase === "complete" && <Sparkles className="h-6 w-6 text-primary" />}
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {phase === "scanning" && "Scanning Repository..."}
                {phase === "discovering" && "Discovering Concepts..."}
                {phase === "organizing" && "Organizing Knowledge..."}
                {phase === "complete" && "Discovery Complete!"}
              </h3>
              <p className="text-sm text-white/60 mt-0.5">
                {phase === "scanning" && "Analyzing code structure and dependencies"}
                {phase === "discovering" && `Found ${discoveredConcepts.length} concepts`}
                {phase === "organizing" && "Building knowledge graph"}
                {phase === "complete" && `${concepts.length} concepts mapped`}
              </p>
            </div>
          </motion.div>
          
          {/* Progress bar */}
          <div className="mt-4">
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-violet-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        </div>
        
        {/* Concept cards */}
        <div className="flex-1 relative">
          <AnimatePresence>
            {phase === "discovering" && (
              <div className="absolute inset-0">
                {discoveredConcepts.map((concept, index) => (
                  <ConceptCard
                    key={concept.id}
                    concept={concept}
                    index={index}
                    total={concepts.length}
                    delay={index * 0.1}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
          
          {/* Center visualization */}
          {phase === "organizing" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="relative">
                {/* Rotating rings */}
                {[0, 1, 2].map((ring) => (
                  <div
                    key={ring}
                    className="absolute inset-0 border-2 border-primary/20 rounded-full"
                    style={{
                      width: `${150 + ring * 50}px`,
                      height: `${150 + ring * 50}px`,
                      left: `${-25 - ring * 25}px`,
                      top: `${-25 - ring * 25}px`,
                      animation: `spin ${10 + ring * 2}s linear infinite ${ring % 2 ? "reverse" : ""}`,
                    }}
                  />
                ))}
                <Code2 className="h-24 w-24 text-primary animate-pulse" />
              </div>
            </motion.div>
          )}
        </div>
        
        {/* Stats footer */}
        <div className="p-6">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Modules", value: concepts.filter(c => c.category === "architecture").length, icon: Zap },
              { label: "Technologies", value: concepts.filter(c => c.category === "technology").length, icon: Cpu },
              { label: "Patterns", value: concepts.filter(c => c.category === "patterns").length, icon: Network },
              { label: "Connections", value: concepts.reduce((sum, c) => sum + c.relatedConcepts.length, 0), icon: Brain },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="bg-white/[0.04] rounded-lg p-3"
              >
                <div className="flex items-center gap-2">
                  <stat.icon className="h-4 w-4 text-white/40" />
                  <span className="text-xs text-white/40">{stat.label}</span>
                </div>
                <div className="mt-1 text-xl font-bold text-white">
                  {phase === "complete" ? stat.value : "—"}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Add custom CSS for animations */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};