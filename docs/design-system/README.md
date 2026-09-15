# NeoDevEx Style Reference

`neodevex-style-reference.css` is a standalone, framework-free stylesheet that
captures the NeoDevEx visual language so other products can match it without
pulling in Tailwind, HeroUI, or this app's build pipeline.

## Use

```html
<link rel="stylesheet" href="neodevex-style-reference.css">
```

Then either use the tokens (`var(--primary-500)`, `var(--surface)`,
`var(--font-sans)`, …) in your own CSS, or use the ready-made `.ame-*`
component classes:

```html
<button class="ame-btn-primary">Save</button>
<button class="ame-btn-secondary ame-btn-sm">Cancel</button>

<div class="ame-card">
  <div class="ame-card-header"><h3 class="ame-card-title">Title</h3></div>
  <div class="ame-card-body">…</div>
</div>

<span class="ame-badge ame-badge-success">Ready</span>
<input class="ame-input" placeholder="Search…">
```

## Key facts

| Aspect | Value |
| --- | --- |
| Theme | Light, cool-grey (blue-tinted) neutrals |
| Brand color | `#0b81b7` cyan-blue (`--primary-500`), teal accent `#27867d` |
| UI font | Outfit (Google Fonts) |
| Code font | IBM Plex Mono |
| Page canvas | `#EEF2F7` (`--cool-grey-950`) |
| Card surface | `#F7F9FC` (`--cool-grey-975`) |
| Primary ink | `#0B0E14` (`--cool-grey-100`) |
| Border | `#7E8A9E` (`--cool-grey-700`) |
| Radius | 8px default, 6/8/12px scale, 20px pill |
| Success / Warning / Danger | `#188c42` / `#db7706` / `#d32222` |

## Keeping it in sync

Sources of truth live in the app:

- `src/tailwind.css` — semantic `--oh-*` tokens
- `src/index.css` — cool-grey ramp, fonts, markdown styles
- `src/styles/neo-tokens.css` — brand ramp, radii, shadows
- `src/styles/neo-design-system.css` — `.ame-*` components (copied verbatim into section 4)
- `hero.ts` — HeroUI theme (mirrors the same palette)

When those change, regenerate section 4 by re-copying `neo-design-system.css`
and update the token values in section 2 by hand.
