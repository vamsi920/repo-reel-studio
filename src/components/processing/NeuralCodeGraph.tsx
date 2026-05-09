import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, Text, Billboard, Sphere, Box } from "@react-three/drei";
import { motion } from "framer-motion";
import * as THREE from "three";
import type { NeuralGraphNode, NeuralGraphEdge, RepoIntelligence } from "@/lib/types";

interface Props {
  intelligence: RepoIntelligence;
  isAnimating?: boolean;
  selectedNodeId?: string;
  onNodeSelect?: (node: NeuralGraphNode) => void;
}

// Animated node component
function GraphNode({
  node,
  isSelected,
  isHovered,
  onHover,
  onClick,
}: {
  node: NeuralGraphNode;
  isSelected: boolean;
  isHovered: boolean;
  onHover: (hover: boolean) => void;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [pulsePhase, setPulsePhase] = useState(0);
  
  useFrame((state) => {
    if (!meshRef.current) return;
    
    const time = state.clock.getElapsedTime();
    
    // Pulse effect based on node importance
    const pulseSpeed = node.pulseFrequency || 1;
    const pulseAmount = 0.1 + (node.connections / 20) * 0.1;
    const scale = 1 + Math.sin(time * pulseSpeed) * pulseAmount;
    
    if (isSelected) {
      meshRef.current.scale.setScalar(scale * 1.3);
    } else if (isHovered) {
      meshRef.current.scale.setScalar(scale * 1.1);
    } else {
      meshRef.current.scale.setScalar(scale);
    }
    
    // Rotate based on type
    if (node.type === "module") {
      meshRef.current.rotation.y = time * 0.2;
    } else if (node.type === "class") {
      meshRef.current.rotation.x = time * 0.15;
      meshRef.current.rotation.z = time * 0.1;
    }
    
    // Glow effect
    if (glowRef.current) {
      const glowScale = scale * (1.5 + Math.sin(time * 2) * 0.2);
      glowRef.current.scale.setScalar(glowScale);
      glowRef.current.material.opacity = (node.glowIntensity || 0.3) * (isHovered ? 1.5 : 1);
    }
    
    setPulsePhase(Math.sin(time * pulseSpeed));
  });
  
  // Node shape based on type
  const NodeGeometry = () => {
    const size = Math.max(0.3, Math.min(1, node.size / 1000));
    
    switch (node.type) {
      case "file":
        return <Box args={[size, size * 1.2, size * 0.3]} />;
      case "module":
        return <Sphere args={[size, 16, 16]} />;
      case "function":
        return <Box args={[size * 0.8, size * 0.8, size * 0.8]} />;
      case "class":
      default:
        return <Sphere args={[size, 8, 8]} />;
    }
  };
  
  return (
    <group position={node.position}>
      {/* Glow effect */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color={node.color}
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      
      {/* Main node */}
      <mesh
        ref={meshRef}
        onPointerOver={() => onHover(true)}
        onPointerOut={() => onHover(false)}
        onClick={onClick}
      >
        <NodeGeometry />
        <meshPhongMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={isHovered ? 0.5 : 0.2}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
      
      {/* Label */}
      <Billboard>
        <Text
          fontSize={0.15}
          color="white"
          anchorX="center"
          anchorY="bottom"
          position={[0, 1, 0]}
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {node.label}
        </Text>
      </Billboard>
      
      {/* Connection indicator */}
      {node.connections > 5 && (
        <mesh position={[0, -0.8, 0]}>
          <ringGeometry args={[0.3, 0.35, 16]} />
          <meshBasicMaterial
            color={pulsePhase > 0 ? "#4ade80" : "#fbbf24"}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}
    </group>
  );
}

// Animated edge/connection
function GraphEdge({
  edge,
  sourcePos,
  targetPos,
  isHighlighted,
}: {
  edge: NeuralGraphEdge;
  sourcePos: THREE.Vector3;
  targetPos: THREE.Vector3;
  isHighlighted: boolean;
}) {
  const lineRef = useRef<any>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const [particles, setParticles] = useState<Float32Array | null>(null);
  
  useEffect(() => {
    if (!edge.animated) return;
    
    // Create particles along the edge
    const particleCount = 10;
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      const t = i / particleCount;
      positions[i * 3] = sourcePos.x + (targetPos.x - sourcePos.x) * t;
      positions[i * 3 + 1] = sourcePos.y + (targetPos.y - sourcePos.y) * t;
      positions[i * 3 + 2] = sourcePos.z + (targetPos.z - sourcePos.z) * t;
    }
    
    setParticles(positions);
  }, [edge.animated, sourcePos, targetPos]);
  
  useFrame((state) => {
    if (!edge.animated || !particlesRef.current || !particles) return;
    
    const time = state.clock.getElapsedTime();
    const speed = edge.particleSpeed || 1;
    
    // Animate particles along the edge
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length / 3; i++) {
      const t = ((time * speed + i * 0.1) % 1);
      positions[i * 3] = sourcePos.x + (targetPos.x - sourcePos.x) * t;
      positions[i * 3 + 1] = sourcePos.y + (targetPos.y - sourcePos.y) * t;
      positions[i * 3 + 2] = sourcePos.z + (targetPos.z - sourcePos.z) * t;
    }
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });
  
  const edgeColor = edge.color || (
    edge.type === "import" ? "#6884ff" :
    edge.type === "call" ? "#4ade80" :
    edge.type === "inherit" ? "#fbbf24" :
    "#f87171"
  );
  
  const opacity = isHighlighted ? 0.8 : 0.3 + edge.strength * 0.3;
  
  return (
    <>
      {/* Main connection line */}
      <Line
        ref={lineRef}
        points={[sourcePos, targetPos]}
        color={edgeColor}
        lineWidth={isHighlighted ? 2 : 1}
        transparent
        opacity={opacity}
        dashed={edge.type === "implement"}
        dashScale={edge.type === "implement" ? 5 : 1}
      />
      
      {/* Animated particles */}
      {edge.animated && particles && (
        <points ref={particlesRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={particles.length / 3}
              array={particles}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            size={0.05}
            color={edgeColor}
            transparent
            opacity={0.8}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}
    </>
  );
}

// Camera auto-rotation
function CameraController({ isAnimating }: { isAnimating: boolean }) {
  const { camera } = useThree();
  
  useFrame((state) => {
    if (!isAnimating) return;
    
    const time = state.clock.getElapsedTime();
    const radius = 15;
    const height = 8;
    
    camera.position.x = Math.cos(time * 0.1) * radius;
    camera.position.z = Math.sin(time * 0.1) * radius;
    camera.position.y = height + Math.sin(time * 0.2) * 2;
    camera.lookAt(0, 0, 0);
  });
  
  return null;
}

export const NeuralCodeGraph = ({
  intelligence,
  isAnimating = true,
  selectedNodeId,
  onNodeSelect,
}: Props) => {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<NeuralGraphNode[]>([]);
  const [edges, setEdges] = useState<NeuralGraphEdge[]>([]);
  
  // Generate graph data from intelligence
  useEffect(() => {
    const graphNodes: NeuralGraphNode[] = [];
    const graphEdges: NeuralGraphEdge[] = [];
    
    // Create nodes from modules
    intelligence.modules.forEach((module, i) => {
      const angle = (i / intelligence.modules.length) * Math.PI * 2;
      const radius = 5 + (module.is_hub ? 0 : 3);
      
      graphNodes.push({
        id: module.id,
        label: module.label,
        type: module.is_entry ? "file" : module.is_hub ? "module" : "class",
        size: module.file_paths.length * 100,
        connections: module.is_hub ? 10 : 5,
        position: {
          x: Math.cos(angle) * radius,
          y: module.is_entry ? 2 : 0,
          z: Math.sin(angle) * radius,
        },
        color: module.is_hub ? "#fbbf24" : module.is_entry ? "#6884ff" : "#4ade80",
        pulseFrequency: module.is_hub ? 2 : 1,
        glowIntensity: module.is_hub ? 0.5 : 0.3,
      });
    });
    
    // Create edges between related modules
    intelligence.modules.forEach((module, i) => {
      // Connect hub modules to others
      if (module.is_hub) {
        intelligence.modules.forEach((other, j) => {
          if (i !== j && !other.is_hub) {
            graphEdges.push({
              source: module.id,
              target: other.id,
              strength: 0.5,
              type: "call",
              animated: true,
              particleSpeed: 0.5,
            });
          }
        });
      }
      
      // Connect entry points
      if (module.is_entry && i < intelligence.modules.length - 1) {
        const nextModule = intelligence.modules[i + 1];
        graphEdges.push({
          source: module.id,
          target: nextModule.id,
          strength: 0.8,
          type: "import",
          animated: true,
          particleSpeed: 1,
          color: "#6884ff",
        });
      }
    });
    
    setNodes(graphNodes);
    setEdges(graphEdges);
  }, [intelligence]);
  
  // Get node positions for edges
  const nodePositions = useMemo(() => {
    const positions: Record<string, THREE.Vector3> = {};
    nodes.forEach(node => {
      positions[node.id] = new THREE.Vector3(
        node.position.x,
        node.position.y,
        node.position.z
      );
    });
    return positions;
  }, [nodes]);
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="relative h-[600px] w-full rounded-2xl overflow-hidden bg-gradient-to-br from-[#050a15] via-[#0a1120] to-[#0d1424]"
    >
      {/* Header */}
      <div className="absolute top-4 left-4 z-10">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          Neural Code Graph
          <span className="text-xs text-white/40 font-normal">
            {nodes.length} nodes • {edges.length} connections
          </span>
        </h3>
        <p className="text-sm text-white/60 mt-1">
          Visualizing code dependencies and relationships
        </p>
      </div>
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-4">
        {[
          { type: "module", color: "#fbbf24", label: "Hub Module" },
          { type: "file", color: "#6884ff", label: "Entry Point" },
          { type: "class", color: "#4ade80", label: "Component" },
        ].map(item => (
          <div key={item.type} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-white/60">{item.label}</span>
          </div>
        ))}
      </div>
      
      {/* 3D Scene */}
      <Canvas
        camera={{ position: [10, 5, 10], fov: 60 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={0.8} color="#6884ff" />
        <pointLight position={[-10, 5, -10]} intensity={0.6} color="#4ade80" />
        <pointLight position={[0, -5, 0]} intensity={0.4} color="#fbbf24" />
        
        {/* Camera controller */}
        <CameraController isAnimating={isAnimating} />
        
        {/* Grid helper */}
        <gridHelper args={[20, 20, "#ffffff", "#ffffff"]} opacity={0.1} />
        
        {/* Edges */}
        {edges.map((edge, i) => {
          const sourcePos = nodePositions[edge.source];
          const targetPos = nodePositions[edge.target];
          
          if (!sourcePos || !targetPos) return null;
          
          return (
            <GraphEdge
              key={`${edge.source}-${edge.target}-${i}`}
              edge={edge}
              sourcePos={sourcePos}
              targetPos={targetPos}
              isHighlighted={
                hoveredNodeId === edge.source || 
                hoveredNodeId === edge.target ||
                selectedNodeId === edge.source ||
                selectedNodeId === edge.target
              }
            />
          );
        })}
        
        {/* Nodes */}
        {nodes.map(node => (
          <GraphNode
            key={node.id}
            node={node}
            isSelected={selectedNodeId === node.id}
            isHovered={hoveredNodeId === node.id}
            onHover={(hover) => setHoveredNodeId(hover ? node.id : null)}
            onClick={() => onNodeSelect?.(node)}
          />
        ))}
      </Canvas>
    </motion.div>
  );
};