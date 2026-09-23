import type {
  BrandMarketRow,
  BrandRow,
  BrandThemeRow,
  EventRow,
  LeadRow,
  ModelRow,
  SpecRowRow,
  TrimRow,
} from "./database.types";
import { type EngineDb, unwrap } from "./client";

// Typed repositories. Every brand-scoped repository is CONSTRUCTED with a brand id and applies it
// to every query itself — callers cannot forget it, because they never pass it. RLS is still the
// real boundary; this is the second layer, so a service-role call (which bypasses RLS entirely)
// cannot read across tenants by accident.

export interface LeadInput {
  market_code: string;
  full_name: string;
  phone: string;
  city?: string | null;
  model_id?: string | null;
  trim_id?: string | null;
  preferred_time?: string | null;
  type?: LeadRow["type"];
  consent_text_version: string;
  consent_at: string;
  session_id?: string | null;
}

export interface EventInput {
  id: string;
  kind: string;
  session_id?: string | null;
  market_code?: string | null;
  model_id?: string | null;
  trim_id?: string | null;
  payload?: Record<string, unknown>;
}

abstract class BrandScopedRepository {
  constructor(
    protected readonly db: EngineDb,
    protected readonly brandId: string,
  ) {
    if (!brandId) throw new Error("A brand-scoped repository needs a brand id.");
  }
}

export class BrandRepository {
  constructor(private readonly db: EngineDb) {}

  async getBySlug(slug: string): Promise<BrandRow | null> {
    return unwrap(
      "BrandRepository.getBySlug",
      await this.db.from<BrandRow>("brands").select("*").eq("slug", slug).maybeSingle(),
    );
  }

  async listMarkets(brandId: string): Promise<BrandMarketRow[]> {
    return (
      unwrap(
        "BrandRepository.listMarkets",
        await this.db
          .from<BrandMarketRow>("brand_markets")
          .select("*")
          .eq("brand_id", brandId)
          .order("market_code"),
      ) ?? []
    );
  }
}

export class ModelRepository extends BrandScopedRepository {
  /** Published models, in the one ordering the line-up uses (hero adjacency IS section order). */
  async listPublished(): Promise<ModelRow[]> {
    return (
      unwrap(
        "ModelRepository.listPublished",
        await this.db
          .from<ModelRow>("models")
          .select("*")
          .eq("brand_id", this.brandId)
          .eq("publish_state", "published")
          .order("order_index", { ascending: true }),
      ) ?? []
    );
  }

  async getBySlug(slug: string): Promise<ModelRow | null> {
    return unwrap(
      "ModelRepository.getBySlug",
      await this.db
        .from<ModelRow>("models")
        .select("*")
        .eq("brand_id", this.brandId)
        .eq("slug", slug)
        .maybeSingle(),
    );
  }
}

export class TrimRepository extends BrandScopedRepository {
  async listForModel(modelId: string): Promise<TrimRow[]> {
    return (
      unwrap(
        "TrimRepository.listForModel",
        await this.db
          .from<TrimRow>("trims")
          .select("*")
          .eq("brand_id", this.brandId)
          .eq("model_id", modelId)
          .order("order_index", { ascending: true }),
      ) ?? []
    );
  }

  /**
   * A trim's effective stats. Null on a trim means "inherit", so resolution happens at read time
   * and a model edit still reaches every trim instead of going stale in copied rows.
   */
  resolveStats(
    model: ModelRow,
    trim: TrimRow,
  ): Pick<ModelRow, "seats" | "accel_0_100_s" | "power_hp" | "top_speed_kph" | "torque_nm"> {
    return {
      seats: trim.seats ?? model.seats,
      accel_0_100_s: trim.accel_0_100_s ?? model.accel_0_100_s,
      power_hp: trim.power_hp ?? model.power_hp,
      top_speed_kph: trim.top_speed_kph ?? model.top_speed_kph,
      torque_nm: trim.torque_nm ?? model.torque_nm,
    };
  }
}

export class ThemeRepository {
  constructor(private readonly db: EngineDb) {}

  /** The full derived theme for a brand in a market. Injected as CSS custom properties server-side. */
  async getForBrand(brandId: string, marketCode: string): Promise<BrandThemeRow | null> {
    return unwrap(
      "ThemeRepository.getForBrand",
      await this.db
        .from<BrandThemeRow>("brand_themes")
        .select("*")
        .eq("brand_id", brandId)
        .eq("market_code", marketCode)
        .maybeSingle(),
    );
  }
}

export class LeadRepository extends BrandScopedRepository {
  /**
   * Capture a lead. Consent is required by the type as well as by the database: a caller cannot
   * reach this method without having carried the consent version and timestamp along with it.
   */
  async create(input: LeadInput): Promise<LeadRow | null> {
    return unwrap(
      "LeadRepository.create",
      await this.db
        .from<LeadRow>("leads")
        .insert({ ...input, brand_id: this.brandId })
        .select("*")
        .single(),
    );
  }

  async listRecent(limit = 50): Promise<LeadRow[]> {
    return (
      unwrap(
        "LeadRepository.listRecent",
        await this.db
          .from<LeadRow>("leads")
          .select("*")
          .eq("brand_id", this.brandId)
          .order("created_at", { ascending: false })
          .limit(limit),
      ) ?? []
    );
  }
}

export class EventRepository extends BrandScopedRepository {
  /**
   * Record an event. The caller supplies the id, which IS the idempotency key — at-least-once
   * delivery means the same event arrives twice and the second must be absorbed, not duplicated.
   */
  async record(input: EventInput): Promise<void> {
    unwrap(
      "EventRepository.record",
      await this.db
        .from<EventRow>("events")
        .upsert(
          { ...input, payload: input.payload ?? {}, brand_id: this.brandId },
          { onConflict: "id" },
        ),
    );
  }

  async markProcessed(id: string, at: string): Promise<void> {
    unwrap(
      "EventRepository.markProcessed",
      await this.db
        .from<EventRow>("events")
        .update({ processed_at: at })
        .eq("brand_id", this.brandId)
        .eq("id", id),
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Spec ledger helpers
// ---------------------------------------------------------------------------------------------

export interface LedgerValue {
  en: string;
  ar: string;
}

/**
 * The value a ledger row shows for one trim: the shared value for an all-trims row, or that trim's
 * own entry for a per-trim one. Returns null when a per-trim row has nothing for this trim, which
 * is a real state (a spec that simply does not apply) rather than an error.
 */
export function resolveLedgerRow(row: SpecRowRow, trimId: string): LedgerValue | null {
  if (row.scope === "all_trims") {
    return row.value_en !== null && row.value_ar !== null
      ? { en: row.value_en, ar: row.value_ar }
      : null;
  }
  return row.trim_values?.[trimId] ?? null;
}

/**
 * Whether a row differs across trims. DERIVED, never stored (REV2): an all-trims row never differs,
 * and a per-trim row differs only if its values are not all identical — two trims quoting the same
 * figure is not a difference worth showing a reader.
 */
export function rowDiffers(row: SpecRowRow): boolean {
  if (row.scope === "all_trims") return false;
  const values = Object.values(row.trim_values ?? {});
  if (values.length < 2) return false;
  const [first, ...rest] = values as LedgerValue[];
  return rest.some((v) => v.en !== first!.en || v.ar !== first!.ar);
}
