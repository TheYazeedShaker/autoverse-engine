# Autoverse — Design System Brief (paste this first into Claude Design)

You are designing pages for **Autoverse**, a premium automotive platform (virtual showroom, digital brochure, car configurator) for brands in MENA. Quality bar: Porsche.com — fast, precise, luxurious, modern. Every design in this project MUST follow this locked system exactly. Do not invent new colors, fonts, or radii.

## Palette (cool monochrome — intentional, no chromatic accent)

- `#F4F7F5` Mist — light canvas / page background
- `#08090A` Onyx — ink / primary text on light / primary buttons
- `#222823` Gunmetal — dark surfaces (heroes, footers, info rails, cards-on-dark)
- `#575A5E` Slate — muted text on light surfaces
- `#A7A2A9` Platinum — muted text on dark surfaces / subtle accents on dark

**The one law — surface↔foreground pairing (never break):**

- On Mist/light surfaces: text is Onyx (primary) or Slate (muted). Never Platinum.
- On Gunmetal/dark surfaces: text is Mist (primary) or Platinum (muted). Never Slate/Onyx.
- Never dark-on-dark or same-luminance pairs. All text meets WCAG AA (4.5:1 normal, 3:1 large).

**Color philosophy:** the UI is deliberately colorless — **the car carries the only color on the page**. Car renders, color swatches, and brand content are the sole chromatic elements. Never let UI chrome compete with the product.

## Typography

- Latin/English: **Google Sans Flex** (variable). Arabic: **Cairo** (variable). RTL mirrors layout.
- Headings: tight tracking, weight 600–650, large scale. Labels/eyebrows: small caps-feel, letter-spaced (0.08–0.16em), 10–12px. Body: 14–16px, relaxed line height.

## Shape & space

- Radii: 7 / 10 / 14 / 18px, pill 999px. Spacing on a 4px scale (8, 12, 16, 24, 32, 48, 64).
- Shadows: soft, low-contrast, wide (e.g. `0 30px 80px -40px rgba(8,9,10,.55)`) — premium, never heavy.
- Buttons: primary = Onyx fill on light / Mist fill on dark; secondary = 1px outline ghost. Small uppercase letter-spaced labels.

## Motion character (design the states to imply it)

Restrained and precise — fast, controlled, no bounce. Hover: subtle lift/scale (≤1.12 on swatches, −1 to −3px translate). Feedback is instant. Motion guides attention or communicates state; never decorative.

## Recurring components (keep consistent across pages)

- **Color swatch:** 26px circle, 1px hairline border; selected = double ring (2px surface gap + 2px Onyx).
- **Segmented toggle:** pill group on 5% ink tint; active segment = white pill with soft shadow.
- **Stat block:** big value + small unit, uppercase letter-spaced label beneath; on dark surfaces.
- **Trim/model cards:** render image dominant, minimal text, from-price; two actions: "View trim →" (ghost) and "Configure" (primary).
- **Control dock:** controls grouped on a light translucent panel with hairline border — never floating loose over imagery.

## Page rules

- Layouts are render-dominant: the car image/stream is the hero of every screen (~60%+ of hero area).
- Dark Gunmetal rails/sections host identity, specs, and CTAs (with Mist/Platinum text).
- Lead CTAs (Book a Test Drive, Request a Quote, Contact, WhatsApp) must always be visible and reachable without the 3D loaded.
- Bilingual-ready: leave room for Arabic (longer strings, RTL mirroring).
- Mobile-first responsiveness is part of the design, not an afterthought — show mobile for every page.

## Design order (one page per session, wait for approval between)

1. **Virtual Showroom** — brand's full range: filterable models (model, body type, fuel, drive, seats + search), trims under each model, trim cards with the two actions. Porsche 911 model-range page is the structural reference.
2. **Digital Brochure** — one trim told richly: hero content, in-place trim switcher, light configurator (image-swap swatches, no streaming), key specs strip, content blocks, full specs table, CTA rail, same-brand recommendations. Porsche 911 Carrera model page is the reference.
3. **Configurator page** — streamed 3D canvas (design it as a large render area), engine-owned control dock beneath (swatches, interior, view, lighting), build summary + price, CTA stack. Lotus Emira configurator is the reference.
4. Brand dashboard overview, then admin pipeline board (after 1–3 approved).

Content grouping for each page follows the approved journey blueprint; the wireframes there define WHAT is on each page — you decide the visual composition within this system.
