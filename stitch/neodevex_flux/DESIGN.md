```markdown
# Design System Specification: The Technical Architect

## 1. Overview & Creative North Star

### Creative North Star: "The Digital Curator"
This design system moves away from the "busy dashboard" trope of developer tools and toward an editorial, high-clarity workspace. We treat code and data as high-end content. The objective is to provide a sense of **Atmospheric Precision**—where the UI feels like a sophisticated, translucent layer over a complex engine.

We break the "template" look by utilizing:
*   **Intentional Asymmetry:** Foregoing rigid 12-column grids for functional clusters that prioritize the primary developer flow.
*   **Tonal Depth:** Replacing harsh lines with overlapping "sheets" of UI.
*   **High-Contrast Typography Scales:** Using oversized Manrope display type against dense, utilitarian Inter-based data tables to create a "Technical-Vogue" aesthetic.

---

## 2. Colors & Surface Logic

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section off major layout areas. Boundaries must be defined through background shifts using the `surface-container` tiers or subtle tonal transitions. A section is "defined" because it is a different shade of dark blue/grey, not because it has a stroke around it.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of frosted glass.
*   **Base Layer:** `surface` (#0b1326) / `surface-dim`.
*   **Navigation/Sidebars:** `surface-container-low` (#131b2e).
*   **Primary Workcards:** `surface-container` (#171f33).
*   **Elevated Modals/Popovers:** `surface-container-highest` (#2d3449).

### The "Glass & Gradient" Rule
To inject "soul" into the technical layout, use **Glassmorphism** for floating elements (e.g., Command Palettes, Tooltips). 
*   **Formula:** `surface-variant` at 60% opacity + 20px Backdrop Blur.
*   **Signature Textures:** Use the primary blue gradient (`primary` to `primary-container`) sparingly for high-intent CTAs to create a "glowing" interactive element amidst the dark matte surroundings.

### Workspace Accents (Gradients)
These are used for functional tagging and environmental storytelling:
*   **Walkthrough:** Sky to Cyan (Instructional flows)
*   **Graph:** Emerald to Teal (Performance/Data)
*   **Q&A:** Indigo to Blue (Community/Knowledge)
*   **Agent Ops:** Amber to Orange (Active processes/AI)

---

## 3. Typography: Editorial Utility

The system pairs **Manrope** (Display) with **Inter** (UI) and **JetBrains Mono** (Code). This creates an authoritative but readable hierarchy.

| Level | Token | Font | Size | Intent |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-lg` | Manrope | 3.5rem | High-level metrics or hero titles. |
| **Headline** | `headline-sm` | Manrope | 1.5rem | Section headers. |
| **Title** | `title-md` | Inter | 1.125rem | Card titles, navigation nodes. |
| **Body** | `body-md` | Inter | 0.875rem | Standard UI text, descriptions. |
| **Label** | `label-sm` | Inter | 0.6875rem | Metadata, caps-lock microcopy. |
| **Code** | `code-md` | JetBrains Mono | 0.875rem | Terminal and Editor output. |

---

## 4. Elevation & Depth

### The Layering Principle
Depth is achieved through **Tonal Layering**. Instead of a shadow, place a `surface-container-lowest` card on a `surface-container-low` section. The slight shift in hex value creates a natural "lift" that feels integrated into the hardware.

### Ambient Shadows
For floating panels (Modals/Dropdowns):
*   **Color:** `on-surface` (at 6% opacity).
*   **Blur:** 32px to 64px.
*   **Spread:** -4px.
*   *Note: Never use pure black shadows. The shadow must be a tinted version of the background.*

### The "Ghost Border" Fallback
If accessibility requires a container edge, use a **Ghost Border**:
*   `outline-variant` (#414755) at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons
*   **Primary:** Gradient background (`primary` to `primary-container`), white text, `xl` (0.75rem) radius.
*   **Secondary:** `surface-container-highest` fill with `primary` text. No border.
*   **Tertiary:** Ghost style. No fill, `on-surface-variant` text.

### Metric Tiles
*   **Structure:** No borders. Background: `surface-container`.
*   **Accent:** A 4px vertical "glow bar" on the left edge using the Workspace Accent gradients (e.g., Emerald to Teal for "Graph" metrics).

### Input Fields
*   **Default:** `surface-container-highest` background. No border. 
*   **Focus:** Subtle glow using `primary` at 20% opacity as a box-shadow (8px spread).

### Cards & Lists
*   **Prohibition:** No horizontal divider lines. 
*   **Solution:** Use `1.5` (0.375rem) to `2` (0.5rem) spacing units to separate list items. Use a subtle hover state shift to `surface-bright` to indicate interactivity.

### Status Badges
*   Caps-only `label-sm` typography.
*   **Style:** Low-opacity background (10%) of the status color (e.g., `error` for 'failed') with high-saturation text.

---

## 6. Do's and Don'ts

### Do
*   **Do** use `0.75rem` (xl) corner radius for main containers and `0.375rem` (md) for nested buttons to create a "nested" visual language.
*   **Do** lean into whitespace. Technical content needs room to breathe to remain scannable.
*   **Do** use `JetBrains Mono` for any alphanumeric string that is generated by the system (IDs, Hashes, Timestamps).

### Don't
*   **Don't** use 100% white (#FFFFFF) for text. Use `on-surface` (#dae2fd) or `on-surface-variant` (#c1c6d7) to reduce eye strain in dark mode.
*   **Don't** use standard "Drop Shadows" for depth. Stick to tonal shifts and Backdrop Blurs.
*   **Don't** use icons as the sole indicator of meaning. Pair them with `label-sm` text for technical clarity.