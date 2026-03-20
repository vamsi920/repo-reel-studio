import { useState, useEffect, useCallback, useRef } from "react";
import { PlayerRef } from "@remotion/player";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  Settings,
  Share2,
  Download,
  Film,
  FileJson,
  Loader2,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Repeat,
  PictureInPicture2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import type { HydratedManifest } from "@/hooks/useHydrateManifest";

interface VideoControlsProps {
  playerRef: React.RefObject<PlayerRef>;
  manifest: HydratedManifest;
  isPlaying: boolean;
  isFullscreen: boolean;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  onPlayPause: () => void;
  onSeek: (frame: number) => void;
  onToggleFullscreen: () => void;
  onSceneChange?: (sceneIndex: number) => void;
  /** Download video (WebM or MP4); when provided, Download becomes a dropdown with Video + Manifest */
  onDownloadVideo?: () => void;
  isDownloadingVideo?: boolean;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const VideoControls = ({
  playerRef,
  manifest,
  isPlaying,
  isFullscreen,
  currentFrame,
  totalFrames,
  fps,
  onPlayPause,
  onSeek,
  onToggleFullscreen,
  onSceneChange,
  onDownloadVideo,
  isDownloadingVideo = false,
}: VideoControlsProps) => {
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoop, setIsLoop] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

  const currentTime = currentFrame / fps;
  const totalTime = totalFrames / fps;
  const progress = (currentFrame / totalFrames) * 100;

  // Find current scene
  const currentSceneIndex = manifest.scenes.findIndex(
    (scene) => currentFrame >= scene.startFrame && currentFrame < scene.endFrame
  );
  const currentScene = manifest.scenes[currentSceneIndex] || manifest.scenes[0];

  // Scene markers for progress bar
  const sceneMarkers = manifest.scenes.map((scene) => ({
    position: (scene.startFrame / totalFrames) * 100,
    title: scene.title || `Scene ${scene.id}`,
    startFrame: scene.startFrame,
  }));

