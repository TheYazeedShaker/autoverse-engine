-- 20260926152000_attribute_vocabulary_kinds.sql
-- PAGE-CONSUMER-SHOWROOM, owner decision (#build-decisions, 2026-09-26, option B): a model's body
-- type, fuel, drive and transmission become controlled vocabulary in vocabulary_registry, with
-- stable keys and display_en/display_ar.
--
-- This file only adds the four kinds. Postgres cannot use an enum value in the transaction that
-- added it, so the seed, the data mapping and the foreign keys follow in
-- 20260926152100_attribute_vocabulary.sql.

alter type public.option_kind add value if not exists 'body_type';
alter type public.option_kind add value if not exists 'fuel';
alter type public.option_kind add value if not exists 'drive';
alter type public.option_kind add value if not exists 'transmission';
