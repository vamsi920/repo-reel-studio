/**
 * NeoDevEx modification.
 *
 * Upstream keeps `LAYER_PALETTE` / `getLayerColor` inside
 * `dashboard/src/components/LayerLegend.tsx`, which also renders a legend bound
 * to upstream's Zustand store. We vendor only the palette so the node
 * components (`ContainerNode`, `PortalNode`, `LayerClusterNode`) keep their
 * exact upstream colors without dragging in that store.
 *
 * Values copied verbatim from upstream LayerLegend.tsx.
 */

export const LAYER_PALETTE = [
  {
    bg: "rgba(74, 124, 155, 0.12)",
    border: "rgba(74, 124, 155, 0.4)",
    label: "#4a7c9b",
  }, // blue (API)
  {
    bg: "rgba(90, 158, 111, 0.12)",
    border: "rgba(90, 158, 111, 0.4)",
    label: "#5a9e6f",
  }, // green (Data)
  {
    bg: "rgba(139, 111, 176, 0.12)",
    border: "rgba(139, 111, 176, 0.4)",
    label: "#8b6fb0",
  }, // purple (Service)
  {
    bg: "rgba(201, 160, 108, 0.12)",
    border: "rgba(201, 160, 108, 0.4)",
    label: "#c9a06c",
  }, // gold (Config)
  {
    bg: "rgba(176, 122, 138, 0.12)",
    border: "rgba(176, 122, 138, 0.4)",
    label: "#b07a8a",
  }, // pink (UI)
  {
    bg: "rgba(74, 155, 140, 0.12)",
    border: "rgba(74, 155, 140, 0.4)",
    label: "#4a9b8c",
  }, // teal (Middleware)
  {
    bg: "rgba(120, 130, 145, 0.12)",
    border: "rgba(120, 130, 145, 0.4)",
    label: "#788291",
  }, // slate (Test)
];

export function getLayerColor(index: number) {
  return LAYER_PALETTE[index % LAYER_PALETTE.length];
}
