import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Text, Billboard, Sphere, Line, Float } from "@react-three/drei";
import { motion } from "framer-motion";
import * as THREE from "three";
import type { ConceptNode, WordCloudItem } from "@/lib/types";

interface Props {
  concepts: ConceptNode[];
  isAnimating: boolean;
  animationType?: "float" | "orbit" | "pulse" | "network";
  particleCount?: number;
}

// Individual word/concept in 3D space
function WordNode({
  item,
  index,
  totalItems,
  animationType,
  isAnimating,
}: {
  item: ConceptNode;
  index: number;
  totalItems: number;
  animationType: string;
  isAnimating: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const textRef = useRef<any>(null);
  const [hovered, setHovered] = useState(false);
  const [basePosition] = useState(() => {
    // Distribute nodes in a spherical pattern
    const phi = Math.acos(1 - 2 * (index + 0.5) / totalItems);
    const theta = Math.PI * (1 + Math.sqrt(5)) * index;
    const radius = 8 + (item.weight / 10) * 2;
    
    return new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  });

  useFrame((state) => {
    if (!meshRef.current || !isAnimating) return;

    const time = state.clock.getElapsedTime();
    
    if (animationType === "float") {
      // Gentle floating motion
      meshRef.current.position.x = basePosition.x + Math.sin(time * 0.3 + index) * 0.5;
      meshRef.current.position.y = basePosition.y + Math.sin(time * 0.4 + index * 1.5) * 0.3;
      meshRef.current.position.z = basePosition.z + Math.sin(time * 0.35 + index * 2) * 0.4;
    } else if (animationType === "orbit") {
      // Orbital motion
      const orbitRadius = Math.sqrt(basePosition.x ** 2 + basePosition.z ** 2);
      const angle = time * 0.2 + (index / totalItems) * Math.PI * 2;
      meshRef.current.position.x = orbitRadius * Math.cos(angle);
      meshRef.current.position.z = orbitRadius * Math.sin(angle);
      meshRef.current.position.y = basePosition.y + Math.sin(time * 0.5 + index) * 0.3;
    } else if (animationType === "pulse") {
      // Pulsing scale based on weight
      const scale = 1 + Math.sin(time * 2 + index) * 0.1 * (item.weight / 15);
      meshRef.current.scale.setScalar(scale);
    } else if (animationType === "network") {
      // Network-like movement with connections
      const connectionPhase = Math.sin(time * 0.5 + index * 0.5);
      meshRef.current.position.x = basePosition.x + connectionPhase * 0.8;
      meshRef.current.position.y = basePosition.y + Math.sin(time * 0.7 + index) * 0.5;
      meshRef.current.position.z = basePosition.z + Math.cos(time * 0.6 + index * 1.2) * 0.6;
    }

    // Rotation for all animation types
    meshRef.current.rotation.y = time * 0.1;
    
    // Hover effect
    if (hovered && textRef.current) {
      textRef.current.scale.lerp(new THREE.Vector3(1.2, 1.2, 1.2), 0.1);
    } else if (textRef.current) {
      textRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
    }
  });

  const fontSize = 0.3 + (item.weight / 20);
  const opacity = 0.6 + (item.weight / 30);

  return (
    <group ref={meshRef} position={basePosition}>
      <Billboard>
        <Text
          ref={textRef}
          fontSize={fontSize}
          color={item.color || "#6884ff"}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.03}
          outlineColor="#000000"
          outlineOpacity={0.3}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          {item.label}
        </Text>
      </Billboard>
      
      {/* Glowing orb behind text */}
      <Sphere args={[fontSize * 0.8, 16, 16]}>
        <meshBasicMaterial
          color={item.color || "#6884ff"}
          transparent
          opacity={hovered ? opacity * 0.8 : opacity * 0.4}
        />
      </Sphere>
      
      {/* Particle aura */}
      {hovered && (
        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
          <Sphere args={[fontSize * 1.5, 8, 8]}>
            <meshBasicMaterial
              color={item.color || "#6884ff"}
              transparent
              opacity={0.1}
              wireframe
            />
          </Sphere>
        </Float>
      )}
    </group>
  );
}

