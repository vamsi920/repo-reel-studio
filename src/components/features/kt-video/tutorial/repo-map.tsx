/* eslint-disable i18next/no-literal-string -- Remotion frame chrome */
import { useMemo } from "react";
import { useVideoConfig } from "remotion";
import { languageForPath } from "#/lib/kt-video/code-regions";
import type { TreeVisual } from "#/lib/kt-video/tutorial-types";
import { THEME, baseName, dirName, easeOut, enter } from "./theme";

interface Row {
  path: string;
  name: string;
  depth: number;
  isDir: boolean;
}

function rowsFor(files: string[]): Row[] {
  const rows: Row[] = [];
  const dirs = new Set<string>();
  for (const path of [...files].sort()) {
    const parts = path.split("/");
    for (let i = 0; i < parts.length - 1; i += 1) {
      const dir = parts.slice(0, i + 1).join("/");
      if (!dirs.has(dir)) {
        dirs.add(dir);
        rows.push({ path: dir, name: parts[i], depth: i, isDir: true });
      }
    }
    rows.push({
      path,
      name: parts[parts.length - 1],
      depth: parts.length - 1,
      isDir: false,
    });
  }
  return rows.slice(0, 34);
}

export function RepoMap({
  visual,
  fileTree,
  files,
  introduce,
  relativeFrame,
}: {
  visual: TreeVisual;
  fileTree: string[];
  files: Record<string, string>;
  introduce: boolean;
  relativeFrame: number;
}) {
  const { fps } = useVideoConfig();
  const rows = useMemo(() => rowsFor(fileTree), [fileTree]);
  const focus = new Set(visual.focusPaths);
  const focusDirs = new Set(visual.focusPaths.map(dirName).filter(Boolean));
  const hasFocus = focus.size > 0;
  const focusIn = easeOut(relativeFrame, 8, 24);
  const details = visual.focusPaths.slice(0, 4);

  return (
    <div
      role="group"
      aria-label="Repository map"
      style={{
        width: 1680,
        height: 860,
        display: "flex",
        gap: 40,
        borderRadius: 14,
        overflow: "hidden",
        background: THEME.bgPanel,
        border: `1px solid ${THEME.borderStrong}`,
        boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        fontFamily: THEME.fontSans,
      }}
    >
      <div
        style={{
          width: 760,
          padding: "26px 0",
          borderRight: `1px solid ${THEME.border}`,
          background: THEME.bgRaised,
        }}
      >
        <div
          style={{
            padding: "0 28px 14px",
            fontSize: 12,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: THEME.textFaint,
            fontWeight: 700,
          }}
        >
          Repository
        </div>
        {rows.map((row, i) => {
          const reveal = introduce ? enter(relativeFrame, fps, i * 1.6) : 1;
          const isFocus =
            focus.has(row.path) || (row.isDir && focusDirs.has(row.path));
          const dim = hasFocus && !isFocus ? 1 - 0.6 * focusIn : 1;
          return (
            <div
              key={row.path}
              style={{
                display: "flex",
                alignItems: "center",
                height: 22,
                paddingLeft: 28 + row.depth * 22,
                fontSize: 15,
                fontFamily: row.isDir ? THEME.fontSans : THEME.fontMono,
                color: isFocus ? THEME.text : THEME.textMuted,
                background:
                  isFocus && !row.isDir
                    ? `rgba(34,224,255,${0.14 * focusIn})`
                    : "transparent",
                boxShadow:
                  isFocus && !row.isDir
                    ? `inset 3px 0 0 rgba(34,224,255,${focusIn})`
                    : undefined,
                opacity: reveal * dim,
                transform: `translateX(${(1 - reveal) * -10}px)`,
                whiteSpace: "nowrap",
              }}
            >
              <span
                style={{
                  color: row.isDir ? THEME.warm : THEME.textFaint,
                  marginRight: 10,
                  fontSize: 12,
                }}
              >
                {row.isDir ? "▾ ▰" : "▫"}
              </span>
              <span style={{ fontWeight: isFocus ? 600 : 400 }}>
                {row.name}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          flex: 1,
          padding: "40px 40px 40px 0",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          justifyContent: "center",
        }}
      >
        {visual.callout ? (
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              color: THEME.text,
              marginBottom: 10,
              opacity: easeOut(relativeFrame, 4, 16),
            }}
          >
            {visual.callout}
          </div>
        ) : null}
        {details.map((path, i) => {
          const t = enter(relativeFrame, fps, 10 + i * 6);
          const content = files[path];
          const lineCount = content ? content.split("\n").length : null;
          return (
            <div
              key={path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                padding: "16px 20px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${THEME.border}`,
                opacity: t,
                transform: `translateY(${(1 - t) * 14}px)`,
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 10,
                  background: THEME.accentSoft,
                  border: `1px solid ${THEME.accentGlow}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: THEME.accent,
                  fontSize: 13,
                  fontWeight: 800,
                  fontFamily: THEME.fontMono,
                }}
              >
                {baseName(path).split(".").pop()?.slice(0, 4).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: THEME.text,
                    fontFamily: THEME.fontMono,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {baseName(path)}
                </div>
                <div
                  style={{ fontSize: 15, color: THEME.textMuted, marginTop: 4 }}
                >
                  {dirName(path) || "repository root"}
                  {lineCount
                    ? ` · ${lineCount} lines · ${languageForPath(path)}`
                    : ""}
                </div>
              </div>
            </div>
          );
        })}
        {!details.length ? (
          <div
            style={{
              fontSize: 22,
              color: THEME.textMuted,
              opacity: easeOut(relativeFrame, 6, 18),
            }}
          >
            {fileTree.length} files in scope for this page
          </div>
        ) : null}
      </div>
    </div>
  );
}
