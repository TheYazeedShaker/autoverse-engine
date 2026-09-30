# Build Spec — Site footer (+ privacy page)

**Task ID:** `COMPONENT-CONSUMER-FOOTER`
**Depends on:** PAGE-CONSUMER-SHOWROOM (brand-market presentation fields already exist).
**Design source (read-only):** the footer in `design-approved/showroom/showroom.dc.html`.
**Standing rule: the approved design wins**; escalate only security, data, money, legal or consent questions.

## Goal

One shared footer for every consumer page, fully data-driven, plus the privacy page that the analytics notice (consent decision B) links to.

## Data

From `brand_markets`: tagline EN/AR, hotline, contact email, cities line, footer link columns, social links (ordered), WhatsApp number. Anything empty is simply omitted, never a placeholder. Social links open in a new tab with `rel="noopener noreferrer"`; only http(s) URLs render.

## Behaviour

- A "Contact us" opener for the lead modal with type `contact`.
- The analytics notice and one-click opt-out from slice 9 live here, per decision B.
- **Privacy page** `/privacy`: renders the brand-market's privacy text, EN/AR. Its wording is legal text and comes from the owner (Tier C). Store it versioned and append-only, like `consent_texts`, or as a content block (implementer's choice, ADR). Until a text exists, the page shows a neutral "being prepared" state and the notice still links to it.

## PRs (1–2, against `main`)

1. Footer component on every consumer page, with data, opener, notice slot, visual verification.
2. Privacy page + its storage (migration, read path, cross-tenant test) if not folded into 1.

## Acceptance

- [ ] Visual verification against the design at 390/768/1440, EN and AR.
- [ ] Empty fields omitted cleanly; unsafe link schemes never render.
- [ ] Privacy text supplied by the owner, not written by the agent.
