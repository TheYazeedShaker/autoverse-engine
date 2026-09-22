# Revision — Theming (extends ENGINE-CORE-1A)

**Applies to:** `ENGINE-CORE-1A`
**Slot:** after Slice 3 (control plane), before Slice 4 (content).
**Read alongside:** `SPEC-engine-core-1A-REV2-hardening.md` (admin neutral ramp in design-tokens).

---

## Decision (locked)

Themes are engine data, not code. A brand's visual identity is one row in `brand_themes`, applied server-side at render time. No per-brand CSS files; no per-brand deploys. Font families are not themable in v1.

---

## Schema addition — brand_themes

Migration `20260921_theming.sql` (insert between Slice 3 and Slice 4):

- brand_id, market_code (unique pair)
- accent_hex — must pass AA before save
- on_accent — 'black' | 'white', server-derived, never user-set
- hover_hex, muted_hex, focus_hex — all server-derived
- logo_light_asset_ref, logo_dark_asset_ref, favicon_asset_ref

RLS: brand users read own theme; writes via service role only.

---

## Server-side derivation and AA gate

Edge function `validate-theme`:

1. Receives { brand_id, market_code, accent_hex }
2. Derives hover/muted/focus/on-accent server-side (client never computes these)
3. AA contrast checks — all must pass or function returns 422 naming the failing pair:
   - on-accent on accent ≥ 4.5:1
   - on-accent on hover shade ≥ 4.5:1
   - accent text on Mist canvas ≥ 4.5:1
   - accent text on white surface ≥ 4.5:1
4. On pass: upserts brand_themes, returns the full derived row.

Invariant: no theme row can exist that fails AA. Validation is the write gate.

---

## Accent routing (locked scope)

Accent applies ONLY to: primary button fill + on-accent text, link color, focus ring, active/selected indicators (dock pills, filter chips, tab underlines), small text accents in specific kicker contexts, card wedge tint (muted_hex variant).

Everything else is brand-invariant: card surfaces (warm greige), canvas (Mist), hero stage (Gunmetal), sidebar (admin neutral), type, grid, radius, shadow, motion. A brand with accent #000000 gets black buttons and invisible wedge tint — acceptable, documented, shown in the admin Theme preview.

---

## Data-access layer addition

ThemeRepository.getForBrand(brandId, marketCode) — returns full derived theme row. Called by the server-side render path; result injected as CSS custom properties into head. No client-side theme switching.

---

## Acceptance criteria

- [ ] brand_themes table exists; migration applies cleanly
- [ ] validate-theme rejects any accent failing any AA pair, naming the failing pair
- [ ] ThemeRepository.getForBrand typed and working
- [ ] No theme row in DB fails AA checks (invariant holds on seed data)
- [ ] Isolation test covers brand_themes (brand A cannot read brand B's theme)