// Connection lines between related concepts
function ConnectionLines({ concepts }: { concepts: ConceptNode[] }) {
  const lines = useMemo(() => {
    const connections: Array<[THREE.Vector3, THREE.Vector3, string]> = [];
    
    concepts.forEach((concept, i) => {
      // Create positions based on same logic as WordNode
      const phi = Math.acos(1 - 2 * (i + 0.5) / concepts.length);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const radius = 8 + (concept.weight / 10) * 2;
      
      const pos1 = new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
      
      // Connect to related concepts
      concept.relatedConcepts.slice(0, 2).forEach(relatedId => {
        const relatedIndex = concepts.findIndex(c => c.id === relatedId);
        if (relatedIndex !== -1) {
          const relatedConcept = concepts[relatedIndex];
          const phi2 = Math.acos(1 - 2 * (relatedIndex + 0.5) / concepts.length);
          const theta2 = Math.PI * (1 + Math.sqrt(5)) * relatedIndex;
          const radius2 = 8 + (relatedConcept.weight / 10) * 2;
          
          const pos2 = new THREE.Vector3(
            radius2 * Math.sin(phi2) * Math.cos(theta2),
            radius2 * Math.cos(phi2),
            radius2 * Math.sin(phi2) * Math.sin(theta2)
          );
          
          connections.push([pos1, pos2, concept.color || "#6884ff"]);
        }
      });
    });
    
    return connections;
  }, [concepts]);

  return (
    <>
      {lines.map((line, i) => (
        <Line
          key={i}
          points={[line[0], line[1]]}
          color={line[2]}
          lineWidth={0.5}
          transparent
          opacity={0.2}
          dashed
          dashScale={2}
        />
      ))}
    </>
  );
}

// Floating particles for atmosphere
function ParticleField({ count = 100 }: { count: number }) {
  const particlesRef = useRef<THREE.Points>(null);
  
  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 30;
      positions[i3 + 1] = (Math.random() - 0.5) * 20;
      positions[i3 + 2] = (Math.random() - 0.5) * 30;
      
      // Varying colors for particles
      const color = new THREE.Color().setHSL(
        0.6 + Math.random() * 0.2,
        0.7,
        0.6
      );
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }
    
    return { positions, colors };
  }, [count]);

  useFrame((state) => {
    if (!particlesRef.current) return;
    
    const time = state.clock.getElapsedTime();
    particlesRef.current.rotation.y = time * 0.02;
    particlesRef.current.rotation.x = Math.sin(time * 0.05) * 0.1;
    
    // Animate individual particles
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3 + 1] += Math.sin(time + i) * 0.001;
    }
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particles.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={particles.colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        transparent
        opacity={0.6}
        vertexColors
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// Camera controller for auto-rotation
function CameraController({ isAnimating }: { isAnimating: boolean }) {
  const { camera } = useThree();
  
  useFrame((state) => {
    if (!isAnimating) return;
    
    const time = state.clock.getElapsedTime();
    camera.position.x = Math.cos(time * 0.1) * 20;
    camera.position.z = Math.sin(time * 0.1) * 20;
    camera.position.y = 5 + Math.sin(time * 0.15) * 3;
    camera.lookAt(0, 0, 0);
  });
  
  return null;
}

export const MagicalWordCloud = ({
  concepts,
  isAnimating,
  animationType = "float",
  particleCount = 150,
}: Props) => {
  const [showConnections, setShowConnections] = useState(false);

  useEffect(() => {
    // Show connections after initial animation
    const timer = setTimeout(() => setShowConnections(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.5 }}
      className="relative h-[600px] w-full rounded-2xl overflow-hidden bg-gradient-to-b from-[#0a0f1f] via-[#0d1424] to-[#111a34]"
    >
      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1f]/80 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
      </div>
      
      {/* 3D Scene */}
      <Canvas
        camera={{ position: [15, 8, 15], fov: 60 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={0.8} color="#6884ff" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#4ade80" />
        
        {/* Auto-rotating camera */}
        <CameraController isAnimating={isAnimating} />
        
        {/* Particle atmosphere */}
        <ParticleField count={particleCount} />
        
        {/* Connection lines */}
        {showConnections && <ConnectionLines concepts={concepts} />}
        
        {/* Word nodes */}
        {concepts.map((concept, i) => (
          <WordNode
            key={concept.id}
            item={concept}
            index={i}
            totalItems={concepts.length}
            animationType={animationType}
            isAnimating={isAnimating}
          />
        ))}
      </Canvas>
      
      {/* UI Overlay */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
        <div className="text-xs text-white/40 font-mono">
          {concepts.length} concepts discovered
        </div>
        <div className="flex gap-2">
          {["float", "orbit", "pulse", "network"].map((type) => (
            <button
              key={type}
              type="button"
              className={`px-3 py-1 text-xs rounded-full transition ${
                animationType === type
                  ? "bg-primary/20 text-primary"
                  : "bg-white/5 text-white/40 hover:bg-white/10"
              }`}
              onClick={() => {
                // Would need to add prop callback to change animation type
              }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
};