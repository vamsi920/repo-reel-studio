import { Easing, interpolate } from "remotion";
import type { KtScene } from "#/lib/kt-video/build-manifest";

/** Renders the real file list a knowledge page's scope covers, as a simple
 * indented tree — no fabricated structure, just the actual paths. */
export function RepoTreePanel({
  scene,
  relativeFrame,
}: {
  scene: KtScene;
  relativeFrame: number;
}) {
  const files = scene.tree_files ?? [];
  const enter = interpolate(relativeFrame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 900,
        maxHeight: 480,
        overflow: "hidden",
        borderRadius: 12,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 16}px)`,
        boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        border: "1px solid rgba(34,224,255,0.25)",
        background: "#0b0e13",
      }}
    >
      <div
        style={{
          padding: "16px 24px",
          fontFamily: "'IBM Plex Mono', Menlo, monospace",
          fontSize: 14,
          lineHeight: 1.8,
        }}
      >
        {files.map((path) => {
          const depth = path.split("/").length - 1;
          const name = path.split("/").pop();
          return (
            <div
              key={path}
              style={{
                paddingLeft: depth * 18,
                color: "rgba(230,235,240,0.82)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {/* eslint-disable-next-line i18next/no-literal-string -- tree glyph */}
              <span style={{ color: "rgba(34,224,255,0.6)" }}>└ </span>
              {name}
            </div>
          );
        })}
      </div>
    </div>
  );
}
