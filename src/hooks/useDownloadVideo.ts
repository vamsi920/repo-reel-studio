import { useCallback, useState, useRef } from "react";
import type { PlayerRef } from "@remotion/player";
import { toast } from "@/hooks/use-toast";

const formatRemaining = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const MIME_PRIORITY = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
];

function pickMime(): string {
  for (const m of MIME_PRIORITY) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m))
      return m;
  }
  return "video/webm";
}

/**
 * Records the Remotion Player canvas in the background via captureStream + MediaRecorder.
 * Keeps the Player hidden (e.g. in sr-only). Shows estimated time remaining.
 */
export function useDownloadVideo({
  playerContainerRef,
  playerRef,
  totalFrames,
  fps = 30,
  fileName,
}: {
  playerContainerRef: React.RefObject<HTMLDivElement | null>;
  playerRef: React.RefObject<PlayerRef | null>;
  totalFrames: number;
  fps?: number;
  fileName: string;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const downloadVideo = useCallback(async () => {
    if (!playerContainerRef?.current || !playerRef?.current || totalFrames < 1)
      return;
    if (isExporting) return;

    const findCanvas = async (): Promise<HTMLCanvasElement | null> => {
      const container =
        (playerRef.current as { getContainerNode?: () => HTMLElement | null } | null)
          ?.getContainerNode?.() ?? playerContainerRef.current;
      for (let i = 0; i < 15; i++) {
        const el = container?.querySelector?.("canvas");
        if (el instanceof HTMLCanvasElement) return el;
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    };

    const canvas = await findCanvas();
    if (!canvas) {
      toast({
        title: "Download unavailable",
        description: "Player canvas not found. Ensure the video is loaded.",
        variant: "destructive",
      });
      return;
    }
    if (typeof canvas.captureStream !== "function") {
      toast({
        title: "Download unavailable",
        description: "Video capture is not supported in this browser. Try Chrome or Firefox.",
      });
      return;
    }

    const mimeType = pickMime();
    const durationSec = totalFrames / fps;
    let remaining = Math.ceil(durationSec);

    const clearCountdown = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setStatusMessage("");
    };

    setIsExporting(true);
    setStatusMessage(`Exporting... ~${formatRemaining(remaining)} remaining`);

    intervalRef.current = setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      setStatusMessage(`Exporting... ~${formatRemaining(remaining)} remaining`);
    }, 1000);

    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      clearCountdown();
      setIsExporting(false);
      const blob = new Blob(chunks, { type: mimeType });
      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${String(fileName).replace(/\//g, "-")}-video.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded!", description: "Video saved to your downloads." });
    };

    const run = async () => {
      playerRef.current!.seekTo(0);
      await new Promise((r) => setTimeout(r, 150));
      recorder.start();
      playerRef.current!.play();
      const durationMs = Math.ceil((totalFrames / fps) * 1000);
      setTimeout(() => {
        try {
          recorder.stop();
          playerRef.current?.pause();
        } catch (_) {}
      }, durationMs + 500);
    };

    run().catch((e) => {
      clearCountdown();
      setIsExporting(false);
      console.error("[useDownloadVideo]", e);
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Could not export video.",
        variant: "destructive",
      });
    });
  }, [playerContainerRef, playerRef, totalFrames, fps, fileName, isExporting]);

  return { downloadVideo, isExporting, statusMessage };
}
