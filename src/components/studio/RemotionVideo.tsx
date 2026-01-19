import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame, Easing, spring, useVideoConfig } from "remotion";
import { IdeWindow } from "@/components/studio/IdeWindow";
import type { HydratedManifest } from "@/hooks/useHydrateManifest";

/**
 * Audio component with fade in/out effects
 */
const AudioWithFade = ({
  src,
  fadeInFrames,
  fadeOutFrames,
  totalFrames,
}: {
  src: string;
  fadeInFrames: number;
  fadeOutFrames: number;
  totalFrames: number;
}) => {
  const frame = useCurrentFrame();
  
  // Calculate volume with fade in and fade out
  const volume = interpolate(
    frame,
    [
      0,                    // Start: volume 0
      fadeInFrames,         // After fade in: volume 1
      totalFrames - fadeOutFrames, // Before fade out: volume 1
      totalFrames,          // End: volume 0
    ],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.ease,
    }
  );

  return (
    <Audio
      src={src}
      volume={volume}
      startFrom={0}
      endAt={totalFrames}
      loop={false}
    />
  );
};

const getActiveSceneIndex = (frame: number, scenes: HydratedManifest["scenes"]) => {
  const index = scenes.findIndex(
    (scene) => frame >= scene.startFrame && frame < scene.endFrame
  );
  return index === -1 ? 0 : index;
};

// Easing functions for smooth animations
const smoothEase = (t: number) => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

// Get zoom config based on scene type
const getSceneZoomConfig = (sceneType: string) => {
  switch (sceneType) {
    case "intro":
      return { startZoom: 0.95, endZoom: 1.05, panX: 0, panY: -20 };
    case "overview":
      return { startZoom: 1.0, endZoom: 1.08, panX: 10, panY: 0 };
    case "entry":
      return { startZoom: 1.02, endZoom: 1.1, panX: -5, panY: 10 };
    case "code_walkthrough":
    case "function_deep_dive":
      return { startZoom: 1.0, endZoom: 1.15, panX: 0, panY: 15 };
    case "architecture":
      return { startZoom: 1.1, endZoom: 1.0, panX: -10, panY: -10 };
    case "conclusion":
      return { startZoom: 1.05, endZoom: 0.98, panX: 0, panY: -15 };
    default:
      return { startZoom: 1.0, endZoom: 1.08, panX: 5, panY: 5 };
  }
};

// Animated particle component
const AnimatedParticle = ({ 
  index, 
  frame, 
  totalFrames,
  type = "dot"
}: { 
  index: number; 
  frame: number; 
  totalFrames: number;
  type?: "dot" | "code" | "star";
}) => {
  const seed = index * 137.5;
  const startX = ((seed * 7) % 100);
  const startY = ((seed * 13) % 100);
  const speed = 0.3 + ((seed * 3) % 0.7);
  const size = 2 + (seed % 4);
  const delay = (seed * 5) % 200;
  
  const x = interpolate(
    (frame + delay) * speed,
    [0, totalFrames],
    [startX, startX + ((seed % 2 === 0 ? 1 : -1) * 30)],
    { extrapolateRight: "clamp" }
  );
  
  const y = interpolate(
    (frame + delay) * speed,
    [0, totalFrames],
    [startY, startY - 40],
    { extrapolateRight: "clamp" }
  );

  const opacity = interpolate(
    frame,
    [0, 30, totalFrames - 30, totalFrames],
    [0, 0.6, 0.6, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const pulse = Math.sin(frame * 0.05 + seed) * 0.3 + 0.7;

  if (type === "code") {
    const symbols = ["</>", "{}", "()", "[]", "//", "=>", "fn", "let", "var", "if"];
    return (
      <div
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          opacity: opacity * 0.15,
          fontSize: 10 + (seed % 4),
          fontFamily: "'JetBrains Mono', monospace",
          color: '#8b5cf6',
          transform: `rotate(${(seed % 30) - 15}deg)`,
          textShadow: '0 0 10px rgba(139, 92, 246, 0.5)',
        }}
      >
        {symbols[Math.floor(seed % symbols.length)]}
      </div>
    );
  }

  if (type === "star") {
    return (
      <div
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          width: size * pulse,
          height: size * pulse,
          background: 'white',
          borderRadius: '50%',
          opacity: opacity * pulse * 0.3,
          boxShadow: `0 0 ${size * 2}px rgba(255, 255, 255, 0.5)`,
        }}
      />
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#8b5cf6',
        opacity: opacity * pulse * 0.4,
        boxShadow: `0 0 ${size * 3}px rgba(139, 92, 246, 0.6)`,
      }}
    />
  );
};

