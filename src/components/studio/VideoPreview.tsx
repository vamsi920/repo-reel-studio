import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  X,
  Clock,
  FileCode,
  Tag,
  BarChart3,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { VideoTreeNode, VideoManifest } from "@/lib/types";

interface Props {
  node: VideoTreeNode;
  manifest?: VideoManifest;
  isOpen: boolean;
  onClose: () => void;
  onPlayFull?: () => void;
}

// Generate thumbnail frames from manifest scenes
function generateThumbnails(manifest: VideoManifest): string[] {
  // In production, these would be actual video frame captures
  // For now, we'll generate placeholder data
  const thumbnails: string[] = [];
  const scenesToPreview = manifest.scenes.slice(0, 6);
  
  scenesToPreview.forEach(scene => {
    // Generate a unique gradient for each scene
    const colors = [
      `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,
      `linear-gradient(135deg, #f093fb 0%, #f5576c 100%)`,
      `linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)`,
      `linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)`,
      `linear-gradient(135deg, #fa709a 0%, #fee140 100%)`,
      `linear-gradient(135deg, #30cfd0 0%, #330867 100%)`,
    ];
    thumbnails.push(colors[thumbnails.length % colors.length]);
  });
  
  return thumbnails;
}

export const VideoPreview = ({
  node,
  manifest,
  isOpen,
  onClose,
  onPlayFull,
}: Props) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (manifest) {
      setThumbnails(generateThumbnails(manifest));
    }
  }, [manifest]);
  
  useEffect(() => {
    if (isPlaying && manifest) {
      intervalRef.current = setInterval(() => {
        setCurrentTime(prev => {
          const next = prev + 0.1;
          if (next >= node.duration) {
            setIsPlaying(false);
            return 0;
          }
          
          // Update current scene based on time
          let accumulatedTime = 0;
          for (let i = 0; i < manifest.scenes.length; i++) {
            accumulatedTime += manifest.scenes[i].duration_seconds || 15;
            if (next < accumulatedTime) {
              setCurrentSceneIndex(i);
              break;
            }
          }
          
          return next;
        });
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, node.duration, manifest]);
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };
  
  const progressPercentage = (currentTime / node.duration) * 100;
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          {/* Preview Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-4xl mx-auto bg-background rounded-2xl shadow-2xl border border-white/10 overflow-hidden z-50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileCode className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{node.title}</h3>
                  <p className="text-sm text-white/60">{node.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 transition"
              >
                <X className="h-5 w-5 text-white/60" />
              </button>
            </div>
            
            {/* Video Preview Area */}
            <div className="relative aspect-video bg-black">
              {manifest && thumbnails.length > 0 ? (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    background: thumbnails[currentSceneIndex % thumbnails.length],
                  }}
                >
                  {/* Scene overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  
                  {/* Scene info */}
                  <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md rounded-lg px-3 py-2">
                    <div className="text-xs text-white/60">Scene {currentSceneIndex + 1}</div>
                    <div className="text-sm font-medium text-white">
                      {manifest.scenes[currentSceneIndex]?.title || "Loading..."}
                    </div>
                  </div>
                  
                  {/* Play button overlay */}
                  {!isPlaying && (
                    <button
                      type="button"
                      onClick={() => setIsPlaying(true)}
                      className="relative z-10 w-20 h-20 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition group"
                    >
                      <Play className="h-8 w-8 text-white ml-1 group-hover:scale-110 transition" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-violet-500/20">
                  <div className="text-center">
                    <FileCode className="h-12 w-12 text-white/40 mx-auto mb-2" />
                    <p className="text-white/60">Preview generating...</p>
                  </div>
                </div>
              )}
              
              {/* Timeline scrubber */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4 text-white" />
                    ) : (
                      <Play className="h-4 w-4 text-white ml-0.5" />
                    )}
                  </button>
                  
                  <div className="flex-1">
                    <div className="relative h-1 bg-white/20 rounded-full overflow-hidden">
                      <motion.div
                        className="absolute inset-y-0 left-0 bg-primary rounded-full"
                        style={{ width: `${progressPercentage}%` }}
                      />
                      {/* Scene markers */}
                      {manifest?.scenes.map((scene, i) => {
                        const sceneStart = manifest.scenes
                          .slice(0, i)
                          .reduce((sum, s) => sum + (s.duration_seconds || 15), 0);
                        const position = (sceneStart / node.duration) * 100;
                        
                        return (
                          <div
                            key={i}
                            className="absolute top-0 bottom-0 w-px bg-white/30"
                            style={{ left: `${position}%` }}
                          />
                        );
                      })}
                    </div>
                  </div>
                  
                  <span className="text-xs text-white/60 font-mono">
                    {formatTime(currentTime)} / {formatTime(node.duration)}
                  </span>
                  
                  <button
                    type="button"
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
                  >
                    {isMuted ? (
                      <VolumeX className="h-4 w-4 text-white/60" />
                    ) : (
                      <Volume2 className="h-4 w-4 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Thumbnail Strip */}
            {thumbnails.length > 0 && (
              <div className="p-4 border-t border-white/10">
                <div className="flex gap-2 overflow-x-auto">
                  {thumbnails.map((thumb, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setCurrentSceneIndex(i);
                        const sceneStart = manifest?.scenes
                          .slice(0, i)
                          .reduce((sum, s) => sum + (s.duration_seconds || 15), 0) || 0;
                        setCurrentTime(sceneStart);
                      }}
                      className={`relative flex-shrink-0 w-24 h-14 rounded-lg overflow-hidden border-2 transition ${
                        currentSceneIndex === i
                          ? "border-primary"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div
                        className="absolute inset-0"
                        style={{ background: thumb }}
                      />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <span className="text-xs text-white/80 font-medium">
                          Scene {i + 1}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Metadata */}
            <div className="p-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-white/40" />
                    <span className="text-sm text-white/60">
                      {formatTime(node.duration)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-white/40" />
                    <span className="text-sm text-white/60">
                      {node.difficulty}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-white/40" />
                    <div className="flex gap-1">
                      {node.tags.slice(0, 3).map(tag => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full bg-white/10 text-xs text-white/60"
                        >
                          {tag}
                        </span>
                      ))}
                      {node.tags.length > 3 && (
                        <span className="text-xs text-white/40">
                          +{node.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {onPlayFull && (
                  <button
                    type="button"
                    onClick={onPlayFull}
                    className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition"
                  >
                    Watch Full Video
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};