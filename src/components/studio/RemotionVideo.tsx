import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame } from "remotion";
import { IdeWindow } from "@/components/studio/IdeWindow";
import type { HydratedManifest } from "@/hooks/useHydrateManifest";

const getActiveSceneIndex = (frame: number, scenes: HydratedManifest["scenes"]) => {
  const index = scenes.findIndex(
    (scene) => frame >= scene.startFrame && frame < scene.endFrame
  );
  return index === -1 ? 0 : index;
};

export const RemotionVideo = ({ manifest }: { manifest: HydratedManifest }) => {
  const frame = useCurrentFrame();
  
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

  const safeDuration = Math.max(1, activeScene?.durationInFrames ?? 1);
  const fadeFrames = Math.min(15, Math.max(1, Math.floor(safeDuration * 0.15)));
  const fadeInEnd = Math.min(fadeFrames, safeDuration);
  const fadeOutStart = Math.max(safeDuration - fadeFrames, fadeInEnd);
  
  const subtitleOpacity = interpolate(
    relativeFrame,
    [0, fadeInEnd, fadeOutStart, safeDuration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const contentOpacity = interpolate(
    relativeFrame,
    [0, 12],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const scale = interpolate(
    relativeFrame,
    [0, 12],
    [0.95, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const badgeScale = interpolate(
    relativeFrame,
    [0, 8],
    [0.8, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const badgeY = interpolate(
    relativeFrame,
    [0, 8],
    [-20, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Animated gradient background
  const gradientRotation = interpolate(
    frame,
    [0, 600],
    [0, 360],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${135 + Math.sin(frame / 100) * 10}deg, 
          #0a0a0f 0%, 
          #1a0f2e 25%, 
          #0f1419 50%, 
          #1a0f2e 75%, 
          #0a0a0f 100%)`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Animated background particles */}
      {Array.from({ length: 20 }).map((_, i) => {
        const particleX = interpolate(
          frame + i * 30,
          [0, 600],
          [0, 1920],
          { extrapolateRight: "repeat" }
        );
        const particleY = interpolate(
          frame + i * 45,
          [0, 600],
          [0, 1080],
          { extrapolateRight: "repeat" }
        );
        const particleOpacity = interpolate(
          relativeFrame,
          [0, 5, safeDuration - 5, safeDuration],
          [0, 0.1, 0.1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${(particleX % 1920)}px`,
              top: `${(particleY % 1080)}px`,
              width: 2,
              height: 2,
              borderRadius: '50%',
              backgroundColor: '#8b5cf6',
              opacity: particleOpacity * 0.3,
              boxShadow: '0 0 8px rgba(139, 92, 246, 0.5)',
            }}
          />
        );
      })}

      {/* Radial gradient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at ${50 + Math.sin(frame / 200) * 20}% ${50 + Math.cos(frame / 200) * 20}%, 
            rgba(139, 92, 246, 0.15) 0%, 
            transparent 70%)`,
          opacity: contentOpacity,
        }}
      />

      {/* Scene Title Badge */}
      <div
        style={{
          position: 'absolute',
          top: 32,
          left: '50%',
          transform: `translateX(-50%) translateY(${badgeY}px) scale(${badgeScale})`,
          zIndex: 30,
          opacity: subtitleOpacity,
          transition: 'all 0.3s ease',
        }}
      >
        <div
          style={{
            padding: '10px 24px',
            borderRadius: 9999,
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(168, 85, 247, 0.2) 100%)',
            border: '1px solid rgba(139, 92, 246, 0.4)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(139, 92, 246, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05) inset',
          }}
        >
          <span style={{ 
            fontSize: 13, 
            fontWeight: 600, 
            color: '#c4b5fd', 
            fontFamily: 'system-ui, -apple-system, sans-serif',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}>
            {activeScene?.title || `Scene ${activeScene?.id}`}
          </span>
        </div>
      </div>

      {/* IDE Window Container */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 64px 180px 64px',
          opacity: contentOpacity,
          transform: `scale(${scale})`,
          transition: 'transform 0.3s ease',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 1400,
            position: 'relative',
          }}
        >
          {/* Glow effect behind IDE */}
          <div
            style={{
              position: 'absolute',
              inset: -20,
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, transparent 70%)',
              borderRadius: 24,
              filter: 'blur(40px)',
              opacity: contentOpacity * 0.6,
              zIndex: 0,
            }}
          />
          
          <div style={{ position: 'relative', zIndex: 1 }}>
            <IdeWindow
              scenes={scenes}
              activeScene={activeScene}
              previousScene={previousScene}
              relativeFrame={relativeFrame}
            />
          </div>
        </div>
      </div>

      {/* Narration Subtitle */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 25,
          padding: '0 32px 40px',
        }}
      >
        <div 
          style={{ 
            maxWidth: 1000, 
            margin: '0 auto',
            opacity: subtitleOpacity,
            transform: `translateY(${interpolate(
              relativeFrame,
              [0, 8, safeDuration - 8, safeDuration],
              [20, 0, 0, 20],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            )}px)`,
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.9) 0%, rgba(20, 20, 30, 0.95) 100%)',
              backdropFilter: 'blur(20px)',
              borderRadius: 20,
              padding: '20px 28px',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Subtle gradient accent */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.6), transparent)',
              }}
            />
            
            <p
              style={{
                color: '#f3f4f6',
                fontSize: 19,
                lineHeight: 1.7,
                textAlign: 'center',
                margin: 0,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                fontWeight: 400,
                letterSpacing: '-0.01em',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              {activeScene?.narration_text || ""}
            </p>
          </div>
        </div>
      </div>

      {/* Audio sequences - only render if audioUrl exists and is valid */}
      {scenes.map((scene) => (
        <Sequence
          key={`audio-${scene.id}-${scene.startFrame}`}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
        >
          {scene.audioUrl && !scene.audioUrl.includes('mock') ? (
            <Audio src={scene.audioUrl} />
          ) : null}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