// Animated glow ring
const GlowRing = ({ frame, delay = 0 }: { frame: number; delay?: number }) => {
  const { width, height } = useVideoConfig();
  const adjustedFrame = Math.max(0, frame - delay);
  
  const scale = interpolate(
    adjustedFrame,
    [0, 60, 120],
    [0.8, 1.2, 0.8],
    { extrapolateRight: "extend" }
  );
  
  const opacity = interpolate(
    adjustedFrame,
    [0, 30, 90, 120],
    [0, 0.3, 0.3, 0],
    { extrapolateRight: "extend" }
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: width * 0.8,
        height: height * 0.6,
        transform: `translate(-50%, -50%) scale(${scale})`,
        border: '2px solid rgba(139, 92, 246, 0.3)',
        borderRadius: '50%',
        opacity: opacity % 1,
        boxShadow: `
          0 0 60px rgba(139, 92, 246, 0.2),
          inset 0 0 60px rgba(139, 92, 246, 0.1)
        `,
        pointerEvents: 'none',
      }}
    />
  );
};

// Scene transition overlay
const SceneTransition = ({ 
  frame, 
  sceneStartFrame, 
  sceneDuration,
  transitionType = "zoom"
}: { 
  frame: number; 
  sceneStartFrame: number;
  sceneDuration: number;
  transitionType?: "zoom" | "fade" | "glitch" | "wipe";
}) => {
  const relativeFrame = frame - sceneStartFrame;
  const transitionInDuration = 20;
  const transitionOutDuration = 15;
  
  // Entry transition
  if (relativeFrame < transitionInDuration) {
    const progress = relativeFrame / transitionInDuration;
    
    if (transitionType === "zoom") {
      const blur = interpolate(progress, [0, 1], [10, 0]);
      const scale = interpolate(progress, [0, 1], [1.1, 1], {
        easing: Easing.out(Easing.cubic),
      });
      
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backdropFilter: `blur(${blur}px)`,
            transform: `scale(${scale})`,
            pointerEvents: 'none',
            zIndex: 100,
          }}
        />
      );
    }
    
    if (transitionType === "glitch") {
      const glitchIntensity = interpolate(progress, [0, 0.5, 1], [1, 0.5, 0]);
      const offsetX = Math.sin(relativeFrame * 2) * 10 * glitchIntensity;
      const offsetY = Math.cos(relativeFrame * 3) * 5 * glitchIntensity;
      
      return (
        <>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `rgba(139, 92, 246, ${0.1 * glitchIntensity})`,
              transform: `translate(${offsetX}px, ${offsetY}px)`,
              mixBlendMode: 'screen',
              pointerEvents: 'none',
              zIndex: 100,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `rgba(236, 72, 153, ${0.05 * glitchIntensity})`,
              transform: `translate(${-offsetX}px, ${-offsetY}px)`,
              mixBlendMode: 'screen',
              pointerEvents: 'none',
              zIndex: 100,
            }}
          />
        </>
      );
    }
  }
  
  // Exit transition (fade out)
  if (relativeFrame > sceneDuration - transitionOutDuration) {
    const exitProgress = (relativeFrame - (sceneDuration - transitionOutDuration)) / transitionOutDuration;
    const opacity = interpolate(exitProgress, [0, 1], [0, 0.3]);
    
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `rgba(10, 10, 15, ${opacity})`,
          pointerEvents: 'none',
          zIndex: 100,
        }}
      />
    );
  }
  
  return null;
};

