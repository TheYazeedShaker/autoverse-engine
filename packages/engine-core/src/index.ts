/**
 * @autoverse/engine-core — the typed data-access layer.
 *
 * Repositories are constructed with a brand id and apply it to every query themselves, so a caller
 * cannot forget to scope one. RLS remains the real boundary; this is the second layer, and it is
 * what protects service-role callers, which bypass RLS entirely.
 */
export type { DbError, EngineDb, QueryBuilder, QueryResult, TableApi } from "./client";
export { EngineDbError, unwrap } from "./client";

export type {
  ActivityKind,
  AssetKind,
  AssetRow,
  BrandMarketRow,
  EfficiencyIconKind,
  OptionKind,
  VocabularyRow,
  TrimPriceRow,
  BrandRow,
  BrandThemeRow,
  EventRow,
  LeadRow,
  LeadStatus,
  LeadType,
  ModelRow,
  PublishState,
  SpecRowRow,
  SpecRowScope,
  TrimRow,
} from "./database.types";

export {
  BrandRepository,
  EventRepository,
  LeadRepository,
  ModelRepository,
  ThemeRepository,
  TrimRepository,
  resolveLedgerRow,
  resolveTrimStats,
  rowDiffers,
} from "./repositories";
export type { EventInput, LeadInput, LedgerValue, ResolvedTrimStats } from "./repositories";
