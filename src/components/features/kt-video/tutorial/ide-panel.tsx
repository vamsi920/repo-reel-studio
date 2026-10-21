/* eslint-disable i18next/no-literal-string -- Remotion frame chrome */
import { useMemo } from "react";
import { useVideoConfig } from "remotion";
import { languageForPath } from "#/lib/kt-video/code-regions";
import type { CodeVisual } from "#/lib/kt-video/tutorial-types";
import { CodeLines, LINE_HEIGHT } from "./code-lines";
import { THEME, baseName, dirName, easeInOut, easeOut, enter } from "./theme";

export const IDE_WIDTH = 1680;
export const IDE_HEIGHT = 860;
const EXPLORER_WIDTH = 300;
const TAB_HEIGHT = 40;
const CRUMB_HEIGHT = 32;
const STATUS_HEIGHT = 28;
const GUTTER_WIDTH = 64;
const EDITOR_PAD_TOP = 10;
const CONTEXT_LINES_BEFORE = 10;
const CONTEXT_LINES_AFTER = 60;
const MAX_EXPLORER_ROWS = 30;

export const EDITOR_HEIGHT =
  IDE_HEIGHT - TAB_HEIGHT - CRUMB_HEIGHT - STATUS_HEIGHT;
export const VISIBLE_LINES = Math.floor(
  (EDITOR_HEIGHT - EDITOR_PAD_TOP) / LINE_HEIGHT,
);

interface TreeRow {
  path: string;
  name: string;
  depth: number;
  isDir: boolean;
}

/** Flattens a path list into explorer rows, collapsing other top-level
 * folders when the full tree would not fit. */
export function buildExplorerRows(
  files: string[],
  activePath: string | null,
): TreeRow[] {
  const sorted = [...files].sort();
  const full: TreeRow[] = [];
  const seenDirs = new Set<string>();
  for (const path of sorted) {
    const parts = path.split("/");
    for (let i = 0; i < parts.length - 1; i += 1) {
      const dir = parts.slice(0, i + 1).join("/");
      if (!seenDirs.has(dir)) {
        seenDirs.add(dir);
        full.push({ path: dir, name: parts[i], depth: i, isDir: true });
      }
    }
    full.push({
      path,
      name: parts[parts.length - 1],
      depth: parts.length - 1,
      isDir: false,
    });
  }
  if (full.length <= MAX_EXPLORER_ROWS) return full;

  const activeTop = activePath?.split("/")[0];
  const collapsed: TreeRow[] = [];
  for (const row of full) {
    const top = row.path.split("/")[0];
    if (row.depth === 0 || top === activeTop) collapsed.push(row);
  }
  if (collapsed.length <= MAX_EXPLORER_ROWS) return collapsed;
  // Still too tall: keep only the active file's directory chain.
  const activeDir = activePath ? dirName(activePath) : "";
  return full
    .filter(
      (row) =>
        row.depth === 0 ||
        row.path === activePath ||
        (row.isDir && activeDir.startsWith(row.path)) ||
        dirName(row.path) === activeDir,
    )
    .slice(0, MAX_EXPLORER_ROWS);
}

function FileIcon({
  path,
  isDir,
  active,
}: {
  path: string;
  isDir: boolean;
  active: boolean;
}) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const color = isDir
    ? THEME.warm
    : ext === "ts" || ext === "tsx"
      ? "#3b9eff"
      : ext === "js" || ext === "jsx" || ext === "mjs"
        ? "#f7df1e"
        : ext === "py"
          ? "#4b8bbe"
          : ext === "go"
            ? "#00add8"
            : ext === "rs"
              ? "#dea584"
              : ext === "md"
                ? THEME.textMuted
                : ext === "json" || ext === "yml" || ext === "yaml"
                  ? THEME.green
                  : THEME.textMuted;
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: isDir ? 2 : 3,
        background: color,
        opacity: active ? 1 : 0.8,
        marginRight: 10,
        flexShrink: 0,
      }}
    />
  );
}