  // Handle seek from progress bar
  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressRef.current) return;
      const rect = progressRef.current.getBoundingClientRect();
      const clickPosition = (e.clientX - rect.left) / rect.width;
      const newFrame = Math.floor(clickPosition * totalFrames);
      onSeek(Math.max(0, Math.min(newFrame, totalFrames - 1)));
    },
    [totalFrames, onSeek]
  );

  // Handle progress bar hover
  const handleProgressHover = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressRef.current) return;
      const rect = progressRef.current.getBoundingClientRect();
      const hoverPosition = ((e.clientX - rect.left) / rect.width) * 100;
      setHoverProgress(Math.max(0, Math.min(hoverPosition, 100)));
    },
    []
  );

  // Handle dragging
  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !progressRef.current) return;
      const rect = progressRef.current.getBoundingClientRect();
      const clickPosition = (e.clientX - rect.left) / rect.width;
      const newFrame = Math.floor(clickPosition * totalFrames);
      onSeek(Math.max(0, Math.min(newFrame, totalFrames - 1)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, totalFrames, onSeek]);

  // Volume control
  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    playerRef.current?.setVolume(newVolume);
  }, [playerRef]);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      playerRef.current?.setVolume(volume || 1);
    } else {
      setIsMuted(true);
      playerRef.current?.setVolume(0);
    }
  }, [isMuted, volume, playerRef]);

  // Playback rate
  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    playerRef.current?.setPlaybackRate(rate);
  }, [playerRef]);

  // Picture in Picture
  const togglePiP = useCallback(async () => {
    try {
      const video = document.querySelector("video");
      if (video) {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      }
    } catch (error) {
      console.error("PiP error:", error);
    }
  }, []);

  // Scene navigation
  const goToPreviousScene = useCallback(() => {
    const prevIndex = Math.max(0, currentSceneIndex - 1);
    const prevScene = manifest.scenes[prevIndex];
    if (prevScene) {
      onSeek(prevScene.startFrame);
      onSceneChange?.(prevIndex);
    }
  }, [currentSceneIndex, manifest.scenes, onSeek, onSceneChange]);

  const goToNextScene = useCallback(() => {
    const nextIndex = Math.min(manifest.scenes.length - 1, currentSceneIndex + 1);
    const nextScene = manifest.scenes[nextIndex];
    if (nextScene) {
      onSeek(nextScene.startFrame);
      onSceneChange?.(nextIndex);
    }
  }, [currentSceneIndex, manifest.scenes, onSeek, onSceneChange]);

  // Skip 10 seconds
  const skipBackward = useCallback(() => {
    const newFrame = Math.max(0, currentFrame - fps * 10);
    onSeek(newFrame);
  }, [currentFrame, fps, onSeek]);

  const skipForward = useCallback(() => {
    const newFrame = Math.min(totalFrames - 1, currentFrame + fps * 10);
    onSeek(newFrame);
  }, [currentFrame, totalFrames, fps, onSeek]);

  // Share
  const handleShare = useCallback(async () => {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast({
      title: "Link copied!",
      description: "Video link has been copied to clipboard.",
    });
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // Download manifest
  const handleDownload = useCallback(() => {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${manifest.title || "video"}-manifest.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Downloaded!",
      description: "Manifest JSON saved to your downloads.",
    });
  }, [manifest]);

  // Get volume icon
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  // Get hover time
  const hoverTime = hoverProgress !== null ? (hoverProgress / 100) * totalTime : 0;
  const hoverScene = hoverProgress !== null
    ? sceneMarkers.find((marker, i) => {
        const nextMarker = sceneMarkers[i + 1];
        return hoverProgress >= marker.position && (!nextMarker || hoverProgress < nextMarker.position);
      })
    : null;

  return (
    <TooltipProvider>
      <div
        ref={controlsRef}
        className="absolute inset-0 flex flex-col justify-end rounded-xl bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-300 pointer-events-none"
      >
        {/* Top overlay - Title and Actions */}
        <div className="absolute top-0 left-0 right-0 flex items-start justify-between bg-gradient-to-b from-black/60 to-transparent p-4 pointer-events-auto">
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-full bg-primary/20 border border-primary/30 backdrop-blur-sm">
              <span className="text-xs font-medium text-primary-foreground">
                Scene {currentSceneIndex + 1} of {manifest.scenes.length}
              </span>
            </div>
            <span className="text-sm text-white/80 font-medium truncate max-w-md">
              {currentScene?.title || manifest.title}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
                  onClick={handleShare}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Share</TooltipContent>
            </Tooltip>

            {onDownloadVideo ? (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
                          disabled={isDownloadingVideo}
                        >
                          {isDownloadingVideo ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Download video or manifest</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={onDownloadVideo}
                    disabled={isDownloadingVideo}
                  >
                    <Film className="h-4 w-4 mr-2" />
                    Download Video
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDownload}>
                    <FileJson className="h-4 w-4 mr-2" />
                    Download Manifest (JSON)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
                    onClick={handleDownload}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download Manifest</TooltipContent>
              </Tooltip>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Playback Speed</DropdownMenuLabel>
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                  <DropdownMenuItem
                    key={rate}
                    onClick={() => handlePlaybackRateChange(rate)}
                    className={playbackRate === rate ? "bg-primary/20" : ""}
                  >
                    {rate}x {rate === 1 && "(Normal)"}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsLoop(!isLoop)}>
                  <Repeat className={`h-4 w-4 mr-2 ${isLoop ? "text-primary" : ""}`} />
                  Loop {isLoop ? "On" : "Off"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="space-y-3 p-4 pointer-events-auto">
          {/* Progress Bar */}
          <div className="relative group">
            {/* Scene markers */}
            <div className="absolute -top-6 left-0 right-0 flex">
              {sceneMarkers.map((marker, i) => (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <button
                      className="absolute w-1 h-3 bg-white/40 hover:bg-primary hover:h-4 transition-all rounded-full -translate-x-1/2"
                      style={{ left: `${marker.position}%` }}
                      onClick={() => onSeek(marker.startFrame)}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {marker.title}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Progress track */}
            <div
              ref={progressRef}
              className="relative h-1.5 bg-white/20 rounded-full cursor-pointer group-hover:h-2 transition-all"
              onClick={handleProgressClick}
              onMouseMove={handleProgressHover}
              onMouseLeave={() => setHoverProgress(null)}
              onMouseDown={handleMouseDown}
            >
              {/* Buffered (simulated) */}
              <div
                className="absolute top-0 left-0 h-full bg-white/30 rounded-full"
                style={{ width: `${Math.min(progress + 10, 100)}%` }}
              />

              {/* Progress */}
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-purple-400 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />

              {/* Hover preview */}
              {hoverProgress !== null && (
                <div
                  className="absolute top-0 h-full bg-white/20 rounded-full"
                  style={{ width: `${hoverProgress}%` }}
                />
              )}

              {/* Scrubber */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg scale-0 group-hover:scale-100 transition-transform"
                style={{ left: `${progress}%`, transform: `translateX(-50%) translateY(-50%)` }}
              />

              {/* Hover tooltip */}
              {hoverProgress !== null && (
                <div
                  className="absolute -top-12 transform -translate-x-1/2 px-2 py-1 bg-black/90 rounded text-xs text-white whitespace-nowrap"
                  style={{ left: `${hoverProgress}%` }}
                >
                  <div className="font-medium">{formatTime(hoverTime)}</div>
                  {hoverScene && (
                    <div className="text-white/60 text-[10px]">{hoverScene.title}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            {/* Left Controls */}
            <div className="flex items-center gap-1">
              {/* Play/Pause */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-white hover:bg-white/10"
                    onClick={onPlayPause}
                  >
                    {isPlaying ? (
                      <Pause className="h-5 w-5 fill-white" />
                    ) : (
                      <Play className="h-5 w-5 fill-white" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isPlaying ? "Pause (Space)" : "Play (Space)"}</TooltipContent>
              </Tooltip>

              {/* Skip Backward */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
                    onClick={skipBackward}
                  >
                    <SkipBack className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>-10s</TooltipContent>
              </Tooltip>

              {/* Skip Forward */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
                    onClick={skipForward}
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>+10s</TooltipContent>
              </Tooltip>

              {/* Scene Navigation */}
              <div className="flex items-center gap-0.5 ml-2 px-2 py-1 rounded-lg bg-white/5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/10"
                      onClick={goToPreviousScene}
                      disabled={currentSceneIndex === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Previous Scene</TooltipContent>
                </Tooltip>
                <span className="text-xs text-white/60 px-2 min-w-[60px] text-center">
                  {currentSceneIndex + 1} / {manifest.scenes.length}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/10"
                      onClick={goToNextScene}
                      disabled={currentSceneIndex === manifest.scenes.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Next Scene</TooltipContent>
                </Tooltip>
              </div>

              {/* Volume */}
              <div
                className="relative flex items-center ml-2"
                onMouseEnter={() => setShowVolumeSlider(true)}
                onMouseLeave={() => setShowVolumeSlider(false)}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
                      onClick={toggleMute}
                    >
                      <VolumeIcon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isMuted ? "Unmute" : "Mute"}</TooltipContent>
                </Tooltip>

                <div
                  className={`overflow-hidden transition-all duration-200 ${
                    showVolumeSlider ? "w-20 opacity-100" : "w-0 opacity-0"
                  }`}
                >
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                  />
                </div>
              </div>

              {/* Time */}
              <div className="text-sm text-white/80 ml-3 font-mono">
                <span className="text-white">{formatTime(currentTime)}</span>
                <span className="mx-1">/</span>
                <span>{formatTime(totalTime)}</span>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-1">
              {/* Speed indicator */}
              {playbackRate !== 1 && (
                <div className="px-2 py-1 rounded bg-primary/20 text-xs text-primary-foreground mr-2">
                  {playbackRate}x
                </div>
              )}

              {/* PiP */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
                    onClick={togglePiP}
                  >
                    <PictureInPicture2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Picture in Picture</TooltipContent>
              </Tooltip>

              {/* Fullscreen */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
                    onClick={onToggleFullscreen}
                  >
                    {isFullscreen ? (
                      <Minimize className="h-4 w-4" />
                    ) : (
                      <Maximize className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

// Scene List Sidebar Component
export const SceneListSidebar = ({
  manifest,
  currentSceneIndex,
  onSceneClick,
  fps,
}: {
  manifest: HydratedManifest;
  currentSceneIndex: number;
  onSceneClick: (sceneIndex: number, frame: number) => void;
  fps: number;
}) => {
  const formatSceneTime = (frames: number) => {
    const seconds = frames / fps;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-full flex-col bg-[#141c37]">
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {manifest.scenes.map((scene, index) => {
          const isActive = index === currentSceneIndex;
          const sceneType = scene.type || "code";

          return (
            <button
              key={scene.id}
              onClick={() => onSceneClick(index, scene.startFrame)}
              className={`w-full text-left p-3 rounded-lg transition-all group ${
                isActive
                  ? "bg-primary/14 border border-primary/30"
                  : "hover:bg-white/[0.04] border border-transparent"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Scene number */}
                <div
                  className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground group-hover:bg-secondary/80"
                  }`}
                >
                  {index + 1}
                </div>

                {/* Scene info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                    className={`text-sm font-medium truncate ${
                        isActive ? "text-white" : "text-white/78"
                      }`}
                    >
                      {scene.title || `Scene ${scene.id}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-white/44">
                      {formatSceneTime(scene.startFrame)}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-white/[0.06] text-white/46 capitalize">
                      {sceneType.replace("_", " ")}
                    </span>
                  </div>

                  {scene.file_path && scene.file_path !== "N/A" && (
                    <p className="mt-1 truncate font-mono text-xs text-white/38">
                      {scene.file_path}
                    </p>
                  )}
                </div>

                {/* Active indicator */}
                {isActive && (
                  <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary animate-pulse" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer Actions */}
      <div className="border-t border-white/8 p-4">
        <div className="mb-3 text-xs text-white/42">
          {manifest.scenes.length} scenes • {formatSceneTime(manifest.totalFrames)} total
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => {
            const narration = manifest.scenes
              .map((s, i) => `[Scene ${i + 1}: ${s.title || s.file_path}]\n${s.narration_text}`)
              .join("\n\n");
            navigator.clipboard.writeText(narration);
            toast({
              title: "Copied!",
              description: "Full narration script copied to clipboard.",
            });
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy Script
        </Button>
      </div>
    </div>
  );
};
