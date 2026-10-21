import type { ExportedFile } from "#/lib/synth/exporters";

/** Browser download of one exported file. */
export function downloadFile(file: ExportedFile, prefix = ""): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([file.content], {
    type: `${file.mimeType};charset=utf-8`,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${prefix}${file.path.replace(/\//g, "__")}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One JSON bundle with every file, for a single click. */
export function downloadBundle(files: ExportedFile[], name: string): void {
  const bundle: Record<string, string> = {};
  for (const file of files) bundle[file.path] = file.content;
  downloadFile({
    path: `${name}.bundle.json`,
    content: JSON.stringify(bundle, null, 2),
    mimeType: "application/json",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