// Vignette overlay
const Vignette = ({ intensity = 0.4 }: { intensity?: number }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: `radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, ${intensity}) 100%)`,
      pointerEvents: 'none',
      zIndex: 50,
    }}
  />
);

// Animated grid background
const AnimatedGrid = ({ frame }: { frame: number }) => {
  const offset = frame * 0.2;
  
  return (
    <div
      style={{
        position: 'absolute',
        inset: -100,
        backgroundImage: `
          linear-gradient(rgba(139, 92, 246, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(139, 92, 246, 0.03) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        backgroundPosition: `${offset}px ${offset}px`,
        opacity: 0.5,
        transform: 'perspective(500px) rotateX(60deg)',
        transformOrigin: 'center bottom',
      }}
    />
  );
};

export const RemotionVideo = ({ manifest }: { manifest: HydratedManifest }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Handle empty scenes case
  if (!manifest?.scenes?.length) {
    return (
      <AbsoluteFill 
        style={{ 
          backgroundColor: '#0f0f12',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          color: '#888'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>Loading video...</div>
          <div style={{ fontSize: 14 }}>Waiting for scenes data</div>
        </div>
      </AbsoluteFill>
    );
  }

  const scenes = manifest.scenes;
  const sceneIndex = getActiveSceneIndex(frame, scenes);
  const activeScene = scenes[sceneIndex] ?? scenes[0];
  const previousScene = sceneIndex > 0 ? scenes[sceneIndex - 1] : undefined;
  const relativeFrame = frame - (activeScene?.startFrame ?? 0);
  const isFirstScene = sceneIndex === 0;
  const isLastScene = sceneIndex === scenes.length - 1;

  const safeDuration = Math.max(1, activeScene?.durationInFrames ?? 1);
  const fadeFrames = Math.min(20, Math.max(1, Math.floor(safeDuration * 0.15)));
  const fadeInEnd = Math.min(fadeFrames, safeDuration);
  const fadeOutStart = Math.max(safeDuration - fadeFrames, fadeInEnd);
  
  // Get zoom config for scene type
  const zoomConfig = getSceneZoomConfig(activeScene?.type || "code");
  
  // Ken Burns effect - slow zoom with pan
  const kenBurnsZoom = interpolate(
    relativeFrame,
    [0, safeDuration],
    [zoomConfig.startZoom, zoomConfig.endZoom],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: smoothEase }
  );
  
  const kenBurnsPanX = interpolate(
    relativeFrame,
    [0, safeDuration],
    [0, zoomConfig.panX],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: smoothEase }
  );
  
  const kenBurnsPanY = interpolate(
    relativeFrame,
    [0, safeDuration],
    [0, zoomConfig.panY],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: smoothEase }
  );

  // Subtle camera shake for energy
  const shakeIntensity = 0.5;
  const shakeX = Math.sin(frame * 0.1) * shakeIntensity + Math.sin(frame * 0.23) * shakeIntensity * 0.5;
  const shakeY = Math.cos(frame * 0.13) * shakeIntensity + Math.cos(frame * 0.19) * shakeIntensity * 0.5;
  
  // Subtitle animations
  const subtitleOpacity = interpolate(
    relativeFrame,
    [0, fadeInEnd, fadeOutStart, safeDuration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const subtitleY = interpolate(
    relativeFrame,
    [0, fadeInEnd, fadeOutStart, safeDuration],
    [30, 0, 0, -20],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  // Content entrance animation
  const contentOpacity = interpolate(
    relativeFrame,
    [0, 15],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const contentScale = interpolate(
    relativeFrame,
    [0, 20],
    [0.92, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.2)) }
  );

  // Badge animation
  const badgeScale = spring({
    frame: relativeFrame,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.5 },
  });

  const badgeY = interpolate(
    relativeFrame,
    [0, 15],
    [-30, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.5)) }
  );

  // Dynamic gradient rotation
  const gradientAngle = 135 + Math.sin(frame / 150) * 15;
  
  // Glow pulse intensity
  const glowPulse = 0.8 + Math.sin(frame * 0.03) * 0.2;

  // Scene number for display
  const sceneNumber = sceneIndex + 1;
  const totalScenes = scenes.length;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${gradientAngle}deg, 
          #0a0a0f 0%, 
          #1a0f2e 25%, 
          #0f1419 50%, 
          #1a0f2e 75%, 
          #0a0a0f 100%)`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Animated grid background */}
      <AnimatedGrid frame={frame} />

      {/* Animated particles - code symbols */}
      {Array.from({ length: 15 }).map((_, i) => (
        <AnimatedParticle 
          key={`code-${i}`} 
          index={i} 
          frame={frame} 
          totalFrames={manifest.totalFrames}
          type="code"
        />
      ))}
      
      {/* Animated particles - dots */}
      {Array.from({ length: 25 }).map((_, i) => (
        <AnimatedParticle 
          key={`dot-${i}`} 
          index={i + 50} 
          frame={frame} 
          totalFrames={manifest.totalFrames}
          type="dot"
        />
      ))}
      
      {/* Animated particles - stars */}
      {Array.from({ length: 10 }).map((_, i) => (
        <AnimatedParticle 
          key={`star-${i}`} 
          index={i + 100} 
          frame={frame} 
          totalFrames={manifest.totalFrames}
          type="star"
        />
      ))}

      {/* Glow rings */}
      <GlowRing frame={frame} delay={0} />
      <GlowRing frame={frame} delay={60} />
      <GlowRing frame={frame} delay={120} />

      {/* Moving radial gradient */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at ${50 + Math.sin(frame / 200) * 20}% ${50 + Math.cos(frame / 200) * 20}%, 
            rgba(139, 92, 246, ${0.15 * glowPulse}) 0%, 
            transparent 60%)`,
          opacity: contentOpacity,
        }}
      />

      {/* Secondary accent gradient */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at ${50 - Math.sin(frame / 300) * 30}% ${70 + Math.cos(frame / 300) * 10}%, 
            rgba(236, 72, 153, 0.08) 0%, 
            transparent 50%)`,
          opacity: contentOpacity * 0.7,
        }}
      />

      {/* Scene transition effect */}
      <SceneTransition 
        frame={frame}
        sceneStartFrame={activeScene?.startFrame ?? 0}
        sceneDuration={safeDuration}
        transitionType={isFirstScene ? "zoom" : (sceneIndex % 3 === 0 ? "glitch" : "zoom")}
      />

      {/* Scene Badge with scene number */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: '50%',
          transform: `translateX(-50%) translateY(${badgeY}px) scale(${badgeScale})`,
          zIndex: 30,
          opacity: subtitleOpacity,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {/* Scene counter */}
        <div
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            background: 'rgba(0, 0, 0, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.7)',
            fontFamily: 'system-ui, sans-serif',
          }}>
            {sceneNumber} / {totalScenes}
          </span>
        </div>

        {/* Scene title badge */}
        <div
          style={{
            padding: '8px 20px',
            borderRadius: 9999,
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.35) 0%, rgba(168, 85, 247, 0.25) 100%)',
            border: '1px solid rgba(139, 92, 246, 0.5)',
            backdropFilter: 'blur(16px)',
            boxShadow: `
              0 8px 32px rgba(139, 92, 246, ${0.25 * glowPulse}), 
              0 0 0 1px rgba(255, 255, 255, 0.08) inset,
              0 0 60px rgba(139, 92, 246, ${0.15 * glowPulse})
            `,
          }}
        >
          <span style={{ 
            fontSize: 12, 
            fontWeight: 700, 
            color: '#e9d5ff', 
            fontFamily: 'system-ui, -apple-system, sans-serif',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}>
            {activeScene?.title || `Scene ${activeScene?.id}`}
          </span>
        </div>
      </div>

      {/* Main content with Ken Burns effect */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 48px 160px 48px',
          opacity: contentOpacity,
          transform: `
            scale(${contentScale * kenBurnsZoom}) 
            translate(${kenBurnsPanX + shakeX}px, ${kenBurnsPanY + shakeY}px)
          `,
          transformOrigin: 'center center',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 1200,
            position: 'relative',
          }}
        >
          {/* Animated glow effect behind IDE */}
          <div
            style={{
              position: 'absolute',
              inset: -40,
              background: `radial-gradient(ellipse at center, rgba(139, 92, 246, ${0.25 * glowPulse}) 0%, transparent 70%)`,
              borderRadius: 32,
              filter: 'blur(60px)',
              opacity: contentOpacity,
              zIndex: 0,
              animation: 'pulse 3s ease-in-out infinite',
            }}
          />
          
          {/* Secondary glow */}
          <div
            style={{
              position: 'absolute',
              inset: -20,
              background: `radial-gradient(ellipse at 30% 30%, rgba(236, 72, 153, 0.1) 0%, transparent 50%)`,
              borderRadius: 24,
              filter: 'blur(40px)',
              opacity: contentOpacity * 0.5,
              zIndex: 0,
            }}
          />
          
          <div style={{ position: 'relative', zIndex: 1 }}>
            <IdeWindow
              scenes={scenes}
              activeScene={activeScene}
              previousScene={previousScene}
              relativeFrame={relativeFrame}
              allFiles={manifest.repo_files}
            />
          </div>
        </div>
      </div>

      {/* Narration Subtitle */}
      <div
        style={{
          position: 'absolute',
          bottom: 96,
          left: 0,
          right: 0,
          zIndex: 25,
          padding: '0 32px 12px',
        }}
      >
        <div 
          style={{ 
            maxWidth: 1000, 
            margin: '0 auto',
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleY}px)`,
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.92) 0%, rgba(20, 20, 30, 0.95) 100%)',
              backdropFilter: 'blur(24px)',
              borderRadius: 16,
              padding: '16px 28px',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              boxShadow: `
                0 24px 80px rgba(0, 0, 0, 0.6), 
                0 0 0 1px rgba(255, 255, 255, 0.06) inset,
                0 0 40px rgba(139, 92, 246, 0.1)
              `,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Animated gradient accent line */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                backgroundImage: `linear-gradient(90deg, 
                  transparent 0%, 
                  rgba(139, 92, 246, ${0.6 + glowPulse * 0.2}) ${50 + Math.sin(frame / 30) * 20}%, 
                  rgba(236, 72, 153, 0.4) ${70 + Math.cos(frame / 25) * 15}%,
                  transparent 100%)`,
                backgroundSize: '200% 100%',
              }}
            />
            
            {/* Scene type indicator */}
            <div
              style={{
                position: 'absolute',
                top: 12,
                right: 16,
                padding: '4px 10px',
                borderRadius: 6,
                background: 'rgba(139, 92, 246, 0.2)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
              }}
            >
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#c4b5fd',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                {activeScene?.type?.replace('_', ' ') || 'Scene'}
              </span>
            </div>
            
            <p
              style={{
                color: '#f8fafc',
                fontSize: 18,
                lineHeight: 1.6,
                textAlign: 'center',
                margin: 0,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                fontWeight: 400,
                letterSpacing: '-0.01em',
                textShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
              }}
            >
              {activeScene?.narration_text || ""}
            </p>
          </div>
        </div>
      </div>

      {/* Vignette overlay */}
      <Vignette intensity={0.35} />

      {/* Top gradient fade */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 150,
          background: 'linear-gradient(to bottom, rgba(10, 10, 15, 0.5), transparent)',
          pointerEvents: 'none',
        }}
      />

      {/* Audio sequences with fade in/out effects */}
      {scenes.map((scene) => {
        if (!scene.audioUrl || scene.audioUrl.includes('mock')) {
          return null;
        }

        const audioDuration = scene.durationInFrames;
        const fadeFrames = Math.min(9, Math.max(3, Math.floor(audioDuration * 0.1))); // 0.1s fade at 30fps = 3 frames, max 9 frames
        
        return (
          <Sequence
            key={`audio-${scene.id}-${scene.startFrame}-${scene.audioUrl}`}
            from={scene.startFrame}
            durationInFrames={audioDuration}
          >
            <AudioWithFade
              src={scene.audioUrl}
              fadeInFrames={fadeFrames}
              fadeOutFrames={fadeFrames}
              totalFrames={audioDuration}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
