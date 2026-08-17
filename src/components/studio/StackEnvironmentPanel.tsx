// Stack & Environment — shows what env_builder.py auto-detected for this
// project's build/test sandbox, and lets a company override it for stacks
// auto-detection doesn't recognize (or just doesn't get right).

import { useEffect, useState } from "react";
import { Boxes, Loader2, Save, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  getEnvOverride,
  saveEnvOverride,
  type DetectedStack,
} from "@/lib/envSettingsApi";

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function StackEnvironmentPanel({ projectId }: { projectId: string | null | undefined }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detected, setDetected] = useState<DetectedStack | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [baseImage, setBaseImage] = useState("");
  const [installCommand, setInstallCommand] = useState("");
  const [buildCommands, setBuildCommands] = useState("");
  const [testCommands, setTestCommands] = useState("");

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    getEnvOverride(projectId)
      .then((data) => {
        if (cancelled) return;
        setDetected(data.detected);
        setUpdatedAt(data.updated_at);
        setBaseImage(data.base_image ?? "");
        setInstallCommand(data.install_command ?? "");
        setBuildCommands((data.build_commands ?? []).join("\n"));
        setTestCommands((data.test_commands ?? []).join("\n"));
      })
      .catch(() => {
        if (!cancelled) {
          toast({
            title: "Couldn't load stack settings",
            description: "The environment settings API may not be running.",
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, toast]);

  if (!projectId) {
    return (
      <div className="rounded-[22px] gf-panel p-6 shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
        <div className="text-sm font-medium text-primary">Stack & Environment</div>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">
          Save the project to configure its build environment
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Stack overrides are scoped per project. Reopen this workspace from your
          dashboard once the project is saved.
        </p>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveEnvOverride(projectId, {
        base_image: baseImage.trim() || null,
        install_command: installCommand.trim() || null,
        build_commands: linesToList(buildCommands),
        test_commands: linesToList(testCommands),
      });
      setDetected(saved.detected);
      setUpdatedAt(saved.updated_at);
      toast({
        title: "Stack settings saved",
        description: "This overrides auto-detection the next time the sandbox is built.",
      });
    } catch (error) {
      toast({
        title: "Couldn't save stack settings",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="studio-stack-environment" className="space-y-5">
      <div className="rounded-[22px] gf-panel p-5 shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Boxes className="h-4 w-4" /> Stack & Environment
        </div>
        <h2 className="mt-1 text-2xl font-semibold text-foreground">
          How the agent builds and tests this project
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          NeoDevEx auto-detects how to install, build, and test this repo. If it
          got it wrong — or your stack isn't recognized yet — set an override
          below. It takes precedence over auto-detection and any{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">devcontainer.json</code>{" "}
          the repo already has.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Detected stack column */}
        <div className="rounded-[22px] gf-panel p-5 shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
          <div className="text-sm font-semibold text-foreground">Last detected</div>
          {loading ? (
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : !detected ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              No detection has run for this project yet — it happens automatically
              the first time the agent builds a sandbox for it.
            </p>
          ) : (
            <div className="mt-4 space-y-3 text-xs">
              <DetectedRow label="Languages" value={detected.languages.join(", ") || "—"} />
              <DetectedRow label="Primary" value={detected.primary_language ?? "—"} />
              <DetectedRow label="Package manager" value={detected.package_manager ?? "—"} />
              <DetectedRow label="Install command" value={detected.install_command || "—"} mono />
              <DetectedRow
                label="Test commands"
                value={detected.test_commands.length ? detected.test_commands.join(" · ") : "—"}
                mono
              />
              {detected.has_devcontainer && (
                <DetectedRow
                  label="devcontainer.json"
                  value={`Found at ${detected.devcontainer_path}`}
                />
              )}
              {detected.devcontainer_warnings.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300/30 bg-amber-300/10 px-2.5 py-2 text-[11px] leading-4 text-amber-700">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{detected.devcontainer_warnings.join(" ")}</span>
                </div>
              )}
              {detected.override_source && (
                <p className="text-[11px] text-muted-foreground">
                  Effective source: <span className="font-medium text-foreground">{detected.override_source}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Override form column */}
        <div className="rounded-[22px] gf-panel p-5 shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">Override</div>
            {updatedAt && (
              <span className="text-[11px] text-muted-foreground">
                Saved {new Date(updatedAt).toLocaleString()}
              </span>
            )}
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Base image</label>
              <Input
                placeholder="e.g. eclipse-temurin:21-jdk"
                value={baseImage}
                onChange={(e) => setBaseImage(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Install command</label>
              <Input
                placeholder="e.g. make bootstrap"
                value={installCommand}
                onChange={(e) => setInstallCommand(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Build commands (one per line)
              </label>
              <Textarea
                value={buildCommands}
                onChange={(e) => setBuildCommands(e.target.value)}
                rows={3}
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Test commands (one per line)
              </label>
              <Textarea
                value={testCommands}
                onChange={(e) => setTestCommands(e.target.value)}
                rows={3}
                className="mt-1 font-mono text-xs"
              />
            </div>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-2 h-3.5 w-3.5" />
              )}
              Save override
            </Button>
            <p className="text-[11px] leading-4 text-muted-foreground">
              A company can also skip this form entirely and check in{" "}
              <code className="rounded bg-muted px-1 py-0.5">.neodevex/env.json</code> with the
              same fields — useful when the build recipe should live in the repo itself.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function DetectedRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg border border-border px-2.5 py-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 truncate text-right text-foreground/90 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

export default StackEnvironmentPanel;
