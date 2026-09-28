# 0025 — lead consent texts: versioned, append-only, cited by every lead

**Status:** accepted — 2026-09-28 (owner, `#build-decisions`, option A)

## Context

Every lead records `consent_text_version` and `consent_at` (the database refuses a lead without
them), but nothing stored the wording a version stood for. So "what exactly did this person agree
to?" couldn't be answered from the database, and the lead form (spec §6) had no text to show.
`brand_markets.consent_defaults` is analytics consent (the separate Tier C EG question), not this.

## Decision

1. **`consent_texts`** (migration `20260928140000`): brand, market, `version`, `text_en`, `text_ar`,
   `published_at`. One row per version, unique per brand-market.
2. **Append-only, enforced in the database** (owner's condition): update and delete are refused by a
   row trigger and truncate by a statement trigger, for every role, the owner and the service role
   included. A change of wording is a new version. There is no unpublish; a newer version supersedes.
3. **Every lead cites an existing version of its own brand-market**: a composite FK
   `leads (brand_id, market_code, consent_text_version) → consent_texts (brand_id, market_code, version)`.
   `capture_lead_public` returns a violation as `rejected` (23503), which capture-lead answers with
   422: the form's problem, never a dead letter.
   - The FK is `NOT VALID`: it binds every lead written from now on. Leads written before the table
     existed keep their version strings unchecked (the owner's pre-check shows how many; on this
     project they are CI-gate and demo test leads). Validating it later needs those versions
     recorded as rows first.
4. **Current text** = the latest row with `published_at <= now()`. A row can be scheduled ahead.
5. **One placeholder, `{Brand}`**, filled with the brand's display name at render time. Any other
   brace is refused (a CHECK), so a typo like `{brand}` can't reach a visitor verbatim. Version
   labels are short and stable (`^[a-z0-9][a-z0-9._-]{0,31}$`, e.g. `eg-v1`).
6. **Fail closed:** no current consent text → no lead CTAs on the page, logged. The consumer's Zod
   mirrors the database's text rules (≤ 2000 code points, at least one non-space character,
   `{Brand}` only). A row it still can't accept becomes `null` too (no CTAs), never a failed
   catalogue: rows are append-only, so a bad one must cost the lead buttons, not the showroom.
   `created_at` is stamped by the database on insert, whatever the insert says.
7. **RLS:** staff and the owning brand read; nobody but the service role writes. Anonymous visitors
   get the current text only through `showroom_catalog` (ADR 0018 amendment).
8. **Wording is HUMAN ONLY.** The owner supplies each market's text and version label. EG `eg-v1`
   is approved for the demo and EG, pending legal review before a real brand goes live.

## Consequences

- A brand with consent texts can't be hard-deleted (no cascade, and rows can't be removed). That is
  intended: the proof must outlive the brand's page. Erasure of one person's lead is a separate
  question (PROGRESS, known follow-ups).
- Replays from `lead_dlq` go through the same FK. A dead-lettered lead citing an unknown version
  fails its replay with 23503 until the version exists.
- Every test or seed that writes a lead first seeds a consent row for its brand-market.
- The FK accepts any existing version, including a superseded one (right for a page with a cached
  catalogue) and one scheduled for later that was never shown (no attack: only the service role
  writes, and future labels aren't served). Requiring `published_at <= consent_at` in
  `capture_lead` is a possible hardening, against clock skew of the form's `consent_at`.
- Only keys labelled `web` are served (ADR 0018 amendment), and `issue_publishable_key` defaults
  the label to null, so each live brand needs a `web` key or its page shows no lead CTAs.
