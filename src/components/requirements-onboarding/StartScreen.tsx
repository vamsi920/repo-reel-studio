// Ported near-verbatim from document-query-flow/src/components/onboarding/StartScreen.tsx.
import { useRef, useState, DragEvent } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  UploadCloud,
  FileText,
  X,
  ArrowRight,
  ShieldCheck,
  Boxes,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export interface StartPayload {
  idea: string;
  files: File[];
}

interface StartScreenProps {
  onStart: (payload: StartPayload) => void;
  isStarting: boolean;
}

const ACCEPTED = ".pdf";
const MAX_FILES = 8;

const StartScreen = ({ onStart, isStarting }: StartScreenProps) => {
  const [idea, setIdea] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next: File[] = [];
    Array.from(incoming).forEach((f) => {
      if (!f.name.toLowerCase().endsWith(".pdf")) {
        toast.error(`${f.name}: only PDF files are supported.`);
        return;
      }
      next.push(f);
    });
    setFiles((prev) => [...prev, ...next].slice(0, MAX_FILES));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const removeFile = (idx: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== idx));

  const canStart = (idea.trim().length > 0 || files.length > 0) && !isStarting;

  return (
    <div className="onb-root onb-scroll h-screen overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <div className="onb-eyebrow mb-3 inline-flex items-center gap-2">
            <span className="onb-pip live" /> AI Requirements Onboarding Engine
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Turn a rough idea into a{" "}
            <span className="text-cyan-300">prototype-ready</span> spec
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-400">
            Drop a tech spec, a regulatory document, or just describe what you
            want to build. I'll interview you, track what's understood, and
            generate a clean BRD, FRD, and Application Summary.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="onb-panel onb-ticks mt-10 p-6"
        >
          <label className="onb-eyebrow mb-2 block text-slate-400">
            Describe your idea
          </label>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="e.g. An internal tool for our ops team to review and approve vendor invoices with an audit trail…"
            rows={4}
            className="onb-scroll w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--ink-750)] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
          />

          <div className="mt-5">
            <label className="onb-eyebrow mb-2 block text-slate-400">
              Upload documents (optional · PDF)
            </label>
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-all ${
                dragging
                  ? "border-cyan-400/70 bg-cyan-400/5"
                  : "border-[var(--line-strong)] bg-[var(--ink-850)] hover:border-cyan-400/40"
              }`}
            >
              <UploadCloud className="mb-2 h-7 w-7 text-cyan-300" />
              <p className="text-sm font-medium text-slate-200">
                Drag &amp; drop or click to browse
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Tech specs, regulatory docs, RFCs — up to {MAX_FILES} PDFs
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED}
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              />
            </div>

            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--ink-750)] px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-cyan-300" />
                      <span className="truncate text-sm text-slate-200">
                        {f.name}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(i);
                      }}
                      className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-slate-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            disabled={!canStart}
            onClick={() => onStart({ idea: idea.trim(), files })}
            className="onb-btn-hud mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm"
          >
            {isStarting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading your input…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Start onboarding
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </motion.div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Feature
            icon={<ShieldCheck className="h-5 w-5 text-cyan-300" />}
            title="Regulatory-aware"
            body="Detects banking, healthcare, compliance & audit projects and asks the right controls questions."
          />
          <Feature
            icon={<Boxes className="h-5 w-5 text-cyan-300" />}
            title="Prototype-ready output"
            body="Builds a structured requirement state, then a clean BRD, FRD & summary you can feed to a builder."
          />
        </div>
      </div>
    </div>
  );
};

const Feature = ({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) => (
  <div className="onb-panel p-4">
    <div className="mb-2 flex items-center gap-2">
      {icon}
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
    </div>
    <p className="text-xs leading-relaxed text-slate-400">{body}</p>
  </div>
);

export default StartScreen;