function Explorer({
  files,
  activePath,
  highlighted,
  frame,
}: {
  files: string[];
  activePath: string | null;
  highlighted: Set<string>;
  frame: number;
}) {
  const rows = useMemo(
    () => buildExplorerRows(files, activePath),
    [files, activePath],
  );
  return (
    <div
      style={{
        width: EXPLORER_WIDTH,
        height: IDE_HEIGHT,
        background: THEME.bgRaised,
        borderRight: `1px solid ${THEME.border}`,
        fontFamily: THEME.fontSans,
        fontSize: 14,
        padding: "12px 0",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "0 16px 10px",
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: THEME.textFaint,
          fontWeight: 700,
        }}
      >
        Explorer
      </div>
      {rows.map((row, i) => {
        const isActive = row.path === activePath;
        const isHighlighted = highlighted.has(row.path);
        const reveal = easeOut(frame, i * 1.5, i * 1.5 + 8);
        return (
          <div
            key={row.path}
            style={{
              display: "flex",
              alignItems: "center",
              height: 26,
              paddingLeft: 16 + row.depth * 16,
              paddingRight: 12,
              color: isActive
                ? THEME.text
                : isHighlighted
                  ? THEME.text
                  : THEME.textMuted,
              background: isActive ? THEME.accentSoft : "transparent",
              borderLeft: isActive
                ? `2px solid ${THEME.accent}`
                : "2px solid transparent",
              opacity: reveal,
              transform: `translateX(${(1 - reveal) * -8}px)`,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontWeight: isActive ? 600 : 400,
            }}
          >
            {row.isDir ? (
              <span
                style={{ color: THEME.textFaint, marginRight: 6, fontSize: 10 }}
              >
                ▾
              </span>
            ) : null}
            <FileIcon path={row.path} isDir={row.isDir} active={isActive} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {row.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Tabs({
  tabs,
  activePath,
  frame,
}: {
  tabs: string[];
  activePath: string;
  frame: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        height: TAB_HEIGHT,
        background: THEME.bgRaised,
        borderBottom: `1px solid ${THEME.border}`,
        fontFamily: THEME.fontSans,
        fontSize: 13,
        overflow: "hidden",
      }}
    >
      {tabs.map((tab) => {
        const active = tab === activePath;
        const reveal = active ? easeOut(frame, 0, 8) : 1;
        return (
          <div
            key={tab}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 18px",
              height: "100%",
              color: active ? THEME.text : THEME.textMuted,
              background: active ? THEME.bgPanel : "transparent",
              borderRight: `1px solid ${THEME.border}`,
              borderTop: active
                ? `2px solid ${THEME.accent}`
                : "2px solid transparent",
              opacity: 0.4 + 0.6 * reveal,
              whiteSpace: "nowrap",
            }}
          >
            <FileIcon path={tab} isDir={false} active={active} />
            {baseName(tab)}
            <span
              style={{ color: THEME.textFaint, marginLeft: 6, fontSize: 11 }}
            >
              {active ? "●" : "×"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export interface IdePanelProps {
  visual: CodeVisual;
  files: Record<string, string>;
  fileTree: string[];
  /** Files opened earlier in the chapter, shown as editor tabs. */
  openTabs: string[];
  /** Previous beat's code visual, for scroll continuity. */
  previous: CodeVisual | null;
  relativeFrame: number;
  durationInFrames: number;
}

function targetScrollLine(
  visual: CodeVisual,
  relativeFrame: number,
  durationInFrames: number,
  totalLines: number,
): number {
  const { startLine, endLine, focus } = visual;
  const rangeLines = endLine - startLine + 1;
  const maxTop = Math.max(1, totalLines - VISIBLE_LINES + 1);
  const clamp = (line: number) =>
    Math.max(1, Math.min(maxTop, Math.round(line)));
  if (focus) {
    const centre = (focus[0] + focus[1]) / 2;
    return clamp(centre - VISIBLE_LINES / 2 + 1);
  }
  if (rangeLines <= VISIBLE_LINES - 2) return clamp(startLine - 2);
  // Range taller than the viewport: read through it like a person would.
  const from = clamp(startLine - 2);
  const to = clamp(endLine - VISIBLE_LINES + 3);
  const t = easeInOut(
    relativeFrame,
    durationInFrames * 0.18,
    durationInFrames * 0.85,
  );
  return from + (to - from) * t;
}

export function IdePanel({
  visual,
  files,
  fileTree,
  openTabs,
  previous,
  relativeFrame,
  durationInFrames,
}: IdePanelProps) {
  const { fps } = useVideoConfig();
  const content = files[visual.path] ?? "";
  const lines = useMemo(() => content.split("\n"), [content]);
  const totalLines = lines.length;
  const language = languageForPath(visual.path);

  const sameFile = previous?.path === visual.path;
  // Near the end of a file the scroll clamps above the highlighted range,
  // so the rendered window must start at least a full viewport above the
  // last line, or the top of the editor shows empty space.
  const lastScreenTop = Math.max(1, totalLines - VISIBLE_LINES + 1);
  const windowStart = Math.max(
    1,
    Math.min(visual.startLine, lastScreenTop) -
      CONTEXT_LINES_BEFORE -
      (sameFile ? 40 : 0),
  );
  const windowEnd = Math.min(totalLines, visual.endLine + CONTEXT_LINES_AFTER);
  const windowCode = useMemo(
    () => lines.slice(windowStart - 1, windowEnd).join("\n"),
    [lines, windowStart, windowEnd],
  );

  const target = targetScrollLine(
    visual,
    relativeFrame,
    durationInFrames,
    totalLines,
  );
  const previousTarget =
    sameFile && previous
      ? targetScrollLine(previous, 10 ** 6, 1, totalLines)
      : target;
  const scrollT = easeInOut(relativeFrame, 0, 22);
  const scrollLine = sameFile
    ? previousTarget + (target - previousTarget) * scrollT
    : target;
  const scrollOffset = (scrollLine - windowStart) * LINE_HEIGHT;

  const appear = sameFile ? 1 : enter(relativeFrame, fps);
  const bandIn = easeOut(relativeFrame, sameFile ? 4 : 14, sameFile ? 16 : 28);
  const focusIn = visual.focus ? easeOut(relativeFrame, 18, 32) : 0;
  const calloutIn = visual.callout ? enter(relativeFrame, fps, 26) : 0;

  const lineY = (line: number) =>
    EDITOR_PAD_TOP + (line - scrollLine) * LINE_HEIGHT;
  const bandTop = lineY(visual.startLine);
  const bandHeight = (visual.endLine - visual.startLine + 1) * LINE_HEIGHT;
  const focusTop = visual.focus ? lineY(visual.focus[0]) : 0;
  const focusHeight = visual.focus
    ? (visual.focus[1] - visual.focus[0] + 1) * LINE_HEIGHT
    : 0;
  const cursorLine = visual.focus ? visual.focus[0] : visual.startLine;
  const cursorBlink = Math.floor(relativeFrame / 14) % 2 === 0;

  const highlighted = new Set(openTabs);
  const crumbs = [
    ...visual.path.split("/"),
    ...(visual.symbol ? [visual.symbol] : []),
  ];
  const calloutY = visual.focus ? focusTop : bandTop;

  return (
    <div
      role="group"
      aria-label={`Editor showing ${visual.path} lines ${visual.startLine} to ${visual.endLine}`}
      style={{
        width: IDE_WIDTH,
        height: IDE_HEIGHT,
        display: "flex",
        borderRadius: 14,
        overflow: "hidden",
        background: THEME.bgPanel,
        border: `1px solid ${THEME.borderStrong}`,
        boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        opacity: 0.35 + 0.65 * appear,
        transform: `scale(${0.985 + 0.015 * appear})`,
      }}
    >
      <Explorer
        files={fileTree}
        activePath={visual.path}
        highlighted={highlighted}
        frame={relativeFrame}
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Tabs
          tabs={
            openTabs.includes(visual.path)
              ? openTabs
              : [...openTabs, visual.path]
          }
          activePath={visual.path}
          frame={relativeFrame}
        />
        <div
          style={{
            height: CRUMB_HEIGHT,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 18px",
            fontFamily: THEME.fontSans,
            fontSize: 12,
            color: THEME.textMuted,
            borderBottom: `1px solid ${THEME.border}`,
            background: THEME.bgPanel,
          }}
        >
          {crumbs.map((crumb, i) => (
            <span
              key={`${crumb}-${i}`}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              {i > 0 ? <span style={{ color: THEME.textFaint }}>›</span> : null}
              <span
                style={{
                  color:
                    i === crumbs.length - 1 ? THEME.accent : THEME.textMuted,
                  fontWeight: i === crumbs.length - 1 ? 600 : 400,
                }}
              >
                {crumb}
              </span>
            </span>
          ))}
        </div>

        <div
          style={{
            position: "relative",
            height: EDITOR_HEIGHT,
            overflow: "hidden",
            background: THEME.bgPanel,
          }}
        >
          {/* Range band */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: bandTop,
              height: bandHeight,
              background: `rgba(34,224,255,${0.05 * bandIn})`,
              borderTop: `1px solid rgba(34,224,255,${0.18 * bandIn})`,
              borderBottom: `1px solid rgba(34,224,255,${0.18 * bandIn})`,
            }}
          />
          {/* Dim everything outside the focus */}
          {visual.focus ? (
            <>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  height: Math.max(0, focusTop),
                  background: `rgba(11,13,18,${0.45 * focusIn})`,
                  zIndex: 2,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: focusTop + focusHeight,
                  bottom: 0,
                  background: `rgba(11,13,18,${0.45 * focusIn})`,
                  zIndex: 2,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: focusTop,
                  height: focusHeight,
                  background: `rgba(255,180,84,${0.08 * focusIn})`,
                  boxShadow: `inset 4px 0 0 rgba(255,180,84,${focusIn})`,
                  zIndex: 1,
                }}
              />
            </>
          ) : null}
          {/* Gutter */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: EDITOR_PAD_TOP - scrollOffset,
              width: GUTTER_WIDTH,
              fontFamily: THEME.fontMono,
              fontSize: 13,
              color: THEME.textFaint,
              textAlign: "right",
              paddingRight: 14,
              userSelect: "none",
              zIndex: 3,
            }}
          >
            {Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => {
              const n = windowStart + i;
              const inFocus =
                visual.focus && n >= visual.focus[0] && n <= visual.focus[1];
              const inRange = n >= visual.startLine && n <= visual.endLine;
              return (
                <div
                  key={n}
                  style={{
                    height: LINE_HEIGHT,
                    lineHeight: `${LINE_HEIGHT}px`,
                    color: inFocus
                      ? THEME.warm
                      : inRange
                        ? THEME.textMuted
                        : THEME.textFaint,
                    fontWeight: inFocus ? 700 : 400,
                  }}
                >
                  {n}
                </div>
              );
            })}
          </div>
          {/* Code */}
          <div
            style={{
              position: "absolute",
              left: GUTTER_WIDTH + 12,
              right: 0,
              top: EDITOR_PAD_TOP - scrollOffset,
              zIndex: 3,
            }}
          >
            <CodeLines code={windowCode} language={language} />
          </div>
          {/* Cursor */}
          <div
            style={{
              position: "absolute",
              left:
                GUTTER_WIDTH + 12 + (lines[cursorLine - 1]?.length ?? 0) * 9.6,
              top: lineY(cursorLine) + 4,
              width: 2,
              height: LINE_HEIGHT - 8,
              background: THEME.accent,
              opacity: cursorBlink ? 0.9 : 0.15,
              zIndex: 4,
            }}
          />
          {/* Callout */}
          {visual.callout ? (
            <div
              style={{
                position: "absolute",
                right: 36,
                top: Math.max(14, Math.min(EDITOR_HEIGHT - 90, calloutY - 6)),
                maxWidth: 380,
                padding: "12px 16px",
                borderRadius: 10,
                background: "rgba(255,180,84,0.12)",
                border: "1px solid rgba(255,180,84,0.55)",
                color: "#ffe2b8",
                fontFamily: THEME.fontSans,
                fontSize: 16,
                fontWeight: 600,
                lineHeight: 1.35,
                boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
                opacity: calloutIn,
                transform: `translateX(${(1 - calloutIn) * 24}px)`,
                zIndex: 5,
              }}
            >
              <span style={{ color: THEME.warm, marginRight: 8 }}>▸</span>
              {visual.callout}
            </div>
          ) : null}
        </div>

        <div
          style={{
            height: STATUS_HEIGHT,
            display: "flex",
            alignItems: "center",
            gap: 22,
            padding: "0 16px",
            fontFamily: THEME.fontSans,
            fontSize: 12,
            color: THEME.textMuted,
            background: THEME.bgRaised,
            borderTop: `1px solid ${THEME.border}`,
          }}
        >
          <span style={{ color: THEME.accent }}>●</span>
          <span>{language}</span>
          <span>
            Ln {cursorLine}, Col{" "}
            {Math.max(1, (lines[cursorLine - 1]?.length ?? 0) + 1)}
          </span>
          <span>{totalLines} lines</span>
          <span style={{ marginLeft: "auto" }}>UTF-8</span>
        </div>
      </div>
    </div>
  );
}
