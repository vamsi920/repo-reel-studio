import { heroui } from "@heroui/react";

export default heroui({
  // NOTE: this theme is keyed "dark" (matching AGENT_SERVER_UI_DEFAULT_THEME
  // and the [data-theme=dark] selectors in src/themes/color-themes.ts /
  // src/tailwind.css) but its actual colors are Neo's LIGHT palette —
  // the cool-grey ramp below is index.css's dark ramp with its lightness
  // order inverted (see index.css comment), so every existing dark-mode
  // selector keeps working unchanged while the app renders light end-to-end.
  defaultTheme: "dark",
  layout: {
    radius: {
      small: "5px",
      large: "20px",
    },
  },
  themes: {
    dark: {
      colors: {
        primary: "#0B81B7", // Neo cyan-blue

        // Map HeroUI's zinc-based semantic colours to our cool-grey palette.
        // This ensures every HeroUI component that uses bg-default, bg-content*,
        // etc. stays within the same colour family as the rest of the UI.

        background: {
          DEFAULT: "#EEF2F7", // cool-grey-950 (light) — app shell base
          foreground: "#05070A", // cool-grey-50 (light)
        },

        foreground: {
          DEFAULT: "#2C313F", // cool-grey-300 (light) — primary readable text
          "50": "#F7F9FC", // cool-grey-975 (light)
          "100": "#EEF2F7", // cool-grey-950 (light)
          "200": "#DCE3EE", // cool-grey-925 (light)
          "300": "#C3CDDC", // cool-grey-900 (light)
          "400": "#A3B0C4", // cool-grey-800 (light)
          "500": "#7E8A9E", // cool-grey-700 (light)
          "600": "#626D82", // cool-grey-600 (light)
          "700": "#4B5468", // cool-grey-500 (light)
          "800": "#383F50", // cool-grey-400 (light)
          "900": "#2C313F", // cool-grey-300 (light)
        },

        // Surface layers: panel → card → inner card → inset
        content1: { DEFAULT: "#DCE3EE", foreground: "#0B0E14" }, // cool-grey-925 / 100 (light)
        content2: { DEFAULT: "#C3CDDC", foreground: "#21252F" }, // cool-grey-900 / 200 (light)
        content3: { DEFAULT: "#A3B0C4", foreground: "#2C313F" }, // cool-grey-800 / 300 (light)
        content4: { DEFAULT: "#7E8A9E", foreground: "#383F50" }, // cool-grey-700 / 400 (light)

        focus: {
          DEFAULT: "#0B81B7", // brand-cyan focus ring — visible on light surfaces
        },
        default: {
          "50": "#F7F9FC", // cool-grey-975 (light)
          "100": "#EEF2F7", // cool-grey-950 (light)
          "200": "#DCE3EE", // cool-grey-925 (light)
          "300": "#C3CDDC", // cool-grey-900 (light)
          "400": "#A3B0C4", // cool-grey-800 (light)
          "500": "#7E8A9E", // cool-grey-700 (light)
          "600": "#626D82", // cool-grey-600 (light)
          "700": "#4B5468", // cool-grey-500 (light)
          "800": "#383F50", // cool-grey-400 (light)
          "900": "#2C313F", // cool-grey-300 (light)
          DEFAULT: "#A3B0C4", // cool-grey-800 (light) — hover/selected tint
          foreground: "#05070A", // cool-grey-50 (light) — text on default bg
        },
      },
    },
  },
});
