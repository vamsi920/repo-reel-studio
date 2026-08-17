// SME Desk — the standalone SME module.
//
// Upload or paste subject-matter-expert material for a project, see the
// knowledge base the SME agent reviews against, and audit every fact-check
// the agent has performed across the pipeline.

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  BookOpen,
  FileText,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  addSmeDocument,
  deleteSmeDocument,
  getSmeDocuments,
  subscribeSmeDocuments,
  type SmeDocument,
} from "@/lib/smeKnowledge";
import {
  getSmeReviews,
  runSmeReview,
  subscribeSmeActivity,
  type SmeReview,
} from "@/lib/smeAgent";
import { narrateSmeReview } from "@/lib/agentNarration";
import SmeStatusIndicator from "./SmeStatusIndicator";

const ACCEPTED_EXTENSIONS = [".md", ".markdown", ".txt", ".csv", ".json"];
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const REVIEW_BADGES: Record<
  SmeReview["status"],
  { label: string; className: string }
> = {
  verified: {
    label: "Verified",
    className: "bg-emerald-300/10 text-emerald-600 border-emerald-300/40",
  },
  flagged: {
    label: "Flagged",
    className: "bg-red-300/10 text-red-600 border-red-300/40",
  },
  attention: {
    label: "Attention",
    className: "bg-amber-300/10 text-amber-600 border-amber-300/40",
  },
  no_material: {
    label: "No material",
    className: "bg-muted text-muted-foreground border-border",
  },
  error: {
    label: "Reviewer error",
    className: "bg-muted text-muted-foreground border-border",
  },
};

export function SmePanel({
  projectId,
  /** Optional content the caller wants re-checked on demand (e.g. current narration). */
  reviewTarget,
}: {
  projectId: string | null | undefined;
  reviewTarget?: { step: string; label: string; content: string } | null;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<SmeDocument[]>([]);
  const [reviews, setReviews] = useState<SmeReview[]>([]);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setDocs(getSmeDocuments(projectId));
    setReviews(getSmeReviews(projectId));
    const unsubDocs = subscribeSmeDocuments(projectId, setDocs);
    const unsubActivity = subscribeSmeActivity(projectId, () => {
      setReviews(getSmeReviews(projectId));
    });
    return () => {
      unsubDocs();
      unsubActivity();
    };
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="rounded-[22px] gf-panel p-6 shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
        <div className="text-sm font-medium text-primary">SME Desk</div>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">
          Save the project to enable the SME agent
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          The SME Desk is scoped per project. Sign in and reopen this workspace
          from your dashboard so uploads and fact-checks stay with the project.
        </p>
      </div>
    );
  }

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    for (const file of files) {
      const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        toast({
          title: `Skipped ${file.name}`,
          description: `Only ${ACCEPTED_EXTENSIONS.join(", ")} files are supported.`,
          variant: "destructive",
        });
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        toast({
          title: `Skipped ${file.name}`,
          description: "Files are capped at 2 MB of text.",
          variant: "destructive",
        });
        continue;
      }
      const text = await file.text();
      const added = addSmeDocument(projectId, {
        title: file.name,
        content: text,
      });
      if (added) {
        toast({
          title: "SME material added",
          description: `${file.name} is now part of this project's knowledge base.`,
        });
      }
    }
  };

  const handlePaste = () => {
    const added = addSmeDocument(projectId, {
      title: pasteTitle || "Pasted notes",
      content: pasteContent,
    });
    if (!added) {
      toast({
        title: "Nothing to add",
        description: "Paste some SME content first.",
        variant: "destructive",
      });
      return;
    }
    setPasteTitle("");
    setPasteContent("");
    toast({
      title: "SME material added",
      description: `"${added.title}" is now part of this project's knowledge base.`,
    });
  };

  const handleRecheck = async () => {
    if (!reviewTarget?.content) return;
    setIsChecking(true);
    try {
      const review = await runSmeReview({ projectId, ...reviewTarget });
      toast({
        title: `SME ${REVIEW_BADGES[review.status].label.toLowerCase()}`,
        description: review.summary,
      });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <section id="studio-sme-desk" className="space-y-5">
      <div className="rounded-[22px] gf-panel p-5 shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-primary">SME Desk</div>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">
              Your subject-matter expert, on every step
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Upload domain truths — specs, glossaries, compliance notes. The
              SME agent fact-checks requirements, video narration, Q&A answers,
              and agent runs against this knowledge base and flags anything
              that drifts.
            </p>
          </div>
          <SmeStatusIndicator projectId={projectId} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Knowledge base column */}
        <div className="rounded-[22px] gf-panel p-5 shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <BookOpen className="h-4 w-4 text-primary" />
            Knowledge base
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {docs.length} document{docs.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS.join(",")}
              className="hidden"
              onChange={handleFiles}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload SME documents (.md, .txt, .csv, .json)
            </Button>

            <div className="rounded-xl border border-border p-3 space-y-2">
              <Input
                placeholder="Title (e.g. Payments domain glossary)"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
              />
              <Textarea
                placeholder="Paste domain knowledge, rules, terminology, compliance constraints…"
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                rows={4}
              />
              <Button size="sm" onClick={handlePaste} disabled={!pasteContent.trim()}>
                Add to knowledge base
              </Button>
            </div>

            {docs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No SME material yet. Until you add some, pipeline steps show
                “SME idle”.
              </p>
            ) : (
              <ul className="space-y-2">
                {docs.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center gap-3 rounded-xl border border-border px-3 py-2"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {doc.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {doc.content.length.toLocaleString()} chars ·{" "}
                        {new Date(doc.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => deleteSmeDocument(projectId, doc.id)}
                      aria-label={`Delete ${doc.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Review history column */}
        <div className="rounded-[22px] gf-panel p-5 shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Fact-check log
            {reviewTarget?.content && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={handleRecheck}
                disabled={isChecking || docs.length === 0}
              >
                {isChecking ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldAlert className="mr-2 h-3.5 w-3.5" />
                )}
                Re-check {reviewTarget.label}
              </Button>
            )}
          </div>

          {reviews.length === 0 ? (
            <p className="mt-4 text-xs text-muted-foreground">
              No fact-checks yet. As the pipeline runs (requirements, video
              narration, Q&A answers), every SME verdict lands here.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {reviews.slice(0, 12).map((review) => {
                const badge = REVIEW_BADGES[review.status];
                return (
                  <li
                    key={review.id}
                    className="rounded-xl border border-border p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          badge.className
                        )}
                      >
                        {badge.label}
                      </span>
                      <span className="text-xs font-medium text-foreground">
                        {review.label}
                      </span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {new Date(review.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-foreground/90">
                      {narrateSmeReview(review)}
                    </p>
                    {review.findings.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {review.findings.slice(0, 4).map((f, i) => (
                          <li
                            key={i}
                            className="rounded-lg bg-muted px-2.5 py-1.5 text-[11px] leading-4 text-foreground/80"
                          >
                            <span className="font-semibold uppercase text-[10px] tracking-wide">
                              {f.severity}
                            </span>{" "}
                            {f.claim} — {f.issue}
                            {f.correction && (
                              <span className="text-emerald-600">
                                {" "}
                                Correction: {f.correction}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

    </section>
  );
}

export default SmePanel;
